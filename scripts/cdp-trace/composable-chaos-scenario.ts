// CDP Trace Validation — composable-chaos Scenario adapter.
//
// This is a NEW file, sibling to `scenario.ts` (which is vdom-stress-only,
// per its own file header). It does not modify `scenario.ts`, does not
// change the vdom-stress protocol, and does not touch
// `src/scenarios/composable-chaos/*` — it only teaches the already-frozen
// generic infrastructure (chrome.ts / tracer.ts / sync.ts / parser.ts /
// rollup.ts / attribution.ts / evidence.ts / stats.ts, all reused verbatim)
// how to drive THIS Scenario's different DOM shape:
//
//   - depth selector:  input[name="composable-depth"][value="N"]  (N = 1/5/10/20)
//   - build button:    <button>Build Chain</button>
//   - update button:   <button>Trigger Update</button>
//   - Build Duration:  1st `.metric-group` dl, <dt>Build Duration</dt> -> <dd>
//   - Total Update Count: 2nd `.metric-group` dl, <dt>Total Update Count</dt> -> <dd>
//
// Same completion-detection philosophy as scenario.ts's Phase 5.1
// trigger/observation split: fire the click with a plain (non-awaitPromise)
// Runtime.evaluate, and detect completion via a SEPARATE Runtime.bindingCalled
// event driven by a page-side MutationObserver — never a Node-side setTimeout
// poll (background-tab timer throttling, see project memory
// vue36_reactive_chain_validation) and never an awaitPromise-wrapped wait
// nested inside the same EvaluateScript we're trying to measure.
//
// Build Duration has one extra wrinkle scenario.ts's renderDuration doesn't:
// `ComposableChaosPage.vue`'s `buildChain()` resets `buildDuration.value` to
// `null` (rendered as the DOM text `'-'`) BEFORE `await nextTick()`, then
// writes the real number AFTER. A naive "text changed" observer resolves on
// that intermediate `'-'` write. Every function below that watches Build
// Duration explicitly skips that transient state (see waitForSettledText).

import type { CDPClient } from './chrome.ts'

