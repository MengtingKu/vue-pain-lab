// CDP Trace Validation — component-storm Scenario adapter.
//
// New file, sibling to `scenario.ts` (vdom-stress-only) and
// `composable-chaos-scenario.ts` (composable-chaos-only). Does not modify
// either, does not change their protocol, and does not touch
// `src/scenarios/component-storm/*` or `src/benchmarks/component-storm/*` —
// it only teaches the already-frozen generic infrastructure (chrome.ts /
// tracer.ts / sync.ts / parser.ts / rollup.ts / attribution.ts / evidence.ts
// / stats.ts, all reused verbatim) how to drive THIS Scenario's DOM shape:
//
//   - trigger button:  a <button> whose text is exactly "Trigger Update"
//     (rendered only when `autoUpdate === false`, which is the frozen
//     `componentStormConfig` value — see src/benchmarks/component-storm/config.ts)
//   - metrics block:   ONE `dl` inside `.metrics` (NOT `.metric-group` like
//     composable-chaos — ComponentStormPage.vue has a single flat metrics
//     `dl`, no per-phase grouping), with <dt>/<dd> pairs:
//       Mount Time / Total Update Count / Average Update Duration /
//       Updated Component Count（上一次 update） / Parent Render Count /
//       Child Render Count（累計） / Parent Tick（ParentOnly 用）
//
// `componentCount` and `updateScope` are compile-time constants in
// config.ts, not DOM-controllable (no radio inputs, unlike vdom-stress's
// node-count radio or composable-chaos's depth radio) — this adapter never
// tries to set them; whichever combination `config.ts` is built with is
// whatever a fresh `Page.navigate` picks up from the dev server.
//
// Total Update Count increments by a plain integer on every click (no
// reset-to-'-' phase, unlike composable-chaos's Build Duration) — this
// Scenario's `metrics.ts` initializes it to `0` and only ever increments it,
// so the simple "text differs from its pre-click value" detection already
// used by scenario.ts's fireTriggerRender is sufficient here too, unlike
// composable-chaos's fireBuildChain which needed a two-phase reset->settle
// detector.
//
// Same completion-detection philosophy as scenario.ts's Phase 5.1
// trigger/observation split and composable-chaos-scenario.ts's
// fireTriggerUpdate: fire the click with a plain (non-awaitPromise)
// Runtime.evaluate, and detect completion via a SEPARATE
// Runtime.bindingCalled event driven by a page-side MutationObserver —
// never a Node-side setTimeout poll (background-tab timer throttling, see
// project memory vue36_reactive_chain_validation) and never an
// awaitPromise-wrapped wait nested inside the same EvaluateScript we're
// trying to measure.

import type { CDPClient } from './chrome.ts'

function assertNoException(result: { exceptionDetails?: unknown }, context: string): void {
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed (${context}): ${JSON.stringify(result.exceptionDetails)}`)
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
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  assertNoException(result, 'waitForAppReady')
}

const COMPLETION_BINDING_NAME = 'cdpTraceComponentStormComplete'

/** Call once per CDP session, before any fire*() calls below. */
export async function enableCompletionBinding(client: CDPClient): Promise<void> {
  await client.send('Runtime.addBinding', { name: COMPLETION_BINDING_NAME })
}

/**
 * Shared browser-side helper (inlined into every fired expression, not a
 * real import — Runtime.evaluate has no module system): finds the `<dd>`
 * that follows a `<dt>` whose text matches `label`, inside `.metrics dl`.
 */
function metricsDDLookupSnippet(): string {
  return `
    function findMetricDD(label) {
      const dl = document.querySelector('.metrics dl')
      if (!dl) throw new Error('.metrics dl not found')
      const dts = [...dl.querySelectorAll('dt')]
      const idx = dts.findIndex((dt) => dt.textContent.trim() === label)
      if (idx === -1) throw new Error('<dt>' + label + '</dt> not found in .metrics dl')
      return dl.querySelectorAll('dd')[idx]
    }
  `
}

/**
 * Fires one "Trigger Update" click and returns immediately — does NOT wait
 * for completion. Requires enableCompletionBinding() first. Watches "Total
 * Update Count" (a plain incrementing integer, see file header) rather than
 * "Average Update Duration" so the detector never has to reason about
 * floating-point text possibly formatting identically twice in a row.
 */
export async function fireTriggerUpdate(client: CDPClient): Promise<void> {
  const expression = `
    (function (bindingName) {
      ${metricsDDLookupSnippet()}
      const target = findMetricDD('Total Update Count')
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
  // Deliberately no awaitPromise — same rationale as scenario.ts's
  // fireTriggerRender / composable-chaos-scenario.ts's fireTriggerUpdate:
  // this expression has no top-level Promise to await, and wrapping the
  // wait in the SAME evaluate would nest it inside the EvaluateScript we're
  // trying to measure.
  const result = await client.send('Runtime.evaluate', { expression })
  assertNoException(result, 'fireTriggerUpdate')
}

/** Awaits the Runtime.bindingCalled event fired once Total Update Count changes. */
export async function waitForUpdateComplete(client: CDPClient, timeoutMs = 15_000): Promise<string> {
  const params = await client.waitFor('Runtime.bindingCalled', (p) => p.name === COMPLETION_BINDING_NAME, timeoutMs)
  return params.payload as string
}

/**
 * Reads every <dt>/<dd> pair in `.metrics dl` as a plain label -> text map —
 * for meta bookkeeping only (structural counters: Mount Time, Total Update
 * Count, Average Update Duration, Updated Component Count, Parent Render
 * Count, Child Render Count, Parent Tick), never used as the measured
 * duration itself (that comes from the trace).
 */
export async function readMetrics(client: CDPClient): Promise<Record<string, string>> {
  const expression = `
    (function () {
      const dl = document.querySelector('.metrics dl')
      if (!dl) throw new Error('.metrics dl not found')
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
  assertNoException(result, 'readMetrics')
  return result.result.value as Record<string, string>
}

/**
 * Reads `.params dl` (COMPONENT_COUNT / UPDATE_SCOPE / UPDATE_INTERVAL /
 * AUTO_UPDATE) — confirms which compile-time config.ts values this page was
 * actually built with, so a matrix runner can assert it matches the
 * condition it thinks it's measuring instead of trusting config.ts blindly.
 */
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
