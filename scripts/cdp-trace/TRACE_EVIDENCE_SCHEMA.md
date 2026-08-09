# Trace Evidence Schema

Defines the contract every metric this CDP trace pipeline reports must
satisfy before it can be cited as evidence in a Vue Pain Lab validation
(e.g. a future `vdom-stress` Vue 3.5 vs 3.6 comparison). Enforced in code by
`scripts/cdp-trace/evidence.ts` (`buildCostTraceEvidence()` /
`buildRuntimeAttributionEvidence()`), not just documented here.

## Dual-Trace Architecture

Confirmed by `results/cdp-trace/calibration/INSTRUMENTATION_ISOLATION_REPORT.md`:
the SAME trace cannot be a trustworthy source for both cost accounting and
Vue Runtime CPU attribution. Enabling `disabled-by-default-v8.cpu_profiler`
(required for attribution) makes `V8.InvokeApiInterruptCallbacks` pollute
`EvaluateScript`'s self-time with tens of milliseconds of profiler overhead
per trial — confirmed by complete elimination (39,587.5µs median → **0.0µs,
every trial**) when that category is removed. Two formally separate trace
sources exist as of `results/cdp-trace/calibration/FINAL_CALIBRATION_REPORT.md`:

```
CPU profiler ON  (TRACE_CATEGORIES)                 CPU profiler OFF (TRACE_CATEGORIES_NO_CPU_PROFILER)
  → source: "runtime-attribution-trace"                → source: "cost-trace"
  → Vue Runtime Attribution: VALID                      → Scripting / Rendering / Painting accounting: VALID
  → Scripting accounting: INVALID                       → Vue Runtime Attribution: UNAVAILABLE
```

Every metric below is tagged with which source it must come from.
`scripts/cdp-trace/evidence.ts`'s two builder functions each throw
`TraceSourceMismatchError` if handed a trace from the wrong source
(checked structurally, via presence/absence of `ProfileChunk` events — not
just by filename convention).

### Metric Source

| Metric | Source |
|---|---|
| Render Duration | Scenario `performance.now()` (not a trace at all) |
| Scripting | `cost-trace` |
| Rendering | `cost-trace` |
| Recalculate Style | `cost-trace` |
| Layout | `cost-trace` |
| Painting | `cost-trace` |
| Paint | `cost-trace` |
| Vue Runtime CPU | `runtime-attribution-trace` |
| Application CPU | `runtime-attribution-trace` |
| DevTools Overlay CPU | `runtime-attribution-trace` |
| V8/native CPU | `runtime-attribution-trace` |

## Fields

