// Component Storm — Vapor Validation — analysis.
//
// Same method as analyze-component-storm.ts / analyze-day29-final-rc9.ts:
// evidence.ts / parser.ts / stats.ts reused unchanged, identical classify()
// thresholds, identical paired-trial definition. loadTrial() reads trials
// the same way analyze-component-storm.ts does (Update Duration =
// metricsAfter['Average Update Duration'] of the cost-trace trial; a single
// click per trial, so it is that click's own duration).
//
// Output shape matches analyze-day29-final-rc9.ts (comparisons[].cells[] with
// metric / operation / nodeCount / deltaPct / signal) so
// compare-day29-runs.ts can line up two runs without changes. Here
// `operation` = `update-<scope>` and `nodeCount` = componentCount (500).
//
// 'Mount Time' is the page's own in-page wall-clock (setup -> onMounted) read
// from the same trial's fresh page load — not traced, no cost breakdown.
//
// Direction convention: A = reference, B = candidate; deltaPct = (B - A) / A;
// "Consistent Improvement" = B lower.
//
// Usage: node scripts/cdp-trace/analyze-component-storm-vapor.ts <runSuffix> > out.json

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCostTraceEvidence, buildRuntimeAttributionEvidence } from './evidence.ts'
import { parseTraceFile } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

const COMPONENT_COUNT = 500
const UPDATE_SCOPES = ['ParentOnly', 'SingleChild', 'AllChildren'] as const
const TRIALS = 10

const RUN_SUFFIX = process.argv[2] ?? ''
// Historical Day 30 labels (Chrome 152, AllChildren only) are never suffixed.
const HISTORICAL_LABELS = new Set(['3.5.40', '3.6.0-rc.2'])
const run = (label: string) => (HISTORICAL_LABELS.has(label) ? label : label + RUN_SUFFIX)

const COST_METRICS = ['Scripting', 'Rendering', 'Recalculate Style', 'Layout', 'Painting', 'Paint']
const ATTRIBUTION_METRICS = [
  'Vue Runtime CPU',
  'Application CPU',
  'DevTools Overlay CPU',
  'V8/native CPU',
]
const ALL_METRICS = ['Update Duration', 'Mount Time', ...COST_METRICS, ...ATTRIBUTION_METRICS]

const COMPARISONS: Array<{ id: string; a: string; b: string; scopes?: readonly string[] }> = (
  [
    // Architecture effect
    { id: 'arch-rc9', a: '3.6.0-rc.9-traditional', b: '3.6.0-rc.9-vapor' },
    {
      id: 'arch-rc4-chrome153',
      a: '3.6.0-rc.4-traditional-chrome153',
      b: '3.6.0-rc.4-vapor-chrome153',
    },
    // Version effect (same session)
    {
      id: 'version-trad-rc4-rc9',
      a: '3.6.0-rc.4-traditional-chrome153',
      b: '3.6.0-rc.9-traditional',
    },
    { id: 'version-vapor-rc4-rc9', a: '3.6.0-rc.4-vapor-chrome153', b: '3.6.0-rc.9-vapor' },
    { id: 'version-3540-rc9trad', a: '3.5.40-chrome153', b: '3.6.0-rc.9-traditional' },
    { id: 'version-3540-rc4trad', a: '3.5.40-chrome153', b: '3.6.0-rc.4-traditional-chrome153' },
    // Session drift vs Day 30 (Chrome 152, AllChildren only)
    { id: 'drift-3540', a: '3.5.40', b: '3.5.40-chrome153', scopes: ['AllChildren'] },
  ] as Array<{ id: string; a: string; b: string; scopes?: readonly string[] }>
).map((c) => ({ ...c, a: run(c.a), b: run(c.b) }))

const LABELS = [
  '3.5.40-chrome153',
  '3.6.0-rc.4-traditional-chrome153',
  '3.6.0-rc.4-vapor-chrome153',
  '3.6.0-rc.9-traditional',
  '3.6.0-rc.9-vapor',
].map(run)

interface TrialMetrics {
  updateDurationMs: number | null
  mountTimeMs: number | null
  browserVersion: string
  metricsAfter: Record<string, string> | null
  cost: Record<string, { observed: boolean; durationUs: number | null }>
  attribution: Record<string, { observed: boolean; durationUs: number | null }>
}

function parseMsText(text: string | null | undefined): number | null {
  if (!text) return null
  const n = Number.parseFloat(text)
  return Number.isFinite(n) ? n : null
}

