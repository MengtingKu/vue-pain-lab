// Measurement Calibration Phase 1 — Headless vs Headed analysis.
//
// Reads the 10 measurement trials each run-calibration.ts captured per mode
// and reports Median/P25/P75/Min/Max for several metrics, PLUS an explicit
// observed/not-observed count for the metrics that are DOM/rendering events
// (Layout / Paint / Recalculate Style) — an event that never fires in a
// trial is recorded as "not observed", never coerced to a duration of 0.
//
// "Main-thread JS events" here is a clearly-scoped RAW diagnostic: the sum
// of `dur` for the exact raw event names this session confirmed (via
// devtools-frontend's own Styles.ts eventStylesMap, see TRACE_ACCOUNTING.md)
// belong to the "scripting" category AND that were actually observed on the
// renderer's main thread in this Scenario's traces — EvaluateScript /
// FunctionCall / EventDispatch / RunMicrotasks / TimerInstall / TimerRemove.
// It is NOT the DevTools "Scripting" total (that requires self-time rollup
// over the nested event tree — see Phase 3) and must not be read as such.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractMetric, findRendererMainThread, parseTraceFile, type SlimTraceEvent } from './parser.ts'
import { summarize, type Distribution } from './stats.ts'

type Mode = 'headless' | 'headed'
const MODES: Mode[] = ['headless', 'headed']
const CALIBRATION_DIR = join('results', 'cdp-trace', 'calibration')
const RUN_DIR = 'update-5000'

const RAW_SCRIPTING_EVENT_NAMES = [
  'EvaluateScript',
  'FunctionCall',
  'EventDispatch',
  'RunMicrotasks',
  'TimerInstall',
  'TimerRemove',
]

interface TrialData {
  trial: number
  meta: Record<string, unknown>
  events: SlimTraceEvent[]
  mainThread: { pid: number; tid: number } | null
}

function loadTrials(mode: Mode): TrialData[] {
  const dir = join(CALIBRATION_DIR, mode, RUN_DIR)
  const files = readdirSync(dir).filter((f) => f.endsWith('.trace.json'))
  return files
    .sort()
    .map((file) => {
      const trial = Number(file.match(/trial-(\d+)/)?.[1])
      const meta = JSON.parse(readFileSync(join(dir, file.replace('.trace.json', '.meta.json')), 'utf-8'))
      const { events } = parseTraceFile(join(dir, file))
      const mainThread = findRendererMainThread(events)
      return { trial, meta, events, mainThread }
    })
}

interface MetricResult {
  metric: string
  mode: Mode
  observedCount: number
  totalTrials: number
  distributionUs: Distribution | null // null when zero trials observed it
}

function metricFromEventNames(trials: TrialData[], mode: Mode, metricName: string, names: string[]): MetricResult {
  const observedDurationsUs: number[] = []
  let observedCount = 0
  for (const t of trials) {
    const scope = t.mainThread ?? undefined
    const m = extractMetric(t.events, names, scope)
    if (m.observed) {
      observedCount++
      if (m.totalDurUs !== null) observedDurationsUs.push(m.totalDurUs)
    }
  }
  return {
    metric: metricName,
    mode,
    observedCount,
    totalTrials: trials.length,
    distributionUs: observedDurationsUs.length > 0 ? summarize(observedDurationsUs) : null,
  }
}

function metricFromMeta(trials: TrialData[], mode: Mode, metricName: string, pick: (m: any) => number): MetricResult {
  const values = trials.map((t) => pick(t.meta)).filter((v) => Number.isFinite(v))
  return {
    metric: metricName,
    mode,
    observedCount: values.length,
    totalTrials: trials.length,
    distributionUs: values.length > 0 ? summarize(values) : null,
  }
}

function fmtDist(d: Distribution | null, unit: string): string {
  if (!d) return 'not observed in any trial'
  return `median=${d.median.toFixed(1)}${unit} p25=${d.p25.toFixed(1)}${unit} p75=${d.p75.toFixed(1)}${unit} min=${d.min.toFixed(1)}${unit} max=${d.max.toFixed(1)}${unit} (n=${d.n})`
}

function main(): void {
  const byMode: Record<Mode, TrialData[]> = {
    headless: loadTrials('headless'),
    headed: loadTrials('headed'),
  }

  console.log('=== Phase 1 — Headless vs Headed Calibration ===\n')

  for (const mode of MODES) {
    const trials = byMode[mode]
    console.log(`--- mode: ${mode} (${trials.length} measurement trials) ---`)

    const mainThreadIds = new Set(trials.map((t) => (t.mainThread ? `${t.mainThread.pid}:${t.mainThread.tid}` : 'NOT FOUND')))
    console.log(`  CrRendererMain thread id(s) across trials: ${[...mainThreadIds].join(', ')}`)

    const renderDuration = metricFromMeta(trials, mode, 'Render Duration (ms, in-page)', (m) => m.renderDurationMs)
    console.log(`  Render Duration:      ${fmtDist(renderDuration.distributionUs, 'ms')}`)

    const traceEventCount = metricFromMeta(trials, mode, 'Trace event count', (m) => m.traceEventCount)
    console.log(`  Trace event count:    ${fmtDist(traceEventCount.distributionUs, '')}`)

    const layout = metricFromEventNames(trials, mode, 'Layout', ['Layout'])
    console.log(`  Layout:               observed ${layout.observedCount}/${layout.totalTrials} — ${fmtDist(layout.distributionUs, 'us')}`)

    const paint = metricFromEventNames(trials, mode, 'Paint', ['Paint'])
    console.log(`  Paint:                observed ${paint.observedCount}/${paint.totalTrials} — ${fmtDist(paint.distributionUs, 'us')}`)

    // Raw name is 'UpdateLayoutTree' (confirmed empirically); DevTools' newer
    // trace engine aliases this to 'RecalcStyle' internally / displays it as
    // "Recalculate Style" — see TRACE_ACCOUNTING.md.
    const recalcStyle = metricFromEventNames(trials, mode, 'Recalculate Style (raw: UpdateLayoutTree)', ['UpdateLayoutTree'])
    console.log(`  Recalculate Style:    observed ${recalcStyle.observedCount}/${recalcStyle.totalTrials} — ${fmtDist(recalcStyle.distributionUs, 'us')}`)

    const jsEvents = metricFromEventNames(trials, mode, 'Main-thread JS events (raw diagnostic)', RAW_SCRIPTING_EVENT_NAMES)
    console.log(`  Main-thread JS (raw): observed ${jsEvents.observedCount}/${jsEvents.totalTrials} — ${fmtDist(jsEvents.distributionUs, 'us')}`)

    console.log('')
  }

  // Paired-direction check per metric (Phase 1 asks for "at least" these
  // metrics compared — this is the same paired-sign-count method the
  // vdom-stress N=10 controlled re-validation used, not a fresh invention).
  console.log('--- Cross-mode notes ---')
  const headlessVis = new Set(byMode.headless.map((t) => t.meta.documentVisibilityStateAtNavigation))
  const headedVis = new Set(byMode.headed.map((t) => t.meta.documentVisibilityStateAtNavigation))
  console.log(`  headless document.visibilityState values seen: ${[...headlessVis].join(', ')}`)
  console.log(`  headed document.visibilityState values seen:   ${[...headedVis].join(', ')}`)
}

main()
