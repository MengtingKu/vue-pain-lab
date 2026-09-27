// Day 29 — Final Validation (rc.9) — analysis.
//
// Same method as analyze-vapor-comparison.ts (evidence.ts / parser.ts /
// stats.ts reused unchanged, identical classify() thresholds, identical
// paired-trial definition). The only difference: the label pair is a
// parameter, so the same cell analysis can be applied to every comparison
// the Final Validation needs (architecture, version, browser drift) instead
// of copying the file once per pair.
//
// Direction convention (same as the rc.4 analysis): A = reference, B =
// candidate; deltaPct = (B - A) / A; "Consistent Improvement" = B lower.
//
// Usage: node scripts/cdp-trace/analyze-day29-final-rc9.ts [runSuffix] > out.json
//   runSuffix (e.g. `-run2`) is appended to every label measured in the
//   Day 29 final session (`-chrome153` controls and rc.9); the historical
//   Chrome 151 labels (`3.5.40`, `3.6.0-rc.4-traditional`/`-vapor`) are never suffixed.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const OPERATIONS = ['mount', 'update'] as const
const NODE_COUNTS = [100, 500, 1000, 5000] as const
const TRIALS = 10

type Operation = (typeof OPERATIONS)[number]

const RUN_SUFFIX = process.argv[2] ?? ''
const HISTORICAL_LABELS = new Set(['3.5.40', '3.6.0-rc.4-traditional', '3.6.0-rc.4-vapor'])
const run = (label: string) => (HISTORICAL_LABELS.has(label) ? label : label + RUN_SUFFIX)

const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
const ATTRIBUTION_METRICS = ['Vue Runtime CPU', 'Application CPU', 'V8/native CPU']
const ALL_METRICS = ['Render Duration', ...COST_METRICS, ...ATTRIBUTION_METRICS]

// Label pairs: [A (reference), B (candidate)].
const COMPARISONS: Array<{ id: string; a: string; b: string }> = (
  [
    // Architecture effect
    { id: 'arch-rc9', a: '3.6.0-rc.9-traditional', b: '3.6.0-rc.9-vapor' },
    // Original rc.4 pair — sanity check that this analyzer reproduces DAY29_FINAL_VALIDATION_REPORT.md
    { id: 'arch-rc4-original', a: '3.6.0-rc.4-traditional', b: '3.6.0-rc.4-vapor' },
    {
      id: 'arch-rc4-chrome153',
      a: '3.6.0-rc.4-traditional-chrome153',
      b: '3.6.0-rc.4-vapor-chrome153',
    },
    // Version effect (same Chrome 153 session)
    {
      id: 'version-trad-rc4-rc9',
      a: '3.6.0-rc.4-traditional-chrome153',
      b: '3.6.0-rc.9-traditional',
    },
    { id: 'version-vapor-rc4-rc9', a: '3.6.0-rc.4-vapor-chrome153', b: '3.6.0-rc.9-vapor' },
    { id: 'version-3540-rc9trad', a: '3.5.40-chrome153', b: '3.6.0-rc.9-traditional' },
    { id: 'version-3540-rc4trad', a: '3.5.40-chrome153', b: '3.6.0-rc.4-traditional-chrome153' },
    // Browser drift / reproducibility (same Vue, different session + Chrome)
    { id: 'drift-3540', a: '3.5.40', b: '3.5.40-chrome153' },
    { id: 'drift-rc4-trad', a: '3.6.0-rc.4-traditional', b: '3.6.0-rc.4-traditional-chrome153' },
    { id: 'drift-rc4-vapor', a: '3.6.0-rc.4-vapor', b: '3.6.0-rc.4-vapor-chrome153' },
  ] as Array<{ id: string; a: string; b: string }>
).map((c) => ({ ...c, a: run(c.a), b: run(c.b) }))

