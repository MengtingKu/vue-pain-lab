// Formal Vue 3.5.40 vs Vue 3.6.0-rc.2 Validation — Matrix Runner.
//
// Measurement Infrastructure is FROZEN as of FINAL_CALIBRATION_REPORT.md.
// This script does not add, change, or redesign any infrastructure — it
// only ORCHESTRATES the existing, already-validated building blocks
// (chrome.ts, scenario.ts, sync.ts, tracer.ts) across the full matrix:
//
//   2 Vue versions × 4 Node Counts × 2 Operations × 10 measurement trials
//   (+3 warm-up each) × 2 trace sources (cost-trace, runtime-attribution-trace)
//   = 160 logical measurement trials, 320 physical trigger+trace cycles
//
// Per-trial protocol, UNCHANGED from the frozen infrastructure:
//   reset (Page.navigate) -> waitForAppReady -> [Mount priming if operation
//   is 'update'] -> waitForBrowserFrames(2) -> Tracing.start(category set)
//   -> fireTriggerRender (no awaitPromise) -> waitForRenderComplete
//   (Runtime.bindingCalled) -> Tracing.end() -> save
//
// Mount vs Update requires ZERO infrastructure changes: fireTriggerRender()
// just clicks the button — whether that click is a Mount or an Update is
// entirely decided by the Scenario itself (cards.length === 0), same rule
// used throughout this Lab. Tracing Mount = skip the priming click (cards
// is already [] right after a fresh Page.navigate). Tracing Update = prime
// with one untraced click first (existing triggerRenderAndWait), exactly as
// already established.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import {
  enableCompletionBinding,
  fireTriggerRender,
  triggerRenderAndWait,
  waitForAppReady,
  waitForRenderComplete,
} from './scenario.ts'
import { waitForBrowserFrames } from './sync.ts'
import { startTracing, stopTracingAndSave, TRACE_CATEGORIES, TRACE_CATEGORIES_NO_CPU_PROFILER } from './tracer.ts'

export type Operation = 'mount' | 'update'
export type TraceSourceName = 'cost-trace' | 'runtime-attribution-trace'

const WARMUP = 3
const MEASUREMENT = 10
const SCENARIO_PATH = '/scenarios/vdom-stress'
const PRIME_SETTLE_FRAMES = 2

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
  renderDurationText: string
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
    // best-effort — if there was nothing to abort, that's fine
  }
}

/**
 * Runs one reset -> [prime] -> frame-sync -> [trace] -> trigger -> observe
 * cycle using the FROZEN protocol (identical calls to the already-validated
 * infrastructure, unchanged), retrying on transient CDP failures (e.g. one
 * observed Runtime.bindingCalled timeout during a long unattended run — see
 * file header) rather than silently losing a trial. Throws if all retries
 * are exhausted, per the Hard Stop Conditions (never fabricates a result).
 */
async function runCycleWithRetry(
  client: CDPClient,
  url: string,
  operation: Operation,
  nodeCount: number,
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
      // Defensive re-assert (idempotent, cheap): guards against the binding
      // not being present in a freshly navigated document — not a protocol
      // change, just insurance around the existing addBinding call.
      await enableCompletionBinding(client)
      await waitForAppReady(client)

      if (operation === 'update') {
        await triggerRenderAndWait(client, nodeCount)
      }
      await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)

      if (isMeasurement) {
        await startTracing(client, source.categories)
        tracingActive = true
      }

      const tTriggerSent = nowMs()
      const completionPromise = waitForRenderComplete(client)
      await fireTriggerRender(client, nodeCount)
      const tTriggerReturned = nowMs()
      const renderDurationText = await completionPromise
      const tCompletionObserved = nowMs()

      // Trailing-edge frame-sync (symmetric to the existing leading-edge fix
      // in sync.ts — same helper, no new mechanism): nextTick()/the
      // completion binding firing only means Vue's JS finished, not that the
      // browser has run a rendering frame for it yet. For a large, single,
      // uninterrupted synchronous JS block (confirmed via direct trace
      // inspection for Mount N=5000: one 50ms RunMicrotasks event with zero
      // Layout/Paint anywhere in the trace — JS and Layout/Paint share one
      // main thread, so Layout/Paint cannot run until this JS task ends AND
      // the browser gets a subsequent frame), calling Tracing.end()
      // immediately after completion misses that action's own Layout/Paint
      // entirely. Only needed when actually tracing (isMeasurement).
      if (isMeasurement) {
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)
      }

      return { renderDurationText, tTriggerSent, tTriggerReturned, tCompletionObserved }
    } catch (err) {
      lastError = err
      console.warn(
        `     [retry] attempt ${attempt}/${maxAttempts} failed (operation=${operation}, source=${source.name}): ${String(err)}`,
      )
      if (tracingActive) await abortActiveTrace(client)
    }
  }
  throw new Error(
    `runCycleWithRetry exhausted ${maxAttempts} attempts (operation=${operation}, source=${source.name}): ${String(lastError)}`,
  )
}

