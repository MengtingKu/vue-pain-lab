// Component Storm — Vapor Validation (Vue 3.6.0-rc.9 Freeze Point, 2026-09-27).
//
// Orchestration only — reuses `runVersionMatrix` from
// `run-component-storm-matrix.ts` (same protocol as Day 30 and as
// vdom-stress: reset -> waitForAppReady -> assert params ->
// waitForBrowserFrames(2) -> Tracing.start -> trigger -> Runtime.bindingCalled
// -> waitForBrowserFrames(2) -> Tracing.end, 3 warm-up + 10 measurement,
// cost-trace + runtime-attribution-trace). Same five conditions, same order
// and same worktrees as the Day 29 rc.9 Final Validation (run-day29-final-rc9.ts).
//
// Scope: componentCount=500 x updateScope ParentOnly / SingleChild /
// AllChildren, Update only. Mount is not traced (component-storm mounts
// during app init, before any button exists — see run-component-storm-matrix.ts
// header); the page's own in-page Mount Time is still captured in every
// trial's meta via readMetrics().
//
// updateScope is a compile-time value in src/benchmarks/component-storm/config.ts
// — the Scenario's documented parameter knob (its README's Baseline and
// rc.2 validation switched it the same way). This script rewrites only the
// `updateScope:` line in each worktree, waits until every dev server serves
// the new value, and restores 'AllChildren' when it finishes (or fails).
// runVersionMatrix's readParams() check still refuses any mismatched trial.
//
// Usage: RUN_SUFFIX=-run1 node scripts/cdp-trace/run-component-storm-vapor.ts

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { runVersionMatrix, type VersionCondition } from './run-component-storm-matrix.ts'

const RUN_SUFFIX = process.env.RUN_SUFFIX ?? '-run1'
const UPDATE_SCOPES = ['ParentOnly', 'SingleChild', 'AllChildren'] as const
const CONFIG_PATH = 'src/benchmarks/component-storm/config.ts'
const WORKTREE_ROOT = join('..')

interface Condition extends VersionCondition {
  worktree: string
}

const CONDITIONS: Condition[] = [
  {
    vueVersion: '3.5.40-chrome153',
    baseUrl: 'http://localhost:5178',
    chromePort: 9381,
    worktree: 'vue-pain-lab-vue35-d29ctrl',
  },
  {
    vueVersion: '3.6.0-rc.4-traditional-chrome153',
    baseUrl: 'http://localhost:5175',
    chromePort: 9382,
    worktree: 'vue-pain-lab-vue36rc4-trad',
  },
  {
    vueVersion: '3.6.0-rc.4-vapor-chrome153',
    baseUrl: 'http://localhost:5174',
    chromePort: 9383,
    worktree: 'vue-pain-lab-vue36-vapor',
  },
  {
    vueVersion: '3.6.0-rc.9-traditional',
    baseUrl: 'http://localhost:5176',
    chromePort: 9384,
    worktree: 'vue-pain-lab-vue36rc9-trad',
  },
  {
    vueVersion: '3.6.0-rc.9-vapor',
    baseUrl: 'http://localhost:5177',
    chromePort: 9385,
    worktree: 'vue-pain-lab-vue36rc9-vapor',
  },
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

function setUpdateScope(worktree: string, scope: string): void {
  const path = join(WORKTREE_ROOT, worktree, CONFIG_PATH)
  const before = readFileSync(path, 'utf-8')
  const after = before.replace(/updateScope: '[A-Za-z]+',/, `updateScope: '${scope}',`)
  if (!after.includes(`updateScope: '${scope}',`))
    throw new Error(`Could not set updateScope in ${path}`)
  if (after !== before) writeFileSync(path, after, 'utf-8')
}

/** Waits until the dev server serves config.ts with the requested scope. */
async function waitForServedScope(
  cond: Condition,
  scope: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // Vite serves the transformed module; the literal may be single- or double-quoted.
      const text = await (await fetch(`${cond.baseUrl}/${CONFIG_PATH}?t=${Date.now()}`)).text()
      if (new RegExp(`updateScope:\\s*["']${scope}["']`).test(text)) return
    } catch {
      // server momentarily unavailable — keep polling
    }
    await delay(250)
  }
  throw new Error(`${cond.baseUrl} did not serve updateScope=${scope} within ${timeoutMs}ms`)
}

async function main(): Promise<void> {
  assertOnAcPower()
  for (const cond of CONDITIONS) {
    const outDir = join('results', 'cdp-trace', 'component-storm', `vue-${cond.vueVersion}`)
    if (existsSync(outDir)) {
      throw new Error(
        `Refusing to run: ${outDir} already exists (never overwrite existing evidence)`,
      )
    }
    const res = await fetch(cond.baseUrl).catch(() => null)
    if (!res?.ok)
      throw new Error(`Dev server not responding at ${cond.baseUrl} for ${cond.vueVersion}`)
  }

  try {
    for (const scope of UPDATE_SCOPES) {
      for (const cond of CONDITIONS) setUpdateScope(cond.worktree, scope)
      for (const cond of CONDITIONS) await waitForServedScope(cond, scope)
      console.log(`\n>>> updateScope=${scope} served by all ${CONDITIONS.length} dev servers`)

      for (const cond of CONDITIONS) {
        await runVersionMatrix(cond, scope)
      }
      console.log(`\n=== updateScope=${scope} complete (all ${CONDITIONS.length} conditions) ===\n`)
    }
  } finally {
    for (const cond of CONDITIONS) setUpdateScope(cond.worktree, 'AllChildren')
    console.log("config.ts restored to updateScope: 'AllChildren' in all worktrees")
  }

  console.log('\nComponent Storm Vapor matrix complete.')
}

main().catch((err) => {
  console.error('run-component-storm-vapor failed:', err)
  process.exitCode = 1
})
