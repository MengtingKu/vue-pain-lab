# Phase 5.1–5.5: Trigger/Observation Separation — Result

**Correction to `HARNESS_FIX_REPORT.md` Phase 5**: that report attributed the
~53ms `V8.InvokeApiInterruptCallbacks` gap to `Runtime.evaluate({awaitPromise:true})`
polling for the promise to settle. **This hypothesis is now falsified by
direct evidence below** — removing `awaitPromise` entirely did not remove
the gap; it got larger and more variable in several trials. That earlier
causal claim was wrong and is retracted here, not carried forward.

## Phase 5.1 — Separate Trigger and Observation

**Files changed**:
- `scripts/cdp-trace/chrome.ts` — added `CDPClient#waitFor(event, predicate, timeoutMs)`, a Node-side-timeout filtered event wait (never injects a wait-related event into the browser's own trace).
- `scripts/cdp-trace/scenario.ts` — added `enableCompletionBinding()` (`Runtime.addBinding`, called once per session), `fireTriggerRender()` (fires the click, no `awaitPromise`, returns as soon as its own execution finishes), `waitForRenderComplete()` (awaits a separate `Runtime.bindingCalled` CDP event). `triggerRenderAndWait()` (the old blocking version) is kept, used only for the untraced priming Mount step.
- `scripts/cdp-trace/run-harness-check.ts` — measured trigger now uses `fireTriggerRender()` + `waitForRenderComplete()` as two independent calls; priming step unchanged.

**Trigger flow** (measured action only):
```
register waitForRenderComplete() listener (Node-side, no browser cost)
  ↓
fireTriggerRender()  — Runtime.evaluate, NO awaitPromise
  ↓ (returns as soon as its own execution finishes)
await the registered completion listener
  ↓ (resolves on a separate Runtime.bindingCalled CDP event,
     fired when the page's MutationObserver calls window.cdpTraceRenderComplete(...))
```

**Observation flow**: the page's `MutationObserver` (same detection mechanism
as before, unchanged) now calls an exposed binding function instead of
resolving a Promise held open by a blocking `Runtime.evaluate`. The binding
call arrives as its own async CDP protocol message, structurally incapable
of nesting inside any `Runtime.evaluate`'s own trace event.

**Result — measured wait**: `completionWaitDuration` (Node-side, time between
`fireTriggerRender()` returning and the completion event arriving) was
**~0.00–0.01ms across all 10 trials**. This confirms the *architecture* now
does what was asked (trigger returns immediately; observation is a separate,
non-blocking round trip) — but it also means the completion signal is
arriving essentially synchronously with `fireTriggerRender()`'s own return,
which turned out to matter for Phase 5.4 (below).

```
Phase 5.1: PASS (mechanism)
```

## Phase 5.2 — Preserve Measurement Boundary

Confirmed unchanged and still working: re-checked `dirtyObjects` on this
round's `Layout` events — still 3–19 out of ~25085 in every trial (see
raw data), no Mount-scale (~25025) values reappeared.

```
Phase 5.2: PASS
```

## Phase 5.3 — Re-run Calibration

`run-harness-check.ts`: Vue 3.5.40, N=5000, Update, warm-up 3 + measurement
10, headless. All 10 trials completed and saved.
`results/cdp-trace/harness-check/vue-3.5.40/update-5000/trial-0{1-10}.{trace,meta}.json`
(the pre-5.1 version of this same directory was preserved at
`results/cdp-trace/harness-check-phase1-only/vue-3.5.40/` for comparison).

```
Phase 5.3: PASS
```

## Phase 5.4 — Verify Scripting Contamination

Medians computed across all 10 trials in each directory (not a single
hand-picked example):

| Metric | Before (Phase 1 fix only, `awaitPromise:true` trigger) — median [range] | After (Phase 5.1 fix, separated trigger/observation) — median [range] |
|---|---:|---:|
| EvaluateScript | 169,749us [77,131–194,627] | 78,822us [45,414–187,659] |
| V8.InvokeApiInterruptCallbacks | 101,002us [52,941–128,161] | 48,805us [24,718–135,905] |
| Trigger duration | N/A (not separately measurable — bundled with wait) | 46.5–190.1ms (median ~78.3ms) |
| Completion waiting | inside EvaluateScript (unmeasurable, bundled) | **separate, measured directly: ~0.00–0.01ms** |
| Scripting confidence | NOT AVAILABLE | **still NOT AVAILABLE** |

