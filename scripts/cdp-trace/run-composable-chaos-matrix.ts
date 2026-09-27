// composable-chaos Controlled Validation — Matrix Runner.
//
// Validation Task, not Optimization. Reuses the FROZEN generic CDP
// infrastructure verbatim (chrome.ts, tracer.ts, sync.ts, devserver.ts) plus
// the new composable-chaos-scenario.ts adapter (this scenario's DOM shape
// only — no protocol redesign). Does not touch `src/scenarios/composable-chaos/*`,
// does not change Vue version (3.5.40 throughout), does not add any Depth
// beyond the Scenario's own DEPTH_OPTIONS = [1, 5, 10, 20].
//
//   4 Depths × 2 Operations (build / update) × 2 trace sources
//   (cost-trace, runtime-attribution-trace) × (WARMUP + MEASUREMENT) trials
//
// Per-trial protocol (mirrors run-validation-matrix.ts's frozen shape,
// adapted only where this Scenario's DOM/semantics genuinely differ):
//
//   reset (Page.navigate) -> waitForAppReady
//   -> [operation === 'update': untraced primeBuildAndWait(depth) so the
//      traced action is a pure update batch, not tangled with a build]
//   -> waitForBrowserFrames(2) -> [measurement: Tracing.start]
//   -> measured action:
//        'build'  -> ONE fireBuildChain(depth) + waitForBuildComplete
//        'update' -> UPDATE_BATCH_SIZE sequential fireTriggerUpdate +
//                    waitForUpdateComplete cycles (Node-side loop — every
//                    individual click still uses the same non-awaitPromise
//                    fire + separate-binding-event wait technique as
//                    scenario.ts's Phase 5.1 fix, just repeated N times
//                    inside one trace window, so no new wait-embedding
//                    pattern is introduced)
//   -> [measurement: waitForBrowserFrames(2) -> Tracing.end -> save]
//
// 'build' at every Depth (including Depth=1) is always a REBUILD — this
// Scenario's onMounted() already auto-builds Depth 1 once before any
// measured cycle runs, so there is no way to observe a virgin first-ever
// build without editing the Scenario (forbidden by the Freeze Rule). This
// is documented, not hidden: every 'build' trial measures dispose(previous
// chain) + createComposableChain(targetDepth), which is exactly what a real
// user does by picking a Depth and pressing "Build Chain" after the page
// has already loaded once.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import { ensureDevServer } from './devserver.ts'
import {
  enableCompletionBinding,
  fireBuildChain,
  fireTriggerUpdate,
  primeBuildAndWait,
  readAverageUpdateDuration,
  waitForAppReady,
  waitForBuildComplete,
  waitForUpdateComplete,
} from './composable-chaos-scenario.ts'
import { waitForBrowserFrames } from './sync.ts'
import { startTracing, stopTracingAndSave, TRACE_CATEGORIES, TRACE_CATEGORIES_NO_CPU_PROFILER } from './tracer.ts'

export type Operation = 'build' | 'update'
export type TraceSourceName = 'cost-trace' | 'runtime-attribution-trace'

const VUE_VERSION = '3.5.40'
const DEPTHS = [1, 5, 10, 20] as const
const WARMUP = 3
const MEASUREMENT = 5
const UPDATE_BATCH_SIZE = 20
const SCENARIO_PATH = '/scenarios/composable-chaos'
const PRIME_SETTLE_FRAMES = 2
const CDP_PORT = 9334

const nowMs = () => Number(process.hrtime.bigint()) / 1e6

const SOURCES: Array<{ name: TraceSourceName; categories: string[] }> = [
  { name: 'cost-trace', categories: TRACE_CATEGORIES_NO_CPU_PROFILER },
  { name: 'runtime-attribution-trace', categories: TRACE_CATEGORIES },
]

interface CycleResult {
  buildDurationText: string | null
  averageUpdateDurationText: string | null
  tActionStart: number
  tActionEnd: number
}

