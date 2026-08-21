// Day 29 — Vapor Exploratory Validation, VDOM Stress.
//
// Orchestration only — reuses `runVersionNodeCount` from
// `run-validation-matrix.ts` UNCHANGED (same protocol: reset -> waitForAppReady
// -> [priming mount] -> waitForBrowserFrames(2) -> Tracing.start -> trigger ->
// waitForRenderComplete -> waitForBrowserFrames(2) -> Tracing.end, 3 warm-up +
// 10 measurement trials, both cost-trace and runtime-attribution-trace
// sources). Nothing in chrome.ts/scenario.ts/sync.ts/tracer.ts is modified.
//
// The only new thing this script does is point that unchanged runner at two
// NEW dev servers that both serve the exact same frozen vdom-stress Scenario
// source (commit d3991df, byte-identical in both worktrees):
//   - Vue 3.6.0-rc.4, Traditional (vapor OFF)  -> vue-pain-lab-vue36rc4-trad, :5175
//   - Vue 3.6.0-rc.4, Vapor       (vapor ON)   -> vue-pain-lab-vue36-vapor,   :5174
//
// Enabling Vapor required exactly two build/bootstrap-level changes, NEITHER
// touching any Scenario component file (see docs/decisions/ for the write-up):
//   1. vite.config.ts: vue({ features: { vapor: true } })
//   2. src/main.ts: app.use(vaporInteropPlugin) (required because the app
//      shell — App.vue / DefaultLayout / RouterView — is not itself vapor;
//      without this the app throws on mount, it is not an optional workaround)
//
// Results land under results/cdp-trace/vue-{label}/... using the SAME saver
// as the existing matrix, just with new version labels so they never collide
// with or overwrite the frozen Vue 3.5.40 / 3.6.0-rc.2 traditional data.

import { runVersionNodeCount, type VersionCondition } from './run-validation-matrix.ts'

const TRADITIONAL: VersionCondition = {
  vueVersion: '3.6.0-rc.4-traditional',
  baseUrl: 'http://localhost:5175',
  chromePort: 9345,
}

const VAPOR: VersionCondition = {
  vueVersion: '3.6.0-rc.4-vapor',
  baseUrl: 'http://localhost:5174',
  chromePort: 9346,
}

const NODE_COUNTS = [100, 500, 1000, 5000]

async function isResponding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  for (const cond of [TRADITIONAL, VAPOR]) {
    if (!(await isResponding(cond.baseUrl))) {
      throw new Error(`Dev server not responding at ${cond.baseUrl} for ${cond.vueVersion}`)
    }
  }

  for (const nodeCount of NODE_COUNTS) {
    await runVersionNodeCount(TRADITIONAL, nodeCount)
    await runVersionNodeCount(VAPOR, nodeCount)
    console.log(`\n=== N=${nodeCount} complete (both conditions) ===\n`)
  }

  console.log('\nVapor comparison matrix complete.')
}

main().catch((err) => {
  console.error('run-vapor-comparison failed:', err)
  process.exitCode = 1
})
