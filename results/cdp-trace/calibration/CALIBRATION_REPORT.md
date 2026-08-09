# CDP Trace Measurement Calibration Report

Scope: `vdom-stress`, Vue 3.5.40, Node Count = 5000, Operation = Update,
Warm-up = 3 (discarded), Measurement = 10, per Chrome mode. Scenario code,
benchmark parameters and CDP runner protocol identical between modes — only
`--headless=new` presence/absence changed. Raw data:
`results/cdp-trace/calibration/{headless,headed}/update-5000/trial-XX.{trace,meta}.json`.
Captured by `scripts/cdp-trace/run-calibration.ts`, analyzed by
`scripts/cdp-trace/analyze-calibration.ts`. See `scripts/cdp-trace/TRACE_ACCOUNTING.md`
for what these raw event names mean and `TRACE_EVIDENCE_SCHEMA.md` for the
per-metric confidence contract this report follows.

---

## Phase 1 — Headless vs Headed

Both runs: `document.visibilityState` was `visible` in all 20/20 measurement
trials (confirmed, not assumed) — so this is a fair comparison, not one side
silently penalized by background-tab throttling.

| Metric | Headless | Headed |
|---|---|---|
| Render Duration (ms) | median 13.2, P25 12.4, P75 13.4, min 12.0, max 18.6 (n=10) | median 12.5, P25 12.3, P75 13.9, min 11.8, max 16.0 (n=10) |
| Trace event count | median 2120.5, P25 1882.5, P75 2239.8, min 1763, max 2620 (n=10) | median 2150.0, P25 2016.3, P75 2235.3, min 1881, max 2273 (n=10) |
| Layout (raw-sum, µs) | observed 10/10 — median 92240.5, P25 87840.3, P75 97079.0, min 1550, max 107755 | observed 10/10 — median 90550.0, P25 88480.8, P75 94792.8, min 1374, max 107291 |
| Paint (raw-sum, µs) | observed 10/10 — median 2642.0, P25 2545.3, P75 2788.3, min 2077, max 2893 | observed 10/10 — median 2678.0, P25 2505.0, P75 2753.3, min 1671, max 3809 |
| Recalculate Style (raw: `UpdateLayoutTree`, µs) | observed 8/10 (2 not observed); of those, 7/8 had a readable duration — median 200.0, P25 186.5, P75 227.5, min 180, max 368 | observed 6/10 (4 not observed); all 6 had a readable duration — median 190.5, P25 189.3, P75 205.3, min 184, max 211 |
| Main-thread JS events (raw diagnostic, µs) | observed 10/10 — median 91436.0, P25 86565.8, P75 105251.8, min 83678, max 162145 | observed 10/10 — median 91619.0, P25 83044.3, P75 98324.5, min 79886, max 174550 |

**Reading this table**: Render Duration and trace event count are close and
their IQRs overlap heavily — no evidence headless vs headed differ for those.
Layout / Paint / Recalculate Style / "Main-thread JS" medians also look
close between modes, **but this is not a clean calibration result** — see
Phase 2. Both modes show the *same* contamination pattern at a similar rate,
so the headless-vs-headed comparison itself is not invalidated, but the
absolute numbers in this table are not trustworthy as "Update cost" figures
for either mode (that's a harness bug, not a headless-specific artifact —
confirmed identical CPU-profile contamination pattern in both modes, see
Phase 4).

**Phase 1 conclusion**: headless and headed are consistent **with each
other** for every metric measured. Whether that consistency reflects "both
faithfully measure the same real thing" or "both are affected by the same
harness bug to a similar degree" cannot be fully separated yet — Phase 2
shows it's substantially the latter for the trace-derived metrics. Render
Duration (the one metric free of this contamination) shows no headless vs
headed difference.

---

## Phase 2 — Paint event availability

**Confirmed, not hypothesized** (via `args.beginData.dirtyObjects` /
`totalObjects` on the `Layout` events themselves — this is Chromium's own
instrumentation, not an inference): in 18 of the 20 measurement trials
across both modes, the trace captured a `Layout` event with
`dirtyObjects ≈ 25025` out of `totalObjects ≈ 25079/25085` — i.e. **nearly
every layout object in the whole 5000-card tree**, not just the handful of
nodes an Update-with-unchanged-content should touch. The other 2 trials
(trial-01 in each mode) instead show two small `Layout` events with
`dirtyObjects` of 3, 19, or 25 — consistent with the Scenario's own
Hypothesis that an Update with identical `id`/`title` content should barely
touch the DOM.

Example (`headless/update-5000/trial-02.trace.json`):

