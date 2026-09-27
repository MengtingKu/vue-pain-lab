// Reactive Chain — CDP trace matrix runner (Vapor Validation, rc.9 Freeze Point).
//
// First CDP pipeline for this Scenario. Its historical 3.5.40 / 3.6.0-rc.2
// validation was in-page only (README / validation-log.md). The protocol is
// identical to run-component-storm-matrix.ts's `runVersionMatrix()` — only
// the adapter (reactive-chain-scenario.ts) and output path differ:
//
//   reset (Page.navigate) -> waitForAppReady -> assert DEPTH=100 /
//   AUTO_UPDATE=false -> waitForBrowserFrames(2) -> [measurement:
//   Tracing.start] -> ONE fireTriggerUpdate + waitForUpdateComplete ->
//   [measurement: waitForBrowserFrames(2) -> Tracing.end -> save]
//
//   1 operation (update) x 2 trace sources (cost-trace,
//   runtime-attribution-trace) x (WARMUP 3 + MEASUREMENT 10) trials
//
// Single click per trace, same as vdom-stress / component-storm (one update
// at DEPTH=100 is ~3ms in headless Chrome, enough profiler samples).
//
// Initialization (the chain is built in component setup, before any button
// exists) is not traced — same reasoning as component-storm's Mount, see
// docs/decisions/component-storm-vapor-validation-scope.md. The page has no
// in-page init-time metric either.
//
// DEPTH is a compile-time constant in ReactiveChainPage.vue; changing it would
// modify the Scenario, so only DEPTH=100 is measured.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import {
  enableCompletionBinding,
  fireTriggerUpdate,
  readMetrics,
  readParams,
  waitForAppReady,
  waitForUpdateComplete,
} from './reactive-chain-scenario.ts'
import { waitForBrowserFrames } from './sync.ts'
import {
  startTracing,
  stopTracingAndSave,
  TRACE_CATEGORIES,
  TRACE_CATEGORIES_NO_CPU_PROFILER,
} from './tracer.ts'

export type TraceSourceName = 'cost-trace' | 'runtime-attribution-trace'

const EXPECTED_DEPTH = '100'
const WARMUP = 3
const MEASUREMENT = 10
const SCENARIO_PATH = '/scenarios/reactive-chain'
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
      if (params['DEPTH'] !== EXPECTED_DEPTH || params['AUTO_UPDATE'] !== 'false') {
        throw new Error(
          `page params drift detected: expected DEPTH=${EXPECTED_DEPTH} AUTO_UPDATE=false, ` +
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

      // Trailing-edge frame-sync, same rationale as the other runners.
      if (isMeasurement) {
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)
      }

      const metricsAfter = await readMetrics(client)
      return { metricsAfter, tTriggerSent, tTriggerReturned, tCompletionObserved }
    } catch (err) {
      lastError = err
      console.warn(
        `     [retry] attempt ${attempt}/${maxAttempts} failed (source=${source.name}): ${String(err)}`,
      )
      if (tracingActive) await abortActiveTrace(client)
    }
  }
  throw new Error(
    `runCycleWithRetry exhausted ${maxAttempts} attempts (source=${source.name}): ${String(lastError)}`,
  )
}

/** Runs the DEPTH=100 update condition: 1 operation x 2 trace sources. */
export async function runVersionMatrix(cond: VersionCondition): Promise<void> {
  console.log(`\n=== Reactive Chain CDP trace matrix: ${cond.vueVersion} (${cond.baseUrl}) ===`)
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
        'reactive-chain',
        `vue-${cond.vueVersion}`,
        `update-depth-${EXPECTED_DEPTH}`,
      )

      for (const source of SOURCES) {
        console.log(`  -- source=${source.name} --`)
        let measurementIndex = 0
        for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
          const isMeasurement = i >= WARMUP
          const cycle = await runCycleWithRetry(client, url, isMeasurement, source, 3)

          if (!isMeasurement) continue

          measurementIndex++
          const trialLabel = String(measurementIndex).padStart(2, '0')
          const trialDir = join(baseDir, `trial-${trialLabel}`)
          mkdirSync(trialDir, { recursive: true })
          const tracePath = join(trialDir, `${source.name}.trace.json`)
          const metaPath = join(trialDir, `${source.name}.meta.json`)

          const saved = await stopTracingAndSave(client, tracePath)

          const meta = {
            scenario: 'reactive-chain',
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
            depth: EXPECTED_DEPTH,
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
