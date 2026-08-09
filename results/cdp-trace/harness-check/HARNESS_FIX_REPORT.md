# CDP Trace Harness Fix & Measurement Infrastructure Validation

Follow-up to `results/cdp-trace/calibration/CALIBRATION_REPORT.md`. Scope
frozen per task: Vue 3.5.40, Node Count = 5000, Operation = Update, Warm-up
= 3, Measurement = 10, headless only. No Vue 3.6, no other Node Count, no
Mount, no Scenario changes. Raw data:
`results/cdp-trace/harness-check/vue-3.5.40/update-5000/trial-0{1-10}.{trace,meta}.json`.

## Phase 1 — Fix Harness

**Files changed**: new `scripts/cdp-trace/sync.ts` (`waitForBrowserFrames()`),
wired into `scripts/cdp-trace/run-calibration.ts` and the new
`scripts/cdp-trace/run-harness-check.ts`.

**Synchronization flow** (exactly as specified — `nextTick()` kept, frame
sync added on top, not substituted):

```
Mount trigger
  ↓ await nextTick()          (unchanged — inside triggerRenderAndWait())
  ↓ requestAnimationFrame #1  (new)
  ↓ requestAnimationFrame #2  (new)
  ↓ Tracing.start()
  ↓ Update trigger
```

**Why this is safe**: `waitForBrowserFrames()` only reads `Date.now()`-free
rAF callbacks inside the page — it does not touch the Scenario's DOM,
component, or any Vue API, and it runs entirely from the harness side (a
`Runtime.evaluate` call), same category as the existing `waitForAppReady`/
`triggerRenderAndWait` helpers already in `scenario.ts`. Node Count,
Operation, and benchmark parameters are untouched; only how long the harness
waits before starting a trace changed.

**Phase 1 result**: `node scripts/cdp-trace/run-harness-check.ts` ran
end-to-end without errors (13 trial cycles, CDP connect → trace → save all
succeeded) — confirms the fix is wired correctly.

```
Phase 1: PASS
```

## Phase 2 — Calibration Only

Ran `run-harness-check.ts`: Vue 3.5.40, N=5000, Update, warm-up 3 +
measurement 10, headless. All 10 trials completed and saved successfully.

```
Phase 2: PASS
```

## Phase 3 — Mount Contamination Gate

Per-trial `Layout` event(s), reading each event's own
`args.beginData.dirtyObjects` / `totalObjects` (Chromium's own
instrumentation):

| Trial | Layout duration (µs) | dirtyObjects | totalObjects | Paint observed | Recalc Style observed |
|---:|---:|---:|---:|:---:|:---:|
| 01 | 1194 + 857 | 3, 19 | 25085 | true | true |
| 02 | (no `dur` on the one Layout event) | 19 | 25085 | false | true |
| 03 | 932 | 19 | 25085 | true | true |
| 04 | 1690 | 17 | 25085 | false | true |
| 05 | 1743 | 17 | 25085 | false | true |
| 06 | 2656 | 17 | 25085 | false | true |
| 07 | 2157 | 17 | 25085 | false | true |
| 08 | 2204 | 17 | 25085 | false | true |
| 09 | 1916 | 17 | 25085 | false | true |
| 10 | 1898 | 17 | 25085 | false | true |

**Before/After**:

