// CDP Trace Harness — browser rendering-frame synchronization.
//
// WHY this exists (see results/cdp-trace/calibration/CALIBRATION_REPORT.md
// Phase 2 for the full evidence): `nextTick()` is VUE's flush
// synchronization, not the BROWSER's. `await nextTick()` only guarantees
// Vue's own synchronous DOM patch (createElement/insertBefore/etc. calls)
// has completed. It does NOT guarantee the browser has actually run a
// rendering frame — Style Recalculation → Layout → Paint → Composite — for
// that patch yet, because that pipeline runs on the next compositor frame,
// asynchronous relative to script execution.
//
// The original harness called Tracing.start() immediately after the
// priming Mount's nextTick() resolved. Calibration proved (via each
// Layout event's own `args.beginData.dirtyObjects`/`totalObjects` fields —
// Chromium's own instrumentation, not an inference) that in 18/20
// measurement trials, the traced "Update" window's Layout event covered
// ~25025 of ~25079 layout objects — nearly the ENTIRE 5000-card tree, not
// just the handful of nodes an Update-with-unchanged-content should touch.
// That is the priming Mount's own (still-pending) rendering work bleeding
// into the very next traced window.
//
// Fix: after nextTick() resolves, wait for two chained
// requestAnimationFrame callbacks before starting the trace. This is the
// standard "wait for a real frame" technique — the browser guarantees it
// runs style/layout/paint for any pending work before invoking a
// requestAnimationFrame callback, and chaining two of them (rather than
// one) guarantees at least one full frame has been COMMITTED in between,
// not just requested. This does not replace `nextTick()` — it is a second,
// additional synchronization step layered on top of it.

import type { CDPClient } from './chrome.ts'

export async function waitForBrowserFrames(client: CDPClient, count = 2, timeoutMs = 5_000): Promise<void> {
  const expression = `
    new Promise((resolve, reject) => {
      let remaining = ${count}
      const timer = setTimeout(() => {
        reject(new Error('timeout waiting for ${count} browser frame(s)'))
      }, ${timeoutMs})
      function step() {
        remaining--
        if (remaining <= 0) {
          clearTimeout(timer)
          resolve(true)
        } else {
          requestAnimationFrame(step)
        }
      }
      requestAnimationFrame(step)
    })
  `
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(`waitForBrowserFrames failed: ${JSON.stringify(result.exceptionDetails)}`)
  }
}
