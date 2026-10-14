// Composable Chaos — Vapor Validation — analysis (Vue 3.6.0-rc.11 Freeze Point, 2026-10-14).
//
// Same method as analyze-composable-chaos-version-compare.ts (Day 24) and
// analyze-day29-final-rc9.ts: evidence.ts / parser.ts / stats.ts reused
// unchanged, identical classify() thresholds, identical paired-trial
// definition, same 'Instrumentation Duration' definition (build ->
// buildDurationText, update -> averageUpdateDurationText of the
// UPDATE_BATCH_SIZE-click batch).
//
// Output shape matches analyze-day29-final-rc9.ts (comparisons[].cells[] with
// metric / operation / nodeCount / deltaPct / signal) so
// compare-day29-runs.ts can line up two runs without changes. Here
// `operation` = build | update and `nodeCount` = Depth.
//
// Trials: 10 per cell for this validation; the historical Day 24 labels
// ('3.5.40', '3.6.0-rc.2') have 5, so drift comparisons use the first 5
// trial pairs only.
//
// Direction convention: A = reference, B = candidate; deltaPct = (B - A) / A;
// "Consistent Improvement" = B lower.
//
// rc.11 Freeze Point (2026-10-14): copied from analyze-composable-chaos-vapor.ts — only COMPARISONS
// and LABELS changed (classify() thresholds, paired-trial definition, metric
// list and loadTrial() untouched). Same 12 comparisons as
// analyze-day29-final-rc11.ts. The rc.9-session labels (`-chrome153`, rc.9)
// were measured with the same -run1 / -run2 suffixes, so every label is
// suffixed; arch-rc9-original must reproduce composable-chaos-vapor-runN-analysis.json arch-rc9.
//
// Usage: node scripts/cdp-trace/analyze-composable-chaos-vapor-rc11.ts <runSuffix> > out.json

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const DEPTHS = [1, 5, 10, 20] as const
const OPERATIONS = ['build', 'update'] as const
const TRIALS = 10
const HISTORICAL_TRIALS = 5

type Operation = (typeof OPERATIONS)[number]

const RUN_SUFFIX = process.argv[2] ?? ''
const HISTORICAL_LABELS = new Set(['3.5.40', '3.6.0-rc.2'])
const run = (label: string) => (HISTORICAL_LABELS.has(label) ? label : label + RUN_SUFFIX)
const trialsFor = (label: string) => (HISTORICAL_LABELS.has(label) ? HISTORICAL_TRIALS : TRIALS)

const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
const ATTRIBUTION_METRICS = [
  'Vue Runtime CPU',
  'Application CPU',
  'DevTools Overlay CPU',
  'V8/native CPU',
]
const ALL_METRICS = ['Instrumentation Duration', ...COST_METRICS, ...ATTRIBUTION_METRICS]

const COMPARISONS: Array<{ id: string; a: string; b: string }> = (
  [
    // Architecture effect
    { id: 'arch-rc11', a: '3.6.0-rc.11-traditional', b: '3.6.0-rc.11-vapor' },
    // Original rc.9 pair (Chrome 153) — equivalence check against <scenario>-vapor-runN-analysis.json arch-rc9
    { id: 'arch-rc9-original', a: '3.6.0-rc.9-traditional', b: '3.6.0-rc.9-vapor' },
    {
      id: 'arch-rc9-chrome155',
      a: '3.6.0-rc.9-traditional-chrome155',
      b: '3.6.0-rc.9-vapor-chrome155',
    },
    {
      id: 'arch-rc4-chrome155',
      a: '3.6.0-rc.4-traditional-chrome155',
      b: '3.6.0-rc.4-vapor-chrome155',
    },
    // Version effect (same Chrome 155 session)
    {
      id: 'version-trad-rc9-rc11',
      a: '3.6.0-rc.9-traditional-chrome155',
      b: '3.6.0-rc.11-traditional',
    },
    { id: 'version-vapor-rc9-rc11', a: '3.6.0-rc.9-vapor-chrome155', b: '3.6.0-rc.11-vapor' },
    {
      id: 'version-trad-rc4-rc9',
      a: '3.6.0-rc.4-traditional-chrome155',
      b: '3.6.0-rc.9-traditional-chrome155',
    },
    { id: 'version-3540-rc11trad', a: '3.5.40-chrome155', b: '3.6.0-rc.11-traditional' },
    { id: 'version-3540-rc9trad', a: '3.5.40-chrome155', b: '3.6.0-rc.9-traditional-chrome155' },
    // Browser drift (same Vue, rc.9 session Chrome 153 -> this session Chrome 155)
    { id: 'drift-3540', a: '3.5.40-chrome153', b: '3.5.40-chrome155' },
    { id: 'drift-rc9-trad', a: '3.6.0-rc.9-traditional', b: '3.6.0-rc.9-traditional-chrome155' },
    { id: 'drift-rc9-vapor', a: '3.6.0-rc.9-vapor', b: '3.6.0-rc.9-vapor-chrome155' },
  ] as Array<{ id: string; a: string; b: string }>
).map((c) => ({ ...c, a: run(c.a), b: run(c.b) }))

