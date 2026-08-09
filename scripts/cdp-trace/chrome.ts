// CDP Trace Validation Runner PoC — Chrome lifecycle + minimal CDP client.
//
// Responsibilities (per task spec):
// - 啟動 / 連線 Chrome（dedicated isolated instance：temp user-data-dir、remote debugging、
//   no extensions、not the user's daily profile）
// - 找到 target page
// - 建立 CDP session
// - 關閉 browser
//
// No npm dependency added: Node 24 ships a global `WebSocket` and `fetch` (undici-based),
// which is enough to speak CDP's HTTP discovery endpoints and the debugger WebSocket
// directly, so this stays a plain script per PAIN_LAB_PRINCIPLES（不引入框架化的抽象層）。

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const CHROME_EXECUTABLE_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null,
].filter((p): p is string => Boolean(p))

function findChromeExecutable(): string {
  for (const candidate of CHROME_EXECUTABLE_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    `Chrome executable not found. Checked:\n${CHROME_EXECUTABLE_CANDIDATES.join('\n')}\n` +
      'Set a valid path in CHROME_EXECUTABLE_CANDIDATES if Chrome is installed elsewhere.',
  )
}

export interface CdpTarget {
  id: string
  type: string
  url: string
  webSocketDebuggerUrl: string
}

export interface LaunchedChrome {
  readonly port: number
  readonly userDataDir: string
  readonly mode: ChromeMode
  readonly pid: number | undefined
  browserVersion(): Promise<{ Browser: string; 'Protocol-Version': string }>
  listTargets(): Promise<CdpTarget[]>
  kill(): Promise<void>
}

/**
 * Launches a dedicated, isolated Chrome instance:
 * - fresh temporary user-data-dir (not the daily profile)
 * - remote debugging enabled on a fixed local port
 * - extensions / default apps / background networking disabled
 * - headless=new by default — chosen in the original PoC to sidestep window
 *   focus / tab-visibility timer throttling (see project memory:
 *   vue36_reactive_chain_validation). Whether that's actually equivalent to
 *   headed for rendering purposes was exactly UNVALIDATED — that's what the
 *   Measurement Calibration phase checks. Pass `mode: 'headed'` to launch a
 *   real (non-headless) window instead, everything else identical.
 */
export type ChromeMode = 'headless' | 'headed'

export async function launchIsolatedChrome(port: number, mode: ChromeMode = 'headless'): Promise<LaunchedChrome> {
  const exe = findChromeExecutable()
  const userDataDir = mkdtempSync(join(tmpdir(), 'vue-pain-lab-cdp-'))

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...(mode === 'headless' ? ['--headless=new'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-component-update',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-ipc-flooding-protection',
    '--window-size=1280,900',
    'about:blank',
  ]

  const proc = spawn(exe, args, { stdio: 'ignore' })

  await waitForCdpReady(port, 15_000)

  return {
    port,
    userDataDir,
    mode,
    pid: proc.pid,
    async browserVersion() {
      return fetchJson(`http://127.0.0.1:${port}/json/version`)
    },
    async listTargets() {
      return fetchJson(`http://127.0.0.1:${port}/json/list`)
    },
    async kill() {
      await killChrome(proc)
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        // best-effort cleanup; a leftover temp dir is not fatal for the PoC
      }
    },
  }
}

async function killChrome(proc: ChildProcess): Promise<void> {
  if (proc.pid === undefined || proc.exitCode !== null) return
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
  proc.kill()
  await Promise.race([exited, delay(5_000)])
  if (proc.exitCode === null && proc.pid !== undefined) {
    // Windows: plain kill() does not always tear down the Chrome process tree.
    // Only ever targets this specific PID we just launched — never a blanket
    // `taskkill /IM chrome.exe`, matching the repo's Process Management Rule.
    spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    await Promise.race([exited, delay(3_000)])
  }
}

async function waitForCdpReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`)
      return
    } catch (err) {
      lastError = err
      await delay(150)
    }
  }
  throw new Error(`Chrome CDP HTTP endpoint not ready on port ${port} within ${timeoutMs}ms: ${String(lastError)}`)
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Minimal CDP session over a target's webSocketDebuggerUrl.
// Connecting directly to a page target's WS URL (rather than the browser-level
// endpoint + Target.attachToTarget) gives a flat session scoped to that page,
// which is all this PoC needs (Page / Runtime / Tracing / IO domains).
// ---------------------------------------------------------------------------

interface PendingCall {
  resolve: (value: any) => void
  reject: (err: Error) => void
}

export class CDPClient {
  #ws: WebSocket
  #nextId = 1
  #pending = new Map<number, PendingCall>()
  #listeners = new Map<string, Set<(params: any) => void>>()
  #closed = false

  private constructor(ws: WebSocket) {
    this.#ws = ws
    this.#ws.addEventListener('message', (event) => this.#handleMessage(event))
    this.#ws.addEventListener('close', () => {
      this.#closed = true
    })
  }

  static connect(webSocketDebuggerUrl: string): Promise<CDPClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(webSocketDebuggerUrl)
      const onOpen = () => {
        ws.removeEventListener('error', onError)
        resolve(new CDPClient(ws))
      }
      const onError = (event: Event) => {
        ws.removeEventListener('open', onOpen)
        reject(new Error(`CDP WebSocket connection failed: ${webSocketDebuggerUrl} (${String(event)})`))
      }
      ws.addEventListener('open', onOpen, { once: true })
      ws.addEventListener('error', onError, { once: true })
    })
  }

  #handleMessage(event: MessageEvent): void {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
    if (typeof message.id === 'number') {
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(`CDP error (${message.error.code}): ${message.error.message}`))
      } else {
        pending.resolve(message.result)
      }
      return
    }
    if (typeof message.method === 'string') {
      const listeners = this.#listeners.get(message.method)
      if (listeners) {
        for (const listener of listeners) listener(message.params)
      }
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.#closed) return Promise.reject(new Error(`CDP session closed, cannot send ${method}`))
    const id = this.#nextId++
    const payload = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#ws.send(payload)
    })
  }

  /** Registers a listener; call BEFORE the action that may trigger the event. */
  on(event: string, callback: (params: any) => void): () => void {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set())
    this.#listeners.get(event)!.add(callback)
    return () => this.#listeners.get(event)?.delete(callback)
  }

  /** Resolves on the next occurrence of `event`. Attach before triggering the action. */
  once(event: string): Promise<any> {
    return new Promise((resolve) => {
      const off = this.on(event, (params) => {
        off()
        resolve(params)
      })
    })
  }

  /**
   * Resolves on the next occurrence of `event` matching `predicate`, with a
   * NODE-SIDE timeout (setTimeout in this Node process, not inside the
   * page) — this never adds any wait-related event to the browser's own
   * trace, unlike a page-side timeout embedded in a Runtime.evaluate call.
   */
  waitFor(event: string, predicate: (params: any) => boolean, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const off = this.on(event, (params) => {
        if (!predicate(params)) return
        off()
        clearTimeout(timer)
        resolve(params)
      })
      const timer = setTimeout(() => {
        off()
        reject(new Error(`waitFor(${event}) timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#ws.close()
  }
}
