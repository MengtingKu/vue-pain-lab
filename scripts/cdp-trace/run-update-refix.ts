// Re-captures the Update side of the Validation Matrix with the
// trailing-edge frame-sync fix now applied uniformly to both operations
// (see run-validation-matrix.ts). Mount side already re-captured under this
// fix in run-mount-refix.ts. This makes the entire 160-trial matrix use one
// single, consistent protocol state for the first time.

import { runVersionNodeCount } from './run-validation-matrix.ts'

const VUE_35 = { vueVersion: '3.5.40', baseUrl: 'http://localhost:5173', chromePort: 9364 }
const VUE_36 = { vueVersion: '3.6.0-rc.2', baseUrl: 'http://localhost:5174', chromePort: 9365 }

const jobs = [
  { cond: VUE_35, nodeCount: 100 },
  { cond: VUE_35, nodeCount: 500 },
  { cond: VUE_35, nodeCount: 1000 },
  { cond: VUE_35, nodeCount: 5000 },
  { cond: VUE_36, nodeCount: 100 },
  { cond: VUE_36, nodeCount: 500 },
  { cond: VUE_36, nodeCount: 1000 },
  { cond: VUE_36, nodeCount: 5000 },
]

async function main(): Promise<void> {
  const startedAt = Date.now()
  for (const [i, job] of jobs.entries()) {
    console.log(`\n[job ${i + 1}/${jobs.length}] ${job.cond.vueVersion} N=${job.nodeCount} update`)
    await runVersionNodeCount(job.cond, job.nodeCount, ['update'])
  }
  console.log(`\nAll Update re-fix jobs complete in ${((Date.now() - startedAt) / 1000 / 60).toFixed(1)} min.`)
}

main().catch((err) => {
  console.error('Update re-fix run failed:', err)
  process.exitCode = 1
})
