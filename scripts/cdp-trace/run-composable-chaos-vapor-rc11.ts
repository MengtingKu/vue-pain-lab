// Composable Chaos — Vapor Validation (Vue 3.6.0-rc.11 Freeze Point, 2026-10-14).
//
// Orchestration only — reuses `runVersionMatrix` from
// `run-composable-chaos-matrix.ts` (Day 24 protocol: reset -> waitForAppReady
// -> [update: untraced priming build] -> waitForBrowserFrames(2) ->
// Tracing.start -> build (1 click) or update (UPDATE_BATCH_SIZE=20 clicks) ->
// waitForBrowserFrames(2) -> Tracing.end, cost-trace + runtime-attribution-trace).
// Same seven conditions, same worktrees and same interleaving as the Day 29 rc.11
// Final Validation (run-day29-final-rc11.ts): for each Depth, all seven conditions.
//
// Only deviation from Day 24: 10 measurement trials instead of 5, passed as
// runVersionMatrix's `measurement` argument (default stays 5), to match the
// vdom-stress / component-storm Vapor validations. WARMUP stays 3.
//
// rc.11 Freeze Point (2026-10-14): copied from run-composable-chaos-vapor.ts — only the condition
// list (labels, worktrees, ports) changed. Chrome auto-updated 153 -> 155, so
// every rc.9-session control is re-run under a `-chrome155` label, and rc.11
// Traditional / Vapor are added: 7 conditions, oldest version first. Run
// suffixes -run1 / -run2 match this scenario's rc.9 runs so /compare merges them.
//
// Usage: RUN_SUFFIX=-run1 node scripts/cdp-trace/run-composable-chaos-vapor-rc11.ts

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runVersionMatrix, type VersionCondition } from './run-composable-chaos-matrix.ts'

const RUN_SUFFIX = process.env.RUN_SUFFIX ?? '-run1'
const DEPTHS = [1, 5, 10, 20] as const
const MEASUREMENT = 10

const CONDITIONS: VersionCondition[] = [
  { vueVersion: '3.5.40-chrome155', baseUrl: 'http://localhost:5178', chromePort: 9401 },
  {
    vueVersion: '3.6.0-rc.4-traditional-chrome155',
    baseUrl: 'http://localhost:5175',
    chromePort: 9402,
  },
  { vueVersion: '3.6.0-rc.4-vapor-chrome155', baseUrl: 'http://localhost:5174', chromePort: 9403 },
  {
    vueVersion: '3.6.0-rc.9-traditional-chrome155',
    baseUrl: 'http://localhost:5176',
    chromePort: 9404,
  },
  { vueVersion: '3.6.0-rc.9-vapor-chrome155', baseUrl: 'http://localhost:5177', chromePort: 9405 },
  { vueVersion: '3.6.0-rc.11-traditional', baseUrl: 'http://localhost:5179', chromePort: 9406 },
  { vueVersion: '3.6.0-rc.11-vapor', baseUrl: 'http://localhost:5180', chromePort: 9407 },
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

async function main(): Promise<void> {
  assertOnAcPower()
  for (const cond of CONDITIONS) {
    const outDir = join('results', 'cdp-trace', 'composable-chaos', `vue-${cond.vueVersion}`)
    if (existsSync(outDir)) {
      throw new Error(
        `Refusing to run: ${outDir} already exists (never overwrite existing evidence)`,
      )
    }
    const res = await fetch(cond.baseUrl).catch(() => null)
    if (!res?.ok)
      throw new Error(`Dev server not responding at ${cond.baseUrl} for ${cond.vueVersion}`)
  }

  for (const depth of DEPTHS) {
    for (const cond of CONDITIONS) {
      await runVersionMatrix(cond, [depth], MEASUREMENT)
    }
    console.log(`\n=== Depth=${depth} complete (all ${CONDITIONS.length} conditions) ===\n`)
  }

  console.log('\nComposable Chaos Vapor matrix complete.')
}

main().catch((err) => {
  console.error('run-composable-chaos-vapor-rc11 failed:', err)
  process.exitCode = 1
})
