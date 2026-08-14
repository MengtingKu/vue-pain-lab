// composable-chaos — Layer A (Scenario-level instrumentation) analysis.
// Day 24 Validation. Reads every trial produced by
// run-composable-chaos-instrumentation.ts (both vue-3.5.40 and
// vue-3.6.0-rc.2 conditions), computes per-depth-per-version distributions
// (median/P25/P75/min/max, N=3) for the numeric metrics, and an IQR-overlap
// signal between the two versions at each depth — same overlap rule
// (`a.p25 <= b.p75 && b.p25 <= a.p75`) already used by
// analyze-composable-chaos.ts's depth-pair comparison, just applied across
// the version axis instead of the depth axis. Structural counters
// (Composable Instance Count, Computed Count, Watch/WatchEffect Count,
// Computed Execute Count, Watch/WatchEffect Trigger Count, Render Count)
// are exact integers with zero trial-to-trial variance by design (see
// Scenario README) — reported as-is, no distribution needed.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { summarize, type Distribution } from './stats.ts'

const VERSIONS = ['3.5.40', '3.6.0-rc.2'] as const
const DEPTHS = [1, 5, 10, 20] as const
const TRIALS = 3

type Version = (typeof VERSIONS)[number]
type Depth = (typeof DEPTHS)[number]

interface Trial {
  buildMetrics: Record<string, string>
  updateMetrics: Record<string, string>
  wallClockMs: { build: number; updateLoop: number }
}

function loadTrial(version: Version, depth: Depth, trial: number): Trial | null {
  const path = join('results', 'cdp-trace', 'composable-chaos-instrumentation', `vue-${version}`, `depth-${depth}`, `trial-${String(trial).padStart(2, '0')}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function parseMs(text: string | undefined): number | null {
  if (!text) return null
  const n = Number.parseFloat(text)
  return Number.isFinite(n) ? n : null
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

const NUMERIC_METRICS = [
  { label: 'Build Duration', group: 'build' as const, key: 'Build Duration', parse: true },
  { label: 'Average Update Duration', group: 'update' as const, key: 'Average Update Duration', parse: true },
]
const STRUCTURAL_COUNTERS = [
  { label: 'Composable Instance Count', group: 'build' as const, key: 'Composable Instance Count' },
  { label: 'Computed Count', group: 'build' as const, key: 'Computed Count' },
  { label: 'Watch Count', group: 'build' as const, key: 'Watch Count' },
  { label: 'WatchEffect Count', group: 'build' as const, key: 'WatchEffect Count' },
  { label: 'Computed Execute Count', group: 'update' as const, key: 'Computed Execute Count' },
  { label: 'Watch Trigger Count', group: 'update' as const, key: 'Watch Trigger Count' },
  { label: 'WatchEffect Trigger Count', group: 'update' as const, key: 'WatchEffect Trigger Count' },
  { label: 'Render Count', group: 'update' as const, key: 'Render Count' },
]

interface VersionDepthSummary {
  depth: Depth
  version: Version
  numeric: Record<string, Distribution | null>
  structural: Record<string, string | null>
  wallClockMs: { buildMedian: number | null; updateLoopMedian: number | null }
}

function summarizeVersionDepth(version: Version, depth: Depth): VersionDepthSummary {
  const trials: Trial[] = []
  for (let t = 1; t <= TRIALS; t++) {
    const trial = loadTrial(version, depth, t)
    if (trial) trials.push(trial)
  }

  const numeric: Record<string, Distribution | null> = {}
  for (const m of NUMERIC_METRICS) {
    const series = trials
      .map((t) => parseMs((m.group === 'build' ? t.buildMetrics : t.updateMetrics)[m.key]))
      .filter((v): v is number => v !== null)
    numeric[m.label] = series.length > 0 ? summarize(series) : null
  }

  const structural: Record<string, string | null> = {}
  for (const c of STRUCTURAL_COUNTERS) {
    const values = trials.map((t) => (c.group === 'build' ? t.buildMetrics : t.updateMetrics)[c.key])
    const uniq = new Set(values)
    structural[c.label] = uniq.size === 1 ? [...uniq][0]! : `INCONSISTENT: ${values.join(',')}`
  }

  const buildWall = trials.map((t) => t.wallClockMs.build)
  const updateWall = trials.map((t) => t.wallClockMs.updateLoop)

  return {
    depth,
    version,
    numeric,
    structural,
    wallClockMs: {
      buildMedian: buildWall.length > 0 ? summarize(buildWall).median : null,
      updateLoopMedian: updateWall.length > 0 ? summarize(updateWall).median : null,
    },
  }
}

export interface DepthComparison {
  depth: Depth
  metric: string
  v35: Distribution | null
  v36: Distribution | null
  deltaPct: number | null
  iqrOverlap: boolean | null
  signal: 'Meaningful Difference' | 'No Meaningful Difference' | 'Not Available'
}

export function analyzeAll(): { summaries: VersionDepthSummary[]; comparisons: DepthComparison[] } {
  const summaries: VersionDepthSummary[] = []
  for (const version of VERSIONS) {
    for (const depth of DEPTHS) {
      summaries.push(summarizeVersionDepth(version, depth))
    }
  }

  const comparisons: DepthComparison[] = []
  for (const depth of DEPTHS) {
    const s35 = summaries.find((s) => s.version === '3.5.40' && s.depth === depth)!
    const s36 = summaries.find((s) => s.version === '3.6.0-rc.2' && s.depth === depth)!
    for (const m of NUMERIC_METRICS) {
      const v35 = s35.numeric[m.label] ?? null
      const v36 = s36.numeric[m.label] ?? null
      const deltaPct = v35 && v36 && v35.median !== 0 ? ((v36.median - v35.median) / v35.median) * 100 : null
      const overlap = v35 && v36 ? iqrOverlaps(v35, v36) : null
      comparisons.push({
        depth,
        metric: m.label,
        v35,
        v36,
        deltaPct,
        iqrOverlap: overlap,
        signal: v35 && v36 ? (overlap ? 'No Meaningful Difference' : 'Meaningful Difference') : 'Not Available',
      })
    }
  }

  return { summaries, comparisons }
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/analyze-composable-chaos-instrumentation.ts')
if (isMain) {
  const { summaries, comparisons } = analyzeAll()
  console.log('=== Per-Version-Depth Summaries ===')
  for (const s of summaries) {
    console.log(`\n-- ${s.version} / depth=${s.depth} --`)
    for (const [label, dist] of Object.entries(s.numeric)) {
      console.log(dist ? `  ${label}: median=${dist.median.toFixed(3)} [${dist.p25.toFixed(3)},${dist.p75.toFixed(3)}] (${dist.min.toFixed(3)}-${dist.max.toFixed(3)}) n=${dist.n}` : `  ${label}: N/A`)
    }
    for (const [label, val] of Object.entries(s.structural)) {
      console.log(`  ${label}: ${val}`)
    }
    console.log(`  wallClock build median=${s.wallClockMs.buildMedian?.toFixed(2)}ms, updateLoop median=${s.wallClockMs.updateLoopMedian?.toFixed(2)}ms`)
  }
  console.log('\n=== Version Comparison Signal (IQR overlap) ===')
  for (const c of comparisons) {
    console.log(
      `depth=${c.depth} | ${c.metric} :: 3.5.40 median=${c.v35?.median.toFixed(3)}  vs  3.6.0-rc.2 median=${c.v36?.median.toFixed(3)}  Δ%=${c.deltaPct !== null ? c.deltaPct.toFixed(1) + '%' : 'N/A'} -> ${c.signal}`,
    )
  }
}
