// Dual-Trace Architecture — formal Evidence contract.
//
// Confirmed by INSTRUMENTATION_ISOLATION_REPORT.md: the SAME trace cannot
// be a trustworthy source for both Scripting/Rendering/Painting cost AND
// Vue Runtime CPU attribution — enabling disabled-by-default-v8.cpu_profiler
// (needed for attribution) makes V8.InvokeApiInterruptCallbacks pollute
// EvaluateScript's self-time (needed for cost accounting) with tens of
// milliseconds of profiler overhead per trial.
//
// This module is the single place that is allowed to turn raw trace events
// into a `MetricEvidence` record. Every metric this pipeline reports must
// come from here (or carry the same seven fields by the same rules) —
// TRACE_EVIDENCE_SCHEMA.md documents the contract, this module enforces it.

import { decodeVueRuntimeAttribution } from './attribution.ts'
import { extractMetric, findRendererMainThread, type SlimTraceEvent } from './parser.ts'
import { rollupSelfTimeByCategory } from './rollup.ts'

export type TraceSource = 'cost-trace' | 'runtime-attribution-trace'
export type Confidence = 'high' | 'medium' | 'low' | 'unavailable'

export interface MetricEvidence {
  metric: string
  source: TraceSource
  observed: boolean
  /** Microseconds. Always `null` when `observed` is false — never 0. */
  durationUs: number | null
  thread: string
  sourceEvent: string
  accountingRule: string
  confidence: Confidence
}

// ---------------------------------------------------------------------------
// Cross-use guards (Gate E). A trace captured with TRACE_CATEGORIES_NO_CPU_PROFILER
// can never contain ProfileChunk events; a trace captured with the full
// TRACE_CATEGORIES always will if any JS ran. These are structural checks,
// not just naming convention — passing the wrong trace to the wrong builder
// throws instead of silently producing misleading numbers.
// ---------------------------------------------------------------------------

export class TraceSourceMismatchError extends Error {}

function assertNoCpuProfilerSamples(events: SlimTraceEvent[], calledAs: TraceSource): void {
  const hasProfileChunks = events.some((e) => e.name === 'ProfileChunk')
  if (hasProfileChunks) {
    throw new TraceSourceMismatchError(
      `buildCostTraceEvidence() was called on a trace that contains ProfileChunk events — ` +
        `this looks like a runtime-attribution-trace (CPU profiler ON), not a ${calledAs}. ` +
        `Cost accounting must come from a trace captured with TRACE_CATEGORIES_NO_CPU_PROFILER.`,
    )
  }
}

function assertHasCpuProfilerSamples(events: SlimTraceEvent[], calledAs: TraceSource): void {
  const hasProfileChunks = events.some((e) => e.name === 'ProfileChunk')
  if (!hasProfileChunks) {
    throw new TraceSourceMismatchError(
      `buildRuntimeAttributionEvidence() was called on a trace with no ProfileChunk events — ` +
        `this looks like a cost-trace (CPU profiler OFF), not a ${calledAs}. ` +
        `Vue Runtime attribution requires a trace captured with the full TRACE_CATEGORIES.`,
    )
  }
}

// ---------------------------------------------------------------------------
// cost-trace → Scripting / Rendering / Recalculate Style / Layout / Painting / Paint
// ---------------------------------------------------------------------------