| Field | Meaning |
|---|---|
| **Metric** | Human name for what's being reported. |
| **Source** | `cost-trace` / `runtime-attribution-trace` / N/A (Render Duration only). No metric may be reported without one — see Dual-Trace Architecture above. |
| **Observed?** | `true` / `false` / `partial`. `false` means the underlying raw event never appeared in that trial — record this explicitly, never silently convert to a duration of `0`. `partial` means the event appeared (name matched) but had no usable `dur` field. |
| **Duration** | The value, in the stated unit — or literally `null` when Observed is `false`/`partial`. Never a placeholder `0`. |
| **Thread** | Which thread/process this measurement is scoped to (Main / Compositor / Raster / GPU-process / cross-thread — see `TRACE_ACCOUNTING.md` §4). "Cross-thread" metrics scoped only to Main are known-incomplete. |
| **Source Event** | The exact raw trace event `name` field(s) read, including any alias caveat. |
| **Accounting Rule** | `raw-direct` (single event's own `dur`, safe to read as-is), `raw-sum` (sum of same-named events — explicitly NOT a DevTools category total), `self-time-rollup` (self-time tree walk, implemented in `rollup.ts`), or `sample-attribution` (CPU-profiler sample bucketing by call-frame `url`, implemented in `attribution.ts`). |
| **Confidence** | `high` (direct field read, well-understood semantics), `medium` (raw-sum or single-trial, plausible but not fully isolated from contamination), `low` (known contamination or small n), `unavailable` (not yet reconstructable — do not report a number). |

## Metrics catalog (as of Final Calibration — see FINAL_CALIBRATION_REPORT.md)

All duration stats below: median [P25, P75] (min–max), n=10, from the Final
Calibration run (`results/cdp-trace/vue-3.5.40/update-5000/trial-0{1-10}/`).

### Render Duration (in-page `performance.now()`)

```
Source:          N/A (not a trace metric — read from the page's own DOM)
Observed:        true (all trials, every calibration round so far)
Duration:        11.7–22.7ms typical range this round (one outlier trial at
                  22.7ms); the 29–37ms cluster seen once in
                  PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md did NOT reproduce
                  in either the Instrumentation Isolation Test or the Final
                  Calibration — treated as unresolved session-level noise,
                  not a deterministic harness artifact (see
                  INSTRUMENTATION_ISOLATION_REPORT.md §8)
Thread:          N/A (JS timestamp read from the page's own script, not a trace event)
Source Event:    none — Scenario's own renderStartTime/renderEndTime via performance.now()
Accounting Rule: raw-direct
Confidence:      high — unaffected by trace-window contamination or which
                  trace source is active (it measures from click to
                  nextTick(), entirely inside the page)
```

### Layout

```
Source:          cost-trace
Observed:        true (10/10, Final Calibration)
Duration:        748.0us median [674.8, 788.8] (656–1882)
Thread:          Main (CrRendererMain)
Source Event:    "Layout"
Accounting Rule: raw-sum — safe: Mount contamination confirmed absent
                  (0/20 traces this round had dirtyObjects > 5000; see
                  FINAL_CALIBRATION_REPORT.md Gate A/B)
Confidence:      high
```

### Paint

```
Source:          cost-trace
Observed:        true (10/10, Final Calibration — was 2/10 in one earlier
                  round and 7-8/10 in others; observed-rate itself varies
                  run to run, root cause of the variance still not confirmed)
Duration:        152.5us median [110.0, 244.0] (103–3104) — when NOT
                  observed in a given trial/round, always recorded as
                  observed=false, duration=null, never 0
Thread:          Main (record event) — actual rasterization is on Raster
                  threads via RasterTask, not counted here
Source Event:    "Paint"
Accounting Rule: raw-sum
Confidence:      medium — event itself reads cleanly when present; why its
                  observed-rate varies between calibration rounds (2/10 to
                  10/10 across different sessions) is still an open question
```

### Recalculate Style

```
Source:          cost-trace
Observed:        true (10/10, Final Calibration)
Duration:        105.0us median [101.3, 110.8] (99–237)
Thread:          Main (CrRendererMain)
Source Event:    "UpdateLayoutTree"  (raw name — see TRACE_ACCOUNTING.md §3
                  for why this is NOT literally "RecalcStyle" in the JSON)
Accounting Rule: raw-sum
Confidence:      high
```

### Scripting

```
Source:          cost-trace ONLY. On a runtime-attribution-trace (CPU
                  profiler ON) this number is invalid — see Dual-Trace
                  Architecture above and INSTRUMENTATION_ISOLATION_REPORT.md.
Observed:        true (10/10, Final Calibration)
Duration:        23,176.5us median [21,764.3, 25,093.8] (20,768–35,531) —
                  now trustworthy: EvaluateScript's self-time in a
                  cost-trace lands within ~1,000-1,500us of its own
                  RunMicrotasks child (the real work), confirming
                  V8.InvokeApiInterruptCallbacks (the CPU-profiler-driven
                  contamination) is fully absent — measured as exactly
                  0.0us in all 10 Final Calibration trials
Thread:          Main only
Source Event:    self-time rollup over EvaluateScript/FunctionCall/
                  EventDispatch/RunMicrotasks/Timer* (confirmed subset,
                  see TRACE_ACCOUNTING.md §2)
Accounting Rule: self-time-rollup (scripts/cdp-trace/rollup.ts)
Confidence:      medium — algorithm correct and contamination-free on
                  cost-trace, but Main-thread-only self-time is still a
                  simpler measure than DevTools' full cross-thread Summary
                  computation, and this has not been visually cross-checked
                  against DevTools' own Performance panel UI (see original
                  PoC report — this Lab's tooling can't open that UI)
```

### Rendering

```
Source:          cost-trace ONLY (same restriction as Scripting above)
Observed:        true (10/10, Final Calibration)
Duration:        960.5us median [897.5, 1,706.3] (837–5,052)
Thread:          Main only
Source Event:    self-time rollup over ScheduleStyleRecalculation/
                  UpdateLayoutTree/Layout/PrePaint/InvalidateLayout/
                  Layerize/UpdateLayerTree/HitTest/ComputeIntersections
Accounting Rule: self-time-rollup
Confidence:      medium — same caveats as Scripting
```

### Painting

```
Source:          cost-trace ONLY (same restriction as Scripting above)
Observed:        true (10/10, Final Calibration)
Duration:        172.5us median [132.0, 282.8] (119–3,112)
Thread:          Main only — KNOWN UNDERCOUNT: RasterTask/CompositeLayers
                  run on Raster/Compositor threads, entirely excluded here
Source Event:    self-time rollup over PaintSetup/PaintImage/UpdateLayer/
                  Paint/RasterTask/Commit/CompositeLayers
Accounting Rule: self-time-rollup
Confidence:      low — cross-thread exclusion makes this a lower bound,
                  not a full Painting cost figure
```

### Vue Runtime CPU

```
Source:          runtime-attribution-trace ONLY. Never read from a
                  cost-trace — a cost-trace has no ProfileChunk events at
                  all (CPU profiler off), so this metric is structurally
                  unavailable there (buildRuntimeAttributionEvidence()
                  throws if called on one).
Observed:        true (10/10, Final Calibration)
Duration:        6,506.0us median [5,611.8, 7,037.0] (3,739–13,606)
Thread:          Main (CrRendererMain), via CPU profiler samples
Source Event:    Profile / ProfileChunk (disabled-by-default-v8.cpu_profiler),
                  leaf call-frame `url` matching `vue.runtime.esm-bundler-*.js`
Accounting Rule: sample-attribution (scripts/cdp-trace/attribution.ts) —
                  samples + timeDeltas decoded into real elapsed time per
                  bucket, not node counts
Confidence:      low, two confirmed reasons that still apply: (1) this
                  trace's own EvaluateScript/Scripting numbers are
                  contaminated by profiler overhead — some of that overhead
                  likely also biases sample distribution across buckets in
                  ways not yet quantified; (2) leaf-only attribution
                  undercounts Vue's true inclusive cost — native DOM
                  binding calls (setAttribute, set textContent) that Vue's
                  own runtime invokes get bucketed as V8/native CPU because
                  the leaf frame itself has no `url`, not walked up to the
                  nearest ancestor frame that does
```

### Application CPU

```
Source:          runtime-attribution-trace ONLY (same restriction as Vue Runtime CPU)
Observed:        true (10/10, Final Calibration)
Duration:        3,034.0us median [1,918.0, 4,130.5] (1,141–6,199)
Thread / Source Event / Accounting Rule: same as Vue Runtime CPU, matching
                  `src/scenarios/vdom-stress/VDomStressPage.vue`
Confidence:      low, same reasons as Vue Runtime CPU
```

### DevTools Overlay CPU

```
Source:          runtime-attribution-trace ONLY
Observed:        true (10/10, Final Calibration) — but measured as exactly
                  0.0us in every trial this round. In HARNESS_FIX_REPORT.md
                  Phase 5-B, this bucket was 27–35 of ~83 sampled nodes
                  (non-trivial). Not contradictory: `vite-plugin-vue-devtools`'s
                  overlay appears to only run its own reactive effects when
                  something (e.g. its panel UI) is actually active/dirty —
                  its absence here is not proof the contamination risk is
                  gone, only that it didn't trigger in this batch of trials.
Thread / Source Event / Accounting Rule: same as Vue Runtime CPU, matching
                  `virtual:vue-devtools-path:overlay/devtools-overlay.mjs`
Confidence:      low — presence is intermittent and not yet explained
```

### V8/native CPU

```
Source:          runtime-attribution-trace ONLY
Observed:        true (10/10, Final Calibration)
Duration:        45,697.5us median [40,893.5, 51,692.0] (36,861–123,691) —
                  BY FAR the largest bucket. This is expected and consistent
                  with everything found in this investigation: it catches
                  (a) genuine native DOM binding calls invoked BY Vue
                  (undercounting Vue Runtime CPU — see above), (b) the
                  CPU-profiler's own sampling overhead (the `(program)`
                  pseudo-frame catch-all — see HARNESS_FIX_REPORT.md Phase
                  5-B), and (c) any other V8-internal/native activity. This
                  bucket should NOT be read as "the browser's real native
                  cost" — it is mostly measurement artifact plus
                  undercounted Vue cost, not a clean number.
Thread / Source Event / Accounting Rule: same as Vue Runtime CPU
Confidence:      unavailable as a standalone figure — too heterogeneous to
                  interpret as one thing
```

## Rule for anything not in this catalog

Any metric not listed above that a future script produces from this
pipeline must be added here with all eight fields filled in — including
`Source` and `Observed?: false` / `Duration: null` cases — before it can be
cited in a Vue version comparison. A number with no `Source` or no
accounting-rule entry is not evidence. In code, this means going through
`scripts/cdp-trace/evidence.ts`'s builders (or extending them) — never
reading a raw trace duration directly into a report.