function assertNoException(result: { exceptionDetails?: unknown }, context: string): void {
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed (${context}): ${JSON.stringify(result.exceptionDetails)}`)
  }
}

/** Waits until the Vue app has mounted (both Lab buttons exist). */
export async function waitForAppReady(client: CDPClient, timeoutMs = 15_000): Promise<void> {
  const expression = `
    new Promise((resolve, reject) => {
      const ready = () => {
        const texts = [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
        return texts.includes('Build Chain') && texts.includes('Trigger Update')
      }
      if (ready()) return resolve(true)
      const timer = setTimeout(() => {
        obs.disconnect()
        reject(new Error('timeout waiting for Build Chain / Trigger Update buttons to mount'))
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

const COMPLETION_BINDING_NAME = 'cdpTraceComposableChaosComplete'

/** Call once per CDP session, before any fire*() calls below. */
export async function enableCompletionBinding(client: CDPClient): Promise<void> {
  await client.send('Runtime.addBinding', { name: COMPLETION_BINDING_NAME })
}

/**
 * Shared browser-side helper (inlined into every fired expression, not a
 * real import — Runtime.evaluate has no module system): finds the `<dd>`
 * that follows a `<dt>` whose FIRST text node matches `label`, inside the
 * `groupIndex`-th `.metric-group`.
 */
function ddLookupSnippet(): string {
  return `
    function findDD(groupIndex, label) {
      const group = document.querySelectorAll('.metric-group')[groupIndex]
      if (!group) throw new Error('metric-group[' + groupIndex + '] not found')
      const dts = [...group.querySelectorAll('dt')]
      const idx = dts.findIndex((dt) => dt.childNodes[0].textContent.trim() === label)
      if (idx === -1) throw new Error('<dt>' + label + '</dt> not found in metric-group[' + groupIndex + ']')
      return group.querySelectorAll('dd')[idx]
    }
  `
}

// ---------------------------------------------------------------------------
// Build Chain
// ---------------------------------------------------------------------------

/**
 * Fires a Build Chain click at the given depth and returns immediately —
 * does NOT wait for completion. Requires enableCompletionBinding() first.
 * Selects the depth radio (dispatching `change`) before clicking, matching
 * how a real user would operate the Lab UI (pick Depth, then press Build).
 */
export async function fireBuildChain(client: CDPClient, depth: number): Promise<void> {
  const expression = `
    (function (depth, bindingName) {
      ${ddLookupSnippet()}
      const target = findDD(0, 'Build Duration')

      // Two-phase detection, NOT "text differs from its pre-click value":
      // buildChain() first resets to '-' (reset phase), then writes the real
      // duration after nextTick() (settle phase). Comparing only against the
      // pre-click snapshot is unsound — at Depth 1 (and generally, since
      // these operations round to sub-millisecond strings) two consecutive
      // builds can legitimately settle on the SAME formatted text (e.g.
      // "0.900 ms" both times), which would make "now !== before" never
      // fire and hang until the caller's timeout. Requiring an observed
      // '-' first guarantees we're watching THIS click's own cycle, not
      // comparing against stale state.
      let sawReset = false
      const obs = new MutationObserver(() => {
        const now = target.textContent
        if (!sawReset) {
          if (now === '-') sawReset = true
          return
        }
        if (now !== '-') {
          obs.disconnect()
          window[bindingName](now)
        }
      })
      obs.observe(target, { childList: true, characterData: true, subtree: true })

      const radio = document.querySelector('input[name="composable-depth"][value="' + depth + '"]')
      if (!radio) throw new Error('radio input not found for depth=' + depth)
      if (!radio.checked) {
        radio.checked = true
        radio.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Build Chain')
      if (!button) throw new Error('Build Chain button not found')
      button.click()
    })(${depth}, ${JSON.stringify(COMPLETION_BINDING_NAME)})
  `
  // Deliberately no awaitPromise, same rationale as scenario.ts's fireTriggerRender.
  const result = await client.send('Runtime.evaluate', { expression })
  assertNoException(result, `fireBuildChain(depth=${depth})`)
}

/** Awaits the Runtime.bindingCalled event fired once Build Duration settles. Resolves with the new dd text. */
export async function waitForBuildComplete(client: CDPClient, timeoutMs = 15_000): Promise<string> {
  const params = await client.waitFor('Runtime.bindingCalled', (p) => p.name === COMPLETION_BINDING_NAME, timeoutMs)
  return params.payload as string
}

/**
 * Untraced convenience wrapper for PRIMING (reset to a known depth before a
 * measured cycle) — click + settle in one awaitPromise'd evaluate. Never use
 * this for a MEASURED cycle (see scenario.ts's file header on why
 * awaitPromise-wrapping a wait must not happen inside a traced window);
 * fine here because priming clicks are never traced.
 */
export async function primeBuildAndWait(client: CDPClient, depth: number, timeoutMs = 15_000): Promise<string> {
  const expression = `
    (function (depth) {
      return new Promise((resolve, reject) => {
        ${ddLookupSnippet()}
        const target = findDD(0, 'Build Duration')
        const timer = setTimeout(() => {
          obs.disconnect()
          reject(new Error('timeout waiting for Build Duration to settle'))
        }, ${timeoutMs})
        // Same two-phase reset->settle detection as fireBuildChain() — see
        // that function's comment for why comparing against the pre-click
        // text is unsound for this Scenario's sub-millisecond durations.
        let sawReset = false
        const obs = new MutationObserver(() => {
          const now = target.textContent
          if (!sawReset) {
            if (now === '-') sawReset = true
            return
          }
          if (now !== '-') {
            clearTimeout(timer)
            obs.disconnect()
            resolve(now)
          }
        })
        obs.observe(target, { childList: true, characterData: true, subtree: true })

        const radio = document.querySelector('input[name="composable-depth"][value="' + depth + '"]')
        if (!radio) return reject(new Error('radio input not found for depth=' + depth))
        if (!radio.checked) {
          radio.checked = true
          radio.dispatchEvent(new Event('change', { bubbles: true }))
        }
        const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Build Chain')
        if (!button) return reject(new Error('Build Chain button not found'))
        button.click()
      })
    })(${depth})
  `
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  assertNoException(result, `primeBuildAndWait(depth=${depth})`)
  return result.result.value as string
}

// ---------------------------------------------------------------------------
// Trigger Update
// ---------------------------------------------------------------------------

/** Fires one Trigger Update click and returns immediately. Requires enableCompletionBinding() first. */
export async function fireTriggerUpdate(client: CDPClient): Promise<void> {
  const expression = `
    (function (bindingName) {
      ${ddLookupSnippet()}
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
  const result = await client.send('Runtime.evaluate', { expression })
  assertNoException(result, 'fireTriggerUpdate')
}

/** Awaits the Runtime.bindingCalled event fired once Total Update Count increments. */
export async function waitForUpdateComplete(client: CDPClient, timeoutMs = 15_000): Promise<string> {
  const params = await client.waitFor('Runtime.bindingCalled', (p) => p.name === COMPLETION_BINDING_NAME, timeoutMs)
  return params.payload as string
}

/**
 * Reads the current (already-settled) Average Update Duration text from the
 * page, for meta bookkeeping only — never used as the measured value itself
 * (that comes from the trace). Returns null if not yet rendered.
 */
export async function readAverageUpdateDuration(client: CDPClient): Promise<string | null> {
  const expression = `
    (function () {
      ${ddLookupSnippet()}
      try {
        return findDD(1, 'Average Update Duration').textContent
      } catch {
        return null
      }
    })()
  `
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true })
  assertNoException(result, 'readAverageUpdateDuration')
  return result.result.value ?? null
}

// ---------------------------------------------------------------------------
// ADDITION (Day 24, Vue 3.6.0-rc.2 Validation, Layer A instrumentation) —
// readMetricGroup() below is a pure, read-only extension of this adapter.
// It does not change any existing exported function's behavior and never
// touches `src/scenarios/composable-chaos/*`; it only teaches the adapter to
// read the counters that the CDP trace matrix (Layer B, above) never needed:
// Composable Instance Count / Computed Count / Watch Count / WatchEffect
// Count (Build Phase) and Computed Execute Count / Watch Trigger Count /
// WatchEffect Trigger Count / Render Count (Update Phase). These are exactly
// the structural counters the Scenario's README lists under "Metrics" and
// that the Vue 3.5.40 Baseline recorded manually via claude-in-chrome.
// Reused here — via the SAME already-frozen fireBuildChain/waitForBuildComplete
// and fireTriggerUpdate/waitForUpdateComplete click+MutationObserver
// mechanism — so a script (run-composable-chaos-instrumentation.ts) can
// drive Layer A deterministically across two Vue versions without manual
// browser interaction for 2,400 individual clicks (4 depths x 2 versions x
// 3 trials x 100 updates).
// ---------------------------------------------------------------------------

/** Reads every <dt>/<dd> pair in the `groupIndex`-th `.metric-group` as a plain label -> text map. */
export async function readMetricGroup(client: CDPClient, groupIndex: number): Promise<Record<string, string>> {
  const expression = `
    (function () {
      const group = document.querySelectorAll('.metric-group')[${groupIndex}]
      if (!group) throw new Error('metric-group[${groupIndex}] not found')
      const dts = [...group.querySelectorAll('dt')]
      const dds = [...group.querySelectorAll('dd')]
      const out = {}
      dts.forEach((dt, i) => {
        out[dt.childNodes[0].textContent.trim()] = dds[i] ? dds[i].textContent.trim() : null
      })
      return out
    })()
  `
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true })
  assertNoException(result, `readMetricGroup(${groupIndex})`)
  return result.result.value as Record<string, string>
}
