// CDP Trace Harness — Phase 2/5.3 (Calibration Only) after the Phase 1 +
// Phase 5.1 fixes.
//
// Scope, exactly as specified: Vue 3.5.40 / Node Count = 5000 / Operation =
// Update / Warm-up = 3 (discarded) / Measurement = 10. Single Chrome mode
// (headless). No Vue 3.6, no other Node Count, no Mount, no Scenario changes.
//
// Two harness fixes now active, both layered on top of nextTick(), neither
// replacing it (see sync.ts and scenario.ts for the evidence each addresses):
//   Phase 1   — waitForBrowserFrames() between the priming Mount and
//               Tracing.start(), so the Mount's own pending rendering work
//               doesn't bleed into the traced Update window.
//   Phase 5.1 — the MEASURED trigger uses fireTriggerRender() (fire and
//               return immediately, no awaitPromise) + waitForRenderComplete()
//               (a separate Runtime.bindingCalled CDP event) instead of one
//               blocking Runtime.evaluate({awaitPromise:true}) that wrapped
//               both the click AND the wait — that pattern was confirmed to
//               nest ~53ms of harness wait time inside a single
//               EvaluateScript trace event (HARNESS_FIX_REPORT.md Phase 5).
//               The priming click still uses the old blocking
//               triggerRenderAndWait() — fine, since priming happens before
//               Tracing.start(), so its wait time is never inside a trace.
//
// Also adds Phase 5.5 Node-side timing instrumentation (trigger duration vs
// completion-wait duration vs trace start/end) so Render Duration
// instability can be diagnosed without touching the Scenario.

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
import { startTracing, stopTracingAndSave } from './tracer.ts'

const VUE_VERSION = '3.5.40'
const NODE_COUNT = 5000
const OPERATION = 'update' as const
const WARMUP = 3
const MEASUREMENT = 10
const CDP_PORT = 9336
const SCENARIO_PATH = '/scenarios/vdom-stress'
const PRIME_SETTLE_FRAMES = 2

const nowMs = () => Number(process.hrtime.bigint()) / 1e6

async function main(): Promise<void> {
  console.log('Ensuring dev server…')
  const dev = await ensureDevServer()
  console.log(`  dev server: ${dev.url} (spawned by this script: ${dev.spawned})`)

  console.log('Launching isolated headless Chrome…')
  const chrome = await launchIsolatedChrome(CDP_PORT, 'headless')
  console.log(`  user-data-dir: ${chrome.userDataDir}, pid: ${chrome.pid}`)

  try {
    const versionInfo = await chrome.browserVersion()
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error('No page target found')

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await enableCompletionBinding(client) // Phase 5.1 — once per session

      const url = `${dev.url}${SCENARIO_PATH}`
      const outDir = join('results', 'cdp-trace', 'harness-check', `vue-${VUE_VERSION}`, `${OPERATION}-${NODE_COUNT}`)
      mkdirSync(outDir, { recursive: true })

      let measurementIndex = 0
      for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
        const isMeasurement = i >= WARMUP
        const label = isMeasurement ? `measurement ${i - WARMUP + 1}/${MEASUREMENT}` : `warm-up ${i + 1}/${WARMUP}`
        console.log(`-- ${label} --`)

        const loadFired = client.once('Page.loadEventFired')
        await client.send('Page.navigate', { url })
        await loadFired
        await waitForAppReady(client)

        // prime: first click on empty cards = Mount. Untraced — old
        // blocking style is fine here (see file header).
        await triggerRenderAndWait(client, NODE_COUNT)

        // Phase 1 fix — wait for real browser frames, not just nextTick(),
        // before tracing the next (Update) trigger.
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)

        if (isMeasurement) await startTracing(client)

        // Phase 5.1 fix — fire and return immediately; observe completion
        // via a separate CDP event, not a second blocking evaluate.
        const tTriggerSent = nowMs()
        // Register the completion listener BEFORE firing, so a very fast
        // completion can't arrive before we're listening for it.
        const completionPromise = waitForRenderComplete(client)
        await fireTriggerRender(client, NODE_COUNT)
        const tTriggerReturned = nowMs()
        const renderDurationText = await completionPromise
        const tCompletionObserved = nowMs()

        if (!isMeasurement) {
          console.log(`   (warm-up, discarded) renderDuration=${renderDurationText}`)
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
          calibrationPhase: '5.3-harness-check',
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
          // Phase 5.5 timing breakdown — all Node-side high-res timestamps
          // (process.hrtime.bigint()), relative ms since tTriggerSent.
          timingMs: {
            triggerDuration: tTriggerReturned - tTriggerSent, // Runtime.evaluate round trip for the fire-only click
            completionWaitDuration: tCompletionObserved - tTriggerReturned, // separate CDP event wait
            totalTriggerToCompletion: tCompletionObserved - tTriggerSent, // cross-check vs renderDurationMs
            tracingEndCallDelay: tTracingEndCalled - tCompletionObserved, // harness overhead after completion, before Tracing.end()
            tracingEndToSaved: tTracingSaved - tTracingEndCalled,
          },
          traceFile: `trial-${trialLabel}.trace.json`,
          traceBytes: saved.bytes,
          traceEventCount: saved.eventCount,
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        console.log(
          `   saved trial-${trialLabel}: renderDuration=${renderDurationText}, ` +
            `trigger=${meta.timingMs.triggerDuration.toFixed(2)}ms, ` +
            `wait=${meta.timingMs.completionWaitDuration.toFixed(2)}ms, ` +
            `${saved.bytes} bytes, ${saved.eventCount} events`,
        )
      }
      console.log(`\nDone. output: ${outDir}`)
    } finally {
      await client.close()
    }
  } finally {
    await chrome.kill()
    await dev.stopIfSpawned()
  }
}

main().catch((err) => {
  console.error('Harness check run failed:', err)
  process.exitCode = 1
})