async function abortActiveTrace(client: CDPClient): Promise<void> {
  try {
    const tracingComplete = client.once('Tracing.tracingComplete')
    await client.send('Tracing.end')
    const { stream } = await tracingComplete
    if (stream) {
      for (;;) {
        const { eof } = await client.send('IO.read', { handle: stream, size: 1024 * 1024 })
        if (eof) break
      }
      await client.send('IO.close', { handle: stream })
    }
  } catch {
    // best-effort — nothing to abort is fine
  }
}

async function runCycleWithRetry(
  client: CDPClient,
  url: string,
  operation: Operation,
  depth: number,
  isMeasurement: boolean,
  source: { name: TraceSourceName; categories: string[] },
  maxAttempts: number,
): Promise<CycleResult> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let tracingActive = false
    try {
      const loadFired = client.once('Page.loadEventFired')
      await client.send('Page.navigate', { url })
      await loadFired
      await enableCompletionBinding(client) // idempotent re-assert after navigation
      await waitForAppReady(client)

      if (operation === 'update') {
        // Untraced priming build to target depth — the traced action is a
        // pure update batch, not conflated with a build.
        await primeBuildAndWait(client, depth)
      }

      await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)

      if (isMeasurement) {
        await startTracing(client, source.categories)
        tracingActive = true
      }

      const tActionStart = nowMs()
      let buildDurationText: string | null = null
      let averageUpdateDurationText: string | null = null

      if (operation === 'build') {
        const completionPromise = waitForBuildComplete(client)
        await fireBuildChain(client, depth)
        buildDurationText = await completionPromise
      } else {
        for (let j = 0; j < UPDATE_BATCH_SIZE; j++) {
          const completionPromise = waitForUpdateComplete(client)
          await fireTriggerUpdate(client)
          await completionPromise
        }
        averageUpdateDurationText = await readAverageUpdateDuration(client)
      }

      const tActionEnd = nowMs()

      if (isMeasurement) {
        // Trailing-edge frame-sync, symmetric to run-validation-matrix.ts's
        // use of the same helper: the completion binding firing only means
        // Vue's own JS finished, not that the browser ran a rendering frame
        // for it yet.
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)
      }

      return { buildDurationText, averageUpdateDurationText, tActionStart, tActionEnd }
    } catch (err) {
      lastError = err
      console.warn(
        `     [retry] attempt ${attempt}/${maxAttempts} failed (operation=${operation}, depth=${depth}, source=${source.name}): ${String(err)}`,
      )
      if (tracingActive) await abortActiveTrace(client)
    }
  }
  throw new Error(
    `runCycleWithRetry exhausted ${maxAttempts} attempts (operation=${operation}, depth=${depth}, source=${source.name}): ${String(lastError)}`,
  )
}

