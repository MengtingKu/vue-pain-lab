# Instrumentation Isolation Test — H-Instrumentation

## 1. Experiment Hypothesis

```
H-Instrumentation: disabled-by-default-v8.cpu_profiler sampling/interrupt
instrumentation is a material cause of V8.InvokeApiInterruptCallbacks'
large self-time inside EvaluateScript.
```

Raised after `PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md` falsified the prior
hypothesis (`Runtime.evaluate({awaitPromise:true})` polling) — removing
`awaitPromise` did not remove the contamination, and trace-through showed
`V8.InvokeApiInterruptCallbacks` starting at the very beginning of
`EvaluateScript`, before any injected script statement runs.

## 2. Fixed Conditions

Identical across both runs: Vue 3.5.40, Node Count = 5000, Operation =
Update, Warm-up = 3, Measurement = 10, headless, same Scenario (untouched),
same Trigger (`fireTriggerRender`), same Observation
(`waitForRenderComplete` via `Runtime.bindingCalled`), same reset (fresh
`Page.navigate` per trial), same browser launch flags, same
`waitForBrowserFrames(2)` Mount-contamination fix. **Only variable changed**:
`tracer.ts`'s `TRACE_CATEGORIES` (11 categories) vs
`TRACE_CATEGORIES_NO_CPU_PROFILER` (9 categories — same list minus
`disabled-by-default-v8.cpu_profiler` and `.hires`).

Two separate isolated Chrome launches (fresh temp profile each), run
back-to-back in one script execution
(`scripts/cdp-trace/run-instrumentation-isolation.ts`).

Raw data:
`results/cdp-trace/calibration/instrumentation-isolation/{profiler-on,profiler-off}/vue-3.5.40/update-5000/trial-0{1-10}.{trace,meta}.json`

## 3. Run A — CPU Profiler ON (control)

| Metric | Median | P25 | P75 | Min | Max |
|---|---:|---:|---:|---:|---:|
| Render Duration (ms) | 13.3 | 13.0 | 13.7 | 12.1 | 14.2 |
| Trigger duration (ms) | 66.34 | — | — | 60.50 | 153.08 |
| EvaluateScript (µs) | 65,128.5 | 61,825.8 | 73,935.3 | 59,225 | 151,937 |
| V8.InvokeApiInterruptCallbacks (µs) | 39,587.5 | 36,755.8 | 48,044.8 | 35,318 | 126,415 |
| RunMicrotasks (µs) | 23,740.0 | 23,445.8 | 25,839.8 | 22,952 | 28,921 |
| Layout (µs) | 793.0 | 0.0* | 918.5 | 0 | 1,629 |
| Recalculate Style (µs, raw: `UpdateLayoutTree`) | 135.5 | 117.3 | 176.3 | 106 | 460 |
| Paint | observed 8/10 (2/10: observed=false, duration=null) | | | | |

\* One trial's Layout event matched by name but had no readable `dur` — contributes 0 to the sum, not a true zero-duration Layout; consistent with the "observed=true, duration=null" handling used throughout this Lab's tooling.

## 4. Run B — CPU Profiler OFF

| Metric | Median | P25 | P75 | Min | Max |
|---|---:|---:|---:|---:|---:|
| Render Duration (ms) | 13.8 | 12.7 | 14.3 | 12.0 | 15.8 |
| Trigger duration (ms) | 25.63 | — | — | 22.01 | 30.02 |
| EvaluateScript (µs) | 23,393.5 | 21,763.3 | 25,112.0 | 20,878 | 25,266 |
| V8.InvokeApiInterruptCallbacks (µs) | **0.0** | 0.0 | 0.0 | 0 | 0 |
| RunMicrotasks (µs) | 22,716.5 | 21,187.3 | 24,294.3 | 20,427 | 24,729 |
| Layout (µs) | 764.0 | 728.0 | 994.8 | 0* | 1,526 |
| Recalculate Style (µs) | 103.5 | 102.3 | 144.3 | 99 | 243 |
| Paint | observed 7/10 (3/10: observed=false, duration=null) | | | | |

\* Same caveat as Run A — one trial matched by name with no readable `dur`.

## 5. Median / IQR Comparison (Δ%, negative = lower in profiler-off)

| Metric | Run A median | Run B median | Δ% |
|---|---:|---:|---:|
| Render Duration | 13.3ms | 13.8ms | +3.8% |
| Trigger duration | 66.34ms | 25.63ms | **−61.4%** |
| EvaluateScript | 65,128.5µs | 23,393.5µs | **−64.1%** |
| V8.InvokeApiInterruptCallbacks | 39,587.5µs | 0.0µs | **−100.0%** |
| RunMicrotasks | 23,740.0µs | 22,716.5µs | −4.3% |
| Layout | 793.0µs | 764.0µs | −3.7% |
| Recalculate Style | 135.5µs | 103.5µs | −23.6% |

