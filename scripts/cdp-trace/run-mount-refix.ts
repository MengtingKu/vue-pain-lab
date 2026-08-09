// Re-captures the Mount side of the Validation Matrix with the trailing-edge
// frame-sync fix (see run-validation-matrix.ts). vue-3.5.40/mount-5000 was
// already re-captured as part of the fix's smoke test — not repeated here.
// Update side is untouched (kept from the original matrix run — empirically
// showed reliable Layout/Paint capture even without this fix).

import { runVersionNodeCount } from './run-validation-matrix.ts'

const VUE_35 = { vueVersion: '3.5.40', baseUrl: 'http://localhost:5173', chromePort: 9362 }
const VUE_36 = { vueVersion: '3.6.0-rc.2', baseUrl: 'http://localhost:5174', chromePort: 9363 }

const jobs = [
  { cond: VUE_35, nodeCount: 100 },
  { cond: VUE_35, nodeCount: 500 },
  { cond: VUE_35, nodeCount: 1000 },
  { cond: VUE_36, nodeCount: 100 },
  { cond: VUE_36, nodeCount: 500 },
  { cond: VUE_36, nodeCount: 1000 },
  { cond: VUE_36, nodeCount: 5000 },
]

async function main(): Promise<void> {
  const startedAt = Date.now()
  for (const [i, job] of jobs.entries()) {
    console.log(`\n[job ${i + 1}/${jobs.length}] ${job.cond.vueVersion} N=${job.nodeCount} mount`)
    await runVersionNodeCount(job.cond, job.nodeCount, ['mount'])
  }
  console.log(`\nAll Mount re-fix jobs complete in ${((Date.now() - startedAt) / 1000 / 60).toFixed(1)} min.`)
}

main().catch((err) => {
  console.error('Mount re-fix run failed:', err)
  process.exitCode = 1
})
