// Reactive Chain — Vapor Validation (Vue 3.6.0-rc.11 Freeze Point, 2026-10-14).
//
// Orchestration only — calls `runVersionMatrix` from run-reactive-chain-matrix.ts
// for the same seven conditions, worktrees and order as the Day 29 rc.11 Final
// Validation and the component-storm / composable-chaos Vapor validations.
// The Scenario has a single cell (DEPTH=100 x update), so there is nothing
// to interleave beyond the condition order.
//
// rc.11 Freeze Point (2026-10-14): copied from run-reactive-chain-vapor.ts — only the condition
// list (labels, worktrees, ports) changed. Chrome auto-updated 153 -> 155, so
// every rc.9-session control is re-run under a `-chrome155` label, and rc.11
// Traditional / Vapor are added: 7 conditions, oldest version first. Run
// suffixes -run1 / -run2 match this scenario's rc.9 runs so /compare merges them.
//
// Usage: RUN_SUFFIX=-run1 node scripts/cdp-trace/run-reactive-chain-vapor-rc11.ts

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runVersionMatrix, type VersionCondition } from './run-reactive-chain-matrix.ts'

const RUN_SUFFIX = process.env.RUN_SUFFIX ?? '-run1'

const CONDITIONS: VersionCondition[] = [
  { vueVersion: '3.5.40-chrome155', baseUrl: 'http://localhost:5178', chromePort: 9421 },
  {
    vueVersion: '3.6.0-rc.4-traditional-chrome155',
    baseUrl: 'http://localhost:5175',
    chromePort: 9422,
  },
  { vueVersion: '3.6.0-rc.4-vapor-chrome155', baseUrl: 'http://localhost:5174', chromePort: 9423 },
  {
    vueVersion: '3.6.0-rc.9-traditional-chrome155',
    baseUrl: 'http://localhost:5176',
    chromePort: 9424,
  },
  { vueVersion: '3.6.0-rc.9-vapor-chrome155', baseUrl: 'http://localhost:5177', chromePort: 9425 },
  { vueVersion: '3.6.0-rc.11-traditional', baseUrl: 'http://localhost:5179', chromePort: 9426 },
  { vueVersion: '3.6.0-rc.11-vapor', baseUrl: 'http://localhost:5180', chromePort: 9427 },
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
    const outDir = join('results', 'cdp-trace', 'reactive-chain', `vue-${cond.vueVersion}`)
    if (existsSync(outDir)) {
      throw new Error(
        `Refusing to run: ${outDir} already exists (never overwrite existing evidence)`,
      )
    }
    const res = await fetch(cond.baseUrl).catch(() => null)
    if (!res?.ok)
      throw new Error(`Dev server not responding at ${cond.baseUrl} for ${cond.vueVersion}`)
  }

  for (const cond of CONDITIONS) {
    await runVersionMatrix(cond)
  }

  console.log('\nReactive Chain Vapor matrix complete.')
}

main().catch((err) => {
  console.error('run-reactive-chain-vapor-rc11 failed:', err)
  process.exitCode = 1
})