// Conditions whose per-cell cost structure (share of Scripting+Rendering+Painting) is reported.
const COST_STRUCTURE_LABELS = [
  '3.5.40-chrome153',
  '3.6.0-rc.4-traditional',
  '3.6.0-rc.4-vapor',
  '3.6.0-rc.4-traditional-chrome153',
  '3.6.0-rc.4-vapor-chrome153',
  '3.6.0-rc.9-traditional',
  '3.6.0-rc.9-vapor',
].map(run)

interface TrialMetrics {
  renderDurationMs: number | null
  browserVersion: string
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

const trialCache = new Map<string, TrialMetrics>()

function loadTrial(
  label: string,
  operation: Operation,
  nodeCount: number,
  trial: number,
): TrialMetrics {
  const dir = join(
    'results',
    'cdp-trace',
    `vue-${label}`,
    `${operation}-${nodeCount}`,
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

  const result = {
    renderDurationMs: costMeta.renderDurationMs,
    browserVersion: costMeta.browserVersion,
    cost: costMap,
    attribution: attrMap,
  }
  trialCache.set(dir, result)
  return result
}

function loadTrials(label: string, operation: Operation, nodeCount: number): TrialMetrics[] {
  const trials: TrialMetrics[] = []
  for (let trial = 1; trial <= TRIALS; trial++)
    trials.push(loadTrial(label, operation, nodeCount, trial))
  return trials
}

function valueOf(t: TrialMetrics, metric: string): number | null {
  if (metric === 'Render Duration') return t.renderDurationMs
  const v = t.cost[metric] ?? t.attribution[metric]
  return v && v.observed && v.durationUs !== null ? v.durationUs : null
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

// Identical thresholds to analyze-vapor-comparison.ts / analyze-validation-matrix.ts.
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
  nodeCount: number,
) {
  const trialsA = loadTrials(labelA, operation, nodeCount)
  const trialsB = loadTrials(labelB, operation, nodeCount)
  const dA = distOf(trialsA, metric)
  const dB = distOf(trialsB, metric)

  let pairedFavorB = 0
  let pairedTotal = 0
  for (let i = 0; i < TRIALS; i++) {
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
    nodeCount,
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

// Same definition as the rc.4 report: share = metric median / (Scripting + Rendering + Painting medians).
function costStructure(label: string, operation: Operation, nodeCount: number) {
  const trials = loadTrials(label, operation, nodeCount)
  const med = (m: string) => distOf(trials, m)?.median ?? 0
  const scripting = med('Scripting')
  const rendering = med('Rendering')
  const painting = med('Painting')
  const total = scripting + rendering + painting
  return {
    label,
    operation,
    nodeCount,
    scriptingUs: scripting,
    renderingUs: rendering,
    paintingUs: painting,
    totalUs: total,
    scriptingPct: (scripting / total) * 100,
    renderingPct: (rendering / total) * 100,
    paintingPct: (painting / total) * 100,
  }
}

const browserVersions: Record<string, string[]> = {}
for (const label of new Set(COMPARISONS.flatMap((c) => [c.a, c.b]))) {
  const versions = new Set<string>()
  for (const op of OPERATIONS)
    for (const n of NODE_COUNTS)
      for (const t of loadTrials(label, op, n)) versions.add(t.browserVersion)
  browserVersions[label] = [...versions]
}

const comparisons = COMPARISONS.map((c) => {
  const cells = []
  for (const metric of ALL_METRICS)
    for (const op of OPERATIONS)
      for (const n of NODE_COUNTS) cells.push(analyzeCell(c.a, c.b, metric, op, n))
  const signalCounts: Record<string, number> = {}
  for (const cell of cells) signalCounts[cell.signal] = (signalCounts[cell.signal] ?? 0) + 1
  return { ...c, signalCounts, cells }
})

const costStructures = []
for (const label of COST_STRUCTURE_LABELS)
  for (const op of OPERATIONS)
    for (const n of NODE_COUNTS) costStructures.push(costStructure(label, op, n))

console.log(
  JSON.stringify(
    { generatedAt: new Date().toISOString(), browserVersions, comparisons, costStructures },
    null,
    2,
  ),
)
