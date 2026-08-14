// composable-chaos — Vue 3.5.40 vs Vue 3.6.0-rc.2 Version Comparison
// (Layer B / CDP trace evidence). Day 24 Validation.
//
// Reuses the already-frozen evidence.ts contract (buildCostTraceEvidence /
// buildRuntimeAttributionEvidence — never mixes cost-trace and
// runtime-attribution-trace) exactly as analyze-composable-chaos.ts (the
// within-version, cross-depth analysis) already does, and reuses the
// classify() signal logic verbatim from analyze-validation-matrix.ts (the
// vdom-stress Vue-version comparison) — same four-way signal (Consistent
// Improvement / Consistent Regression / Stable-No Meaningful Difference /
// Unstable), same paired-trial "does v3.6 beat v3.5 on the SAME trial
// index" check, same IQR-overlap gate, same >=5-trial floor before calling
// anything Not Available. No new statistical methodology is introduced —
// this file only re-points loadTrial() at composable-chaos's
// vue-{version}/{operation}-depth-{depth}/trial-NN/ layout instead of
// vdom-stress's vue-{version}/{operation}-{nodeCount}/trial-NN/ layout.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const VUE_VERSIONS = ['3.5.40', '3.6.0-rc.2'] as const
const DEPTHS = [1, 5, 10, 20] as const
const OPERATIONS = ['build', 'update'] as const
const TRIALS = 5

type Version = (typeof VUE_VERSIONS)[number]
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

function loadTrial(version: Version, operation: Operation, depth: Depth, trial: number): TrialMetrics | null {
  const dir = join(
    'results',
    'cdp-trace',
    'composable-chaos',
    `vue-${version}`,
    `${operation}-depth-${depth}`,
    `trial-${String(trial).padStart(2, '0')}`,
  )
  const costMetaPath = join(dir, 'cost-trace.meta.json')
  const attrMetaPath = join(dir, 'runtime-attribution-trace.meta.json')
  try {
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
  } catch {
    return null
  }
}

export const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
export const ATTRIBUTION_METRICS = ['Vue Runtime CPU', 'Application CPU', 'DevTools Overlay CPU', 'V8/native CPU']
export const ALL_METRICS = ['Instrumentation Duration', ...COST_METRICS, ...ATTRIBUTION_METRICS]

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

export interface CellResult {
  metric: string
  operation: Operation
  depth: Depth
  v35: { observedCount: number; dist: Distribution | null }
  v36: { observedCount: number; dist: Distribution | null }
  deltaAbs: number | null
  deltaPct: number | null
  pairedFavor36Count: number
  pairedTotal: number
  iqrOverlap: boolean | null
  signal: 'Consistent Improvement' | 'Consistent Regression' | 'Stable / No Meaningful Difference' | 'Unstable' | 'Not Available'
}

function classify(v35: Distribution | null, v36: Distribution | null, pairedFavor36: number, pairedTotal: number): CellResult['signal'] {
  if (!v35 || !v36 || pairedTotal < 5) return 'Not Available'
  const overlap = iqrOverlaps(v35, v36)
  const deltaPct = ((v36.median - v35.median) / v35.median) * 100
  const favorRatio = pairedFavor36 / pairedTotal

  const consistentDirection = favorRatio >= 0.9 || favorRatio <= 0.1
  if (!overlap && consistentDirection) {
    return favorRatio >= 0.9 ? 'Consistent Improvement' : 'Consistent Regression'
  }
  if (Math.abs(deltaPct) < 3 && favorRatio > 0.35 && favorRatio < 0.65) {
    return 'Stable / No Meaningful Difference'
  }
  return 'Unstable'
}

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

function valueAt(t: TrialMetrics | null, operation: Operation, metric: string): number | null {
  if (!t) return null
  if (metric === 'Instrumentation Duration') return operation === 'build' ? t.buildDurationMs : t.averageUpdateDurationMs
  return (t.cost[metric] ?? t.attribution[metric])?.durationUs ?? null
}

export function analyzeCell(metric: string, operation: Operation, depth: Depth): CellResult {
  const trials35: (TrialMetrics | null)[] = []
  const trials36: (TrialMetrics | null)[] = []
  for (let trial = 1; trial <= TRIALS; trial++) {
    trials35.push(loadTrial('3.5.40', operation, depth, trial))
    trials36.push(loadTrial('3.6.0-rc.2', operation, depth, trial))
  }

  const s35 = extractSeries(trials35.filter((t): t is TrialMetrics => t !== null), operation, metric)
  const s36 = extractSeries(trials36.filter((t): t is TrialMetrics => t !== null), operation, metric)
  const d35 = s35.length > 0 ? summarize(s35) : null
  const d36 = s36.length > 0 ? summarize(s36) : null

  let pairedFavor36 = 0
  let pairedTotal = 0
  for (let i = 0; i < TRIALS; i++) {
    const v35v = valueAt(trials35[i] ?? null, operation, metric)
    const v36v = valueAt(trials36[i] ?? null, operation, metric)
    if (v35v === null || v36v === null) continue
    pairedTotal++
    if (v36v < v35v) pairedFavor36++
  }

  const deltaAbs = d35 && d36 ? d36.median - d35.median : null
  const deltaPct = d35 && d36 && d35.median !== 0 ? (deltaAbs! / d35.median) * 100 : null

  return {
    metric,
    operation,
    depth,
    v35: { observedCount: s35.length, dist: d35 },
    v36: { observedCount: s36.length, dist: d36 },
    deltaAbs,
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
      for (const depth of DEPTHS) {
        results.push(analyzeCell(metric, operation, depth))
      }
    }
  }
  return results
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/analyze-composable-chaos-version-compare.ts')
if (isMain) {
  const results = analyzeFullMatrix()
  for (const r of results) {
    const d35 = r.v35.dist ? `median=${r.v35.dist.median.toFixed(1)} [${r.v35.dist.p25.toFixed(1)},${r.v35.dist.p75.toFixed(1)}] n=${r.v35.observedCount}` : 'N/A'
    const d36 = r.v36.dist ? `median=${r.v36.dist.median.toFixed(1)} [${r.v36.dist.p25.toFixed(1)},${r.v36.dist.p75.toFixed(1)}] n=${r.v36.observedCount}` : 'N/A'
    console.log(
      `${r.metric} | ${r.operation} | depth=${r.depth} :: 3.5.40 ${d35}  vs  3.6.0-rc.2 ${d36}  Δ%=${r.deltaPct !== null ? r.deltaPct.toFixed(1) + '%' : 'N/A'}  paired=${r.pairedFavor36Count}/${r.pairedTotal}  -> ${r.signal}`,
    )
  }
}
