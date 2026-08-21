// Day 29 — Vapor Exploratory Validation, VDOM Stress — analysis.
//
// Same method as analyze-validation-matrix.ts (evidence.ts / parser.ts /
// stats.ts reused unchanged, same classify() thresholds, same paired-trial
// definition), just pointed at the two new version labels produced by
// run-vapor-comparison.ts instead of 3.5.40 / 3.6.0-rc.2.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const LABEL_A = '3.6.0-rc.4-traditional'
const LABEL_B = '3.6.0-rc.4-vapor'
const OPERATIONS = ['mount', 'update'] as const
const NODE_COUNTS = [100, 500, 1000, 5000] as const
const TRIALS = 10

type Operation = (typeof OPERATIONS)[number]

interface TrialMetrics {
  renderDurationMs: number | null
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

function loadTrial(label: string, operation: Operation, nodeCount: number, trial: number): TrialMetrics {
  const dir = join('results', 'cdp-trace', `vue-${label}`, `${operation}-${nodeCount}`, `trial-${String(trial).padStart(2, '0')}`)
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
  a: { observedCount: number; dist: Distribution | null } // Traditional
  b: { observedCount: number; dist: Distribution | null } // Vapor
  deltaMs: number | null
  deltaUs: number | null
  deltaPct: number | null // (vapor - traditional) / traditional * 100
  pairedFavorVaporCount: number
  pairedTotal: number
  iqrOverlap: boolean | null
  signal:
    | 'Consistent Improvement' // Vapor lower/faster
    | 'Consistent Regression' // Vapor higher/slower
    | 'Stable / No Meaningful Difference'
    | 'Unstable'
    | 'Not Available'
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

function classify(a: Distribution | null, b: Distribution | null, pairedFavorVapor: number, pairedTotal: number): CellResult['signal'] {
  if (!a || !b || pairedTotal < 5) return 'Not Available'
  const overlap = iqrOverlaps(a, b)
  const deltaPct = ((b.median - a.median) / a.median) * 100
  const favorRatio = pairedFavorVapor / pairedTotal

  const consistentDirection = favorRatio >= 0.9 || favorRatio <= 0.1
  if (!overlap && consistentDirection) {
    return favorRatio >= 0.9 ? 'Consistent Improvement' : 'Consistent Regression'
  }
  if (Math.abs(deltaPct) < 3 && favorRatio > 0.35 && favorRatio < 0.65) {
    return 'Stable / No Meaningful Difference'
  }
  return 'Unstable'
}

function extractSeries(trials: TrialMetrics[], metric: string): { observed: number[]; observedCount: number; total: number } {
  const observed: number[] = []
  for (const t of trials) {
    if (metric === 'Render Duration') {
      if (t.renderDurationMs !== null) observed.push(t.renderDurationMs)
      continue
    }
    const v = t.cost[metric] ?? t.attribution[metric]
    if (v && v.observed && v.durationUs !== null) observed.push(v.durationUs)
  }
  return { observed, observedCount: observed.length, total: trials.length }
}

export function analyzeCell(metric: string, operation: Operation, nodeCount: number): CellResult {
  const trialsA: TrialMetrics[] = []
  const trialsB: TrialMetrics[] = []
  for (let trial = 1; trial <= TRIALS; trial++) {
    trialsA.push(loadTrial(LABEL_A, operation, nodeCount, trial))
    trialsB.push(loadTrial(LABEL_B, operation, nodeCount, trial))
  }

  const sA = extractSeries(trialsA, metric)
  const sB = extractSeries(trialsB, metric)
  const dA = sA.observed.length > 0 ? summarize(sA.observed) : null
  const dB = sB.observed.length > 0 ? summarize(sB.observed) : null

  let pairedFavorVapor = 0
  let pairedTotal = 0
  for (let i = 0; i < TRIALS; i++) {
    const tA = trialsA[i]!
    const tB = trialsB[i]!
    const isRenderDuration = metric === 'Render Duration'
    const vA = isRenderDuration ? tA.renderDurationMs : (tA.cost[metric] ?? tA.attribution[metric])?.durationUs ?? null
    const vB = isRenderDuration ? tB.renderDurationMs : (tB.cost[metric] ?? tB.attribution[metric])?.durationUs ?? null
    if (vA === null || vB === null) continue
    pairedTotal++
    if (vB < vA) pairedFavorVapor++
  }

  const deltaAbs = dA && dB ? dB.median - dA.median : null
  const deltaPct = dA && dB && dA.median !== 0 ? (deltaAbs! / dA.median) * 100 : null

  return {
    metric,
    operation,
    nodeCount,
    a: { observedCount: sA.observedCount, dist: dA },
    b: { observedCount: sB.observedCount, dist: dB },
    deltaMs: metric === 'Render Duration' ? deltaAbs : null,
    deltaUs: metric !== 'Render Duration' ? deltaAbs : null,
    deltaPct,
    pairedFavorVaporCount: pairedFavorVapor,
    pairedTotal,
    iqrOverlap: dA && dB ? iqrOverlaps(dA, dB) : null,
    signal: classify(dA, dB, pairedFavorVapor, pairedTotal),
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

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/analyze-vapor-comparison.ts')
if (isMain) {
  const results = analyzeFullMatrix()
  console.log(JSON.stringify(results, null, 2))
}