**Correction to be precise about what actually changed**: the median DID
drop by roughly half (EvaluateScript 169,749us → 78,822us;
`V8.InvokeApiInterruptCallbacks` 101,002us → 48,805us) — this is a real,
directionally positive change, not nothing. But it is not resolution:
`V8.InvokeApiInterruptCallbacks` still dominates `EvaluateScript` in every
single trial (its self-time is 52–79% of EvaluateScript's own duration
across all 10 trials), still vastly exceeds the real work happening
alongside it (`RunMicrotasks`, 14,538–68,504us), and the range still
touches values as high as 135,905us — worse than this same metric's worst
value before the fix. A partial, inconsistent reduction is not "no longer
appearing as a long wait-like event", which is the actual Phase 3 gate
criterion for this phase.

**New evidence on WHERE the gap actually is** (traced through trial-02's
full nested event list by hand): `V8.InvokeApiInterruptCallbacks` begins at
the very start of `EvaluateScript` — **before any of the injected script's
own statements run** (before `document.querySelectorAll`, before the
`MutationObserver` is even constructed, before the click). This rules out
the original "waiting for our own Promise" hypothesis outright, since this
round's trigger call contains no Promise at all. It also rules out a
GC-sweep-wait hypothesis considered mid-investigation: `V8.GC_HEAP_ENSURE_SWEEPING_COMPLETED`
events ARE nested inside that same window, but their total duration
(46–1213us across all 10 trials) is under 1% of `V8.InvokeApiInterruptCallbacks`'s
own duration (24,718–135,905us) — nowhere near large enough to be the
dominant cause.

**A new, untested (not confirmed) hypothesis worth flagging**: this trace
configuration includes the `disabled-by-default-v8.cpu_profiler` category
(needed for Phase 5.6's Vue Runtime Attribution work) — Chrome's CPU
profiler is an interrupt/signal-driven sampling profiler, and
`V8.InvokeApiInterruptCallbacks` is literally V8's API for external code to
interrupt JS execution and run a callback (e.g. to take a sample). It is
plausible that enabling CPU-profiler sampling during tracing is itself
adding this overhead — a classic profiler-Heisenberg effect — but this has
**not been tested** (would require re-running with that category removed
and comparing, which is a further calibration cycle, not done here per the
Stop Condition below).

**A separate, striking cross-check**: `triggerDuration` (this round's
Node-side wall-clock for `fireTriggerRender()`, e.g. trial-01: 163.68ms)
is **~13x larger than the Scenario's own `renderDurationMs`** for the exact
same action (trial-01: 12.4ms). Whatever is causing
`V8.InvokeApiInterruptCallbacks`'s size happens **outside** the window
Vue's own `performance.now()` timers bracket (`renderStartTime` to
`renderEndTime`) — meaning `renderDurationMs` itself may still be a valid
measurement of Vue's own work, even though this harness's CDP-observed
wall-clock around the same click is not currently trustworthy. This is
useful, but does not by itself explain the `renderDurationMs` instability
noted in Phase 5.5 below.

```
Phase 5.4: FAIL

Contamination is confirmed NOT resolved by the trigger/observation
separation. Root cause has shifted from "our own hypothesized awaitPromise
wait" (falsified) to an unconfirmed candidate (CPU-profiler sampling
overhead, or something else present at the very start of any
Runtime.evaluate call in this environment). Per the Stop Condition, this
blocks proceeding to Vue 3.5 vs 3.6.
```

## Phase 5.5 — Render Duration Instability

Per-trial breakdown (all Node-side `process.hrtime.bigint()`-derived, ms):

