// CDP Trace Validation — reactive-chain Scenario adapter.
//
// New file, sibling to `scenario.ts` (vdom-stress), `composable-chaos-scenario.ts`
// and `component-storm-scenario.ts`. Does not modify any of them, does not
// change their protocol, and does not touch `src/scenarios/reactive-chain/*`
// or `src/benchmarks/reactive/*` — it only teaches the frozen generic
// infrastructure (chrome.ts / tracer.ts / sync.ts / parser.ts /
// attribution.ts / evidence.ts / stats.ts, reused verbatim) this Scenario's
// DOM shape:
//
//   - trigger button: a <button> whose text is exactly "Trigger Update"
//     (rendered only when AUTO_UPDATE === false, the frozen page constant)
//   - metrics: TWO `.metric-group dl` blocks —
//       [0] Initialization Phase: Dependency Depth / Computed Execute Count /
//           WatchEffect Trigger Count
//       [1] Runtime Update Phase: Total Update Count / Average Update Duration /
//           Total Execution Time / Watch Trigger Count / Render Count
//   - `.params dl`: DEPTH / UPDATE_INTERVAL / AUTO_UPDATE (compile-time
//     constants in ReactiveChainPage.vue, not DOM-controllable)
//
// Completion detection watches "Total Update Count" (a reactive integer that
// only increments, from metrics.duration) — same as component-storm, so it
// is immune to the 0.1ms text collision seen with vdom-stress's
// renderDuration. The Initialization Phase counters are NOT reactive and are
// not refreshed under Vapor (see the Vapor validation report); they are read
// for bookkeeping only, never used for detection.
//
// Same trigger/observation split as the other adapters: the click is fired
// with a plain (non-awaitPromise) Runtime.evaluate, and completion arrives as
// a separate Runtime.bindingCalled event from a page-side MutationObserver.

import type { CDPClient } from './chrome.ts'

function assertNoException(result: { exceptionDetails?: unknown }, context: string): void {
  if (result.exceptionDetails) {
    throw new Error(
      `Runtime.evaluate failed (${context}): ${JSON.stringify(result.exceptionDetails)}`,
    )
  }
}

/** Waits until the Vue app has mounted (the "Trigger Update" button exists). */
export async function waitForAppReady(client: CDPClient, timeoutMs = 15_000): Promise<void> {
  const expression = `
    new Promise((resolve, reject) => {
      const ready = () =>
        [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Trigger Update')
      if (ready()) return resolve(true)
      const timer = setTimeout(() => {
        obs.disconnect()
        reject(new Error('timeout waiting for Trigger Update button to mount'))
      }, ${timeoutMs})
      const obs = new MutationObserver(() => {
        if (ready()) {
          clearTimeout(timer)
          obs.disconnect()
          resolve(true)
        }
      })
      obs.observe(document.documentElement, { childList: true, subtree: true })
    })
  `
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  assertNoException(result, 'waitForAppReady')
}

const COMPLETION_BINDING_NAME = 'cdpTraceReactiveChainComplete'

/** Call once per CDP session, before any fire*() calls below. */
export async function enableCompletionBinding(client: CDPClient): Promise<void> {
  await client.send('Runtime.addBinding', { name: COMPLETION_BINDING_NAME })
}

/** Browser-side helper: the <dd> after the <dt> with `label` inside `.metric-group` number `groupIndex`. */
function findDDSnippet(): string {
  return `
    function findDD(groupIndex, label) {
      const dl = document.querySelectorAll('.metric-group dl')[groupIndex]
      if (!dl) throw new Error('.metric-group dl #' + groupIndex + ' not found')
      const dts = [...dl.querySelectorAll('dt')]
      const idx = dts.findIndex((dt) => dt.textContent.trim() === label)
      if (idx === -1) throw new Error('<dt>' + label + '</dt> not found in group ' + groupIndex)
      return dl.querySelectorAll('dd')[idx]
    }
  `
}

/**
 * Fires one "Trigger Update" click and returns immediately — does NOT wait
 * for completion. Requires enableCompletionBinding() first.
 */
export async function fireTriggerUpdate(client: CDPClient): Promise<void> {
  const expression = `
    (function (bindingName) {
      ${findDDSnippet()}
      const target = findDD(1, 'Total Update Count')
      const before = target.textContent

      const obs = new MutationObserver(() => {
        const now = target.textContent
        if (now !== before) {
          obs.disconnect()
          window[bindingName](now)
        }
      })
      obs.observe(target, { childList: true, characterData: true, subtree: true })

      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Trigger Update')
      if (!button) throw new Error('Trigger Update button not found')
      button.click()
    })(${JSON.stringify(COMPLETION_BINDING_NAME)})
  `
  // Deliberately no awaitPromise — same rationale as the other adapters.
  const result = await client.send('Runtime.evaluate', { expression })
  assertNoException(result, 'fireTriggerUpdate')
}

/** Awaits the Runtime.bindingCalled event fired once Total Update Count changes. */
export async function waitForUpdateComplete(
  client: CDPClient,
  timeoutMs = 15_000,
): Promise<string> {
  const params = await client.waitFor(
    'Runtime.bindingCalled',
    (p) => p.name === COMPLETION_BINDING_NAME,
    timeoutMs,
  )
  return params.payload as string
}

/** Reads every <dt>/<dd> pair of both `.metric-group dl` blocks, keyed "G1 <label>" / "G2 <label>" (bookkeeping only). */
export async function readMetrics(client: CDPClient): Promise<Record<string, string>> {
  const expression = `
    (function () {
      const out = {}
      document.querySelectorAll('.metric-group dl').forEach((dl, g) => {
        const dts = [...dl.querySelectorAll('dt')]
        const dds = [...dl.querySelectorAll('dd')]
        dts.forEach((dt, i) => {
          out['G' + (g + 1) + ' ' + dt.textContent.trim()] = dds[i] ? dds[i].textContent.trim() : null
        })
      })
      return out
    })()
  `
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true })
  assertNoException(result, 'readMetrics')
  return result.result.value as Record<string, string>
}

/** Reads `.params dl` (DEPTH / UPDATE_INTERVAL / AUTO_UPDATE) so the runner can assert the page it measures. */
export async function readParams(client: CDPClient): Promise<Record<string, string>> {
  const expression = `
    (function () {
      const dl = document.querySelector('.params dl')
      if (!dl) throw new Error('.params dl not found')
      const dts = [...dl.querySelectorAll('dt')]
      const dds = [...dl.querySelectorAll('dd')]
      const out = {}
      dts.forEach((dt, i) => {
        out[dt.textContent.trim()] = dds[i] ? dds[i].textContent.trim() : null
      })
      return out
    })()
  `
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true })
  assertNoException(result, 'readParams')
  return result.result.value as Record<string, string>
}
