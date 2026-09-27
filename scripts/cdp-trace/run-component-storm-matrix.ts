// Component Storm Runtime Attribution Validation — Matrix Runner (Day 30).
//
// Task: decompose the already-observed componentCount=500 / updateScope=
// 'AllChildren' Average Update Duration difference (Vue 3.5.40 187.405ms ->
// Vue 3.6.0-rc.2 158.669ms, -15.3%, see src/scenarios/component-storm/README.md)
// into Application JS / Vue Runtime / Browser Rendering-Painting / Other
// Browser cost — NOT to re-measure Update Duration itself (that evidence
// already exists) and NOT to re-run the wall-clock methodology.
//
// Measurement Infrastructure is FROZEN as of FINAL_CALIBRATION_REPORT.md /
// TRACE_EVIDENCE_SCHEMA.md. This script does not add, change, or redesign
// any of it — it only orchestrates the existing, already-validated building
// blocks (chrome.ts, tracer.ts, sync.ts, devserver.ts, evidence.ts) plus the
// new component-storm-scenario.ts adapter (this Scenario's DOM shape only —
// no protocol redesign) across ONE fixed condition:
//
//   componentCount=500, updateScope='AllChildren' (the frozen config.ts
//   value on BOTH `main` and the `vue-pain-lab-vue36` worktree — verified,
//   not assumed, see readParams() assertion below) x 1 operation (update)
//   x 2 trace sources (cost-trace, runtime-attribution-trace) x
//   (WARMUP + MEASUREMENT) trials.
//
// Per-trial protocol (mirrors run-validation-matrix.ts's frozen shape,
// adapted only where component-storm's DOM/semantics genuinely differ):
//
//   reset (Page.navigate) -> waitForAppReady -> assert params match
//   -> waitForBrowserFrames(2) -> [measurement: Tracing.start]
//   -> ONE fireTriggerUpdate + waitForUpdateComplete
//   -> [measurement: waitForBrowserFrames(2) -> Tracing.end -> save]
//
// Single trigger per trial (NOT batched like composable-chaos's
// UPDATE_BATCH_SIZE=20): AllChildren@500's own Average Update Duration is
// already ~150-190ms per click — an order of magnitude above
// composable-chaos's sub-ms Depths that needed batching for CPU-profiler
// sample density. A single click already yields hundreds of profiler
// samples, and single-trigger-per-trial is the SAME methodology
// run-validation-matrix.ts (vdom-stress, the Day 19 precedent this task
// explicitly asks to reuse) already uses. WARMUP=3 / MEASUREMENT=10 also
// matches that precedent's Final Calibration trial count.
//
// Mount is deliberately OUT OF SCOPE for this runner: unlike vdom-stress
// (Mount = the FIRST "Trigger Render" click, cards.length === 0 initially)
// component-storm mounts all 500 children synchronously during Vue's own
// app-mount lifecycle, before any button exists to click into — tracing it
// would require starting Tracing.start() BEFORE Page.navigate and detecting
// completion some other way, which is new protocol surface this task's
// specific ask (attribute the -15.3% Update Duration difference) doesn't
// need. Documented as a Next Step, not silently dropped.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import { ensureDevServer } from './devserver.ts'
import {
  enableCompletionBinding,
  fireTriggerUpdate,
  readMetrics,
  readParams,
  waitForAppReady,
  waitForUpdateComplete,
} from './component-storm-scenario.ts'
import { waitForBrowserFrames } from './sync.ts'
import { startTracing, stopTracingAndSave, TRACE_CATEGORIES, TRACE_CATEGORIES_NO_CPU_PROFILER } from './tracer.ts'

export type TraceSourceName = 'cost-trace' | 'runtime-attribution-trace'

const VUE_VERSION = '3.5.40'
const EXPECTED_COMPONENT_COUNT = '500'
const EXPECTED_UPDATE_SCOPE = 'AllChildren'
const WARMUP = 3
const MEASUREMENT = 10
const SCENARIO_PATH = '/scenarios/component-storm'
const PRIME_SETTLE_FRAMES = 2
const CDP_PORT = 9350

const nowMs = () => Number(process.hrtime.bigint()) / 1e6

const SOURCES: Array<{ name: TraceSourceName; categories: string[] }> = [
  { name: 'cost-trace', categories: TRACE_CATEGORIES_NO_CPU_PROFILER },
  { name: 'runtime-attribution-trace', categories: TRACE_CATEGORIES },
]

export interface VersionCondition {
  vueVersion: string
  baseUrl: string
  chromePort: number
}

interface CycleResult {
  metricsAfter: Record<string, string>
  tTriggerSent: number
  tTriggerReturned: number
  tCompletionObserved: number
}

