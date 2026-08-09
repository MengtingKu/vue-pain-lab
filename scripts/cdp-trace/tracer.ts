// CDP Trace Validation Runner PoC — raw Chrome trace capture via Tracing domain.
//
// Uses transferMode = ReturnAsStream per the task spec: the trace is not
// accumulated from `Tracing.dataCollected` events (that's the default
// ReportEvents mode); instead `Tracing.tracingComplete` hands back a stream
// handle that must be drained with `IO.read` until eof, then closed with
// `IO.close`. This module does not compute Scripting/Rendering/Layout/Paint
// numbers — it only saves the raw trace for later parsing / DevTools reload.

import { writeFileSync } from 'node:fs'
import type { CDPClient } from './chrome.ts'

// Matches the category set Chrome DevTools' own Performance panel requests
// when you click "Record" (same list Puppeteer's Tracing.start defaults to),
// so the resulting trace is a normal, fully-featured DevTools trace —
// including Layout / Paint / Recalculate Style events.
export const TRACE_CATEGORIES = [
  'devtools.timeline',
  'v8.execute',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'toplevel',
  'blink.console',
  'blink.user_timing',
  'latencyInfo',
  'disabled-by-default-devtools.timeline.stack',
  'disabled-by-default-v8.cpu_profiler',
  'disabled-by-default-v8.cpu_profiler.hires',
]

// Same as TRACE_CATEGORIES minus the CPU-profiler sampling categories — used
// by the Instrumentation Isolation Test (results/cdp-trace/calibration/
// INSTRUMENTATION_ISOLATION_REPORT.md) to test whether CPU-profiler sampling
// itself perturbs Scripting-related self-time via V8's interrupt mechanism.
// Every other category is identical, so this is the only variable changed.
export const TRACE_CATEGORIES_NO_CPU_PROFILER = TRACE_CATEGORIES.filter(
  (c) => !c.startsWith('disabled-by-default-v8.cpu_profiler'),
)

export async function startTracing(client: CDPClient, categories: string[] = TRACE_CATEGORIES): Promise<void> {
  await client.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    streamFormat: 'json',
    streamCompression: 'none',
    traceConfig: {
      includedCategories: categories,
    },
  })
}

export interface SavedTrace {
  path: string
  bytes: number
  eventCount: number
}

/**
 * Ends the current trace, drains the returned stream, and writes it to
 * `outPath` as a DevTools-loadable `{ traceEvents: [...] }` file.
 */
export async function stopTracingAndSave(client: CDPClient, outPath: string): Promise<SavedTrace> {
  // Must attach the listener before sending Tracing.end — the event can
  // arrive as soon as Chrome finishes flushing, before send() resolves.
  const tracingComplete = client.once('Tracing.tracingComplete')
  await client.send('Tracing.end')
  const { stream, streamCompression } = await tracingComplete

  if (!stream) {
    throw new Error(
      'Tracing.tracingComplete did not return a stream handle — ' +
        'transferMode may not have been honored as ReturnAsStream.',
    )
  }
  if (streamCompression && streamCompression !== 'none') {
    throw new Error(`Unexpected stream compression "${streamCompression}"; expected "none".`)
  }

  const chunks: string[] = []
  for (;;) {
    const { data, base64Encoded, eof } = await client.send('IO.read', {
      handle: stream,
      size: 10 * 1024 * 1024,
    })
    if (data) {
      chunks.push(base64Encoded ? Buffer.from(data, 'base64').toString('utf-8') : data)
    }
    if (eof) break
  }
  await client.send('IO.close', { handle: stream })

  const rawText = chunks.join('')
  const parsed = JSON.parse(rawText)
  const traceEvents = Array.isArray(parsed) ? parsed : parsed.traceEvents
  if (!Array.isArray(traceEvents)) {
    throw new Error('Captured trace stream did not contain a parseable traceEvents array.')
  }

  // Normalize to the { traceEvents: [...] } shape DevTools' "Load profile…"
  // expects, regardless of whether the stream came back as a bare array.
  const traceFile = JSON.stringify({ traceEvents })
  writeFileSync(outPath, traceFile, 'utf-8')

  return {
    path: outPath,
    bytes: Buffer.byteLength(traceFile, 'utf-8'),
    eventCount: traceEvents.length,
  }
}
