// CDP Trace Validation Runner PoC — Scenario control.
//
// Per task instructions: `VDomStressPage.vue` has no dedicated benchmark hook
// (no `window.__vdomStressBenchmark` or similar). Its existing DOM / reactive
// state IS reliably controllable from the outside:
//   - a radio group `input[name="render-count"][value="N"]` picks Node Count
//   - a single <button> with text "Trigger Render" starts the run
//   - `.metrics dl` renders `renderDuration` as text, and is set to `'-'`
//     until the run completes, then replaced with a `${ms} ms` string right
//     after Vue's `nextTick()` resolves (see VDomStressPage.vue's
//     `triggerRender()`).
// That is enough to drive Mount/Update deterministically without touching
// Scenario source, so per the task's "check DOM/API first" rule, no hook was
// added and the Scenario file is untouched.
//
// Completion is detected with a MutationObserver set up and armed in the
// SAME synchronous browser-side script that also performs the click — not by
// polling from Node. This avoids both a race (Vue's DOM write is a
// microtask that could otherwise fire between our setup and our click) and
// the setTimeout-based background-tab throttling documented in project
// memory (vue36_reactive_chain_validation) — moot here anyway since this is
// a single dedicated headless tab, but kept as the more robust pattern.

import type { CDPClient } from './chrome.ts'

