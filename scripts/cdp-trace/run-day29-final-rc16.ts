// Day 29 — Final Validation, VDOM Stress, Vue 3.6.0-rc.16 (Freeze Point 2026-11-23).
//
// Orchestration only — reuses `runVersionNodeCount` from
// `run-validation-matrix.ts` UNCHANGED (same protocol, 3 warm-up + 10
// measurement trials, both cost-trace and runtime-attribution-trace sources),
// exactly like run-day29-final-rc11.ts did for rc.11.
//
// Why nine conditions: the machine's Chrome auto-updated from 155.0.8059.41
// (rc.11 run, 2026-10-14) to 157.x. Comparing new rc.16 data against the old
// rc.11 data would confound Vue version with Chrome version, so 3.5.40 /
// rc.4 T/V / rc.9 T/V / rc.11 T/V are re-run as same-session controls under
// the same Chrome, into NEW directories (`-chrome157b` suffix on every label,
// rc.16 included). All earlier results are never touched.
//
// Why `-chrome157b` and not `-chrome157`: the first rc.16 session (2026-11-23,
// labels `*-chrome157-run2/-run3` and `3.6.0-rc.16-*-run2/-run3`) was voided
// because a machine-level ~2.5-3x slow regime hit all conditions (incl. 3.5.40)
// mid-run. Those raw dirs are kept; the `b` session marker lets this re-run
// keep the -run2/-run3 numbering (aligned with rc.9 / rc.11 in /compare)
// without colliding with them.
//
// All nine dev servers serve the same frozen Scenario source (commit d3991df,
// verified byte-identical with git diff in every worktree):
//   - 3.5.40                  -> vue-pain-lab-vue35-d29ctrl,    :5178
//   - 3.6.0-rc.4 Traditional  -> vue-pain-lab-vue36rc4-trad,    :5175
//   - 3.6.0-rc.4 Vapor        -> vue-pain-lab-vue36-vapor,      :5174
//   - 3.6.0-rc.9 Traditional  -> vue-pain-lab-vue36rc9-trad,    :5176
//   - 3.6.0-rc.9 Vapor        -> vue-pain-lab-vue36rc9-vapor,   :5177
//   - 3.6.0-rc.11 Traditional -> vue-pain-lab-vue36rc11-trad,   :5179
//   - 3.6.0-rc.11 Vapor       -> vue-pain-lab-vue36rc11-vapor,  :5180
//   - 3.6.0-rc.16 Traditional -> vue-pain-lab-vue36rc16-trad,   :5181
//   - 3.6.0-rc.16 Vapor       -> vue-pain-lab-vue36rc16-vapor,  :5182
// Vapor worktrees carry the same two build/bootstrap changes as rc.4 / rc.9 / rc.11
// (vite.config.ts features.vapor + src/main.ts vaporInteropPlugin).

//
// Two independent AC replicates: `RUN_SUFFIX=-run2 node ...` and
// `RUN_SUFFIX=-run3 node ...` (identical protocol and order, same suffixes as rc.9 / rc.11 so
// /compare merges them per Run), dev servers
// restarted in between. Refuses to start unless the machine is on AC power.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runVersionNodeCount, type VersionCondition } from './run-validation-matrix.ts'

const RUN_SUFFIX = process.env.RUN_SUFFIX ?? '-run2'

const CONDITIONS: VersionCondition[] = [
  { vueVersion: '3.5.40-chrome157b', baseUrl: 'http://localhost:5178', chromePort: 9351 },
  {
    vueVersion: '3.6.0-rc.4-traditional-chrome157b',
    baseUrl: 'http://localhost:5175',
    chromePort: 9352,
  },
  { vueVersion: '3.6.0-rc.4-vapor-chrome157b', baseUrl: 'http://localhost:5174', chromePort: 9353 },
  {
    vueVersion: '3.6.0-rc.9-traditional-chrome157b',
    baseUrl: 'http://localhost:5176',
    chromePort: 9354,
  },
  { vueVersion: '3.6.0-rc.9-vapor-chrome157b', baseUrl: 'http://localhost:5177', chromePort: 9355 },
  {
    vueVersion: '3.6.0-rc.11-traditional-chrome157b',
    baseUrl: 'http://localhost:5179',
    chromePort: 9356,
  },
  {
    vueVersion: '3.6.0-rc.11-vapor-chrome157b',
    baseUrl: 'http://localhost:5180',
    chromePort: 9357,
  },
  {
    vueVersion: '3.6.0-rc.16-traditional-chrome157b',
    baseUrl: 'http://localhost:5181',
    chromePort: 9358,
  },
  {
    vueVersion: '3.6.0-rc.16-vapor-chrome157b',
    baseUrl: 'http://localhost:5182',
    chromePort: 9359,
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
    const outDir = join('results', 'cdp-trace', 'vdom-stress', `vue-${cond.vueVersion}`)
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

  console.log('\nDay 29 final rc.16 matrix complete.')
}

main().catch((err) => {
  console.error('run-day29-final-rc16 failed:', err)
  process.exitCode = 1
})
