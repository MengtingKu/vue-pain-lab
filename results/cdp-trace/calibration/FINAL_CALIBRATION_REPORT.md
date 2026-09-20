# Final Measurement Infrastructure Calibration — Dual-Trace Architecture

Formalizes and re-validates the CDP Trace Measurement pipeline for
`vdom-stress` as two distinct, non-interchangeable evidence sources. Scope
frozen per task: Vue 3.5.40, N=5000, Update, Warm-up=3, Measurement=10,
headless, `src/scenarios/vdom-stress/` untouched throughout. Raw data:
`results/cdp-trace/vue-3.5.40/update-5000/trial-0{1-10}/{cost-trace,runtime-attribution-trace}.{trace,meta}.json`.

## 1. Dual-Trace Architecture (formalized)

|             | `cost-trace`                                                          | `runtime-attribution-trace`                                                      |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Categories  | `TRACE_CATEGORIES_NO_CPU_PROFILER` (9)                                | `TRACE_CATEGORIES` (11, includes `disabled-by-default-v8.cpu_profiler{,.hires}`) |
| Valid for   | Scripting / Rendering / Recalculate Style / Layout / Painting / Paint | Vue Runtime / Application / DevTools Overlay / V8-native CPU attribution         |
| Invalid for | Vue Runtime attribution (no `ProfileChunk` events exist in it at all) | Scripting/cost accounting (`EvaluateScript` polluted by profiler overhead)       |

Enforced in code by `scripts/cdp-trace/evidence.ts`: `buildCostTraceEvidence()`
and `buildRuntimeAttributionEvidence()` each structurally check for the
presence/absence of `ProfileChunk` events and throw
`TraceSourceMismatchError` if handed the wrong trace — not just a naming
convention.

**Same trial, two traces, not one click measured two ways**: CDP's Tracing
domain only supports one active trace at a time. "Trial N" producing both
traces means the full reset → prime → frame-sync → trigger → observe cycle
runs twice for that trial index (`scripts/cdp-trace/run-final-calibration.ts`)
— once per category set. Both passes share identical Scenario, Node Count,
Operation, Trigger (`fireTriggerRender`/`waitForRenderComplete`), browser
synchronization (`waitForBrowserFrames`), and warm-up protocol; only the
trace category set differs. This is documented in each trial's own
`meta.json` (`pairingNote` field), not hidden.

## 2. Output Layout

```
results/cdp-trace/vue-3.5.40/update-5000/trial-01/
  cost-trace.trace.json          cost-trace.meta.json
  runtime-attribution-trace.trace.json   runtime-attribution-trace.meta.json
... trial-02 … trial-10 (same structure)
```

Source is unambiguous from both the filename and each `meta.json`'s
`source` field.

## 3. Gate Results

### Gate A — Harness Synchronization

Confirmed present in code (`scripts/cdp-trace/sync.ts` +
`run-final-calibration.ts`): `nextTick()` → `requestAnimationFrame` ×2 →
`Tracing.start()`, unchanged since the original fix, used identically for
both trace sources.

```
Gate A: PASS
```

### Mount Contamination

Checked `args.beginData.dirtyObjects`/`totalObjects` on every `Layout`
event across all 20 traces this round (both sources, all 10 trials):

```
Contaminated (dirtyObjects > 5000): 0 / 20
```

No Mount-scale (~25025) values reappeared in either trace source.

```
Gate: PASS
```

### Gate B — Cost Trace

From `cost-trace`, all 10 trials, via `buildCostTraceEvidence()`:

| Metric                                      | Observed | Median [P25, P75] (min–max), µs  |
| ------------------------------------------- | -------: | -------------------------------- |
| Layout                                      |    10/10 | 748.0 [674.8, 788.8] (656–1,882) |
| Recalculate Style (raw: `UpdateLayoutTree`) |    10/10 | 105.0 [101.3, 110.8] (99–237)    |
| Paint                                       |    10/10 | 152.5 [110.0, 244.0] (103–3,104) |

`UpdateLayoutTree` correctly read (not the alias `RecalcStyle`, which never
appears in raw JSON — see `TRACE_ACCOUNTING.md` §3). Paint was observed in
all 10 trials this round; when a future round has it missing, `evidence.ts`
records `observed: false, durationUs: null` — verified by code inspection
of `extractMetric()`, not just claimed (this is the same function used
throughout, already exercised with real absent-event cases in earlier
rounds).

```
Gate B: PASS
```

