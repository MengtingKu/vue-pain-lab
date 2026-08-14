// composable-chaos Controlled Validation — Layer A (Scenario-level
// instrumentation) Matrix Runner. Day 24, Vue 3.6.0-rc.2 Validation.
//
// NEW script, sibling to run-composable-chaos-matrix.ts (Layer B / CDP
// trace). Does not modify that file, does not touch
// `src/scenarios/composable-chaos/*`, does not change the Scenario's own
// DEPTH_OPTIONS = [1, 5, 10, 20] or its Update trigger mechanism
// (`source.value++` via the "Trigger Update" button). Reuses
// composable-chaos-scenario.ts's already-frozen click+MutationObserver
// functions verbatim (waitForAppReady / enableCompletionBinding /
// fireBuildChain / waitForBuildComplete / fireTriggerUpdate /
// waitForUpdateComplete), plus the one pure-read ADDITION documented in
// that file's header (readMetricGroup).
//
// Why this script exists (harness change, documented per
// .claude/skills/validate-vue-update's "若必須修改 Measurement Harness"
// rule): the Vue 3.5.40 Baseline's Layer A numbers (see
// src/benchmarks/validation-log.md, "Composable Chaos" section) were
// gathered by manually driving claude-in-chrome — 3 trials x 4 depths x
// 100 sequential Trigger Update clicks, on a hidden/background tab. That is
// not practical to reproduce identically for a second Vue version (2,400
// individual clicks), and per project memory
// (vue36_reactive_chain_validation) a hidden claude-in-chrome tab carries a
// real risk of asymmetric timer throttling between two tabs/versions. This
// script performs the EXACT SAME logical protocol the Baseline used (Build
// Chain once, then 100 sequential Trigger Update cycles, 3 trials per
// Depth, reading the same on-page counters) but drives it deterministically
// via CDP (the same click+MutationObserver mechanism already validated and
// frozen for Layer B on this Scenario), against a plain non-traced browser
// tab — no tracing overhead, no background-tab throttling (each condition
// gets its own dedicated, foregroundable tab; timing here relies solely on
// `nextTick()` microtask completion signaling, exactly as the frozen
// Scenario itself does, never a Node-side setTimeout poll).
//
// To make the Vue-version comparison itself apples-to-apples (only Vue
// version differs, not measurement method), this script is run against
// BOTH Vue 3.5.40 (this repo, port 5173) and Vue 3.6.0-rc.2 (the
// `vue-pain-lab-vue36` worktree, port 5174) using the identical protocol
// below. The original claude-in-chrome-driven Vue 3.5.40 Baseline numbers
// are kept as a separate, clearly labeled reference — not overwritten, not
// treated as equivalent to this script's output.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDPClient, launchIsolatedChrome } from './chrome.ts'
import {
  enableCompletionBinding,
  fireBuildChain,
  fireTriggerUpdate,
  readMetricGroup,
  waitForAppReady,
  waitForBuildComplete,
  waitForUpdateComplete,
} from './composable-chaos-scenario.ts'

const DEPTHS = [1, 5, 10, 20] as const
const TRIALS = 3
const UPDATE_COUNT = 100
const SCENARIO_PATH = '/scenarios/composable-chaos'

const nowMs = () => Number(process.hrtime.bigint()) / 1e6

export interface VersionCondition {
  vueVersion: string
  baseUrl: string
  chromePort: number
}

interface TrialRecord {
  scenario: 'composable-chaos'
  layer: 'A-instrumentation'
  vueVersion: string
  depth: number
  trial: number
  updateCount: number
  timestamp: string
  url: string
  buildMetrics: Record<string, string>
  updateMetrics: Record<string, string>
  wallClockMs: {
    build: number
    updateLoop: number
  }
}

async function runTrial(client: CDPClient, url: string, depth: number): Promise<TrialRecord> {
  const loadFired = client.once('Page.loadEventFired')
  await client.send('Page.navigate', { url })
  await loadFired
  await enableCompletionBinding(client) // idempotent re-assert after navigation
  await waitForAppReady(client)

  const tBuildStart = nowMs()
  const buildCompletion = waitForBuildComplete(client)
  await fireBuildChain(client, depth)
  await buildCompletion
  const tBuildEnd = nowMs()
  const buildMetrics = await readMetricGroup(client, 0)

  const tUpdateStart = nowMs()
  for (let i = 0; i < UPDATE_COUNT; i++) {
    const completion = waitForUpdateComplete(client)
    await fireTriggerUpdate(client)
    await completion
  }
  const tUpdateEnd = nowMs()
  const updateMetrics = await readMetricGroup(client, 1)

  return {
    scenario: 'composable-chaos',
    layer: 'A-instrumentation',
    vueVersion: '', // filled by caller
    depth,
    trial: 0, // filled by caller
    updateCount: UPDATE_COUNT,
    timestamp: new Date().toISOString(),
    url,
    buildMetrics,
    updateMetrics,
    wallClockMs: {
      build: tBuildEnd - tBuildStart,
      updateLoop: tUpdateEnd - tUpdateStart,
    },
  }
}

export async function runVersionInstrumentation(cond: VersionCondition): Promise<void> {
  console.log(`\n=== Layer A instrumentation: ${cond.vueVersion} ===`)
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

      for (const depth of DEPTHS) {
        console.log(`  -- Depth=${depth} --`)
        const baseDir = join('results', 'cdp-trace', 'composable-chaos-instrumentation', `vue-${cond.vueVersion}`, `depth-${depth}`)
        mkdirSync(baseDir, { recursive: true })

        for (let trial = 1; trial <= TRIALS; trial++) {
          const record = await runTrial(client, url, depth)
          record.vueVersion = cond.vueVersion
          record.trial = trial
          const path = join(baseDir, `trial-${String(trial).padStart(2, '0')}.json`)
          writeFileSync(path, JSON.stringify(record, null, 2), 'utf-8')
          console.log(
            `     trial ${trial}/${TRIALS}: Build Duration=${record.buildMetrics['Build Duration']}, ` +
              `Average Update Duration=${record.updateMetrics['Average Update Duration']}, ` +
              `Computed Execute Count=${record.updateMetrics['Computed Execute Count']}`,
          )
        }
      }
    } finally {
      await client.close()
    }
  } finally {
    await chrome.kill()
  }
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/run-composable-chaos-instrumentation.ts')
if (isMain) {
  const conditionsArg = process.argv[2] // '3.5' | '3.6' | 'both' (default: both)
  const VUE_35: VersionCondition = { vueVersion: '3.5.40', baseUrl: 'http://localhost:5173', chromePort: 9336 }
  const VUE_36: VersionCondition = { vueVersion: '3.6.0-rc.2', baseUrl: 'http://localhost:5174', chromePort: 9337 }

  const conditions: VersionCondition[] =
    conditionsArg === '3.5' ? [VUE_35] : conditionsArg === '3.6' ? [VUE_36] : [VUE_35, VUE_36]

  ;(async () => {
    const startedAt = Date.now()
    for (const cond of conditions) {
      await runVersionInstrumentation(cond)
    }
    console.log(`\nAll Layer A instrumentation runs complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`)
  })().catch((err) => {
    console.error('run-composable-chaos-instrumentation failed:', err)
    process.exitCode = 1
  })
}