| Trial | renderDuration (Vue's own) | triggerDuration | completionWaitDuration | tracingEndCallDelay | tracingEndToSaved |
|---:|---:|---:|---:|---:|---:|
| 01 | 12.4 | 163.68 | 0.00 | 0.04 | 84.96 |
| 02 | 12.2 | 65.37 | 0.00 | 0.04 | 37.99 |
| 03 | 16.5 | 89.37 | 0.01 | 0.11 | 84.98 |
| 04 | 36.8 | 179.52 | 0.01 | 0.12 | 90.73 |
| 05 | 29.1 | 190.13 | 0.01 | 0.07 | 131.59 |
| 06 | 35.9 | 174.36 | 0.01 | 0.08 | 59.09 |
| 07 | 8.4 | 46.54 | 0.00 | 0.03 | 27.46 |
| 08 | 13.3 | 49.45 | 0.00 | 0.03 | 36.59 |
| 09 | 13.9 | 71.20 | 0.00 | 0.03 | 42.08 |
| 10 | 12.3 | 57.64 | 0.00 | 0.03 | 31.71 |

Answering the 8 questions posed:

1. **Measurement start point**: `renderDurationMs` starts at Vue's own
   `renderStartTime = performance.now()`, called synchronously inside
   `triggerRender()` right after the click handler begins — unaffected by
   this harness's CDP mechanics.
2. **Measurement end point**: `renderEndTime = performance.now()`, called
   right after `await nextTick()` resolves — also entirely inside the
   page, unaffected by CDP mechanics.
3. **Does Trigger really return immediately?** No — `triggerDuration`
   (46.5–190.1ms) is the Node-side wall-clock for the ENTIRE
   `Runtime.evaluate` call, and per Phase 5.4's trace-through, most of that
   time is `V8.InvokeApiInterruptCallbacks`, occurring even before our own
   script's statements execute. So while the *design* fires-and-returns
   (no `awaitPromise`), the CDP round trip itself is not fast, and that
   slowness is not something this harness's Node-side code is doing.
4. **Is `nextTick()` still the measurement end condition?** Yes — unchanged,
   confirmed in `VDomStressPage.vue` (not touched) and in the unmodified
   `renderDurationText` DOM read.
5. **Does MutationObserver represent Vue DOM patch completion?** Yes,
   unchanged from the original design — it watches the exact DOM node Vue
   writes `renderDuration` into, right after `nextTick()`.
6. **Browser scheduling / background / headless scheduling variance?** Not
   isolated as a cause this round — `triggerDuration` variance doesn't
   track cleanly with anything measured on the Node side; it's a property
   of what happens on the browser/V8 side per Phase 5.4.
7. **GC / V8 interrupt / DevTools overlay non-Vue costs?** GC sweep events
   are present but quantitatively negligible (Phase 5.4). DevTools overlay
   contamination (from the original Calibration Phase 4) was not
   re-checked this round — still an open, uninvestigated factor.
8. **Is reset state identical across trials?** Yes, mechanically — every
   trial does a fresh `Page.navigate` to the same URL, same
   `waitForAppReady()`, same priming click, same `waitForBrowserFrames(2)`.
   No difference in the reset procedure between low-renderDuration trials
   (1,2,3,7,8,9,10: 8.4–16.5ms) and high ones (4,5,6: 29.1–36.8ms).

**renderDurationMs itself**: still shows the same three-trial cluster
(trials 4–6: 29.1–36.8ms) sitting apart from the other seven (8.4–16.5ms)
seen in the Phase 1-only run. **Root cause NOT identified.** `triggerDuration`
does correlate loosely in the same direction (trials 4–6 also have the
largest `triggerDuration`: 174–190ms vs. 46–89ms for the others) — worth
noting as a pattern, but correlation between two things both suspected of
sharing an unexplained upstream cause is not an explanation of either.

```
Phase 5.5: NOT RESOLVED — instrumentation added successfully (full timing
breakdown now available per-trial without touching the Scenario), but the
instability itself remains unexplained. Flagged as an open blocking issue.
```

## Overall Result

```
Phase 5 Result
- Files changed: chrome.ts (CDPClient#waitFor), scenario.ts
  (enableCompletionBinding/fireTriggerRender/waitForRenderComplete),
  run-harness-check.ts (uses the new trigger/observation split + records
  Phase 5.5 timing breakdown in meta.json)
- Trigger flow: Runtime.evaluate WITHOUT awaitPromise, fires the click,
  returns as soon as its own execution finishes
- Observation flow: separate Runtime.addBinding / Runtime.bindingCalled
  CDP event, Node-side timeout — architecturally decoupled from the
  trigger call, confirmed by completionWaitDuration ~0ms every trial
- EvaluateScript contamination: STILL PRESENT. Original causal hypothesis
  (awaitPromise polling) FALSIFIED by this fix not resolving it. New
  evidence narrows it to something occurring at the very start of
  Runtime.evaluate, before injected script code runs; GC-sweep-wait ruled
  out quantitatively; CPU-profiler-sampling-overhead proposed as the next
  hypothesis to test, NOT confirmed
- Render Duration stability: NOT resolved, same trial-4-6 cluster as before,
  root cause not identified
- PASS / FAIL: Phase 5.1 (mechanism) PASS; Phase 5.2 PASS; Phase 5.3 PASS;
  Phase 5.4 FAIL; Phase 5.5 NOT RESOLVED
- Next Step: per the Stop Condition, do NOT proceed to Vue 3.5 vs 3.6.
  Recommended next diagnostic (not performed here): re-run this exact
  Phase 5.3 calibration with `disabled-by-default-v8.cpu_profiler` removed
  from TRACE_CATEGORIES (tracer.ts) to test the profiler-overhead
  hypothesis in isolation — if V8.InvokeApiInterruptCallbacks shrinks
  substantially, that confirms the cause and forces a choice between
  "trace with CPU profiling" (needed for Phase 5.6 attribution) and
  "trace with clean Scripting self-time" (needed for Phase 5/5.4) as two
  separate calibration runs, not one.
```