async function runDepth(client: CDPClient, url: string, depth: number, vueVersion: string, measurement: number): Promise<void> {
  console.log(`\n### Depth=${depth} ###`)
  for (const operation of ['build', 'update'] as Operation[]) {
    for (const source of SOURCES) {
      console.log(`  -- operation=${operation} source=${source.name} --`)
      const baseDir = join('results', 'cdp-trace', 'composable-chaos', `vue-${vueVersion}`, `${operation}-depth-${depth}`)

      let measurementIndex = 0
      for (let i = 0; i < WARMUP + measurement; i++) {
        const isMeasurement = i >= WARMUP
        const cycle = await runCycleWithRetry(client, url, operation, depth, isMeasurement, source, 3)

        if (!isMeasurement) continue

        measurementIndex++
        const trialLabel = String(measurementIndex).padStart(2, '0')
        const trialDir = join(baseDir, `trial-${trialLabel}`)
        mkdirSync(trialDir, { recursive: true })
        const tracePath = join(trialDir, `${source.name}.trace.json`)
        const metaPath = join(trialDir, `${source.name}.meta.json`)

        const saved = await stopTracingAndSave(client, tracePath)

        const meta = {
          scenario: 'composable-chaos',
          source: source.name,
          traceCategories: source.categories,
          harnessFrameSync: { enabled: true, primeSettleFrames: PRIME_SETTLE_FRAMES },
          triggerObservationSeparation: {
            enabled: true,
            mechanism: 'Runtime.addBinding + Runtime.bindingCalled (per-click, repeated for update batches)',
          },
          chromeMode: 'headless',
          vueVersion,
          nodeVersion: process.version,
          depth,
          operation,
          updateBatchSize: operation === 'update' ? UPDATE_BATCH_SIZE : null,
          trial: measurementIndex,
          warmupCount: WARMUP,
          timestamp: new Date().toISOString(),
          url,
          buildDurationText: cycle.buildDurationText,
          averageUpdateDurationText: cycle.averageUpdateDurationText,
          actionWallClockMs: cycle.tActionEnd - cycle.tActionStart,
          traceFile: `${source.name}.trace.json`,
          traceBytes: saved.bytes,
          traceEventCount: saved.eventCount,
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      }
      console.log(`     ${operation}/${source.name}: ${measurementIndex}/${measurement} trials saved`)
    }
  }
}

// ---------------------------------------------------------------------------
// REFACTOR (Day 24, Vue 3.6.0-rc.2 Validation) — the body of the original
// `main()` (single Vue 3.5.40 run against a dev server this script itself
// ensures on port 5173) is extracted into `runVersionMatrix()` below,
// parameterized by a VersionCondition instead of the module-level
// VUE_VERSION/CDP_PORT constants. This is a pure extraction: `main()` at the
// bottom of this file still does EXACTLY what it did before (ensureDevServer
// -> launchIsolatedChrome(CDP_PORT) -> run all DEPTHS with VUE_VERSION), just
// by calling the extracted function — no behavior change for the existing
// Vue 3.5.40 invocation. This lets a new sibling script
// (run-composable-chaos-matrix-vue36.ts) reuse the identical protocol
// against the vue-pain-lab-vue36 worktree's dev server (port 5174) without
// duplicating ~100 lines of retry/trace/meta logic, mirroring the
// VersionCondition pattern already established for vdom-stress in
// run-validation-matrix.ts.
// ---------------------------------------------------------------------------

export interface VersionCondition {
  vueVersion: string
  baseUrl: string
  chromePort: number
}

/**
 * Runs the full DEPTHS x operations x sources matrix for one already-running dev server / Vue version.
 * `measurement` defaults to the Day 24 protocol (MEASUREMENT = 5); the Vapor validation passes 10 to
 * match the vdom-stress / component-storm trial count. WARMUP and the per-trial protocol are unchanged.
 */
export async function runVersionMatrix(
  cond: VersionCondition,
  depths: readonly number[] = DEPTHS,
  measurement: number = MEASUREMENT,
): Promise<void> {
  console.log(`\n=== CDP trace matrix: ${cond.vueVersion} (${cond.baseUrl}) ===`)
  const chrome = await launchIsolatedChrome(cond.chromePort, 'headless')
  console.log(`  user-data-dir: ${chrome.userDataDir}, pid: ${chrome.pid}`)

  try {
    const versionInfo = await chrome.browserVersion()
    console.log(`  browser: ${versionInfo.Browser}`)

    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error(`No page target found (${cond.vueVersion})`)

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await enableCompletionBinding(client)

      const url = `${cond.baseUrl}${SCENARIO_PATH}`
      for (const depth of depths) {
        await runDepth(client, url, depth, cond.vueVersion, measurement)
      }
    } finally {
      await client.close()
    }
  } finally {
    await chrome.kill()
  }
}

async function main(): Promise<void> {
  console.log('[1/4] Ensuring dev server…')
  const dev = await ensureDevServer()
  console.log(`      dev server: ${dev.url} (spawned by this script: ${dev.spawned})`)

  let exitCode = 0
  try {
    console.log('[2-3/4] Launching isolated Chrome instance + running matrix…')
    await runVersionMatrix({ vueVersion: VUE_VERSION, baseUrl: dev.url, chromePort: CDP_PORT })
    console.log('[4/4] All depths complete.')
  } catch (err) {
    exitCode = 1
    console.error('run-composable-chaos-matrix failed:', err)
  } finally {
    await dev.stopIfSpawned()
  }
  process.exitCode = exitCode
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/run-composable-chaos-matrix.ts')
if (isMain) main()