const trialCache = new Map<string, TrialMetrics>()

function loadTrial(label: string, scope: string, trial: number): TrialMetrics {
  const dir = join(
    'results',
    'cdp-trace',
    'component-storm',
    `vue-${label}`,
    `update-${COMPONENT_COUNT}-${scope}`,
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
    updateDurationMs: parseMsText(costMeta.metricsAfter?.['Average Update Duration']),
    mountTimeMs: parseMsText(costMeta.metricsAfter?.['Mount Time']),
    browserVersion: costMeta.browserVersion,
    metricsAfter: costMeta.metricsAfter ?? null,
    cost: costMap,
    attribution: attrMap,
  }
  trialCache.set(dir, result)
  return result
}

function loadTrials(label: string, scope: string): TrialMetrics[] {
  const trials: TrialMetrics[] = []
  for (let trial = 1; trial <= TRIALS; trial++) trials.push(loadTrial(label, scope, trial))
  return trials
}

function valueOf(t: TrialMetrics, metric: string): number | null {
  if (metric === 'Update Duration') return t.updateDurationMs
  if (metric === 'Mount Time') return t.mountTimeMs
  const v = t.cost[metric] ?? t.attribution[metric]
  return v && v.observed && v.durationUs !== null ? v.durationUs : null
}

function iqrOverlaps(a: Distribution, b: Distribution): boolean {
  return a.p25 <= b.p75 && b.p25 <= a.p75
}

// Identical thresholds to analyze-component-storm.ts / analyze-day29-final-rc9.ts.
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

function analyzeCell(labelA: string, labelB: string, metric: string, scope: string) {
  const trialsA = loadTrials(labelA, scope)
  const trialsB = loadTrials(labelB, scope)
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
    operation: `update-${scope}`,
    nodeCount: COMPONENT_COUNT,
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
function costStructure(label: string, scope: string) {
  const trials = loadTrials(label, scope)
  const med = (m: string) => distOf(trials, m)?.median ?? 0
  const scripting = med('Scripting')
  const rendering = med('Rendering')
  const painting = med('Painting')
  const total = scripting + rendering + painting
  return {
    label,
    operation: `update-${scope}`,
    nodeCount: COMPONENT_COUNT,
    scriptingUs: scripting,
    renderingUs: rendering,
    paintingUs: painting,
    totalUs: total,
    scriptingPct: (scripting / total) * 100,
    renderingPct: (rendering / total) * 100,
    paintingPct: (painting / total) * 100,
  }
}

// Structural counters from the page itself (correctness / semantics check, not performance).
function structuralCounters(label: string, scope: string) {
  const keys = [
    'Updated Component Count（上一次 update）',
    'Parent Render Count',
    'Child Render Count（累計）',
    'Parent Tick（ParentOnly 用）',
  ]
  const seen: Record<string, string[]> = {}
  for (const t of loadTrials(label, scope)) {
    for (const k of keys) {
      const v = t.metricsAfter?.[k] ?? 'n/a'
      seen[k] ??= []
      if (!seen[k].includes(v)) seen[k].push(v)
    }
  }
  return { label, operation: `update-${scope}`, counters: seen }
}

const browserVersions: Record<string, string[]> = {}
for (const c of COMPARISONS) {
  for (const label of [c.a, c.b]) {
    if (browserVersions[label]) continue
    const versions = new Set<string>()
    for (const scope of c.scopes ?? UPDATE_SCOPES)
      for (const t of loadTrials(label, scope)) versions.add(t.browserVersion)
    browserVersions[label] = [...versions]
  }
}

const comparisons = COMPARISONS.map((c) => {
  const cells = []
  for (const metric of ALL_METRICS)
    for (const scope of c.scopes ?? UPDATE_SCOPES) cells.push(analyzeCell(c.a, c.b, metric, scope))
  const signalCounts: Record<string, number> = {}
  for (const cell of cells) signalCounts[cell.signal] = (signalCounts[cell.signal] ?? 0) + 1
  return { id: c.id, a: c.a, b: c.b, signalCounts, cells }
})

const costStructures = []
const counters = []
for (const label of LABELS) {
  for (const scope of UPDATE_SCOPES) {
    costStructures.push(costStructure(label, scope))
    counters.push(structuralCounters(label, scope))
  }
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      browserVersions,
      comparisons,
      costStructures,
      counters,
    },
    null,
    2,
  ),
)