export function buildCostTraceEvidence(events: SlimTraceEvent[]): MetricEvidence[] {
  assertNoCpuProfilerSamples(events, 'cost-trace')

  const main = findRendererMainThread(events)
  const threadLabel = main ? `Main (pid ${main.pid}, tid ${main.tid})` : 'Main (not found)'
  const scoped = main ? events.filter((e) => e.pid === main.pid && e.tid === main.tid) : events

  const evidence: MetricEvidence[] = []

  const layout = extractMetric(scoped, ['Layout'])
  evidence.push({
    metric: 'Layout',
    source: 'cost-trace',
    observed: layout.observed,
    durationUs: layout.totalDurUs,
    thread: threadLabel,
    sourceEvent: 'Layout',
    accountingRule: 'raw-sum',
    confidence: layout.observed ? 'high' : 'unavailable',
  })

  const recalcStyle = extractMetric(scoped, ['UpdateLayoutTree'])
  evidence.push({
    metric: 'Recalculate Style',
    source: 'cost-trace',
    observed: recalcStyle.observed,
    durationUs: recalcStyle.totalDurUs,
    thread: threadLabel,
    sourceEvent: 'UpdateLayoutTree', // raw name — DevTools aliases this to "RecalcStyle"/"Recalculate Style", see TRACE_ACCOUNTING.md §3
    accountingRule: 'raw-sum',
    confidence: recalcStyle.observed ? 'high' : 'unavailable',
  })

  const paint = extractMetric(scoped, ['Paint'])
  evidence.push({
    metric: 'Paint',
    source: 'cost-trace',
    observed: paint.observed,
    durationUs: paint.totalDurUs,
    thread: threadLabel,
    sourceEvent: 'Paint',
    accountingRule: 'raw-sum',
    confidence: paint.observed ? 'medium' : 'unavailable', // see CALIBRATION_REPORT.md Phase 2 — observed-rate root cause still open
  })

  const rollup = main ? rollupSelfTimeByCategory(scoped) : null
  const rollupConfidence: Confidence = rollup ? 'medium' : 'unavailable' // Main-thread-only; Painting is a known undercount (Raster/Compositor excluded)
  evidence.push({
    metric: 'Scripting',
    source: 'cost-trace',
    observed: rollup !== null,
    durationUs: rollup ? rollup.byCategory.scripting : null,
    thread: threadLabel,
    sourceEvent: 'self-time rollup over EvaluateScript/FunctionCall/EventDispatch/RunMicrotasks/Timer*',
    accountingRule: 'self-time-rollup',
    confidence: rollupConfidence,
  })
  evidence.push({
    metric: 'Rendering',
    source: 'cost-trace',
    observed: rollup !== null,
    durationUs: rollup ? rollup.byCategory.rendering : null,
    thread: threadLabel,
    sourceEvent: 'self-time rollup over ScheduleStyleRecalculation/UpdateLayoutTree/Layout/PrePaint/...',
    accountingRule: 'self-time-rollup',
    confidence: rollupConfidence,
  })
  evidence.push({
    metric: 'Painting',
    source: 'cost-trace',
    observed: rollup !== null,
    durationUs: rollup ? rollup.byCategory.painting : null,
    thread: threadLabel,
    sourceEvent: 'self-time rollup over PaintSetup/Paint/RasterTask/Commit/CompositeLayers',
    accountingRule: 'self-time-rollup',
    confidence: 'low', // Main-thread only — RasterTask/CompositeLayers cross-thread work excluded, known undercount
  })

  return evidence
}

// ---------------------------------------------------------------------------
// runtime-attribution-trace → Vue Runtime / Application / DevTools Overlay / V8-native CPU
// ---------------------------------------------------------------------------

export function buildRuntimeAttributionEvidence(events: SlimTraceEvent[]): MetricEvidence[] {
  assertHasCpuProfilerSamples(events, 'runtime-attribution-trace')

  const main = findRendererMainThread(events)
  const threadLabel = main ? `Main (pid ${main.pid}, tid ${main.tid})` : 'Main (not found)'

  const attribution = decodeVueRuntimeAttribution(events)
  const hasSamples = attribution.totalSamples > 0
  // Leaf-only attribution — confirmed to UNDERCOUNT Vue's true inclusive cost
  // (native DOM calls Vue invokes, e.g. setAttribute/set textContent, land in
  // nativeOther because the leaf frame itself has no url — see
  // HARNESS_FIX_REPORT.md Phase 5-B). Also known to include CPU-profiler's
  // own sampling overhead in the same numbers it's measuring — do not read
  // these as precise, only as a directional attribution.
  const confidence: Confidence = hasSamples ? 'low' : 'unavailable'

  const label: Record<'vueRuntime' | 'application' | 'devtoolsOverlay' | 'nativeOther', string> = {
    vueRuntime: 'Vue Runtime CPU',
    application: 'Application CPU',
    devtoolsOverlay: 'DevTools Overlay CPU',
    nativeOther: 'V8/native CPU',
  }

  return (Object.keys(label) as Array<keyof typeof label>).map((bucket) => ({
    metric: label[bucket],
    source: 'runtime-attribution-trace' as const,
    observed: hasSamples,
    durationUs: hasSamples ? attribution.byBucket[bucket].timeUs : null,
    thread: threadLabel,
    sourceEvent: 'Profile/ProfileChunk (disabled-by-default-v8.cpu_profiler) — leaf callFrame.url bucketing',
    accountingRule: 'sample-attribution',
    confidence,
  }))
}
