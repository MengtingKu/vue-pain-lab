// Component Storm Runtime Attribution Validation — analysis (Day 30).
//
// Reuses the already-frozen evidence.ts contract (buildCostTraceEvidence /
// buildRuntimeAttributionEvidence — never mixes cost-trace and
// runtime-attribution-trace) exactly as analyze-composable-chaos.ts and
// analyze-validation-matrix.ts already do, and reuses the classify() signal
// logic verbatim from analyze-composable-chaos-version-compare.ts (same
// four-way signal: Consistent Improvement / Consistent Regression /
// Stable-No Meaningful Difference / Unstable, same paired-trial "does v3.6
// beat v3.5 on the SAME trial index" check, same IQR-overlap gate, same
// >=5-trial floor before calling anything Not Available). No new
// statistical methodology introduced — this file only re-points loadTrial()
// at component-storm's single-condition
// vue-{version}/update-500-AllChildren/trial-NN/ layout.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const VUE_VERSIONS = ['3.5.40', '3.6.0-rc.2'] as const
const CONDITION_DIR = 'update-500-AllChildren'
const TRIALS = 10

type Version = (typeof VUE_VERSIONS)[number]

interface TrialMetrics {
  updateDurationMs: number | null
  metricsAfter: Record<string, string> | null
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

function parseMsText(text: string | null | undefined): number | null {
  if (!text) return null
  const n = Number.parseFloat(text)
  return Number.isFinite(n) ? n : null
}

function loadTrial(version: Version, trial: number): TrialMetrics | null {
  const dir = join(
    'results',
    'cdp-trace',
    'component-storm',
    `vue-${version}`,
    CONDITION_DIR,
    `trial-${String(trial).padStart(2, '0')}`,
  )
  const costMetaPath = join(dir, 'cost-trace.meta.json')
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
      updateDurationMs: parseMsText(costMeta.metricsAfter?.['Average Update Duration']),
      metricsAfter: costMeta.metricsAfter ?? null,
      cost: costMap,
      attribution: attrMap,
    }
  } catch {
    return null
  }
}

export const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
export const ATTRIBUTION_METRICS = ['Vue Runtime CPU', 'Application CPU', 'DevTools Overlay CPU', 'V8/native CPU']
export const ALL_METRICS = ['Update Duration', ...COST_METRICS, ...ATTRIBUTION_METRICS]

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

export interface CellResult {
  metric: string
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

function extractSeries(trials: TrialMetrics[], metric: string): number[] {
  const observed: number[] = []
  for (const t of trials) {
    if (metric === 'Update Duration') {
      if (t.updateDurationMs !== null) observed.push(t.updateDurationMs)
      continue
    }
    const v = t.cost[metric] ?? t.attribution[metric]
    if (v && v.observed && v.durationUs !== null) observed.push(v.durationUs)
  }
  return observed
}

function valueAt(t: TrialMetrics | null, metric: string): number | null {
  if (!t) return null
  if (metric === 'Update Duration') return t.updateDurationMs
  return (t.cost[metric] ?? t.attribution[metric])?.durationUs ?? null
}

export function analyzeCell(metric: string): CellResult {
  const trials35: (TrialMetrics | null)[] = []
  const trials36: (TrialMetrics | null)[] = []
  for (let trial = 1; trial <= TRIALS; trial++) {
    trials35.push(loadTrial('3.5.40', trial))
    trials36.push(loadTrial('3.6.0-rc.2', trial))
  }

  const s35 = extractSeries(trials35.filter((t): t is TrialMetrics => t !== null), metric)
  const s36 = extractSeries(trials36.filter((t): t is TrialMetrics => t !== null), metric)
  const d35 = s35.length > 0 ? summarize(s35) : null
  const d36 = s36.length > 0 ? summarize(s36) : null

  let pairedFavor36 = 0
  let pairedTotal = 0
  for (let i = 0; i < TRIALS; i++) {
    const v35v = valueAt(trials35[i] ?? null, metric)
    const v36v = valueAt(trials36[i] ?? null, metric)
    if (v35v === null || v36v === null) continue
    pairedTotal++
    if (v36v < v35v) pairedFavor36++
  }

  const deltaAbs = d35 && d36 ? d36.median - d35.median : null
  const deltaPct = d35 && d36 && d35.median !== 0 ? (deltaAbs! / d35.median) * 100 : null

  return {
    metric,
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

export function analyzeAll(): CellResult[] {
  return ALL_METRICS.map((metric) => analyzeCell(metric))
}

/** Reads structural counters (Updated Component Count / Parent Render Count / Child Render Count) for one trial, for cross-version consistency reporting. */
export function loadStructuralCounters(version: Version, trial: number): Record<string, string> | null {
  return loadTrial(version, trial)?.metricsAfter ?? null
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/analyze-component-storm.ts')
if (isMain) {
  const results = analyzeAll()
  for (const r of results) {
    const d35 = r.v35.dist ? `median=${r.v35.dist.median.toFixed(1)} [${r.v35.dist.p25.toFixed(1)},${r.v35.dist.p75.toFixed(1)}] n=${r.v35.observedCount}` : 'N/A'
    const d36 = r.v36.dist ? `median=${r.v36.dist.median.toFixed(1)} [${r.v36.dist.p25.toFixed(1)},${r.v36.dist.p75.toFixed(1)}] n=${r.v36.observedCount}` : 'N/A'
    console.log(
      `${r.metric.padEnd(20)} :: 3.5.40 ${d35}  vs  3.6.0-rc.2 ${d36}  Δ%=${r.deltaPct !== null ? r.deltaPct.toFixed(1) + '%' : 'N/A'}  paired=${r.pairedFavor36Count}/${r.pairedTotal}  -> ${r.signal}`,
    )
  }
}
