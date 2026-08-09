// Formal Vue 3.5.40 vs Vue 3.6.0-rc.2 Validation — analysis.
//
// Reads every trial produced by run-validation-matrix.ts / run-remaining-matrix.ts,
// builds evidence via the frozen evidence.ts contract (never mixes cost-trace
// and runtime-attribution-trace), and for every Metric x Operation x NodeCount
// cell computes: Median/P25/P75/Min/Max per version, Δ/Δ%, paired direction
// (same trial INDEX across versions, same source — never cost-trace vs
// runtime-attribution-trace), and a Signal classification. Never explains a
// version difference from a single trial.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const VUE_VERSIONS = ['3.5.40', '3.6.0-rc.2'] as const
const OPERATIONS = ['mount', 'update'] as const
const NODE_COUNTS = [100, 500, 1000, 5000] as const
const TRIALS = 10

type Version = (typeof VUE_VERSIONS)[number]
type Operation = (typeof OPERATIONS)[number]

interface TrialMetrics {
  renderDurationMs: number | null
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

function loadTrial(version: Version, operation: Operation, nodeCount: number, trial: number): TrialMetrics {
  const dir = join('results', 'cdp-trace', `vue-${version}`, `${operation}-${nodeCount}`, `trial-${String(trial).padStart(2, '0')}`)
  const costMeta = JSON.parse(readFileSync(join(dir, 'cost-trace.meta.json'), 'utf-8'))
  const cost = parseTraceFile(join(dir, 'cost-trace.trace.json'))
  const attr = parseTraceFile(join(dir, 'runtime-attribution-trace.trace.json'))

  const costEvidence = buildCostTraceEvidence(cost.events)
  const attrEvidence = buildRuntimeAttributionEvidence(attr.events)

  const costMap: TrialMetrics['cost'] = {}
  for (const e of costEvidence) costMap[e.metric] = { observed: e.observed, durationUs: e.durationUs }
  const attrMap: TrialMetrics['attribution'] = {}
  for (const e of attrEvidence) attrMap[e.metric] = { observed: e.observed, durationUs: e.durationUs }

  return { renderDurationMs: costMeta.renderDurationMs, cost: costMap, attribution: attrMap }
}

export const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
export const ATTRIBUTION_METRICS = ['Vue Runtime CPU', 'Application CPU', 'V8/native CPU']
export const ALL_METRICS = ['Render Duration', ...COST_METRICS, ...ATTRIBUTION_METRICS]

export interface CellResult {
  metric: string
  operation: Operation
  nodeCount: number
  v35: { observedCount: number; dist: Distribution | null }
  v36: { observedCount: number; dist: Distribution | null }
  deltaMs: number | null // v36.median - v35.median (only for Render Duration, ms unit)
  deltaUs: number | null // for trace-derived metrics, us unit
  deltaPct: number | null
  pairedFavor36Count: number // out of paired trials where both observed
  pairedTotal: number
  iqrOverlap: boolean | null
  signal:
    | 'Consistent Improvement'
    | 'Consistent Regression'
    | 'Stable / No Meaningful Difference'
    | 'Unstable'
    | 'Not Available'
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

function classify(v35: Distribution | null, v36: Distribution | null, pairedFavor36: number, pairedTotal: number): CellResult['signal'] {
  if (!v35 || !v36 || pairedTotal < 5) return 'Not Available'
  const overlap = iqrOverlaps(v35, v36)
  const deltaPct = ((v36.median - v35.median) / v35.median) * 100
  const favorRatio = pairedFavor36 / pairedTotal // fraction of paired trials where v36 < v35 (lower/"improved")

  const consistentDirection = favorRatio >= 0.9 || favorRatio <= 0.1
  if (!overlap && consistentDirection) {
    return favorRatio >= 0.9 ? 'Consistent Improvement' : 'Consistent Regression'
  }
  if (Math.abs(deltaPct) < 3 && favorRatio > 0.35 && favorRatio < 0.65) {
    return 'Stable / No Meaningful Difference'
  }
  return 'Unstable'
}

function extractSeries(
  trials: TrialMetrics[],
  metric: string,
): { observed: number[]; observedCount: number; total: number } {
  const observed: number[] = []
  for (const t of trials) {
    let v: { observed: boolean; durationUs: number | null } | undefined
    if (metric === 'Render Duration') {
      if (t.renderDurationMs !== null) observed.push(t.renderDurationMs)
      continue
    }
    v = t.cost[metric] ?? t.attribution[metric]
    if (v && v.observed && v.durationUs !== null) observed.push(v.durationUs)
  }
  return { observed, observedCount: observed.length, total: trials.length }
}

export function analyzeCell(metric: string, operation: Operation, nodeCount: number): CellResult {
  const trials35: TrialMetrics[] = []
  const trials36: TrialMetrics[] = []
  for (let trial = 1; trial <= TRIALS; trial++) {
    trials35.push(loadTrial('3.5.40', operation, nodeCount, trial))
    trials36.push(loadTrial('3.6.0-rc.2', operation, nodeCount, trial))
  }

  const s35 = extractSeries(trials35, metric)
  const s36 = extractSeries(trials36, metric)
  const d35 = s35.observed.length > 0 ? summarize(s35.observed) : null
  const d36 = s36.observed.length > 0 ? summarize(s36.observed) : null

  // Paired: only trials where BOTH versions observed the metric at that trial index
  let pairedFavor36 = 0
  let pairedTotal = 0
  for (let i = 0; i < TRIALS; i++) {
    const t35 = trials35[i]!
    const t36 = trials36[i]!
    const isRenderDuration = metric === 'Render Duration'
    const v35v = isRenderDuration ? t35.renderDurationMs : (t35.cost[metric] ?? t35.attribution[metric])?.durationUs ?? null
    const v36v = isRenderDuration ? t36.renderDurationMs : (t36.cost[metric] ?? t36.attribution[metric])?.durationUs ?? null
    if (v35v === null || v36v === null) continue
    pairedTotal++
    if (v36v < v35v) pairedFavor36++
  }

  const deltaAbs = d35 && d36 ? d36.median - d35.median : null
  const deltaPct = d35 && d36 && d35.median !== 0 ? (deltaAbs! / d35.median) * 100 : null

  return {
    metric,
    operation,
    nodeCount,
    v35: { observedCount: s35.observedCount, dist: d35 },
    v36: { observedCount: s36.observedCount, dist: d36 },
    deltaMs: metric === 'Render Duration' ? deltaAbs : null,
    deltaUs: metric !== 'Render Duration' ? deltaAbs : null,
    deltaPct,
    pairedFavor36Count: pairedFavor36,
    pairedTotal,
    iqrOverlap: d35 && d36 ? iqrOverlaps(d35, d36) : null,
    signal: classify(d35, d36, pairedFavor36, pairedTotal),
  }
}

export function analyzeFullMatrix(): CellResult[] {
  const results: CellResult[] = []
  for (const metric of ALL_METRICS) {
    for (const operation of OPERATIONS) {
      for (const nodeCount of NODE_COUNTS) {
        results.push(analyzeCell(metric, operation, nodeCount))
      }
    }
  }
  return results
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/analyze-validation-matrix.ts')
if (isMain) {
  const results = analyzeFullMatrix()
  console.log(JSON.stringify(results, null, 2))
}