/** Runs one (vueVersion × nodeCount) condition: all operations × all trace sources. */
export async function runVersionNodeCount(
  cond: VersionCondition,
  nodeCount: number,
  operations: Operation[] = ['mount', 'update'],
): Promise<void> {
  console.log(`\n### ${cond.vueVersion} — N=${nodeCount} ###`)
  const chrome = await launchIsolatedChrome(cond.chromePort, 'headless')
  console.log(`  user-data-dir: ${chrome.userDataDir}, pid: ${chrome.pid}`)

  try {
    const versionInfo = await chrome.browserVersion()
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error(`No page target found (${cond.vueVersion}, N=${nodeCount})`)

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await enableCompletionBinding(client)

      const url = `${cond.baseUrl}${SCENARIO_PATH}`

      for (const operation of operations) {
        for (const source of SOURCES) {
          console.log(`  -- operation=${operation} source=${source.name} --`)
          const baseDir = join('results', 'cdp-trace', `vue-${cond.vueVersion}`, `${operation}-${nodeCount}`)

          let measurementIndex = 0
          for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
            const isMeasurement = i >= WARMUP

            // Resilience, not a protocol change: a long unattended run (320
            // cycles) hit one rare Runtime.bindingCalled timeout during
            // dogfooding (see run-validation-matrix's smoke-test notes) —
            // cause not fully isolated, but re-navigating and retrying the
            // SAME frozen protocol (never altering it) prevents a transient
            // CDP hiccup from silently costing a trial. Fails loudly (throws)
            // if retries are also exhausted, per the Hard Stop Conditions —
            // never silently skips or fabricates a trial.
            const cycleResult = await runCycleWithRetry(client, url, operation, nodeCount, isMeasurement, source, 3)
            const { renderDurationText, tTriggerSent, tTriggerReturned, tCompletionObserved } = cycleResult

            if (!isMeasurement) continue

            measurementIndex++
            const trialLabel = String(measurementIndex).padStart(2, '0')
            const trialDir = join(baseDir, `trial-${trialLabel}`)
            mkdirSync(trialDir, { recursive: true })
            const tracePath = join(trialDir, `${source.name}.trace.json`)
            const metaPath = join(trialDir, `${source.name}.meta.json`)

            const saved = await stopTracingAndSave(client, tracePath)

            const meta = {
              source: source.name,
              traceCategories: source.categories,
              pairedTrialIndex: measurementIndex,
              pairingNote:
                'Same trial index, NOT the same physical click — cost-trace and ' +
                'runtime-attribution-trace for this index are two separate executions ' +
                'of an identical protocol (CDP Tracing only supports one active trace).',
              harnessFrameSync: { enabled: true, primeSettleFrames: PRIME_SETTLE_FRAMES },
              triggerObservationSeparation: {
                enabled: true,
                mechanism: 'Runtime.addBinding + Runtime.bindingCalled',
              },
              chromeMode: 'headless',
              vueVersion: cond.vueVersion,
              nodeVersion: process.version,
              browserVersion: versionInfo.Browser,
              nodeCount,
              operation,
              trial: measurementIndex,
              warmupCount: WARMUP,
              timestamp: new Date().toISOString(),
              url,
              renderDurationText,
              renderDurationMs: renderDurationText ? Number.parseFloat(renderDurationText) : null,
              timingMs: {
                triggerDuration: tTriggerReturned - tTriggerSent,
                completionWaitDuration: tCompletionObserved - tTriggerReturned,
                totalTriggerToCompletion: tCompletionObserved - tTriggerSent,
              },
              traceFile: `${source.name}.trace.json`,
              traceBytes: saved.bytes,
              traceEventCount: saved.eventCount,
            }
            writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
          }
          console.log(`     ${operation}/${source.name}: ${measurementIndex}/${MEASUREMENT} trials saved`)
        }
      }
    } finally {
      await client.close()
    }
  } finally {
    await chrome.kill()
  }
}
