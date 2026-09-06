// CDP Trace Harness — Phase 5-B: Vue Runtime Attribution via CPU profiler
// sample decoding (not node counts).
//
// A ProfileChunk's node LIST tells you which functions/files exist in the
// call tree — it does NOT tell you how much time was spent in each. That
// requires walking `samples` (one call-tree node id per sample) alongside
// `timeDeltas` (microseconds since the previous sample) and crediting each
// sample's elapsed time to that sample's node — the standard convention
// used by CPU-profile flame-graph tools (the interval ending at sample i is
// attributed to the node sampled AT i, i.e. "what was running when this
// sample was taken").
//
// Category is decided by matching the sampled node's `callFrame.url`
// against the three patterns confirmed in this Lab's own traces (see
// TRACE_ACCOUNTING.md / CALIBRATION_REPORT.md Phase 4):
//   - Vue Runtime:     .../vue.runtime.esm-bundler-*.js
//   - Application:     .../scenarios/vdom-stress/VDomStressPage.vue
//   - DevTools Overlay: .../virtual:vue-devtools-path:overlay/...
//   - everything else (no url, or any other url) -> "native/other"
//
// Additive extension for the composable-chaos Controlled Validation: the
// vdom-stress-only "application" pattern above cannot see composable-chaos's
// own files, so without this every sample from ComposableChaosPage.vue /
// createComposableChain.ts / the shared reactive/metrics.ts + logger.ts
// instrumentation helpers would silently fall into nativeOther — not wrong,
// but misleading (it would look like "no application code ran" instead of
// "this scenario's application code isn't recognized yet"). Purely additive:
// every existing vdom-stress url pattern above is untouched, so prior
// vdom-stress attribution results are bit-for-bit unaffected.

import type { SlimTraceEvent } from './parser.ts'

export type AttributionBucket = 'vueRuntime' | 'application' | 'devtoolsOverlay' | 'nativeOther'

interface CpuProfileNode {
  id: number
  callFrame: { functionName?: string; url?: string; scriptId?: number | string }
  parent?: number
}

interface CpuProfileChunkData {
  cpuProfile?: {
    nodes?: CpuProfileNode[]
    samples?: number[]
  }
  timeDeltas?: number[]
}

// Application-code url fragments across all Scenarios this pipeline has
// been taught to recognize so far — additive list, one entry per Scenario
// (or shared benchmark helper) as adapters are built. Never remove an
// existing entry when adding a new one.
const APPLICATION_URL_FRAGMENTS = [
  'scenarios/vdom-stress/VDomStressPage.vue',
  'scenarios/composable-chaos/ComposableChaosPage.vue',
  'benchmarks/composable/createComposableChain.ts',
  'benchmarks/reactive/metrics.ts',
  'benchmarks/reactive/logger.ts',
  // Component Storm Runtime Attribution Validation (Day 30) — additive, same
  // rationale as the composable-chaos entries above: without these, every
  // sample from this Scenario's own files would silently fall into
  // nativeOther instead of `application`.
  'scenarios/component-storm/ComponentStormPage.vue',
  'scenarios/component-storm/ComponentStormChild.vue',
  'benchmarks/component-storm/metrics.ts',
  'benchmarks/component-storm/createChildren.ts',
]

function bucketForUrl(url: string | undefined): AttributionBucket {
  if (!url) return 'nativeOther'
  if (url.includes('vue.runtime.esm-bundler')) return 'vueRuntime'
  if (APPLICATION_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) return 'application'
  if (url.includes('vue-devtools-path:overlay')) return 'devtoolsOverlay'
  return 'nativeOther'
}

export interface AttributionResult {
  totalSamples: number
  totalTimeUs: number
  byBucket: Record<AttributionBucket, { samples: number; timeUs: number }>
  chunkCount: number
}

/**
 * Decodes every Profile/ProfileChunk event in `events` (all threads, since
 * a trial's chunks are all attributable to whichever thread emitted them —
 * callers scoping to one thread should pre-filter `events`) into actual
 * sampled CPU time per attribution bucket.
 */
export function decodeVueRuntimeAttribution(events: SlimTraceEvent[]): AttributionResult {
  const nodeMap = new Map<number, CpuProfileNode>()
  const chunks = events.filter((e) => e.name === 'ProfileChunk')

  const byBucket: AttributionResult['byBucket'] = {
    vueRuntime: { samples: 0, timeUs: 0 },
    application: { samples: 0, timeUs: 0 },
    devtoolsOverlay: { samples: 0, timeUs: 0 },
    nativeOther: { samples: 0, timeUs: 0 },
  }
  let totalSamples = 0
  let totalTimeUs = 0

  for (const chunk of chunks) {
    const data = (chunk.args as { data?: CpuProfileChunkData } | undefined)?.data
    if (!data) continue
    for (const node of data.cpuProfile?.nodes ?? []) nodeMap.set(node.id, node)

    const samples = data.cpuProfile?.samples ?? []
    const timeDeltas = data.timeDeltas ?? []
    // Same-length guard — if they diverge, the chunk's format didn't match
    // what this decoder expects; skip rather than misattribute.
    const n = Math.min(samples.length, timeDeltas.length)
    for (let i = 0; i < n; i++) {
      const dtUs = timeDeltas[i]!
      if (!Number.isFinite(dtUs) || dtUs < 0) continue // negative delta = chunk boundary artifact, skip
      const node = nodeMap.get(samples[i]!)
      const bucket = bucketForUrl(node?.callFrame.url)
      byBucket[bucket].samples++
      byBucket[bucket].timeUs += dtUs
      totalSamples++
      totalTimeUs += dtUs
    }
  }

  return { totalSamples, totalTimeUs, byBucket, chunkCount: chunks.length }
}

// CLI usage: node scripts/cdp-trace/attribution.ts <trace-file>
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/attribution.ts')
if (isMain) {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: node scripts/cdp-trace/attribution.ts <trace-file>')
    process.exit(1)
  }
  const { parseTraceFile } = await import('./parser.ts')
  const { events } = parseTraceFile(path)
  const result = decodeVueRuntimeAttribution(events)
  console.log(`Trace: ${path}`)
  console.log(`ProfileChunks decoded: ${result.chunkCount}`)
  console.log(`Total samples: ${result.totalSamples}, total sampled time: ${result.totalTimeUs}us`)
  for (const [bucket, { samples, timeUs }] of Object.entries(result.byBucket)) {
    const pct = result.totalTimeUs > 0 ? ((timeUs / result.totalTimeUs) * 100).toFixed(1) : '0.0'
    console.log(`  ${bucket}: ${samples} samples, ${timeUs}us (${pct}%)`)
  }
}
