// CDP Trace Harness — Phase 5: category self-time rollup.
//
// Implements the actual algorithm TRACE_ACCOUNTING.md documents
// (DevTools' aggregatedStatsForTraceEvent): build the nested event tree for
// one thread (events ordered by `ts`, nested by [ts, ts+dur] containment),
// compute each event's SELF time (own `dur` minus the sum of its direct
// children's `dur`), then bucket self time by category. This is explicitly
// NOT `sum(dur where cat = X)` — nested same-category children would be
// double-counted by that method (e.g. EvaluateScript contains
// RunMicrotasks; both are "scripting").
//
// SCOPE — read before trusting the numbers this produces:
//   - Main thread (CrRendererMain) ONLY. Paint's own record event is on
//     Main, but actual rasterization (RasterTask) runs on Raster/Compositor
//     threads and is NOT included here — so any "painting" total from this
//     rollup is a known UNDERCOUNT, not a full Painting cost.
//   - NOT validated against DevTools' own Performance panel Summary output
//     (this Lab's tooling cannot open DevTools UI — see the original PoC
//     report). Treat this as "this Lab's best-effort reproduction of the
//     documented algorithm", not as "proven identical to DevTools".
//   - Category comes from the confirmed subset of eventStylesMap in
//     TRACE_ACCOUNTING.md §2. Any event name not in that subset falls into
//     "other", same fallback DevTools itself uses for unmapped names.

import type { SlimTraceEvent } from './parser.ts'

type Category = 'scripting' | 'rendering' | 'painting' | 'loading' | 'other'

// Confirmed subset only (see TRACE_ACCOUNTING.md §2) — not the full
// eventStylesMap, just the raw names this Lab's own traces contain.
const CATEGORY_BY_NAME: Record<string, Category> = {
  EvaluateScript: 'scripting',
  FunctionCall: 'scripting',
  EventDispatch: 'scripting',
  RunMicrotasks: 'scripting',
  TimerInstall: 'scripting',
  TimerRemove: 'scripting',
  TimerFire: 'scripting',
  ScheduleStyleRecalculation: 'rendering',
  UpdateLayoutTree: 'rendering', // raw name for "Recalculate Style" — see TRACE_ACCOUNTING.md §3
  InvalidateLayout: 'rendering',
  Layout: 'rendering',
  Layerize: 'rendering',
  UpdateLayerTree: 'rendering',
  PrePaint: 'rendering',
  HitTest: 'rendering',
  ComputeIntersections: 'rendering',
  PaintSetup: 'painting',
  PaintImage: 'painting',
  UpdateLayer: 'painting',
  Paint: 'painting',
  RasterTask: 'painting',
  Commit: 'painting',
  CompositeLayers: 'painting',
  ParseHTML: 'loading',
  ParseAuthorStyleSheet: 'loading',
}

function categoryFor(name: string): Category {
  return CATEGORY_BY_NAME[name] ?? 'other'
}

export interface RollupResult {
  scopeNote: string
  totalSelfTimeUs: number
  byCategory: Record<Category, number>
  uncategorizedNames: string[] // event names seen that fell back to "other" — for auditing, not hidden
}

/**
 * Self-time rollup for ONE thread's complete ('X' phase) events.
 * `events` should already be filtered to a single {pid, tid}.
 */
export function rollupSelfTimeByCategory(events: SlimTraceEvent[]): RollupResult {
  const complete = events
    .filter((e): e is SlimTraceEvent & { dur: number } => e.ph === 'X' && typeof e.dur === 'number')
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur) // parents (longer dur) before children at same ts

  // Stack-based nesting: an event is a child of the top-of-stack event if
  // it starts at/after the parent's start and ends at/before the parent's end.
  const byCategory: Record<Category, number> = { scripting: 0, rendering: 0, painting: 0, loading: 0, other: 0 }
  const uncategorized = new Set<string>()
  const stack: Array<{ event: SlimTraceEvent & { dur: number }; childrenDur: number }> = []

  const closeTo = (endTs: number) => {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const topEnd = top.event.ts + top.event.dur
      if (topEnd > endTs) break
      stack.pop()
      const selfTime = top.event.dur - top.childrenDur
      const cat = categoryFor(top.event.name)
      if (cat === 'other' && !(top.event.name in CATEGORY_BY_NAME)) uncategorized.add(top.event.name)
      byCategory[cat] += Math.max(0, selfTime) // clamp: overlapping siblings could otherwise go negative
      if (stack.length > 0) stack[stack.length - 1]!.childrenDur += top.event.dur
    }
  }

  for (const e of complete) {
    closeTo(e.ts) // close out any events that ended before this one started
    stack.push({ event: e, childrenDur: 0 })
  }
  // flush remaining stack (close everything at the last possible ts)
  const maxEnd = Math.max(0, ...complete.map((e) => e.ts + e.dur))
  closeTo(maxEnd + 1)

  const totalSelfTimeUs = Object.values(byCategory).reduce((a, b) => a + b, 0)

  return {
    scopeNote:
      'Main-thread self-time only. Painting is a known undercount (Raster/Compositor-thread work excluded). ' +
      'Not validated against DevTools Performance panel UI output.',
    totalSelfTimeUs,
    byCategory,
    uncategorizedNames: [...uncategorized],
  }
}