### Gate C — Scripting Accounting

```
V8.InvokeApiInterruptCallbacks self-time, cost-trace, all 10 trials: 0us (every trial)
EvaluateScript vs RunMicrotasks, cost-trace, all 10 trials:
  trial-01: EvaluateScript=23784us  RunMicrotasks=22658us  (Δ 1126us)
  trial-02: EvaluateScript=21798us  RunMicrotasks=21238us  (Δ 560us)
  trial-03: EvaluateScript=35899us  RunMicrotasks=34997us  (Δ 902us)
  trial-04: EvaluateScript=21039us  RunMicrotasks=20277us  (Δ 762us)
  trial-05: EvaluateScript=23405us  RunMicrotasks=22830us  (Δ 575us)
  trial-06: EvaluateScript=23521us  RunMicrotasks=23090us  (Δ 431us)
  trial-07: EvaluateScript=22665us  RunMicrotasks=22103us  (Δ 562us)
  trial-08: EvaluateScript=21328us  RunMicrotasks=20777us  (Δ 551us)
  trial-09: EvaluateScript=30384us  RunMicrotasks=29895us  (Δ 489us)
  trial-10: EvaluateScript=25905us  RunMicrotasks=24955us  (Δ 950us)
```

`V8.InvokeApiInterruptCallbacks` is 0µs in every single trial — reproduces
`INSTRUMENTATION_ISOLATION_REPORT.md`'s finding exactly. `EvaluateScript`'s
self-time now sits within ~400–1,200µs of its own `RunMicrotasks` child
(the real work) in every trial — no unexplained gap remains.

**Refinement worth recording**: cross-checking `rollup.ts`'s self-time
`Scripting` bucket specifically (not the raw `EvaluateScript` sum) between
profiler-ON and profiler-OFF traces from the Instrumentation Isolation Test
shows those two were already fairly close (~22,300–27,700µs ON vs.
~20,600–25,000µs OFF) — because `V8.InvokeApiInterruptCallbacks` isn't in
`rollup.ts`'s category map, its self-time was always bucketed into `other`,
never `scripting`, even before this fix. The dramatic contamination found
earlier was specifically in the **raw `EvaluateScript` duration** (used
directly in the "Main-thread JS events" diagnostic) and in the `other`
bucket, not in the self-time-rollup `Scripting` figure itself. `cost-trace`
still matters — it removes any residual ambiguity and makes the `other`
bucket's dominant, hard-to-interpret contributor disappear entirely — but
this nuance is recorded here for accuracy rather than overstating the fix's
effect on every metric equally.

```
Gate C: PASS
```

### Gate D — Runtime Attribution

From `runtime-attribution-trace`, all 10 trials, via
`buildRuntimeAttributionEvidence()` (`Profile`/`ProfileChunk` →
`samples`+`timeDeltas` decoded into real elapsed time, not node counts):

| Metric               | Observed | Median [P25, P75] (min–max), µs                |
| -------------------- | -------: | ---------------------------------------------- |
| Vue Runtime CPU      |    10/10 | 6,506.0 [5,611.8, 7,037.0] (3,739–13,606)      |
| Application CPU      |    10/10 | 3,034.0 [1,918.0, 4,130.5] (1,141–6,199)       |
| DevTools Overlay CPU |    10/10 | 0.0 (all trials)                               |
| V8/native CPU        |    10/10 | 45,697.5 [40,893.5, 51,692.0] (36,861–123,691) |

Decoding succeeded in all 10 trials, no parser failures. Four buckets
reliably separated via leaf `callFrame.url`. `V8/native CPU` remains the
dominant bucket by design — it absorbs the CPU profiler's own sampling
overhead (the `(program)` catch-all) plus native DOM binding calls Vue
itself invokes (leaf-only attribution's known undercount, from
`HARNESS_FIX_REPORT.md` Phase 5-B) — documented in
`TRACE_EVIDENCE_SCHEMA.md` as `confidence: unavailable` for that specific
bucket, not silently trusted.

```
Gate D: PASS (mechanism confirmed working; sub-bucket confidence
documented per-metric in TRACE_EVIDENCE_SCHEMA.md, not uniformly high)
```

### Gate E — Trace Isolation

Directly tested both cross-use guards in `evidence.ts`:

```
buildCostTraceEvidence(runtime-attribution-trace's events)
  → threw TraceSourceMismatchError: "...contains ProfileChunk events..." ✓
buildRuntimeAttributionEvidence(cost-trace's events)
  → threw TraceSourceMismatchError: "...no ProfileChunk events..." ✓
```

