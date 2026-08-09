// Dual-Trace Architecture — Final Measurement Infrastructure Calibration.
//
// Formalizes the two trace sources confirmed by INSTRUMENTATION_ISOLATION_REPORT.md:
//   cost-trace                — TRACE_CATEGORIES_NO_CPU_PROFILER, the only
//                                valid source for Scripting/Rendering/
//                                Recalculate Style/Layout/Painting/Paint.
//   runtime-attribution-trace  — TRACE_CATEGORIES (profiler ON), the only
//                                valid source for Vue Runtime/Application/
//                                V8-native CPU attribution.
//
// CDP's Tracing domain only supports one active trace at a time, so "trial N"
// producing both traces means running the FULL reset → prime → frame-sync →
// trigger → observe cycle twice for that trial index — once per category
// set — not one physical click captured two ways. Both passes share
// identical Scenario, Node Count, Operation, Trigger, browser
// synchronization, and warm-up protocol; only the trace category set
// differs, exactly as in the Instrumentation Isolation Test.
//
// Output layout — one folder per trial index, both traces inside it, source
// unambiguous from the filename AND from meta.json's `source` field:
//   results/cdp-trace/vue-3.5.40/update-5000/trial-01/
//     cost-trace.trace.json / cost-trace.meta.json
//     runtime-attribution-trace.trace.json / runtime-attribution-trace.meta.json

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
import type { TraceSource } from './evidence.ts'

const VUE_VERSION = '3.5.40'
const NODE_COUNT = 5000
const OPERATION = 'update' as const
const WARMUP = 3
const MEASUREMENT = 10
const SCENARIO_PATH = '/scenarios/vdom-stress'
const PRIME_SETTLE_FRAMES = 2

const nowMs = () => Number(process.hrtime.bigint()) / 1e6

async function runSource(source: TraceSource, categories: string[], port: number, devUrl: string): Promise<void> {
  console.log(`\n=== ${source} (categories: ${categories.length}) ===`)
  const chrome = await launchIsolatedChrome(port, 'headless')
  console.log(`  user-data-dir: ${chrome.userDataDir}, pid: ${chrome.pid}`)

  try {
    const versionInfo = await chrome.browserVersion()
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error(`No page target found for ${source}`)

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await enableCompletionBinding(client)

      const url = `${devUrl}${SCENARIO_PATH}`
      const baseDir = join('results', 'cdp-trace', `vue-${VUE_VERSION}`, `${OPERATION}-${NODE_COUNT}`)

      let measurementIndex = 0
      for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
        const isMeasurement = i >= WARMUP
        const label = isMeasurement ? `measurement ${i - WARMUP + 1}/${MEASUREMENT}` : `warm-up ${i + 1}/${WARMUP}`
        console.log(`  -- ${label} --`)

        const loadFired = client.once('Page.loadEventFired')
        await client.send('Page.navigate', { url })
        await loadFired
        await waitForAppReady(client)

        // prime: untraced Mount, identical across both sources
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
        const trialDir = join(baseDir, `trial-${trialLabel}`)
        mkdirSync(trialDir, { recursive: true })
        const tracePath = join(trialDir, `${source}.trace.json`)
        const metaPath = join(trialDir, `${source}.meta.json`)

        const saved = await stopTracingAndSave(client, tracePath)

        const meta = {
          source, // 'cost-trace' | 'runtime-attribution-trace' — unambiguous, machine-readable
          traceCategories: categories,
          pairedTrialIndex: measurementIndex,
          pairingNote:
            'Same trial index, NOT the same physical click — CDP Tracing only supports one ' +
            'active trace at a time, so cost-trace and runtime-attribution-trace for this trial ' +
            'index are two separate executions of an identical protocol (see run-final-calibration.ts header).',
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
          },
          traceFile: `${source}.trace.json`,
          traceBytes: saved.bytes,
          traceEventCount: saved.eventCount,
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        console.log(
          `     saved trial-${trialLabel}/${source}: renderDuration=${renderDurationText}, ` +
            `${saved.bytes} bytes, ${saved.eventCount} events`,
        )
      }
      console.log(`  ${source} complete.`)
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
    await runSource('cost-trace', TRACE_CATEGORIES_NO_CPU_PROFILER, 9339, dev.url)
    await runSource('runtime-attribution-trace', TRACE_CATEGORIES, 9340, dev.url)
    console.log('\nBoth trace sources complete for all 10 trials.')
  } finally {
    await dev.stopIfSpawned()
  }
}

main().catch((err) => {
  console.error('Final calibration run failed:', err)
  process.exitCode = 1
})
