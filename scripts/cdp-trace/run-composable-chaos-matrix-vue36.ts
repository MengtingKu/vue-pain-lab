// composable-chaos Controlled Validation — Layer B (CDP trace) Matrix
// Runner, Vue 3.6.0-rc.2 condition. Day 24 Validation.
//
// Thin orchestrator, NOT a new methodology: calls the exact same
// `runVersionMatrix()` extracted from run-composable-chaos-matrix.ts (same
// DEPTHS = [1, 5, 10, 20], same WARMUP/MEASUREMENT counts, same
// build/update operations, same cost-trace/runtime-attribution-trace dual
// sources, same retry logic, same meta schema) — only the VersionCondition
// differs: baseUrl points at the `vue-pain-lab-vue36` git worktree's dev
// server (Vue 3.6.0-rc.2 installed there, everything else byte-identical to
// this repo's `main` at the time this script was written — see
// docs/decisions or validation-log.md for the sync record) instead of
// spawning/reusing this repo's own dev server.
//
// Does not touch `src/scenarios/composable-chaos/*`, does not touch
// `composable-chaos-scenario.ts`, does not change any Depth/trial/batch
// parameter. Results land under
// results/cdp-trace/composable-chaos/vue-3.6.0-rc.2/ — a sibling directory
// to the existing vue-3.5.40 results, never overwriting them.
//
// Precondition: the vue-pain-lab-vue36 worktree's dev server must already be
// running on port 5174 (`npm run dev -- --port 5174 --strictPort`), started
// separately per the repo's Process Management Rule (this script does not
// spawn or kill dev servers itself, unlike the 3.5.40 script's
// ensureDevServer() convenience — the worktree lives outside this repo's
// cwd, so spawning it here would require assumptions about the other
// worktree's layout; starting it once, out of band, is simpler and safer).

import { runVersionMatrix } from './run-composable-chaos-matrix.ts'

const VUE_36 = { vueVersion: '3.6.0-rc.2', baseUrl: 'http://localhost:5174', chromePort: 9338 }

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
  console.log('\nVue 3.6.0-rc.2 CDP trace matrix complete.')
}

main().catch((err) => {
  console.error('run-composable-chaos-matrix-vue36 failed:', err)
  process.exitCode = 1
})
