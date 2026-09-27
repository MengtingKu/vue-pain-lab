// Reactive Chain — Vapor Validation (Vue 3.6.0-rc.9 Freeze Point, 2026-09-27).
//
// Orchestration only — calls `runVersionMatrix` from run-reactive-chain-matrix.ts
// for the same five conditions, worktrees and order as the Day 29 rc.9 Final
// Validation and the component-storm / composable-chaos Vapor validations.
// The Scenario has a single cell (DEPTH=100 x update), so there is nothing
// to interleave beyond the condition order.
//
// Usage: RUN_SUFFIX=-run1 node scripts/cdp-trace/run-reactive-chain-vapor.ts

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runVersionMatrix, type VersionCondition } from './run-reactive-chain-matrix.ts'

const RUN_SUFFIX = process.env.RUN_SUFFIX ?? '-run1'

const CONDITIONS: VersionCondition[] = [
  { vueVersion: '3.5.40-chrome153', baseUrl: 'http://localhost:5178', chromePort: 9421 },
  {
    vueVersion: '3.6.0-rc.4-traditional-chrome153',
    baseUrl: 'http://localhost:5175',
    chromePort: 9422,
  },
  { vueVersion: '3.6.0-rc.4-vapor-chrome153', baseUrl: 'http://localhost:5174', chromePort: 9423 },
  { vueVersion: '3.6.0-rc.9-traditional', baseUrl: 'http://localhost:5176', chromePort: 9424 },
  { vueVersion: '3.6.0-rc.9-vapor', baseUrl: 'http://localhost:5177', chromePort: 9425 },
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
  console.error('run-reactive-chain-vapor failed:', err)
  process.exitCode = 1
})
