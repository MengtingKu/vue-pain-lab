// Investigation (Day 30 follow-up): does pushing the scenario tab into the
// SAME `document.hidden === true` state the README's claude-in-chrome
// methodology had (vs. this Lab's isolated-single-tab CDP matrix, which is
// always `document.hidden === false`) reproduce the README's ~150-190ms
// AllChildren@500 Update Duration magnitude and its -15.3% direction?
//
// NOT part of the frozen matrix/evidence pipeline — this is a targeted,
// throwaway diagnostic reusing component-storm-scenario.ts's DOM adapter
// (waitForAppReady/fireTriggerUpdate/waitForUpdateComplete/readMetrics)
// verbatim, no CDP tracing (no Tracing.start/stop — this only needs the
// page's own `performance.now()`-based Average Update Duration text, read
// after every single click).
//
// Mechanism: CDP's `Target.createTarget` + `Target.activateTarget` opens a
// second tab and makes it the active one — this alone flips the FIRST tab's
// `document.visibilityState` to 'hidden' (confirmed empirically: no window
// minimize / OS focus manipulation needed, works identically in headless
// mode). This is a controlled, repeatable way to reproduce the background-tab
// condition instead of relying on claude-in-chrome's own (less controllable)
// automation.

import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import {
  enableCompletionBinding,
  fireTriggerUpdate,
  readMetrics,
  readParams,
  waitForAppReady,
  waitForUpdateComplete,
} from './component-storm-scenario.ts'

const SCENARIO_PATH = '/scenarios/component-storm'
const TRIALS = 10

async function checkVisibility(client: CDPClient): Promise<{ hidden: boolean; visibilityState: string }> {
  const r = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify({hidden: document.hidden, visibilityState: document.visibilityState})',
    returnByValue: true,
  })
  return JSON.parse(r.result.value as string)
}

async function runCondition(
  vueVersion: string,
  baseUrl: string,
  chromePort: number,
  hidden: boolean,
): Promise<number[]> {
  const chrome = await launchIsolatedChrome(chromePort, 'headless')
  const durations: number[] = []
  try {
    const targets = await chrome.listTargets()
    const pageTarget = targets.find((t) => t.type === 'page')
    if (!pageTarget) throw new Error('no page target')
    const client = await CDPClient.connect(pageTarget.webSocketDebuggerUrl)
    try {
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await enableCompletionBinding(client)

      if (hidden) {
        const created = await client.send('Target.createTarget', { url: 'about:blank' })
        await client.send('Target.activateTarget', { targetId: created.targetId })
      }

      const url = `${baseUrl}${SCENARIO_PATH}`
      for (let trial = 1; trial <= TRIALS; trial++) {
        const loadFired = client.once('Page.loadEventFired')
        await client.send('Page.navigate', { url })
        await loadFired
        await enableCompletionBinding(client)
        await waitForAppReady(client)

        const vis = await checkVisibility(client)
        if (vis.hidden !== hidden) {
          throw new Error(`visibility drifted: expected hidden=${hidden}, got ${JSON.stringify(vis)}`)
        }

        const params = await readParams(client)
        if (params['COMPONENT_COUNT'] !== '500' || params['UPDATE_SCOPE'] !== 'AllChildren') {
          throw new Error(`config.ts drift: ${JSON.stringify(params)}`)
        }

        const completionPromise = waitForUpdateComplete(client)
        await fireTriggerUpdate(client)
        await completionPromise

        const metrics = await readMetrics(client)
        const d = Number.parseFloat(metrics['Average Update Duration'])
        durations.push(d)
        process.stdout.write(`  [${vueVersion} hidden=${hidden}] trial ${trial}: ${d.toFixed(3)} ms (visibilityState=${vis.visibilityState})\n`)
      }
    } finally {
      await client.close()
    }
  } finally {
    await chrome.kill()
  }
  return durations
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

async function main(): Promise<void> {
  const conditions: Array<{ vueVersion: string; baseUrl: string; portVisible: number; portHidden: number }> = [
    { vueVersion: '3.5.40', baseUrl: 'http://localhost:5173', portVisible: 9372, portHidden: 9373 },
    { vueVersion: '3.6.0-rc.2', baseUrl: 'http://localhost:5174', portVisible: 9374, portHidden: 9375 },
  ]

  const results: Record<string, { visible: number[]; hidden: number[] }> = {}

  for (const cond of conditions) {
    console.log(`\n=== ${cond.vueVersion} — visible (document.hidden=false, matches the Day 30 matrix) ===`)
    const visible = await runCondition(cond.vueVersion, cond.baseUrl, cond.portVisible, false)
    console.log(`\n=== ${cond.vueVersion} — hidden (document.hidden=true, matches the README's claude-in-chrome methodology) ===`)
    const hidden = await runCondition(cond.vueVersion, cond.baseUrl, cond.portHidden, true)
    results[cond.vueVersion] = { visible, hidden }
  }

  console.log('\n\n=== SUMMARY (median of 10 single-click trials) ===')
  for (const [version, { visible, hidden }] of Object.entries(results)) {
    console.log(`${version}: visible median=${median(visible).toFixed(1)}ms  hidden median=${median(hidden).toFixed(1)}ms`)
  }
  const v35 = results['3.5.40']!
  const v36 = results['3.6.0-rc.2']!
  const visDelta = ((median(v36.visible) - median(v35.visible)) / median(v35.visible)) * 100
  const hidDelta = ((median(v36.hidden) - median(v35.hidden)) / median(v35.hidden)) * 100
  console.log(`\nvisible condition: 3.5.40=${median(v35.visible).toFixed(1)}ms -> 3.6.0-rc.2=${median(v36.visible).toFixed(1)}ms  (${visDelta.toFixed(1)}%)`)
  console.log(`hidden  condition: 3.5.40=${median(v35.hidden).toFixed(1)}ms -> 3.6.0-rc.2=${median(v36.hidden).toFixed(1)}ms  (${hidDelta.toFixed(1)}%)`)
}

main().catch((err) => {
  console.error('investigate-component-storm-visibility failed:', err)
  process.exitCode = 1
})