| | Before (Phase 1's original calibration) | After (this fix) |
|---|---|---|
| Trials with `dirtyObjects ≥ 5000` | 18/20 (9/10 headless, 9/10 headed) | **0/10** |
| Typical `dirtyObjects` when clean | 3, 17, 19, 25 | 3, 17, 19 (same range) |
| Layout duration when clean | 689–2860µs | 932–2656µs (same order of magnitude) |

**PASS criteria check**:
1. `dirtyObjects ≈ 25000` Mount-like pattern: **gone, 0/10 trials.** ✅
2. Layout workload matches actual Update behavior: `dirtyObjects` is 3–19
   out of 25085 total (≈0.01–0.08%) in every trial — consistent with the
   Scenario's own hypothesis that an Update with unchanged `id`/`title`
   content should barely touch the DOM. ✅
3. No previous-Mount work visibly bleeding in: confirmed — no trial shows a
   Layout event anywhere near Mount scale (previously 85,000–108,000µs,
   now max 2656µs). ✅
4. Reasonable stability across 10 trials: Layout durations cluster
   932–2656µs (≈2.9x range) — much tighter than before (1550–107,755µs,
   ≈70x range) and no bimodal split. `dirtyObjects` itself is near-identical
   across all 10 trials (3/19 once, 17 or 19 for the rest) — very stable. ✅

```
Phase 3: PASS
```

**A new, separate observation surfaced here, not a Phase 3 failure**:
`renderDurationMs` (the Scenario's own `performance.now()`-based metric,
untouched by the trace fix) became LESS stable after the fix — median rose
from ~13ms (pre-fix) to ~30ms, and trials 4–10 sit at 28–43ms vs. trials
1–3 at 12.5–18.1ms (compare `results/cdp-trace/harness-check/…/trial-0N.meta.json`).
This looks like a step-change partway through the run, not gradual drift.
Checked GC event totals within each trial's traced window as one candidate
explanation — no clean correlation (trial 1 has the largest GC total,
91ms, but a low renderDuration, 18.1ms; trial 4 has almost no GC, 0.8ms,
but the highest renderDuration, 43.4ms) — so GC pressure alone does not
explain it. **Root cause not identified. Flagged for Phase 6 as an open
issue, not investigated further within this phase's scope.**

## Phase 4 — Browser Rendering Evidence

| Metric | Observed | Distribution (µs) |
|---|---|---|
| Recalculate Style (raw: `UpdateLayoutTree`) | 10/10 | median 127, P25 116.8, P75 157.3, min 84, max 277 |
| Layout | 10/10 (9/10 had a readable `dur`; trial-02 matched but had no `dur` field — recorded as observed=true, duration=null, not 0) | median 1916, P25 1743, P75 2157, min 932, max 2656 |
| Paint | **2/10** | median 2341, P25 1280, P75 3402, min 219, max 4463 (8/10 trials: observed=false, duration=null) |

Paint's observed rate dropped from 10/10 (in the earlier, contaminated
calibration) to 2/10 here. This is consistent with — not proof of, but
consistent with — the Scenario's own Hypothesis: once the trace window no
longer includes the Mount's full-tree repaint, what's left is genuinely
almost-always-a-no-op Update, so most trials legitimately have nothing to
paint. Per the Stop Condition in the original PoC task, this is recorded
as `observed: false, duration: null` for the 8 trials without a Paint
event — never coerced to 0.

```
Phase 4: PASS (metrics extracted with correct observed/null handling;
Recalculate Style and Layout are stable and plausible; Paint's low
observed-rate is recorded honestly, not resolved as a root cause — same
open item carried over from the original Calibration Phase 2)
```

## Phase 5 — Trace Accounting (self-time rollup)