Both directions confirmed to fail closed, not silently produce numbers.

```
Gate E: PASS
```

### Gate F — Repeatability

All 10 trials, both sources (20 trace files, 20 meta files = 40 total):

```
Parser failures: 0 / 10
Layout observed: 10/10
Recalculate Style observed: 10/10
Paint observed: 10/10 (correctly would record observed:false/duration:null if absent — code path exercised in earlier rounds)
Mount contamination: 0/20 traces
Leftover isolated Chrome user-data-dirs after run: none
Leftover Chrome processes from this run: none (verified via tasklist diff)
```

```
Gate F: PASS
```

## 4. Measurement Infrastructure Status

| Metric                  | Status                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness Synchronization | **PASS**                                                                                                                                      |
| Mount Contamination     | **PASS**                                                                                                                                      |
| Cost Trace              | **PASS**                                                                                                                                      |
| Scripting Accounting    | **PASS**                                                                                                                                      |
| Rendering Accounting    | **PASS** (Main-thread-only self-time; documented, not a gap discovered this round)                                                            |
| Painting Accounting     | **PASS** (Main-thread-only, known undercount vs. Raster/Compositor work — documented `confidence: low`, mechanism itself functions correctly) |
| Vue Runtime Attribution | **PASS** (mechanism confirmed; per-bucket confidence varies, documented)                                                                      |
| Trace Isolation         | **PASS**                                                                                                                                      |
| Repeatability           | **PASS**                                                                                                                                      |

```
Overall Measurement Infrastructure: PASS
```

**What "PASS" means here, precisely**: every gate's underlying _mechanism_
is confirmed working, reproducible, and free of the specific contamination
bugs found during this investigation (Mount bleed-in, CPU-profiler
Scripting pollution). It does **not** mean every number above is a
publication-grade precise figure — several are explicitly `confidence:
low` or carry documented undercounts (Painting's cross-thread exclusion,
Vue Runtime CPU's leaf-only-attribution undercount). `TRACE_EVIDENCE_SCHEMA.md`
is the source of truth for which specific number can bear how much weight;
"Overall PASS" means the pipeline producing those numbers is trustworthy
enough to build a Vue 3.5 vs 3.6 comparison on top of, not that every
number is beyond dispute.

## 5. Known Open Item Not Covered by These Gates

**Render Duration instability** (first raised in
`PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md` Phase 5.5): a 29–37ms cluster was
observed once, in one calibration round, sitting apart from a 8–17ms
baseline. This Final Calibration's own 10 measurement trials
(`cost-trace.meta.json`'s `renderDurationMs`) show the same kind of
bimodal pattern, not a clean single-cluster range: values span 12.0–35.5ms,
with trials 1–4 falling within 12.0–18.1ms and trials 5–10 within
26.5–35.5ms (median 26.5ms). This distribution is retained as observed
measurement behavior, not smoothed over as one outlier — the two groups
are close in size (4 vs 6 trials), so neither reading is a lone anomaly
against an otherwise-uniform baseline. This is **not one of the nine gates
above** and is not treated as blocking this Overall verdict, per the gates
as explicitly defined for this phase — but it is carried forward,
unresolved, as a separate open question. Recommend: if a future Vue 3.5 vs
3.6 run shows an unexplained subset of trials with substantially different
Render Duration than the rest, do not attribute it to a Vue version
difference without first checking whether it matches this known,
still-unexplained pattern.

## 6. Answer to This Phase's Only Question

> 我們現在是否已經有一個足夠乾淨、可重複、可解釋的 Measurement Infrastructure，
> 可以公平回答 Vue 3.5 vs Vue 3.6？

**Yes, for the metrics and confidence levels documented in
`TRACE_EVIDENCE_SCHEMA.md`.** The pipeline now: (1) does not let one
Scenario action's rendering work bleed into another's trace window
(Mount contamination, fixed and re-verified 0/20 this round); (2) does not
let measurement-harness mechanics show up as if they were Scripting cost
(trigger/observation separation + dual-trace architecture, both confirmed);
(3) keeps cost accounting and Vue Runtime attribution as two structurally
separate, non-conflatable evidence sources, enforced by code, not just
convention. The one remaining open item (Render Duration instability) is
disclosed, not blocking per the gates defined for this phase, and should
be watched for — not silently trusted — in the next round.