```
Layout: dur=107755us, dirtyObjects=25025, totalObjects=25079
```

vs. (`headless/update-5000/trial-01.trace.json`):

```
Layout: dur=689us,  dirtyObjects=3,  totalObjects=25085
Layout: dur=861us,  dirtyObjects=19, totalObjects=25085
```

**Root cause — confirmed pattern, mechanism not fully isolated**: the
per-trial protocol is `prime click (Mount) → await nextTick() resolves →
Tracing.start() → measured click (Update) → wait → Tracing.end()`.
`nextTick()` only guarantees Vue's own synchronous DOM patch is done — it
does **not** guarantee the browser has actually run a rendering frame
(Style/Layout/Paint) for that patch yet, since that's scheduled on the next
compositor frame, asynchronous relative to script execution. In most trials,
the Mount's Style+Layout work appears to still be pending when
`Tracing.start()` fires, so it gets captured — combined with the Update's
own (tiny) changes — inside the traced window as one large Layout pass. In
the outlier trial (trial-01 of each mode, consistently — both modes' first
measurement trial), that Mount-scale Layout instead does **not** appear in
the trace at all, but `EvaluateScript` for the traced action is anomalously
large (headless: 138.7ms vs. 21–34ms in trials 2–10; headed: 147.6ms vs.
21–26ms) — suggesting the browser flushed the Mount's rendering pipeline
*before* `Tracing.start()` in that trial, and something else (unconfirmed —
possibly first-trace-session overhead in Chrome's tracing subsystem, or
JIT/profiler warm-up specific to the first measurement trial) inflated that
trial's `EvaluateScript` instead. **This asymmetry's exact cause is not
confirmed — flagged as an open question, not resolved here.**

**What this means for "no Paint event = Paint cost 0"**: explicitly did
**not** make that substitution anywhere in this pipeline (`extractMetric()`
in `parser.ts` returns `observed: false, totalDurUs: null` — see
`TRACE_EVIDENCE_SCHEMA.md`). The intermittent Paint absence seen in the
original 3-trial PoC (1/3 trials) was not reproduced as absence in this
10-trial calibration run (10/10 both modes) — with 10x more trials, Paint
was observed every time. This suggests the earlier 1/3 absence was more
likely a small-sample coincidence than a deterministic "sometimes Paint
truly doesn't fire for this exact Update" behavior — **but this is inferred
from a change in observed rate across two different sample sizes, not
directly proven; not a Confirmed conclusion.**

**Relationship between `Paint`, `AnimationFrame::StyleAndLayout`, and
compositor events**: `AnimationFrame::StyleAndLayout` (seen in some but not
all trials, e.g. calibration `headed` trials show it inconsistently) is not
in the confirmed `eventStylesMap` entries this session checked (see
`TRACE_ACCOUNTING.md` §2) — its exact category and relationship to `Paint`
was **not resolved this round**. `CompositeLayers` / `RasterTask` /
`Commit` events were present in the wider (non-scoped) trace event lists
from earlier PoC runs but were not cross-correlated against `Paint`
presence/absence in this calibration pass. **Flagged as unresolved, not
investigated further within this phase's scope.**

### Phase 2 verdict

```
NOT VALIDATED — Paint availability root cause is PARTIALLY confirmed:
  - Confirmed: absence is not silently treated as 0 anywhere in this pipeline.
  - Confirmed: the Layout contamination bug (prime-Mount bleed-in) is real
    and affects both Layout and (probably) Paint numbers' trustworthiness.
  - NOT confirmed: the exact mechanism causing Paint to sometimes not fire
    at all (only observed in the earlier 3-trial PoC, not reproduced here).
  - NOT confirmed: the relationship between Paint, AnimationFrame::StyleAndLayout,
    and compositor/raster events.
```

---

## Phase 4 — Vue Runtime Attribution

Investigated whether nested events under `EvaluateScript` can distinguish
Application code / Vue Runtime / V8 overhead / other browser activity.

