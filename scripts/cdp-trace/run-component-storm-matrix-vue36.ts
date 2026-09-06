// Component Storm Runtime Attribution Validation — Vue 3.6.0-rc.2 condition
// (Day 30).
//
// Thin orchestrator, NOT a new methodology: calls the exact same
// `runVersionMatrix()` extracted from run-component-storm-matrix.ts (same
// componentCount=500/updateScope='AllChildren' fixed condition, same
// WARMUP/MEASUREMENT counts, same cost-trace/runtime-attribution-trace dual
// sources, same retry logic, same meta schema) — only the VersionCondition
// differs: baseUrl points at the `vue-pain-lab-vue36` git worktree's dev
// server (Vue 3.6.0-rc.2 installed there — confirmed via `npm list vue`;
// Scenario/benchmark source confirmed byte-identical to this repo's `main`
// via `git diff --stat` excluding package.json/package-lock.json) instead of
// spawning/reusing this repo's own dev server.
//
// Does not touch `src/scenarios/component-storm/*`, does not touch
// `component-storm-scenario.ts`, does not change any trial/parameter.
// Results land under
// results/cdp-trace/component-storm/vue-3.6.0-rc.2/update-500-AllChildren/ —
// a sibling directory to the vue-3.5.40 results, never overwriting them.
//
// Precondition: the vue-pain-lab-vue36 worktree's dev server must already be
// running on port 5174 (`npm run dev -- --port 5174 --strictPort`), started
// separately per the repo's Process Management Rule (this script does not
// spawn or kill dev servers itself — the worktree lives outside this repo's
// cwd, so spawning it here would require assumptions about the other
// worktree's layout; starting it once, out of band, is simpler and safer).

import { runVersionMatrix } from './run-component-storm-matrix.ts'

const VUE_36 = { vueVersion: '3.6.0-rc.2', baseUrl: 'http://localhost:5174', chromePort: 9351 }

async function isResponding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  if (!(await isResponding(VUE_36.baseUrl))) {
    throw new Error(
      `Vue 3.6 worktree dev server not responding at ${VUE_36.baseUrl}. ` +
        'Start it first: cd ../vue-pain-lab-vue36 && npm run dev -- --port 5174 --strictPort',
    )
  }
  await runVersionMatrix(VUE_36)
  console.log('\nVue 3.6.0-rc.2 Component Storm CDP trace matrix complete.')
}

main().catch((err) => {
  console.error('run-component-storm-matrix-vue36 failed:', err)
  process.exitCode = 1
})
