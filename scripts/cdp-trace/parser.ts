// CDP Trace Validation Runner PoC — Trace Parser (Stage 1).
//
// Scope, deliberately limited per task spec:
//   - confirm the trace JSON parses
//   - list the main event names
//   - list event durations
//   - list event categories
//   - keep pid / tid / ts / dur / name / cat / args
//
// Explicitly OUT of scope for this stage: computing Scripting / Rendering /
// Layout totals. Chrome DevTools' Performance panel category accounting
// involves nested events across multiple threads (main thread, compositor,
// raster workers) and async event pairing (`ph: 'b'/'e'`, `'X'` complete
// events, flow events) — that rollup logic has to be verified against
// DevTools' own behavior before this script claims any such numbers.

import { readFileSync } from 'node:fs'

export interface SlimTraceEvent {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: unknown
}

export interface TraceSummary {
  totalEvents: number
  events: SlimTraceEvent[]
  pidsSeen: number[]
  tidsSeen: number[]
  topEventNames: Array<[name: string, count: number]>
  topCategories: Array<[cat: string, count: number]>
  topDurationByName: Array<[name: string, totalDurUs: number, count: number]>
}

/** `${pid}:${tid}` -> thread name, from `__metadata`/`thread_name` (ph:'M') events. */
export function getThreadNames(events: SlimTraceEvent[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const e of events) {
    if (e.cat === '__metadata' && e.name === 'thread_name') {
      const threadName = (e.args as { name?: string } | undefined)?.name
      if (threadName) names.set(`${e.pid}:${e.tid}`, threadName)
    }
  }
  return names
}

/**
 * Finds the renderer process's main thread — i.e. the thread actually
 * running the page's JS / Vue — identified by Chromium's own thread name
 * "CrRendererMain". This is NOT the same as the browser process's
 * "CrBrowserMain" thread (that's Chrome's own UI process), and matters for
 * telling "our page's work" apart from browser/GPU-process bookkeeping.
 */
export function findRendererMainThread(events: SlimTraceEvent[]): { pid: number; tid: number } | null {
  const names = getThreadNames(events)
  for (const [key, name] of names) {
    if (name === 'CrRendererMain') {
      const [pid, tid] = key.split(':').map(Number)
      return { pid: pid!, tid: tid! }
    }
  }
  return null
}

export interface EventMetric {
  observed: boolean
  totalDurUs: number | null
  count: number
  events: SlimTraceEvent[]
}

/**
 * Raw diagnostic extraction only — sums `dur` for events whose `name` is in
 * `names`, optionally scoped to one thread. This is deliberately NOT "the
 * Scripting/Rendering/Painting number": DevTools computes those via
 * self-time rollup over a nested event tree (see TRACE_ACCOUNTING.md), not
 * by summing same-named top-level events. Use this only to answer "was this
 * raw event observed at all, and what's its raw total duration", never to
 * stand in for a DevTools category total.
 */
export function extractMetric(
  events: SlimTraceEvent[],
  names: string[],
  scope?: { pid: number; tid: number },
): EventMetric {
  const matched = events.filter((e) => {
    if (!names.includes(e.name)) return false
    if (scope && (e.pid !== scope.pid || e.tid !== scope.tid)) return false
    return true
  })
  const withDur = matched.filter((e): e is SlimTraceEvent & { dur: number } => typeof e.dur === 'number')
  return {
    observed: matched.length > 0,
    totalDurUs: withDur.length > 0 ? withDur.reduce((sum, e) => sum + e.dur, 0) : matched.length > 0 ? null : null,
    count: matched.length,
    events: matched,
  }
}

export function parseTraceFile(path: string): TraceSummary {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  const rawEvents: any[] = Array.isArray(raw) ? raw : raw.traceEvents
  if (!Array.isArray(rawEvents)) {
    throw new Error(`Trace file ${path} has no parseable traceEvents array.`)
  }

  const events: SlimTraceEvent[] = rawEvents.map((e) => ({
    name: e.name,
    cat: e.cat,
    ph: e.ph,
    ts: e.ts,
    dur: typeof e.dur === 'number' ? e.dur : undefined,
    pid: e.pid,
    tid: e.tid,
    args: e.args,
  }))

  const nameCounts = new Map<string, number>()
  const catCounts = new Map<string, number>()
  const durByName = new Map<string, { total: number; count: number }>()
  const pids = new Set<number>()
  const tids = new Set<number>()

  for (const e of events) {
    nameCounts.set(e.name, (nameCounts.get(e.name) ?? 0) + 1)
    pids.add(e.pid)
    tids.add(e.tid)
    for (const cat of String(e.cat ?? '').split(',')) {
      if (!cat) continue
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1)
    }
    if (typeof e.dur === 'number') {
      const entry = durByName.get(e.name) ?? { total: 0, count: 0 }
      entry.total += e.dur
      entry.count += 1
      durByName.set(e.name, entry)
    }
  }

  const sortDesc = <T>(entries: [string, T][], keyFn: (v: T) => number) =>
    entries.sort((a, b) => keyFn(b[1]) - keyFn(a[1]))

  return {
    totalEvents: events.length,
    events,
    pidsSeen: [...pids].sort((a, b) => a - b),
    tidsSeen: [...tids].sort((a, b) => a - b),
    topEventNames: sortDesc([...nameCounts.entries()], (v) => v).slice(0, 30),
    topCategories: sortDesc([...catCounts.entries()], (v) => v).slice(0, 30),
    topDurationByName: sortDesc([...durByName.entries()], (v) => v.total)
      .slice(0, 30)
      .map(([name, { total, count }]) => [name, total, count]),
  }
}

function printSummary(path: string, summary: TraceSummary): void {
  console.log(`Trace: ${path}`)
  console.log(`Total events: ${summary.totalEvents}`)
  console.log(`pid(s): ${summary.pidsSeen.join(', ')}`)
  console.log(`tid(s): ${summary.tidsSeen.join(', ')}`)

  console.log('\nTop event names (name: count):')
  for (const [name, count] of summary.topEventNames) console.log(`  ${name}: ${count}`)

  console.log('\nTop categories (cat: count):')
  for (const [cat, count] of summary.topCategories) console.log(`  ${cat}: ${count}`)

  console.log('\nTop total duration by event name (name: sum(dur) us over count events):')
  for (const [name, totalDur, count] of summary.topDurationByName) {
    console.log(`  ${name}: ${totalDur}us over ${count} events`)
  }

  const hasLayout = summary.topEventNames.some(([name]) => name === 'Layout')
  const hasPaint = summary.topEventNames.some(([name]) => name === 'Paint')
  console.log(`\n'Layout' event present: ${hasLayout}`)
  console.log(`'Paint' event present: ${hasPaint}`)
  console.log(
    '\n(Stage 1 only — this does NOT claim Scripting/Rendering/Layout totals; ' +
      'see file header for why.)',
  )
}

// CLI usage: node scripts/cdp-trace/parser.ts <trace-file>
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('cdp-trace/parser.ts')
if (isMain) {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: node scripts/cdp-trace/parser.ts <trace-file>')
    process.exit(1)
  }
  printSummary(path, parseTraceFile(path))
}