`EvaluateScript` (the traced click's synchronous execution + the microtask
checkpoint Blink runs immediately after, per HTML spec — this is where
`RunMicrotasks` and Vue's actual reactive flush end up nested) contains, in
`headless/update-5000/trial-02.trace.json`:

- One `RunMicrotasks` event covering ~96% of `EvaluateScript`'s own duration
  (20320us of 21103us) — this is where the real work happens, and it is
  itself an **opaque single duration** in the `devtools.timeline` category
  events; no further nested `devtools.timeline` events break it down.
- The `disabled-by-default-v8.cpu_profiler` category (included in this
  pipeline's `TRACE_CATEGORIES` from the start) **does** carry `Profile` /
  `ProfileChunk` events with a real sampled call tree — each node has
  `callFrame.functionName`, `callFrame.url`, `lineNumber`, `columnNumber`.
  Decoding all 6 `ProfileChunk` events for that same trial (83 call-tree
  nodes total) and counting nodes by `url` gives:

  | URL | Node count |
  |---|---:|
  | `.../node_modules/.vite/deps/vue.runtime.esm-bundler-*.js` | 41 |
  | `.../@id/virtual:vue-devtools-path:overlay/devtools-overlay.mjs` | 27 |
  | (no url — native/root/program/idle) | 13 |
  | `.../src/scenarios/vdom-stress/VDomStressPage.vue` | 2 |

  **Confirmed identical pattern in `headed/update-5000/trial-05.trace.json`**
  (41 / 35 / 13 / 2) — not a headless-specific artifact.

### Two findings here, both important:

1. **Attribution is feasible, not implemented.** The `url` field genuinely
   separates Vue's own runtime bundle from this Scenario's application code
   from V8 native activity — the raw ingredient for "Application code vs
   Vue Runtime vs V8 overhead" attribution exists in the trace. What's
   missing: decoding the `Profile`/`ProfileChunk` stream's `samples` +
   `timeDeltas` arrays to turn "N nodes reference this URL" into "N
   microseconds were spent in this URL" (node *count* in the call tree is
   not the same as sampled *time* — a node can be visited by many samples
   or few). **Not built, not validated — no time-based number is claimed.**

2. **A previously-unknown contamination source, worth flagging beyond this
   task's scope**: `vite-plugin-vue-devtools`'s injected overlay
   (`devtools-overlay.mjs`) is running its own reactive effects
   (`runIfDirty`, `run`, and further Vue-internal-looking frames) *inside
   the same profiled call stacks* as the Scenario being measured — 27–35 of
   the ~83 sampled call-tree nodes in these trials belong to the devtools
   overlay, not to Vue-for-the-Scenario or the Scenario's own code. This
   plugin is present in `vite.config.ts` for every scenario in this Lab, so
   any future benchmarking that reads JS execution cost from a dev server
   started with this plugin active risks attributing overlay overhead to
   Vue or to the Scenario. **This is a finding to flag to the user, not
   something this task's Stop Condition permits fixing (would mean editing
   `vite.config.ts`, out of scope here).**

### Phase 4 verdict

```
Vue Runtime Cost attribution = Not yet available
  - Feasibility: CONFIRMED (distinguishable via CPU-profiler call-frame url)
  - Implementation: NOT DONE (sample/timeDelta decoding not built)
  - Additional confound identified: vite-plugin-vue-devtools overlay code
    shares the same profiled call stacks — must be accounted for (excluded
    or measured separately) once attribution is implemented
```

---

## Phase 3 — see `scripts/cdp-trace/TRACE_ACCOUNTING.md`

(Kept as its own file since it documents the tooling generally, not just
this calibration run's data.)

---

## Overall Calibration Verdict

```
1. Headless vs Headed acceptable consistency?
   NOT FULLY VALIDATED — consistent WITH EACH OTHER for every metric
   measured (Render Duration cleanly; Layout/Paint/RecalcStyle/JS-events
   only in the sense of "equally contaminated"). Render Duration alone:
   validated consistent.

2. Paint event absence root cause confirmed?
   NOT VALIDATED — partially confirmed (see Phase 2 verdict above).

3. DevTools metrics reliably reconstructable from raw trace?
   Render Duration (in-page, non-trace): yes.
   Layout / Paint / Recalculate Style as raw per-event durations: yes,
     AT THE EVENT LEVEL, but current per-trial values are contaminated by
     the prime-Mount bleed-in bug — not yet safe to use as "Update cost".
   Scripting / Rendering / Painting (DevTools category totals): no
     (self-time roll-up not implemented).
   Vue Runtime Cost: no (see Phase 4).

4. Ready to re-run Vue 3.5 vs 3.6 official Validation using this pipeline?
   NO. Blocking issue: the Layout-contamination bug (Phase 2) must be fixed
   first — e.g. by inserting a real rendering-frame synchronization step
   (such as awaiting two chained requestAnimationFrame callbacks) between
   the priming Mount trigger and Tracing.start(), so the traced window only
   ever contains the measured action's own rendering work. This is a change
   to the CALIBRATION HARNESS (scenario.ts / run-calibration.ts), not the
   Scenario itself, and was not implemented in this phase per its Stop
   Condition.
```
