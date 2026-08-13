// composable-chaos Controlled Validation — Analysis.
//
// Reads every trial produced by run-composable-chaos-matrix.ts, builds
// evidence via the frozen evidence.ts contract (never mixes cost-trace and
// runtime-attribution-trace, same Dual-Trace Architecture rule
// analyze-validation-matrix.ts already follows), and for every
// Metric x Operation cell computes a per-Depth distribution plus an
// IQR-overlap-based IQR-overlap based Signal classification between Depth
// pairs (1v5, 5v10, 10v20, 1v20 — the Scenario's own DEPTH_OPTIONS, no
// invented depths). Single Vue version (3.5.40) — this is NOT a version
// comparison, it is a within-version, cross-depth Controlled Validation.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const VUE_VERSION = '3.5.40'
const DEPTHS = [1, 5, 10, 20] as const
const OPERATIONS = ['build', 'update'] as const
const TRIALS = 5

type Depth = (typeof DEPTHS)[number]
type Operation = (typeof OPERATIONS)[number]

interface TrialMetrics {
  buildDurationMs: number | null
  averageUpdateDurationMs: number | null
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

function parseMsText(text: string | null): number | null {
  if (!text) return null
  const n = Number.parseFloat(text)
  return Number.isFinite(n) ? n : null
}

function loadTrial(operation: Operation, depth: Depth, trial: number): TrialMetrics | null {
  const dir = join(
    'results',
    'cdp-trace',
    'composable-chaos',
    `vue-${VUE_VERSION}`,
    `${operation}-depth-${depth}`,
    `trial-${String(trial).padStart(2, '0')}`,
  )
  const costMetaPath = join(dir, 'cost-trace.meta.json')
  const attrMetaPath = join(dir, 'runtime-attribution-trace.meta.json')
  if (!existsSync(costMetaPath) || !existsSync(attrMetaPath)) return null

  const costMeta = JSON.parse(readFileSync(costMetaPath, 'utf-8'))
  const cost = parseTraceFile(join(dir, 'cost-trace.trace.json'))
  const attr = parseTraceFile(join(dir, 'runtime-attribution-trace.trace.json'))

  const costEvidence = buildCostTraceEvidence(cost.events)
  const attrEvidence = buildRuntimeAttributionEvidence(attr.events)

  const costMap: TrialMetrics['cost'] = {}
  for (const e of costEvidence) costMap[e.metric] = { observed: e.observed, durationUs: e.durationUs }
  const attrMap: TrialMetrics['attribution'] = {}
  for (const e of attrEvidence) attrMap[e.metric] = { observed: e.observed, durationUs: e.durationUs }

  return {
    buildDurationMs: parseMsText(costMeta.buildDurationText),
    averageUpdateDurationMs: parseMsText(costMeta.averageUpdateDurationText),
    cost: costMap,
    attribution: attrMap,
  }
}

export const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
export const ATTRIBUTION_METRICS = ['Vue Runtime CPU', 'Application CPU', 'DevTools Overlay CPU', 'V8/native CPU']
export const ALL_METRICS = ['Instrumentation Duration', ...COST_METRICS, ...ATTRIBUTION_METRICS]

function extractSeries(trials: TrialMetrics[], operation: Operation, metric: string): number[] {
  const observed: number[] = []
  for (const t of trials) {
    if (metric === 'Instrumentation Duration') {
      const v = operation === 'build' ? t.buildDurationMs : t.averageUpdateDurationMs
      if (v !== null) observed.push(v)
      continue
    }
    const v = t.cost[metric] ?? t.attribution[metric]
    if (v && v.observed && v.durationUs !== null) observed.push(v.durationUs)
  }
  return observed
}

export interface DepthCell {
  metric: string
  operation: Operation
  depth: Depth
  observedCount: number
  totalTrials: number
  dist: Distribution | null
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

export interface DepthPairComparison {
  metric: string
  operation: Operation
  depthA: Depth
  depthB: Depth
  medianDeltaPct: number | null
  iqrOverlap: boolean | null
  signal: 'Meaningful Difference' | 'No Meaningful Difference' | 'Not Available'
}

function classifyPair(a: Distribution | null, b: Distribution | null): DepthPairComparison['signal'] {
  if (!a || !b) return 'Not Available'
  const overlap = iqrOverlaps(a, b)
  return overlap ? 'No Meaningful Difference' : 'Meaningful Difference'
}

export function analyzeMetricOperation(metric: string, operation: Operation): {
  cells: DepthCell[]
  pairs: DepthPairComparison[]
} {
  const cells: DepthCell[] = []
  const trialsByDepth = new Map<Depth, TrialMetrics[]>()

  for (const depth of DEPTHS) {
    const trials: TrialMetrics[] = []
    for (let trial = 1; trial <= TRIALS; trial++) {
      const t = loadTrial(operation, depth, trial)
      if (t) trials.push(t)
    }
    trialsByDepth.set(depth, trials)
    const series = extractSeries(trials, operation, metric)
    cells.push({
      metric,
      operation,
      depth,
      observedCount: series.length,
      totalTrials: trials.length,
      dist: series.length > 0 ? summarize(series) : null,
    })
  }

  const distByDepth = new Map<Depth, Distribution | null>(cells.map((c) => [c.depth, c.dist]))
  const pairSpecs: Array<[Depth, Depth]> = [
    [1, 5],
    [5, 10],
    [10, 20],
    [1, 20],
  ]
  const pairs: DepthPairComparison[] = pairSpecs.map(([depthA, depthB]) => {
    const a = distByDepth.get(depthA) ?? null
    const b = distByDepth.get(depthB) ?? null
    const medianDeltaPct = a && b && a.median !== 0 ? ((b.median - a.median) / a.median) * 100 : null
    return {
      metric,
      operation,
      depthA,
      depthB,
      medianDeltaPct,
      iqrOverlap: a && b ? iqrOverlaps(a, b) : null,
      signal: classifyPair(a, b),
    }
  })

  return { cells, pairs }
}

export function analyzeAll(): { cells: DepthCell[]; pairs: DepthPairComparison[] } {
  const cells: DepthCell[] = []
  const pairs: DepthPairComparison[] = []
  for (const metric of ALL_METRICS) {
    for (const operation of OPERATIONS) {
      const result = analyzeMetricOperation(metric, operation)
      cells.push(...result.cells)
      pairs.push(...result.pairs)
    }
  }
  return { cells, pairs }
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/analyze-composable-chaos.ts')
if (isMain) {
  const { cells, pairs } = analyzeAll()
  console.log('=== Per-Depth Distributions ===')
  for (const c of cells) {
    if (!c.dist) {
      console.log(`${c.metric} | ${c.operation} | depth=${c.depth}: NOT OBSERVED (0/${c.totalTrials})`)
      continue
    }
    const d = c.dist
    console.log(
      `${c.metric} | ${c.operation} | depth=${c.depth}: median=${d.median.toFixed(2)} [${d.p25.toFixed(2)}, ${d.p75.toFixed(2)}] (${d.min.toFixed(2)}-${d.max.toFixed(2)}) n=${c.observedCount}/${c.totalTrials}`,
    )
  }
  console.log('\n=== Depth-Pair Signal ===')
  for (const p of pairs) {
    console.log(
      `${p.metric} | ${p.operation} | Depth ${p.depthA} vs ${p.depthB}: Δ%=${p.medianDeltaPct !== null ? p.medianDeltaPct.toFixed(1) + '%' : 'N/A'} iqrOverlap=${p.iqrOverlap} -> ${p.signal}`,
    )
  }
}