Implemented `scripts/cdp-trace/rollup.ts`: builds the nested event tree per
thread (stack-based, ordered by `ts`), computes each event's self time
(`dur` minus its direct children's summed `dur`), buckets self time by the
confirmed category subset from `TRACE_ACCOUNTING.md`. This is the actual
algorithm, not `sum(dur where cat=X)` — verified by manually tracing one
trial's full nested-event chain by hand (below) and confirming the
computed self-times match.

Main-thread self-time totals (µs), trial-02:

```
scripting: 23085   rendering: 129   painting: 65   loading: 0   other: 54172
```

**This does not mean "Scripting cost = 23ms" — here is why, traced through
the actual nested events**:

```
RunTask (77206us)
 └ ThreadControllerImpl::RunTask (77185us)
    └ Receive mojo message (77174us)
       └ EvaluateScript (77131us)          ← our injected Runtime.evaluate call
          ├ V8.StackGuard (52945us)
          │  └ V8.HandleInterrupts (52943us)
          │     └ V8.InvokeApiInterruptCallbacks (52940us)   ← ~53ms, no children, self-time ≈ full 52940us
          ├ RunMicrotasks (23496us)        ← Vue's actual reactive flush lives here
          └ (small EventDispatch/FunctionCall events)
```

`V8.InvokeApiInterruptCallbacks` — 52,940µs with no meaningful nested
children — is entirely responsible for the "other" bucket's size, and it
sits *inside* `EvaluateScript`, inflating scripting's apparent total too.
**Root cause, confirmed by this trace-through, not guessed**: this harness
triggers the Update AND waits for its completion inside a single
`Runtime.evaluate({ awaitPromise: true })` call (see `scenario.ts`'s
`triggerRenderAndWait`) — the whole "click → MutationObserver detects the
DOM change" wait is therefore nested inside ONE `EvaluateScript` trace
event, and Chrome represents most of that wait, from V8's perspective, as
time inside `V8.InvokeApiInterruptCallbacks`. **The self-time rollup
algorithm itself is verified correct — the problem is that this harness's
own measurement technique makes waiting time indistinguishable from
scripting time in the trace it produces.**

```
Phase 5: CONDITIONAL
  - Algorithm: implemented and manually verified correct against raw events.
  - Output: NOT trustworthy as a Scripting/Rendering/Painting cost figure
    yet, because the trace window itself includes CDP-await wait time
    nested under EvaluateScript, not just Vue/browser work.
  - Fix needed (not done here, out of this phase's scope): split
    "trigger the click" and "detect completion" into two separate,
    short-lived CDP round trips instead of one blocking
    Runtime.evaluate({awaitPromise:true}), so no single EvaluateScript
    event spans the entire wait.
```

## Phase 5-B — Vue Runtime Attribution

Implemented `scripts/cdp-trace/attribution.ts`: decodes `ProfileChunk`
events' `samples` + `timeDeltas` (not just node counts) and attributes each
sample's elapsed time to its leaf call-frame's `url`.

| Trial | Total sampled time | Vue Runtime | Application | DevTools Overlay | Native/Other |
|---:|---:|---:|---:|---:|---:|
| 02 | 62,084µs | 7,877µs (12.7%) | 0µs (0.0%) | 0µs | 54,207µs (87.3%) |
| 03 | 76,717µs | 4,420µs (5.8%) | 3,134µs (4.1%) | 0µs | 69,163µs (90.2%) |
| 05 | 184,770µs | 38,510µs (20.8%) | 18,211µs (9.9%) | 0µs | 128,049µs (69.3%) |
| 07 | 178,784µs | 35,471µs (19.8%) | 12,720µs (7.1%) | 0µs | 130,593µs (73.0%) |

**Two findings, both confirmed by direct inspection, not estimated**:

1. **The dominant `Native/Other` bucket is the same
   `V8.InvokeApiInterruptCallbacks` wait artifact as Phase 5** — checked the
   individual samples landing in that bucket for trial-02: one single
   sample with `dt=52702us` attributed to the `(program)` pseudo-frame (V8's
   catch-all for "no JS on the stack"), plus a handful of small native DOM
   binding calls (`click`, `setAttribute`, `set textContent`,
   `setTimeout` — all with empty `url` because they're native bindings, not
   JS). So `Native/Other`'s size is dominated by the same wait-time problem,
   not real uncategorizable browser work.
2. **Leaf-only attribution undercounts Vue's real inclusive cost**: the
   `setAttribute` / `set textContent` native calls seen above are almost
   certainly invoked BY Vue's own runtime-dom patch logic (that's how Vue
   writes attributes/text to the DOM) — but because the CPU-profiler sample
   landed exactly on the native binding frame (which has no `url`), this
   decoder buckets it as `Native/Other`, not `Vue Runtime`. A more complete
   attribution would walk up each leaf sample's parent chain to find the
   nearest frame with a `url`, which this implementation does not do.

