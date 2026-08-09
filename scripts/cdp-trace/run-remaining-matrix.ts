// Drives the remaining cells of the Vue 3.5.40 vs Vue 3.6.0-rc.2 Validation
// Matrix. N=100 (both versions... actually 3.5.40 only so far) and
// 3.5.40/update-5000 were already captured as smoke tests / the Final
// Calibration run using this exact frozen protocol — reused here rather
// than re-run, since they're already valid production data.

import { runVersionNodeCount, type Operation } from './run-validation-matrix.ts'

const VUE_35: { vueVersion: string; baseUrl: string; chromePort: number } = {
  vueVersion: '3.5.40',
  baseUrl: 'http://localhost:5173',
  chromePort: 9360,
}
const VUE_36: { vueVersion: string; baseUrl: string; chromePort: number } = {
  vueVersion: '3.6.0-rc.2',
  baseUrl: 'http://localhost:5174',
  chromePort: 9361,
}

interface Job {
  cond: typeof VUE_35
  nodeCount: number
  operations: Operation[]
}

const jobs: Job[] = [
  { cond: VUE_35, nodeCount: 500, operations: ['mount', 'update'] },
  { cond: VUE_35, nodeCount: 1000, operations: ['mount', 'update'] },
  { cond: VUE_35, nodeCount: 5000, operations: ['mount'] }, // update-5000 already captured
  { cond: VUE_36, nodeCount: 100, operations: ['mount', 'update'] },
  { cond: VUE_36, nodeCount: 500, operations: ['mount', 'update'] },
  { cond: VUE_36, nodeCount: 1000, operations: ['mount', 'update'] },
  { cond: VUE_36, nodeCount: 5000, operations: ['mount', 'update'] },
]

async function main(): Promise<void> {
  const startedAt = Date.now()
  for (const [i, job] of jobs.entries()) {
    console.log(`\n[job ${i + 1}/${jobs.length}] ${job.cond.vueVersion} N=${job.nodeCount} ops=${job.operations.join(',')}`)
    const jobStart = Date.now()
    await runVersionNodeCount(job.cond, job.nodeCount, job.operations)
    console.log(`[job ${i + 1}/${jobs.length}] done in ${((Date.now() - jobStart) / 1000).toFixed(1)}s`)
  }
  console.log(`\nAll remaining matrix jobs complete in ${((Date.now() - startedAt) / 1000 / 60).toFixed(1)} min.`)
}

main().catch((err) => {
  console.error('Matrix run failed:', err)
  process.exitCode = 1
})
