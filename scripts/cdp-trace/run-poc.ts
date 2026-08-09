// CDP Trace Validation Runner PoC — orchestrator.
//
// Scope is intentionally frozen to exactly what the task asked for:
//   Vue 3.5.40 / Node Count = 5000 / Operation = Update / Trials = 3
// Warm-up = 3 (discarded, untraced). No other Node Count, no Mount, no
// Vue 3.6 comparison, no 10-trial run. This only validates that the CDP
// tracing pipeline itself works end-to-end.
//
// Per-trial procedure (matches task spec exactly):
//   reset (fresh navigation) -> prime to Update-state (untraced Mount click)
//   -> [warm-up: stop here, discarded] / [measurement: Tracing.start]
//   -> trigger Update -> wait for completion -> Tracing.end -> save trace + meta

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import { ensureDevServer } from './devserver.ts'
import { triggerRenderAndWait, waitForAppReady } from './scenario.ts'
import { startTracing, stopTracingAndSave } from './tracer.ts'

const VUE_VERSION = '3.5.40'
const NODE_COUNT = 5000
const OPERATION = 'update' as const
const WARMUP = 3
const MEASUREMENT = 3
const CDP_PORT = 9333
const SCENARIO_PATH = '/scenarios/vdom-stress'

async function main(): Promise<void> {
  console.log('[1/6] Ensuring dev server…')
  const dev = await ensureDevServer()
  console.log(`      dev server: ${dev.url} (spawned by this script: ${dev.spawned})`)

  console.log('[2/6] Launching isolated Chrome instance…')
  const chrome = await launchIsolatedChrome(CDP_PORT)
  console.log(`      user-data-dir: ${chrome.userDataDir}`)
  console.log(`      chrome pid: ${chrome.pid}`)

  let exitCode = 0
  try {
    const versionInfo = await chrome.browserVersion()
    console.log(`      browser: ${versionInfo.Browser}, protocol: ${versionInfo['Protocol-Version']}`)

    console.log('[3/6] Finding target page and opening CDP session…')
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error(`No page target found. Targets: ${JSON.stringify(targets)}`)
    console.log(`      target id: ${pageTarget.id}`)

    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    console.log('      CDP session established.')

    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')

      const url = `${dev.url}${SCENARIO_PATH}`
      const outDir = join('results', 'cdp-trace', 'vdom-stress', `vue-${VUE_VERSION}`, `${OPERATION}-${NODE_COUNT}`)
      mkdirSync(outDir, { recursive: true })

      console.log(`[4/6] Running ${WARMUP} warm-up + ${MEASUREMENT} measurement trials…`)
      let measurementIndex = 0

      for (let i = 0; i < WARMUP + MEASUREMENT; i++) {
        const isMeasurement = i >= WARMUP
        const label = isMeasurement ? `measurement ${i - WARMUP + 1}/${MEASUREMENT}` : `warm-up ${i + 1}/${WARMUP}`
        console.log(`      -- trial: ${label} --`)

        // reset: fresh navigation guarantees cards === [] (Mount state)
        const loadFired = client.once('Page.loadEventFired')
        await client.send('Page.navigate', { url })
        await loadFired
        await waitForAppReady(client)

        // prime: first Trigger Render click on an empty `cards` = Mount.
        // Needed to reach the Update-eligible state; not itself measured.
        await triggerRenderAndWait(client, NODE_COUNT)

        if (isMeasurement) {
          await startTracing(client)
        }

        // the measured action: cards already has NODE_COUNT items, so this
        // click is an Update (Scenario's own mount/update rule, unmodified).
        const renderDurationText = await triggerRenderAndWait(client, NODE_COUNT)
        console.log(`         renderDuration (in-page, informational only): ${renderDurationText}`)

        if (!isMeasurement) continue

        measurementIndex++
        const trialLabel = String(measurementIndex).padStart(2, '0')
        const tracePath = join(outDir, `trial-${trialLabel}.trace.json`)
        const metaPath = join(outDir, `trial-${trialLabel}.meta.json`)

        const saved = await stopTracingAndSave(client, tracePath)
        console.log(`         saved trace: ${tracePath} (${saved.bytes} bytes, ${saved.eventCount} events)`)

        const meta = {
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
          traceFile: `trial-${trialLabel}.trace.json`,
          traceBytes: saved.bytes,
          traceEventCount: saved.eventCount,
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        console.log(`         saved meta:  ${metaPath}`)
      }

      console.log('[5/6] All trials complete.')
      console.log(`      output dir: ${outDir}`)
    } finally {
      await client.close()
    }
  } catch (err) {
    exitCode = 1
    console.error('PoC failed:', err)
  } finally {
    console.log('[6/6] Shutting down…')
    await chrome.kill()
    await dev.stopIfSpawned()
  }

  process.exitCode = exitCode
}

main()