function assertNoException(result: { exceptionDetails?: unknown }, context: string): void {
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed (${context}): ${JSON.stringify(result.exceptionDetails)}`)
  }
}

/** Waits until the Vue app has mounted (the "Trigger Render" button exists). */
export async function waitForAppReady(client: CDPClient, timeoutMs = 15_000): Promise<void> {
  const expression = `
    new Promise((resolve, reject) => {
      const hasButton = () =>
        [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Trigger Render')
      if (hasButton()) return resolve(true)
      const timer = setTimeout(() => {
        obs.disconnect()
        reject(new Error('timeout waiting for Trigger Render button to mount'))
      }, ${timeoutMs})
      const obs = new MutationObserver(() => {
        if (hasButton()) {
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

/**
 * Selects `nodeCount` (if not already selected) and clicks "Trigger Render".
 * Resolves with the new `renderDuration` DOM text once Vue's `nextTick()`
 * has written it (i.e. once the triggered Mount/Update actually completed).
 *
 * Whether this call is a Mount or an Update is decided by the Scenario
 * itself (`cards.length === 0` at click time) — same rule as the rest of
 * this Lab's vdom-stress validation, not something this script decides.
 */
export async function triggerRenderAndWait(
  client: CDPClient,
  nodeCount: number,
  timeoutMs = 30_000,
): Promise<string> {
  const expression = `
    (function (nodeCount) {
      return new Promise((resolve, reject) => {
        try {
          const dts = [...document.querySelectorAll('.metrics dt')]
          const dds = [...document.querySelectorAll('.metrics dd')]
          const idx = dts.findIndex((el) => el.textContent.trim() === 'renderDuration')
          if (idx === -1) return reject(new Error('renderDuration <dt> not found'))
          const target = dds[idx]
          const before = target.textContent

          const timer = setTimeout(() => {
            obs.disconnect()
            reject(new Error('timeout waiting for renderDuration to update'))
          }, ${timeoutMs})

          const obs = new MutationObserver(() => {
            const now = target.textContent
            if (now !== before && now !== '-') {
              clearTimeout(timer)
              obs.disconnect()
              resolve(now)
            }
          })
          obs.observe(target, { childList: true, characterData: true, subtree: true })

          const radio = document.querySelector('input[name="render-count"][value="' + nodeCount + '"]')
          if (!radio) {
            clearTimeout(timer)
            obs.disconnect()
            return reject(new Error('radio input not found for nodeCount=' + nodeCount))
          }
          if (!radio.checked) {
            radio.checked = true
            radio.dispatchEvent(new Event('change', { bubbles: true }))
          }

          const button = [...document.querySelectorAll('button')].find(
            (b) => b.textContent.trim() === 'Trigger Render',
          )
          if (!button) {
            clearTimeout(timer)
            obs.disconnect()
            return reject(new Error('Trigger Render button not found'))
          }
          button.click()
        } catch (err) {
          reject(err)
        }
      })
    })(${nodeCount})
  `
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  assertNoException(result, `triggerRenderAndWait(nodeCount=${nodeCount})`)
  return result.result.value as string
}

// ---------------------------------------------------------------------------
// Trigger / Observation separation (Phase 5.1).
//
// triggerRenderAndWait() above is fine for the UNTRACED priming Mount step
// (it happens entirely before Tracing.start(), so however long its
// awaitPromise-based wait takes doesn't pollute any trace). It is NOT fine
// for the MEASURED trigger: wrapping "click" + "wait for completion" in one
// Runtime.evaluate({awaitPromise:true}) call makes the entire wait show up
// nested inside a single EvaluateScript trace event — confirmed by directly
// tracing one such event, where ~53ms of a ~77ms EvaluateScript was spent
// inside V8.InvokeApiInterruptCallbacks with no further children (see
// results/cdp-trace/harness-check/HARNESS_FIX_REPORT.md Phase 5). That
// polluted the Scripting self-time totals with harness wait time.
//
// Fix: fire the click with a plain (non-awaitPromise) Runtime.evaluate that
// returns as soon as its own synchronous execution + immediate microtask
// checkpoint finishes, and detect completion via a SEPARATE, asynchronous
// CDP event — Runtime.addBinding()/Runtime.bindingCalled — instead of a
// second long-lived evaluate. The binding call happens whenever the page's
// own MutationObserver callback later fires (a normal microtask the browser
// schedules on its own), which is not nested inside any Runtime.evaluate at
// all from CDP's perspective, so nothing about the wait can show up inside
// an EvaluateScript slice.

const COMPLETION_BINDING_NAME = 'cdpTraceRenderComplete'

/** Call once per CDP session, before any fireTriggerRender() calls. */
export async function enableCompletionBinding(client: CDPClient): Promise<void> {
  await client.send('Runtime.addBinding', { name: COMPLETION_BINDING_NAME })
}

/**
 * Fires the click and returns immediately — does NOT wait for the
 * Mount/Update to complete. Completion must be awaited separately via
 * waitForRenderComplete(). Requires enableCompletionBinding() to have been
 * called first (on this CDP session — the binding function itself persists
 * across Page.navigate, since Runtime.addBinding is a session-level, not
 * document-level, registration).
 */
export async function fireTriggerRender(client: CDPClient, nodeCount: number): Promise<void> {
  const expression = `
    (function (nodeCount, bindingName) {
      const dts = [...document.querySelectorAll('.metrics dt')]
      const dds = [...document.querySelectorAll('.metrics dd')]
      const idx = dts.findIndex((el) => el.textContent.trim() === 'renderDuration')
      if (idx === -1) throw new Error('renderDuration <dt> not found')
      const target = dds[idx]
      const before = target.textContent

      const obs = new MutationObserver(() => {
        const now = target.textContent
        if (now !== before && now !== '-') {
          obs.disconnect()
          window[bindingName](now)
        }
      })
      obs.observe(target, { childList: true, characterData: true, subtree: true })

      const radio = document.querySelector('input[name="render-count"][value="' + nodeCount + '"]')
      if (!radio) throw new Error('radio input not found for nodeCount=' + nodeCount)
      if (!radio.checked) {
        radio.checked = true
        radio.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Trigger Render',
      )
      if (!button) throw new Error('Trigger Render button not found')
      button.click()
    })(${nodeCount}, ${JSON.stringify(COMPLETION_BINDING_NAME)})
  `
  // Deliberately NO awaitPromise — this expression has no top-level Promise
  // to await; it returns as soon as its synchronous body (+ the immediate
  // post-script microtask checkpoint, which is where Vue's own nextTick()
  // flush runs — real work, not waiting) finishes.
  const result = await client.send('Runtime.evaluate', { expression })
  assertNoException(result, `fireTriggerRender(nodeCount=${nodeCount})`)
}

/**
 * Awaits the SEPARATE Runtime.bindingCalled CDP event fired by the page's
 * MutationObserver once it detects the completion write. Node-side timeout
 * (chrome.ts's CDPClient#waitFor), so no wait-related event is ever
 * injected into the browser's own trace.
 */
export async function waitForRenderComplete(client: CDPClient, timeoutMs = 30_000): Promise<string> {
  const params = await client.waitFor(
    'Runtime.bindingCalled',
    (p) => p.name === COMPLETION_BINDING_NAME,
    timeoutMs,
  )
  return params.payload as string
}
