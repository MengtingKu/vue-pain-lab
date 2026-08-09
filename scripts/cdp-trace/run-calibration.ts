// Measurement Calibration Phase 1 — Headless vs Headed.
//
// Identical scenario / code / node count / operation / Vue version / CDP
// runner / warm-up / trial protocol as the original PoC (run-poc.ts). The
// ONLY thing that changes between the two runs is Chrome launch mode
// (headless=new vs a real window). 3 warm-up (discarded) + 10 measurement
// trials per mode.
//
// This script only CAPTURES the calibration data (traces + meta, including
// document.visibilityState so we can tell whether the two modes were even
// in comparable browser-scheduling states). Statistical comparison and the
// Phase 1 report live in analyze-calibration.ts, kept separate so a bad
// analysis run never requires re-capturing 20 trials of trace data.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome, type ChromeMode } from './chrome.ts'
import { ensureDevServer } from './devserver.ts'
import { triggerRenderAndWait, waitForAppReady } from './scenario.ts'
import { waitForBrowserFrames } from './sync.ts'
import { startTracing, stopTracingAndSave } from './tracer.ts'

// How many rendering frames to wait for after the priming Mount before
// starting the trace — see sync.ts for why this exists. 2 is the standard
// "guarantee one frame actually committed" number; kept as a named
// constant here so it shows up in trial meta.json for traceability.
const PRIME_SETTLE_FRAMES = 2

const VUE_VERSION = '3.5.40'
const NODE_COUNT = 5000
const OPERATION = 'update' as const
const WARMUP = 3
const MEASUREMENT = 10
const SCENARIO_PATH = '/scenarios/vdom-stress'

async function runMode(mode: ChromeMode, port: number, devUrl: string): Promise<void> {
  console.log(`\n=== Calibration run: mode=${mode} ===`)
  const chrome = await launchIsolatedChrome(port, mode)
  console.log(`  user-data-dir: ${chrome.userDataDir}, pid: ${chrome.pid}`)

  try {
    const versionInfo = await chrome.browserVersion()
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error(`No page target found for mode=${mode}`)

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      if (mode === 'headed') {
        // Best-effort: make sure the real window is the focused/foreground
        // one, since an unfocused headed window is a THIRD, undocumented
        // state (neither our headless baseline nor a normal foreground
        // browsing session) that we are not trying to calibrate against.
        await client.send('Page.bringToFront')
      }

      const url = `${devUrl}${SCENARIO_PATH}`
      const outDir = join('results', 'cdp-trace', 'calibration', mode, `${OPERATION}-${NODE_COUNT}`)
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

        const visibility = await client.send('Runtime.evaluate', {
          expression: 'document.visibilityState',
          returnByValue: true,
        })

        // prime: first click on empty cards = Mount, gets us to Update-eligible state
        await triggerRenderAndWait(client, NODE_COUNT)

        // nextTick() (inside triggerRenderAndWait, above) only guarantees Vue's
        // DOM patch is done — NOT that the browser has rendered a frame for it
        // yet. Wait for real frames before tracing so the Mount's own pending
        // Style/Layout/Paint work doesn't bleed into the Update trace window.
        // See sync.ts and CALIBRATION_REPORT.md Phase 2 for the evidence.
        await waitForBrowserFrames(client, PRIME_SETTLE_FRAMES)

        if (isMeasurement) await startTracing(client)

        const renderDurationText = await triggerRenderAndWait(client, NODE_COUNT)

        if (!isMeasurement) {
          console.log(`     (warm-up, discarded) renderDuration=${renderDurationText}`)
          continue
        }

        measurementIndex++
        const trialLabel = String(measurementIndex).padStart(2, '0')
        const tracePath = join(outDir, `trial-${trialLabel}.trace.json`)
        const metaPath = join(outDir, `trial-${trialLabel}.meta.json`)
        const saved = await stopTracingAndSave(client, tracePath)

        const meta = {
          calibrationPhase: 2, // harness-fix re-calibration (see sync.ts / PRIME_SETTLE_FRAMES)
          harnessFrameSync: { enabled: true, primeSettleFrames: PRIME_SETTLE_FRAMES },
          chromeMode: mode,
          vueVersion: VUE_VERSION,
          nodeVersion: process.version,
          browserVersion: versionInfo.Browser,
          nodeCount: NODE_COUNT,
          operation: OPERATION,
          trial: measurementIndex,
          warmupCount: WARMUP,
          timestamp: new Date().toISOString(),
          url,
          documentVisibilityStateAtNavigation: visibility.result?.value ?? null,
          renderDurationText,
          renderDurationMs: renderDurationText ? Number.parseFloat(renderDurationText) : null,
          traceFile: `trial-${trialLabel}.trace.json`,
          traceBytes: saved.bytes,
          traceEventCount: saved.eventCount,
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        console.log(
          `     saved trial-${trialLabel}: renderDuration=${renderDurationText}, ` +
            `${saved.bytes} bytes, ${saved.eventCount} events, visibility=${meta.documentVisibilityStateAtNavigation}`,
        )
      }
      console.log(`  mode=${mode} complete. output: ${outDir}`)
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
    // Sequential, not parallel: isolates each mode's run from the other's
    // process/CPU footprint, and keeps port allocation trivially simple.
    await runMode('headless', 9333, dev.url)
    await runMode('headed', 9334, dev.url)
    console.log('\nCalibration capture complete for both modes.')
  } finally {
    await dev.stopIfSpawned()
  }
}

main().catch((err) => {
  console.error('Calibration run failed:', err)
  process.exitCode = 1
})