const LABELS = [
  '3.5.40-chrome155',
  '3.6.0-rc.4-traditional-chrome155',
  '3.6.0-rc.4-vapor-chrome155',
  '3.6.0-rc.9-traditional-chrome155',
  '3.6.0-rc.9-vapor-chrome155',
  '3.6.0-rc.11-traditional',
  '3.6.0-rc.11-vapor',
].map(run)

interface TrialMetrics {
  instrumentationMs: number | null
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

function parseMsText(text: string | null | undefined): number | null {
  if (!text) return null
  const n = Number.parseFloat(text)
  return Number.isFinite(n) ? n : null
}

const trialCache = new Map<string, TrialMetrics>()

function loadTrial(
  label: string,
  operation: Operation,
  depth: number,
  trial: number,
): TrialMetrics {
  const dir = join(
    'results',
    'cdp-trace',
    'composable-chaos',
    `vue-${label}`,
    `${operation}-depth-${depth}`,
    `trial-${String(trial).padStart(2, '0')}`,
  )
  const cached = trialCache.get(dir)
  if (cached) return cached

  const costMeta = JSON.parse(readFileSync(join(dir, 'cost-trace.meta.json'), 'utf-8'))
  const cost = parseTraceFile(join(dir, 'cost-trace.trace.json'))
  const attr = parseTraceFile(join(dir, 'runtime-attribution-trace.trace.json'))

  const costMap: TrialMetrics['cost'] = {}
  for (const e of buildCostTraceEvidence(cost.events))
    costMap[e.metric] = { observed: e.observed, durationUs: e.durationUs }
  const attrMap: TrialMetrics['attribution'] = {}
  for (const e of buildRuntimeAttributionEvidence(attr.events))
    attrMap[e.metric] = { observed: e.observed, durationUs: e.durationUs }

  const result: TrialMetrics = {
    instrumentationMs: parseMsText(
      operation === 'build' ? costMeta.buildDurationText : costMeta.averageUpdateDurationText,
    ),
    cost: costMap,
    attribution: attrMap,
  }
  trialCache.set(dir, result)
  return result
}

function loadTrials(
  label: string,
  operation: Operation,
  depth: number,
  count: number,
): TrialMetrics[] {
  const trials: TrialMetrics[] = []
  for (let trial = 1; trial <= count; trial++)
    trials.push(loadTrial(label, operation, depth, trial))
  return trials
}

function valueOf(t: TrialMetrics, metric: string): number | null {
  if (metric === 'Instrumentation Duration') return t.instrumentationMs
  const v = t.cost[metric] ?? t.attribution[metric]
  return v && v.observed && v.durationUs !== null ? v.durationUs : null
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

// Identical thresholds to analyze-composable-chaos-version-compare.ts / analyze-day29-final-rc9.ts.
function classify(
  a: Distribution | null,
  b: Distribution | null,
  pairedFavorB: number,
  pairedTotal: number,
): string {
  if (!a || !b || pairedTotal < 5) return 'Not Available'
  const overlap = iqrOverlaps(a, b)
  const deltaPct = ((b.median - a.median) / a.median) * 100
  const favorRatio = pairedFavorB / pairedTotal

  const consistentDirection = favorRatio >= 0.9 || favorRatio <= 0.1
  if (!overlap && consistentDirection) {
    return favorRatio >= 0.9 ? 'Consistent Improvement' : 'Consistent Regression'
  }
  if (Math.abs(deltaPct) < 3 && favorRatio > 0.35 && favorRatio < 0.65) {
    return 'Stable / No Meaningful Difference'
  }
  return 'Unstable'
}

function distOf(trials: TrialMetrics[], metric: string): Distribution | null {
  const observed = trials.map((t) => valueOf(t, metric)).filter((v): v is number => v !== null)
  return observed.length > 0 ? summarize(observed) : null
}

function analyzeCell(
  labelA: string,
  labelB: string,
  metric: string,
  operation: Operation,
  depth: number,
) {
  const count = Math.min(trialsFor(labelA), trialsFor(labelB))
  const trialsA = loadTrials(labelA, operation, depth, count)
  const trialsB = loadTrials(labelB, operation, depth, count)
  const dA = distOf(trialsA, metric)
  const dB = distOf(trialsB, metric)

  let pairedFavorB = 0
  let pairedTotal = 0
  for (let i = 0; i < count; i++) {
    const vA = valueOf(trialsA[i]!, metric)
    const vB = valueOf(trialsB[i]!, metric)
    if (vA === null || vB === null) continue
    pairedTotal++
    if (vB < vA) pairedFavorB++
  }

  const delta = dA && dB ? dB.median - dA.median : null
  return {
    metric,
    operation,
    nodeCount: depth,
    a: dA,
    b: dB,
    delta,
    deltaPct: dA && dB && dA.median !== 0 ? (delta! / dA.median) * 100 : null,
    pairedFavorB,
    pairedTotal,
    iqrOverlap: dA && dB ? iqrOverlaps(dA, dB) : null,
    signal: classify(dA, dB, pairedFavorB, pairedTotal),
  }
}

// Same definition as the Day 29 reports: share = metric median / (Scripting + Rendering + Painting medians).
function costStructure(label: string, operation: Operation, depth: number) {
  const trials = loadTrials(label, operation, depth, trialsFor(label))
  const med = (m: string) => distOf(trials, m)?.median ?? 0
  const scripting = med('Scripting')
  const rendering = med('Rendering')
  const painting = med('Painting')
  const total = scripting + rendering + painting
  return {
    label,
    operation,
    nodeCount: depth,
    scriptingUs: scripting,
    renderingUs: rendering,
    paintingUs: painting,
    totalUs: total,
    scriptingPct: (scripting / total) * 100,
    renderingPct: (rendering / total) * 100,
    paintingPct: (painting / total) * 100,
  }
}

const comparisons = COMPARISONS.map((c) => {
  const cells = []
  for (const metric of ALL_METRICS)
    for (const op of OPERATIONS)
      for (const depth of DEPTHS) cells.push(analyzeCell(c.a, c.b, metric, op, depth))
  const signalCounts: Record<string, number> = {}
  for (const cell of cells) signalCounts[cell.signal] = (signalCounts[cell.signal] ?? 0) + 1
  return { id: c.id, a: c.a, b: c.b, signalCounts, cells }
})

const costStructures = []
for (const label of LABELS)
  for (const op of OPERATIONS)
    for (const depth of DEPTHS) costStructures.push(costStructure(label, op, depth))

// This runner's meta files and traces do not record the browser version; the runner
// prints it once per Chrome launch. Taken from those logs so /compare can tell the two
// sessions apart (metadata only — no statistic depends on it):
//   - this session (`-chrome155` controls, rc.11): every launch in both run logs Chrome/155.0.8059.41
//   - rc.9 session (`-chrome153` controls, rc.9): Chrome/153.0.8010.54 (rc.9 report, Part 0)
const browserOf = (label: string) =>
  /-chrome155-|^3\.6\.0-rc\.11-/.test(label) ? 'Chrome/155.0.8059.41' : 'Chrome/153.0.8010.54'
const browserVersions: Record<string, string[]> = {}
for (const label of new Set(COMPARISONS.flatMap((c) => [c.a, c.b])))
  browserVersions[label] = [browserOf(label)]

console.log(
  JSON.stringify(
    { generatedAt: new Date().toISOString(), browserVersions, comparisons, costStructures },
    null,
    2,
  ),
)