## 6. V8.InvokeApiInterruptCallbacks Comparison

**Complete elimination, not just reduction**: 39,587.5µs median (range
35,318–126,415µs) in Run A → **exactly 0.0µs in all 10 trials** of Run B —
the event does not appear at all when the CPU-profiler category is removed.
This is as clean a confirmation as a controlled trace comparison can give:
one category flag toggled, one event category's self-time going from
consistently tens-of-milliseconds to a literal, universal zero.

## 7. EvaluateScript Comparison

Run A's `EvaluateScript` (median 65,128.5µs) vs. its own `RunMicrotasks`
child (median 23,740.0µs) leaves ~41,000µs unaccounted for — almost
entirely `V8.InvokeApiInterruptCallbacks`. Run B's `EvaluateScript` (median
23,393.5µs) is now **almost exactly equal to** its own `RunMicrotasks`
(median 22,716.5µs) — a ~677µs difference, i.e. `EvaluateScript`'s self-time
now correctly represents real work (the click dispatch + Vue's reactive
flush), not harness/instrumentation overhead. This is the single strongest
piece of evidence in this report: removing the CPU profiler category makes
`EvaluateScript`'s self-time collapse down to just its real nested work.

## 8. Render Duration Stability Comparison

**Inconclusive by design, not by data quality**: Run A (profiler ON — same
categories as the run that showed a 29–37ms cluster in
`PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md`) did **not** reproduce that
cluster this session — all 10 trials sit in a tight 12.1–14.2ms band, and
Run B is similarly tight (12.0–15.8ms). Both conditions are stable and
close to each other (+3.8% median, well within normal trial-to-trial
noise). This means the experiment **cannot test** "does removing the
profiler make the cluster disappear", because the cluster the hypothesis
was meant to explain did not appear in either condition this time. This is
itself informative: it suggests the earlier Render Duration instability is
**not deterministically reproducible under identical categories/code**, and
is more likely session-level environmental noise (background system load,
scheduling variance, etc.) than something tied to a fixed code path or
trace-category configuration. Not confirmed either way — flagged as a
separate, still-open question.

## 9. Decision

```
H-Instrumentation = PARTIALLY SUPPORTED
```

- **Scripting/EvaluateScript contamination**: fully explained and resolved
  by this test. `V8.InvokeApiInterruptCallbacks` is the CPU-profiler
  category's own sampling/interrupt mechanism, confirmed by complete
  elimination (39,587.5µs → 0.0µs) when that single category is removed.
  This is not a partial or ambiguous result — treat this component as
  **SUPPORTED**.
- **Render Duration instability**: **untested this round**, not
  "confirmed persisting" and not "confirmed resolved" — the phenomenon the
  original hypothesis needed to explain simply did not occur in this
  session's control run, so no comparison could be made. This does not
  match either "Case A" or "Case B" as literally written (both assume the
  cluster appears in the profiler-ON control); the honest label for the
  overall hypothesis is therefore **PARTIALLY SUPPORTED** — confirmed for
  the mechanism it directly explains, open for the one it was also asked
  to explain.

Per the Decision Rule: **do not treat CPU-profiler-ON Scripting/EvaluateScript
numbers as valid Browser/Framework cost evidence** — this is now fully
substantiated, not just a precaution. The Render Duration instability
requires separate investigation (e.g. repeated back-to-back sessions under
identical conditions to establish whether it's truly session-level noise,
independent of anything this Lab's harness or trace configuration
controls).

## 10. Recommendation for Final Measurement Architecture

Two trace configurations are needed for different purposes, not one:

1. **Clean Scripting/Rendering/Painting self-time accounting**
   (`TRACE_CATEGORIES_NO_CPU_PROFILER`) — use this for any future
   `rollup.ts` self-time totals or Render/Layout/Paint cost comparisons.
   `EvaluateScript` in this configuration is directly trustworthy as
   real work.
2. **Vue Runtime Attribution** (`TRACE_CATEGORIES`, profiler ON) — still
   required for Phase 5-B/5.6's `Profile`/`ProfileChunk` sample decoding,
   since that mechanism needs the CPU profiler active. When used for this
   purpose, `EvaluateScript`/Scripting self-time numbers from the SAME
   trace must be treated as contaminated by the profiler's own overhead —
   do not mix "attribution" and "self-time cost" conclusions from one
   profiler-ON trace.

Concretely: a future Vue 3.5 vs 3.6 Validation that wants both Browser
Rendering Cost (Layout/Paint/Recalculate Style/Scripting self-time) AND Vue
Runtime Attribution needs **two separate trace captures per trial** (one
per category set), not one trace serving both purposes — this is a real,
now-confirmed constraint on the measurement architecture, not a
convenience choice.

The Render Duration instability question remains open and should be
investigated independently (not conflated with the profiler question)
before it's ruled either a genuine environmental artifact or something
still worth chasing in the harness.
