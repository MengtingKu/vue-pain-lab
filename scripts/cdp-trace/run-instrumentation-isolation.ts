// Instrumentation Isolation Test — H-Instrumentation.
//
// Hypothesis: `disabled-by-default-v8.cpu_profiler` sampling/interrupt
// instrumentation is a material cause of V8.InvokeApiInterruptCallbacks'
// large self-time inside EvaluateScript (see
// results/cdp-trace/harness-check/PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md).
//
// Fixed across both runs: Vue 3.5.40, Node Count = 5000, Operation =
// Update, Warm-up = 3, Measurement = 10, headless, same Scenario, same
// Trigger (fireTriggerRender), same Observation (waitForRenderComplete via
// Runtime.bindingCalled), same reset (fresh Page.navigate), same browser
// flags, same trace categories EXCEPT cpu_profiler.
//
// Run A (profiler ON)  — TRACE_CATEGORIES (unchanged, the control)
// Run B (profiler OFF) — TRACE_CATEGORIES_NO_CPU_PROFILER (only variable changed)
//
// Two separate isolated Chrome launches (fresh temp profile each), run
// sequentially, mirroring run-calibration.ts's headless/headed pattern —
// isolates V8 heap/JIT state between conditions rather than reusing one
// long-lived session for both.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import { ensureDevServer } from './devserver.ts'
import {
  enableCompletionBinding,
  fireTriggerRender,
  triggerRenderAndWait,
  waitForAppReady,
  waitForRenderComplete,
} from './scenario.ts'
import { waitForBrowserFrames } from './sync.ts'
import { startTracing, stopTracingAndSave, TRACE_CATEGORIES, TRACE_CATEGORIES_NO_CPU_PROFILER } from './tracer.ts'

const VUE_VERSION = '3.5.40'
const NODE_COUNT = 5000
const OPERATION = 'update' as const
const WARMUP = 3
const MEASUREMENT = 10
const SCENARIO_PATH = '/scenarios/vdom-stress'
const PRIME_SETTLE_FRAMES = 2

type Condition = 'profiler-on' | 'profiler-off'

const nowMs = () => Number(process.hrtime.bigint()) / 1e6

async function runCondition(condition: Condition, categories: string[], port: number, devUrl: string): Promise<void> {
  console.log(`\n=== Run: ${condition} (categories: ${categories.length}) ===`)
  const chrome = await launchIsolatedChrome(port, 'headless')
  console.log(`  user-data-dir: ${chrome.userDataDir}, pid: ${chrome.pid}`)

  try {
    const versionInfo = await chrome.browserVersion()
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error(`No page target found for ${condition}`)

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await enableCompletionBinding(client)

      const url = `${devUrl}${SCENARIO_PATH}`
      const outDir = join('results', 'cdp-trace', 'calibration', 'instrumentation-isolation', condition, `vue-${VUE_VERSION}`, `${OPERATION}-${NODE_COUNT}`)
      mkdirSync(outDir, { recursive: true })

      let measurementIndex = 0
      for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
        const isMeasurement = i >= WARMUP
        const label = isMeasurement ? `measurement ${i - WARMUP + 1}/${MEASUREMENT}` : `warm-up ${i + 1}/${WARMUP}`
        console.log(`  -- ${label} --`)

        const loadFired = client.once('Page.loadEventFired')
        await client.send('Page.navigate', { url })
        await loadFired
        await waitForAppReady(client)

        // prime: untraced, same as run-harness-check.ts
        await triggerRenderAndWait(client, NODE_COUNT)
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)

        if (isMeasurement) await startTracing(client, categories)

        const tTriggerSent = nowMs()
        const completionPromise = waitForRenderComplete(client)
        await fireTriggerRender(client, NODE_COUNT)
        const tTriggerReturned = nowMs()
        const renderDurationText = await completionPromise
        const tCompletionObserved = nowMs()

        if (!isMeasurement) {
          console.log(`     (warm-up, discarded) renderDuration=${renderDurationText}`)
          continue
        }

        measurementIndex++
        const trialLabel = String(measurementIndex).padStart(2, '0')
        const tracePath = join(outDir, `trial-${trialLabel}.trace.json`)
        const metaPath = join(outDir, `trial-${trialLabel}.meta.json`)
        const tTracingEndCalled = nowMs()
        const saved = await stopTracingAndSave(client, tracePath)
        const tTracingSaved = nowMs()

        const meta = {
          experiment: 'instrumentation-isolation',
          condition,
          traceCategories: categories,
          harnessFrameSync: { enabled: true, primeSettleFrames: PRIME_SETTLE_FRAMES },
          triggerObservationSeparation: { enabled: true, mechanism: 'Runtime.addBinding + Runtime.bindingCalled' },
          chromeMode: 'headless',
          vueVersion: VUE_VERSION,
          nodeVersion: process.version,
          browserVersion: versionInfo.Browser,
          nodeCount: NODE_COUNT,
          operation: OPERATION,
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
            tracingEndCallDelay: tTracingEndCalled - tCompletionObserved,
            tracingEndToSaved: tTracingSaved - tTracingEndCalled,
          },
          traceFile: `trial-${trialLabel}.trace.json`,
          traceBytes: saved.bytes,
          traceEventCount: saved.eventCount,
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        console.log(
          `     saved trial-${trialLabel}: renderDuration=${renderDurationText}, ` +
            `trigger=${meta.timingMs.triggerDuration.toFixed(2)}ms, ${saved.bytes} bytes, ${saved.eventCount} events`,
        )
      }
      console.log(`  ${condition} complete. output: ${outDir}`)
    } finally {
      await client.close()
    }
  } finally {
    await chrome.kill()
  }
}

async function main(): Promise<void> {
  console.log('Ensuring dev server…')
  const dev = await ensureDevServer()
  console.log(`  dev server: ${dev.url} (spawned by this script: ${dev.spawned})`)

  try {
    await runCondition('profiler-on', TRACE_CATEGORIES, 9337, dev.url)
    await runCondition('profiler-off', TRACE_CATEGORIES_NO_CPU_PROFILER, 9338, dev.url)
    console.log('\nBoth conditions complete.')
  } finally {
    await dev.stopIfSpawned()
  }
}

main().catch((err) => {
  console.error('Instrumentation isolation run failed:', err)
  process.exitCode = 1
})