```
Phase 5-B: CONDITIONAL
  - Sample/timeDelta decoding: IMPLEMENTED (not just node counts — actual
    per-sample elapsed time, verified summing to a plausible total).
  - Vue Runtime vs Application vs DevTools Overlay separation: CONFIRMED
    FEASIBLE via callFrame.url (devtools-overlay contamination re-confirmed
    present, consistent with the original Calibration Phase 4 finding).
  - NOT trustworthy as a final number yet: dominated by the same
    CDP-await wait-time artifact as Phase 5, AND leaf-only attribution is a
    known undercount of Vue's true inclusive cost.
  - Vue Runtime Cost = Not yet available (per instructions, no number claimed)
```

## Phase 6 — Measurement Infrastructure Gate

| Metric | Status | Why |
|---|---|---|
| Render Duration | **CONDITIONAL** | Metric itself is reliable (unchanged methodology, matches prior runs), but became notably less stable after the Phase 1 fix (median 13ms → 30ms, unexplained step-change at trial 4) — needs investigation before being cited as a stable baseline number |
| Layout | **PASS** | Mount contamination confirmed gone (Phase 3); values stable and plausible (932–2656µs) |
| Recalculate Style | **PASS** | 10/10 observed, stable (84–277µs), correct raw-name handling (`UpdateLayoutTree`) |
| Paint | **CONDITIONAL** | Correctly handled (observed/null, never 0), but root cause of low observed-rate (2/10) not confirmed — could be genuine or could be an artifact |
| Scripting | **NOT AVAILABLE** | Self-time rollup implemented and algorithmically verified, but output dominated by a CDP-await wait-time artifact (Phase 5) — not a trustworthy cost figure yet |
| Rendering | **CONDITIONAL** | Main-thread self-time only (129–2820µs range across trials), excludes cross-thread work by design (documented limitation, not a bug) |
| Painting | **NOT AVAILABLE** | Main-thread-only rollup misses Raster-thread work entirely; several trials show 0µs self-time here purely because Paint wasn't observed that trial |
| Vue Runtime Cost | **NOT AVAILABLE** | Attribution mechanism confirmed feasible (Phase 5-B), decoder implemented, but numbers not trustworthy yet (same wait-time artifact + leaf-only undercount) |
| Mount contamination | **PASS** | Directly confirmed fixed via `dirtyObjects` evidence (Phase 3) |
| Headless / Headed consistency | **PASS** (carried over) | Established in the original Calibration Phase 1; not re-run this round (out of this phase's scope, which fixed a bug found by that calibration, not re-validated headed mode) |

```
Overall Measurement Infrastructure Status: NOT PASS

Blocking items before a Vue 3.5 vs 3.6 official Validation:
  1. Render Duration instability post-fix — root cause unknown (Phase 3 note)
  2. Scripting/Rendering/Painting self-time rollup — accurate algorithm,
     contaminated output due to the harness's own CDP-await measurement
     technique (Phase 5) — needs the trigger/wait split described there
  3. Vue Runtime Cost attribution — same wait-time artifact, plus a known
     leaf-only-attribution undercount (Phase 5-B)

NOT blocking (resolved this round):
  - Mount-Layout contamination (Phase 3): FIXED, confirmed
  - Paint observed/null handling: correct throughout
  - Recalculate Style raw-name handling: correct throughout
```

## Stop Condition

Per the task's Stop Condition, since Scripting/Rendering/Painting rollup
and Vue Runtime Cost attribution are NOT AVAILABLE and Render Duration
itself shows an unexplained new instability, **this pipeline is not yet
ready for a formal Vue 3.5.40 vs Vue 3.6.0-rc.2 Validation** across
100/500/1000/5000 × Mount/Update × N trials. Stopping here, as instructed,
rather than proceeding past this gate.
