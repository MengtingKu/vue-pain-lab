// Day 29 — Final Validation, VDOM Stress, Vue 3.6.0-rc.9 (Freeze Point 2026-09-27).
//
// Orchestration only — reuses `runVersionNodeCount` from
// `run-validation-matrix.ts` UNCHANGED (same protocol, 3 warm-up + 10
// measurement trials, both cost-trace and runtime-attribution-trace sources),
// exactly like run-vapor-comparison.ts did for rc.4.
//
// Why five conditions instead of two: the machine's Chrome auto-updated from
// 151.0.7922.138 (rc.4 run, 2026-08-17) to 153.x. Comparing new rc.9 data
// against the old rc.4 data would confound Vue version with Chrome version,
// so 3.5.40 / rc.4 Traditional / rc.4 Vapor are re-run as same-session
// controls under the same Chrome, into NEW directories (`-chrome153` suffix).
// The original vue-3.5.40 / vue-3.6.0-rc.4-* results are never touched.
//
// All five dev servers serve the same frozen Scenario source (commit d3991df,
// verified byte-identical with git diff in every worktree):
//   - 3.5.40                 -> vue-pain-lab-vue35-d29ctrl,   :5178
//   - 3.6.0-rc.4 Traditional -> vue-pain-lab-vue36rc4-trad,   :5175
//   - 3.6.0-rc.4 Vapor       -> vue-pain-lab-vue36-vapor,     :5174
//   - 3.6.0-rc.9 Traditional -> vue-pain-lab-vue36rc9-trad,   :5176
//   - 3.6.0-rc.9 Vapor       -> vue-pain-lab-vue36rc9-vapor,  :5177
// Vapor worktrees carry the same two build/bootstrap changes as rc.4
// (vite.config.ts features.vapor + src/main.ts vaporInteropPlugin).

//
// Run 1 (no suffix, 2026-09-27) was measured on battery power with Windows
// power mode "Best power efficiency" and showed mid-block regime shifts, so
// it is kept only as recorded-invalid evidence. Run 2 uses the same
// conditions/order with a `-run2` label suffix and refuses to start unless
// the machine is on AC power. Run 3 is an independent replication of run 2
// (identical protocol and order): `RUN_SUFFIX=-run3 node ...`.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runVersionNodeCount, type VersionCondition } from './run-validation-matrix.ts'

const RUN_SUFFIX = process.env.RUN_SUFFIX ?? '-run2'

const CONDITIONS: VersionCondition[] = [
  { vueVersion: '3.5.40-chrome153', baseUrl: 'http://localhost:5178', chromePort: 9351 },
  {
    vueVersion: '3.6.0-rc.4-traditional-chrome153',
    baseUrl: 'http://localhost:5175',
    chromePort: 9352,
  },
  { vueVersion: '3.6.0-rc.4-vapor-chrome153', baseUrl: 'http://localhost:5174', chromePort: 9353 },
  { vueVersion: '3.6.0-rc.9-traditional', baseUrl: 'http://localhost:5176', chromePort: 9354 },
  { vueVersion: '3.6.0-rc.9-vapor', baseUrl: 'http://localhost:5177', chromePort: 9355 },
].map((c) => ({ ...c, vueVersion: c.vueVersion + RUN_SUFFIX }))

/** Win32_Battery.BatteryStatus: 1 = discharging (battery), 2 = AC. Throws unless on AC. */
function assertOnAcPower(): void {
  const status = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery).BatteryStatus'],
    {
      encoding: 'utf-8',
    },
  ).trim()
  if (status !== '' && status !== '2') {
    throw new Error(`Refusing to run: not on AC power (Win32_Battery.BatteryStatus=${status})`)
  }
  console.log(`Power pre-flight: BatteryStatus=${status || 'n/a (no battery)'}`)
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
  assertOnAcPower()
  for (const cond of CONDITIONS) {
    const outDir = join('results', 'cdp-trace', `vue-${cond.vueVersion}`)
    if (existsSync(outDir)) {
      throw new Error(
        `Refusing to run: ${outDir} already exists (never overwrite existing evidence)`,
      )
    }
    if (!(await isResponding(cond.baseUrl))) {
      throw new Error(`Dev server not responding at ${cond.baseUrl} for ${cond.vueVersion}`)
    }
  }

  for (const nodeCount of NODE_COUNTS) {
    for (const cond of CONDITIONS) {
      await runVersionNodeCount(cond, nodeCount)
    }
    console.log(`\n=== N=${nodeCount} complete (all ${CONDITIONS.length} conditions) ===\n`)
  }

  console.log('\nDay 29 final rc.9 matrix complete.')
}

main().catch((err) => {
  console.error('run-day29-final-rc9 failed:', err)
  process.exitCode = 1
})
