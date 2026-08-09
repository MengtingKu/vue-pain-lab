// CDP Trace Validation Runner PoC — dev server access.
//
// Not part of the task's required file list, but the Scenario has to be
// served over HTTP for Chrome to load it. Follows the repo's Process
// Management Rule (.claude/skills/validate-vue-update): never kill node
// processes in bulk. If a dev server is already listening on the port
// (common — this repo's dev server was already running on 5173 when this
// PoC was written), it is reused as-is and never touched. Only a server this
// script itself spawned is ever stopped, and only that one PID.

import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

export interface DevServerHandle {
  url: string
  spawned: boolean
  pid?: number
  stopIfSpawned(): Promise<void>
}

export async function ensureDevServer(port = 5173, timeoutMs = 20_000): Promise<DevServerHandle> {
  const url = `http://localhost:${port}`

  if (await isResponding(url)) {
    return {
      url,
      spawned: false,
      async stopIfSpawned() {
        // Not ours — leave it running.
      },
    }
  }

  // Spawn Vite's bin directly (single `node` process) instead of
  // `npm run dev` (which goes through an extra cmd.exe/npm process tree on
  // Windows), so the PID we track is the actual dev server process and
  // shutdown never has to guess at a tree.
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port)], {
    stdio: 'ignore',
    cwd: process.cwd(),
  })

  const deadline = Date.now() + timeoutMs
  let ready = false
  while (Date.now() < deadline) {
    if (await isResponding(url)) {
      ready = true
      break
    }
    await delay(200)
  }
  if (!ready) {
    proc.kill()
    throw new Error(`Dev server did not become ready on ${url} within ${timeoutMs}ms`)
  }

  return {
    url,
    spawned: true,
    pid: proc.pid,
    async stopIfSpawned() {
      await stopProcess(proc)
    },
  }
}

async function isResponding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

async function stopProcess(proc: ChildProcess): Promise<void> {
  if (proc.pid === undefined || proc.exitCode !== null) return
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
  proc.kill()
  await Promise.race([exited, delay(5_000)])
}