/** Discards an active trace without saving — used only to reset Tracing state before a retry. */
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
  isMeasurement: boolean,
  source: { name: TraceSourceName; categories: string[] },
  maxAttempts: number,
  updateScope: string,
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

      const params = await readParams(client)
      if (params['COMPONENT_COUNT'] !== EXPECTED_COMPONENT_COUNT || params['UPDATE_SCOPE'] !== updateScope) {
        throw new Error(
          `config.ts drift detected: expected COMPONENT_COUNT=${EXPECTED_COMPONENT_COUNT} UPDATE_SCOPE=${updateScope}, ` +
            `got ${JSON.stringify(params)} — refusing to record a mismatched trial`,
        )
      }

      await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)

      if (isMeasurement) {
        await startTracing(client, source.categories)
        tracingActive = true
      }

      const tTriggerSent = nowMs()
      const completionPromise = waitForUpdateComplete(client)
      await fireTriggerUpdate(client)
      const tTriggerReturned = nowMs()
      await completionPromise
      const tCompletionObserved = nowMs()

      // Trailing-edge frame-sync, same rationale as run-validation-matrix.ts
      // / run-composable-chaos-matrix.ts: the completion binding firing only
      // means Vue's own JS finished, not that the browser ran a rendering
      // frame for it yet.
      if (isMeasurement) {
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)
      }

      const metricsAfter = await readMetrics(client)

      return { metricsAfter, tTriggerSent, tTriggerReturned, tCompletionObserved }
    } catch (err) {
      lastError = err
      console.warn(`     [retry] attempt ${attempt}/${maxAttempts} failed (source=${source.name}): ${String(err)}`)
      if (tracingActive) await abortActiveTrace(client)
    }
  }
  throw new Error(`runCycleWithRetry exhausted ${maxAttempts} attempts (source=${source.name}): ${String(lastError)}`)
}

/**
 * Runs one componentCount=500 condition: 1 operation x 2 trace sources.
 * `updateScope` defaults to the Day 30 condition ('AllChildren'); the Vapor
 * validation passes the other scopes. It never changes config.ts itself —
 * the caller builds the page with the matching config.ts, and readParams()
 * still refuses to record a trial whose page doesn't match.
 */
export async function runVersionMatrix(cond: VersionCondition, updateScope: string = EXPECTED_UPDATE_SCOPE): Promise<void> {
  console.log(`\n=== Component Storm CDP trace matrix: ${cond.vueVersion} (${cond.baseUrl}) ===`)
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
      const baseDir = join(
        'results',
        'cdp-trace',
        'component-storm',
        `vue-${cond.vueVersion}`,
        `update-${EXPECTED_COMPONENT_COUNT}-${updateScope}`,
      )

      for (const source of SOURCES) {
        console.log(`  -- source=${source.name} --`)
        let measurementIndex = 0
        for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
          const isMeasurement = i >= WARMUP
          const cycle = await runCycleWithRetry(client, url, isMeasurement, source, 3, updateScope)

          if (!isMeasurement) continue

          measurementIndex++
          const trialLabel = String(measurementIndex).padStart(2, '0')
          const trialDir = join(baseDir, `trial-${trialLabel}`)
          mkdirSync(trialDir, { recursive: true })
          const tracePath = join(trialDir, `${source.name}.trace.json`)
          const metaPath = join(trialDir, `${source.name}.meta.json`)

          const saved = await stopTracingAndSave(client, tracePath)

          const meta = {
            scenario: 'component-storm',
            source: source.name,
            traceCategories: source.categories,
            harnessFrameSync: { enabled: true, primeSettleFrames: PRIME_SETTLE_FRAMES },
            triggerObservationSeparation: {
              enabled: true,
              mechanism: 'Runtime.addBinding + Runtime.bindingCalled',
            },
            chromeMode: 'headless',
            vueVersion: cond.vueVersion,
            nodeVersion: process.version,
            browserVersion: versionInfo.Browser,
            componentCount: EXPECTED_COMPONENT_COUNT,
            updateScope,
            operation: 'update',
            trial: measurementIndex,
            warmupCount: WARMUP,
            timestamp: new Date().toISOString(),
            url,
            metricsAfter: cycle.metricsAfter,
            timingMs: {
              triggerDuration: cycle.tTriggerReturned - cycle.tTriggerSent,
              completionWaitDuration: cycle.tCompletionObserved - cycle.tTriggerReturned,
              totalTriggerToCompletion: cycle.tCompletionObserved - cycle.tTriggerSent,
            },
            traceFile: `${source.name}.trace.json`,
            traceBytes: saved.bytes,
            traceEventCount: saved.eventCount,
          }
          writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        }
        console.log(`     update/${source.name}: ${measurementIndex}/${MEASUREMENT} trials saved`)
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
    console.log('[4/4] Complete.')
  } catch (err) {
    exitCode = 1
    console.error('run-component-storm-matrix failed:', err)
  } finally {
    await dev.stopIfSpawned()
  }
  process.exitCode = exitCode
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/run-component-storm-matrix.ts')
if (isMain) main()
