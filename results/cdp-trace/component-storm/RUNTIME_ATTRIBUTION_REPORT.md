# Component Storm — Runtime Attribution Validation Report (Day 30)

**Task**: does Component Storm's already-observed `componentCount=500` /
`updateScope='AllChildren'` Average Update Duration improvement (Vue 3.5.40
187.405ms → Vue 3.6.0-rc.2 158.669ms, **-15.3%**, recorded via wall-clock
`performance.now()` in `src/scenarios/component-storm/README.md`) decompose
into Application JavaScript / Vue Runtime / Browser Rendering-Painting /
Other Browser cost? Does the trace evidence show a **reproducible** Vue
Runtime cost decrease, or is "Vue Runtime improved" an unproven inference
from the total duration alone? **Follow-up**: why did this validation's own
measurement not reproduce that -15.3% figure, and does that mean Vue 3.6
actually regressed?

This is the single consolidated report for both rounds of investigation —
the original CDP trace attribution matrix (Part 1) and the follow-up that
found the root cause of the harness disagreement (Part 2).

**Scope**: `componentCount=500`, `updateScope='AllChildren'` only (the
task's stated priority target). `ParentOnly`/`SingleChild` were NOT run —
extending the matrix to those scopes would require editing
`src/benchmarks/component-storm/config.ts` (a Scenario Freeze Rule file) and
was not necessary to answer the specific -15.3% attribution question asked.
Left as a Next Step.

---

# Part 1 — Runtime Attribution Validation

## 1.0 Infrastructure reused (no new methodology invented)

Per the Scenario Freeze Rule and the task's explicit instruction to reuse
existing CDP trace infrastructure rather than build a second one:

- `chrome.ts`, `tracer.ts`, `sync.ts`, `devserver.ts`, `parser.ts`,
  `rollup.ts`, `attribution.ts`, `evidence.ts`, `stats.ts` — reused
  **verbatim** (the Dual-Trace Architecture, self-time rollup, CPU-profiler
  sample-attribution, and Evidence contract are all unchanged from the
  vdom-stress Final Calibration / composable-chaos Day 24 Validation).
- `attribution.ts` — one **additive** edit: added
  `scenarios/component-storm/ComponentStormPage.vue`,
  `scenarios/component-storm/ComponentStormChild.vue`,
  `benchmarks/component-storm/metrics.ts`,
  `benchmarks/component-storm/createChildren.ts` to
  `APPLICATION_URL_FRAGMENTS` — same pattern already used to teach the
  decoder composable-chaos's files; no existing entry removed or changed.
- New, this validation: `component-storm-scenario.ts` (DOM adapter — sibling
  to `scenario.ts`/`composable-chaos-scenario.ts`, does not modify either),
  `run-component-storm-matrix.ts` / `run-component-storm-matrix-vue36.ts`
  (matrix runners, mirroring `run-validation-matrix.ts`'s frozen protocol),
  `analyze-component-storm.ts` (analysis, reusing
  `analyze-composable-chaos-version-compare.ts`'s `classify()` signal logic
  verbatim), `investigate-component-storm-visibility.ts` (Part 2's
  diagnostic — not part of the frozen matrix, see §2.1).
- `src/scenarios/component-storm/*` and `src/benchmarks/component-storm/*`:
  **untouched**. Verified via `git diff --stat` in the `vue-pain-lab-vue36`
  worktree (excluding `package.json`/`package-lock.json`): zero diff against
  `main`. `config.ts` on both sides already reads
  `componentCount: 500, updateScope: 'AllChildren'` — the Scenario's own
  existing frozen value, requiring **zero edits** for this validation's
  primary target.

## 1.1 Methodology

- Vue 3.5.40: this repo (`main`), dev server port 5173.
- Vue 3.6.0-rc.2: `vue-pain-lab-vue36` git worktree (confirmed via
  `npm list vue`), dev server port 5174, started/stopped out-of-band per the
  Process Management Rule (targeted PID only, never a bulk `taskkill`).
- Node.js v24.13.0, Vite 8.1.5, Chrome 152.0.7977.82 — identical on both
  sides.
- Per-trial protocol (single trigger, NOT batched — see
  `run-component-storm-matrix.ts` file header for why this differs from
  composable-chaos's batching): `Page.navigate` → `waitForAppReady` → assert
  `.params dl` reads `COMPONENT_COUNT=500`/`UPDATE_SCOPE=AllChildren` (fails
  loud on drift) → `waitForBrowserFrames(2)` → `[measurement: Tracing.start]`
  → ONE `fireTriggerUpdate` + `waitForUpdateComplete` →
  `[measurement: waitForBrowserFrames(2) → Tracing.end → save]`.
- WARMUP=3 (discarded) + MEASUREMENT=10 trials × 2 trace sources
  (`cost-trace`, `runtime-attribution-trace`) × 2 Vue versions = 40 measured
  trials, 60 total trigger cycles. All 40 measured trials succeeded on the
  first attempt — zero retries needed on either version.
- **Mount is out of scope** for this runner: unlike vdom-stress (Mount = the
  first "Trigger Render" click), Component Storm mounts all 500 children
  synchronously during Vue's own app-mount lifecycle, before any button
  exists — tracing it needs a different start-tracing-before-navigate
  protocol this task's specific ask didn't require. Documented, not silently
  dropped (see Next Step).

### ⚠️ This harness's absolute numbers do NOT match the README's wall-clock numbers

The README's Baseline/Validation was measured via `claude-in-chrome`
browser-extension automation, with the tab **staying hidden/backgrounded
the entire time** (`document.hidden === true`, explicitly recorded in the
README's own Validation Environment). This CDP-trace matrix instead launches
a **dedicated isolated headless Chrome instance** where the measured tab is
the only tab — a different harness. The two are **not directly comparable**:

|                       | README (claude-in-chrome, hidden tab, 100-click average of 3 trials) | This validation (isolated CDP, single click, n=10) |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Vue 3.5.40 median     | 187.405 ms                                                              | 84.9 ms                                              |
| Vue 3.6.0-rc.2 median | 158.669 ms                                                              | 92.1 ms                                              |
| Direction             | -15.3%                                                                  | **+8.5%**                                            |

This ~2x absolute gap is consistent with project memory
(`vue36_reactive_chain_validation`): a backgrounded/hidden tab can be
throttled by Chrome in ways that inflate measured durations independent of
Vue version. **Part 2 of this report tracks down exactly why**, with a
controlled experiment rather than just this general caveat.

## 1.2 Raw measurement summary

Per-trial raw CDP traces (`*.trace.json`) and metadata (`*.meta.json`) are
kept on local disk under
`results/cdp-trace/component-storm/vue-{version}/update-500-AllChildren/trial-NN/`
(gitignored per this repo's existing convention — see `.gitignore` and
commit `21cae00`'s precedent; regenerable via
`node scripts/cdp-trace/run-component-storm-matrix.ts` /
`run-component-storm-matrix-vue36.ts`, analyzable via
`node scripts/cdp-trace/analyze-component-storm.ts`).

Structural counters read from `.metrics dl` after every one of the 20
`cost-trace` trials (both versions, all 10 trials each): **Total Update
Count 1, Updated Component Count 500, Parent Render Count 2, Child Render
Count 500** — identical across all 20 trials and across both versions. This
directly answers Required Evidence items 7 and 8 (Component Render Count /
Updated Component Count): Vue 3.6 does not skip or change how many
components render for this Update Scope.

Update Duration (page's own `performance.now()`, read as `Average Update
Duration` after a single update — i.e. this trial's own duration, not a
running average, since `Total Update Count === 1` at read time):

|                | median  | P25–P75      | n   |
| -------------- | ------- | ------------ | --- |
| Vue 3.5.40     | 84.9 ms | 76.0–88.2 ms | 10  |
| Vue 3.6.0-rc.2 | 92.1 ms | 85.7–98.1 ms | 10  |

Δ% = **+8.5%**, paired-trial favor-3.6 = 4/10 → **Unstable** (frozen
classifier — IQR overlaps, direction not consistent across paired trials).

## 1.3 Attribution summary — Dual-Trace Architecture

Per `TRACE_EVIDENCE_SCHEMA.md` (reused verbatim, not re-derived): the SAME
trace cannot source both cost accounting and Vue Runtime CPU attribution.
Two structurally distinct traces per trial:

- **cost-trace** (CPU profiler OFF) → Scripting / Rendering / Painting
  (self-time rollup) + Layout / Recalculate Style / Paint (raw-sum).
  Confidence: high–medium.
- **runtime-attribution-trace** (CPU profiler ON) → Vue Runtime / Application
  / DevTools Overlay / V8-native CPU (CPU-profiler sample-attribution,
  bucketed by leaf call-frame `url`). Confidence: **low** for every bucket
  (leaf-only attribution undercounts Vue's true inclusive cost; V8/native is
  explicitly flagged "too heterogeneous to interpret as one thing").

`evidence.ts`'s structural guards (`assertNoCpuProfilerSamples` /
`assertHasCpuProfilerSamples`) ran on every one of the 40 loaded traces
without throwing — confirming each trace file actually is the source type
its filename claims, not just trusting naming convention.

### Does Vue Runtime attribution reliably decode from these traces?

**Yes, structurally** — every one of the 20 `runtime-attribution-trace`
files (10/version) contained `ProfileChunk` events and decoded into all four
buckets with `totalSamples > 0`; `bucketForUrl()` correctly matched this
Scenario's own files via the newly-added `APPLICATION_URL_FRAGMENTS` entries
(Application CPU is non-zero and distinct from Vue Runtime CPU in every
trial — see table below). So the pipeline CAN see "this is Vue's own bundle
vs. this is `ComponentStormPage.vue`/`ComponentStormChild.vue`" as separate
things.

**But the resulting numbers are not usable as a clean cost figure**, for the
same reasons already documented in TRACE_EVIDENCE_SCHEMA.md and now
reconfirmed here: total sampled time across all four buckets (357.8ms
Vue 3.5.40 / 509.8ms Vue 3.6.0-rc.2 — see Panel B of the chart) is **3–5x
larger** than the actual measured Update Duration (~85 / ~92ms) for the same
trials. The excess lands almost entirely in V8/native CPU (72.3% / 81.3% of
sampled time) — profiler overhead and unattributable native calls, not real
per-update browser cost. This is the same phenomenon vdom-stress's
calibration already found (V8/native "BY FAR the largest bucket... mostly
measurement artifact"), reconfirmed on a structurally different Scenario.

## 1.4 Vue 3.5.40 vs Vue 3.6.0-rc.2 — full comparison table

(median [P25,P75], n=10 per cell; Signal from the frozen `classify()`
— IQR-overlap gate + paired-trial favor-ratio, unchanged from
`analyze-composable-chaos-version-compare.ts`)

| Metric                | Source               | Confidence      | Vue 3.5.40              | Vue 3.6.0-rc.2          | Δ%     | paired favor 3.6 | Signal                                 |
| ---------------------- | -------------------- | --------------- | ------------------------ | ------------------------ | ------ | ----------------- | --------------------------------------- |
| Update Duration        | page timer           | high            | 84.9 [76.0,88.2] ms       | 92.1 [85.7,98.1] ms       | +8.5%  | 4/10              | Unstable                                |
| Scripting              | cost-trace           | medium          | 85.2 [81.1,90.0] ms       | 93.3 [89.7,97.0] ms       | +9.5%  | 3/10              | Unstable                                |
| Rendering              | cost-trace           | medium          | 108.5 [104.6,115.1] ms    | 113.3 [110.2,115.4] ms    | +4.5%  | 5/10              | Unstable                                |
| Recalculate Style      | cost-trace           | high            | 4.6 [4.2,4.8] ms          | 5.3 [4.9,5.7] ms          | +14.8% | 2/10              | Unstable                                |
| Layout                 | cost-trace           | high            | 82.0 [78.9,84.3] ms       | 85.1 [81.4,87.3] ms       | +3.8%  | 3/10              | Unstable                                |
| Painting               | cost-trace           | low             | 12.0 [11.0,13.3] ms       | 11.6 [11.5,12.6] ms       | -3.1%  | 6/10              | Unstable                                |
| Paint                  | cost-trace           | medium          | 22.8 [20.7,24.9] ms       | 22.1 [21.2,23.5] ms       | -2.9%  | 6/10              | **Stable / No Meaningful Difference**   |
| Vue Runtime CPU        | runtime-attribution  | low             | 70.1 [63.9,74.9] ms       | 73.4 [65.7,81.0] ms       | +4.7%  | 4/10              | Unstable                                |
| Application CPU        | runtime-attribution  | low             | 29.0 [26.1,32.6] ms       | 22.2 [17.7,25.2] ms       | -23.3% | 8/10              | Unstable                                |
| DevTools Overlay CPU    | runtime-attribution  | low             | 0.0 ms                    | 0.0 ms                    | n/a    | 0/10              | Unstable                                |
| V8/native CPU           | runtime-attribution  | **unavailable** | 258.8 [242.1,301.9] ms    | 414.2 [344.8,424.7] ms    | +60.1% | 0/10              | "Consistent Regression"\*               |

\* V8/native CPU's "Consistent Regression" label is the frozen classifier's
literal, mechanical output (v3.6 never beat v3.5 across all 10 paired
trials) — reported as-is for transparency, but per its own `unavailable`
confidence rating this bucket must **not** be read as evidence that
something in the browser got slower. It is the profiler-overhead/undercount
catch-all, confirmed heterogeneous in §1.3.

**Not one cost or attribution metric reaches "Consistent Improvement".**
The only metric reaching a clean signal at all (Paint) reaches "Stable / No
Meaningful Difference", not improvement.

Cost breakdown chart (Panel A: cost-trace category totals; Panel B:
CPU-attribution bucket proportions, with confidence/caveat callouts):
**https://claude.ai/code/artifact/155f8642-c9de-4b91-9a9f-34452736140c**

## 1.5 Answers (Part 1's original four questions)

### Q1 — Can the -15.3% be decomposed into Application JS / Vue Runtime / Browser Rendering-Painting / Other?

**Not as originally observed.** This validation's own harness does not
reproduce a -15.3% Update Duration improvement in the first place (see §1.1's
warning box — it shows +8.5%, classified Unstable). What CAN be reported is
this harness's OWN cost structure for the same Scenario/version pair:
Scripting 85.2→93.3ms, Rendering 108.5→113.3ms, Painting 12.0→11.6ms
(cost-trace, medium confidence); Vue Runtime CPU 70.1→73.4ms, Application CPU
29.0→22.2ms (runtime-attribution-trace, low confidence, see §1.3 for why the
absolute numbers there aren't trustworthy on their own). None of these
component totals individually explain a -15.3%-sized improvement, because
under this harness there is no such improvement to explain — Update Duration
itself moved the other direction (+8.5%, Unstable). **Part 2 explains why.**

### Q2 — Did Vue Runtime itself show a reproducible cost decrease?

**No.** Vue Runtime CPU: 70.1ms → 73.4ms median, **+4.7%** (higher, not
lower), Signal = Unstable (IQR overlaps, only 4/10 paired trials favor 3.6).
No reproducible decrease at any confidence level.

### Q3 — If Vue Runtime evidence is insufficient, say so explicitly

**目前無法歸因（insufficient evidence）** for Vue Runtime cost specifically.
The sample-attribution pipeline can structurally distinguish Vue's own
bundle from application code (§1.3), but (a) its own confidence rating is
`low` by the frozen Evidence contract, (b) the point estimate moves in the
opposite direction from "improvement" (+4.7%), and (c) the classifier finds
no consistent paired-trial signal. This validation does **not** conclude
"Vue Runtime got cheaper in 3.6.0-rc.2" — it concludes there is not enough
clean evidence to say either way, and what evidence exists points slightly
the other direction.

### Q4 — Compare cost structure, not just totals

See §1.4's full table. Cost-structure comparison, not total-duration
comparison: **every** category (Scripting, Rendering, Recalculate Style,
Layout, Vue Runtime CPU) trends _up_ in Vue 3.6.0-rc.2 under this harness,
Painting/Paint trend marginally down, and only Paint clears the bar for a
clean (non-improvement) signal. There is no category where Vue 3.6.0-rc.2
shows a clean, reproducible cost reduction.

---

# Part 2 — Follow-up: Why Did the Two Harnesses Disagree?

**Trigger**: after Part 1 reported Update Duration as 84.9→92.1ms (+8.5%,
Unstable) instead of the README's 187.4→158.7ms (-15.3%), the question was
asked directly: can the root cause of that gap be found, and does it mean
Vue 3.6 actually got _worse_?

## 2.1 Method

Not part of the frozen matrix — a targeted, throwaway diagnostic
(`investigate-component-storm-visibility.ts`) reusing
`component-storm-scenario.ts` verbatim, no Scenario code touched. Isolates
exactly one variable: `document.hidden`/`visibilityState`.

**Mechanism confirmed by direct CDP experiment**: opening a second tab via
`Target.createTarget` and calling `Target.activateTarget` on it flips the
_original_ tab's `document.visibilityState` to `'hidden'` — no window
minimize or OS focus trick needed, works identically in headless mode. This
gives a controlled, repeatable way to reproduce the README's background-tab
condition (`document.hidden === true`, via `claude-in-chrome`) instead of
relying on that extension's own automation.

Both Vue versions were measured under both conditions, 10 fresh single-click
trials each (same protocol as the Day 30 matrix minus CDP tracing — this
reads Vue's own `performance.now()`-based "Average Update Duration" text
directly, no `Tracing.start`/`stop` overhead in the loop):

- **visible**: `document.hidden === false` (Part 1's isolated-tab CDP matrix
  condition — what §1.2's numbers actually measured)
- **hidden**: `document.hidden === true` (the README's `claude-in-chrome`
  condition, reproduced under full CDP control)

## 2.2 Result

| Condition   | Vue 3.5.40 median | Vue 3.6.0-rc.2 median | Δ%         | IQR overlap | paired favor 3.6 | Signal (frozen classifier)             |
| ----------- | ----------------- | ---------------------- | ---------- | ----------- | ----------------- | ---------------------------------------- |
| **visible** | 35.0 ms            | 35.9 ms                 | **+2.4%**  | yes         | 5/10               | **Stable / No Meaningful Difference**    |
| **hidden**  | 177.3 ms           | 140.4 ms                | **-20.8%** | yes         | 7/10               | **Unstable**                             |

(README, for reference: 187.405 ms → 158.669 ms, **-15.3%**, `claude-in-chrome`.)

## 2.3 What this shows

1. **`document.hidden` is confirmed as the dominant variable**, not Vue
   version. The **hidden** condition reproduces the README's absolute
   magnitude almost exactly (177/140ms here vs. 187/159ms there) and its
   improvement _direction_ (-20.8% here vs. -15.3% there) — strong evidence
   that Chrome's background-tab CPU scheduling deprioritization (already
   documented in this Lab's own project memory from the reactive-chain
   scenario) is what the README's methodology was actually measuring, on
   top of whatever Vue-version effect exists.
2. **Under the clean, non-throttled condition (visible), the two versions
   are statistically indistinguishable** — median Δ +2.4%, and the exact
   same frozen classifier used throughout this Lab's CDP validations calls
   it "Stable / No Meaningful Difference." **This directly answers "did Vue
   3.6 get worse?" — no**: Part 1's own +8.5% reading was itself `Unstable`
   (not a confirmed regression, see §1.4), and this cleaner replication with
   the same protocol lands even closer to zero.
3. **Even the hidden condition's -20.8% is, formally, still `Unstable`** —
   not the clean "Consistent Improvement" the README's Result section
   implied. Both versions show enormous trial-to-trial spread once hidden
   (3.5.40 alone ranges 129.5–406.3ms, a >3x swing within one version, one
   version's OWN noise band is wider than the between-version gap being
   interpreted as a signal). This is consistent with (and does not
   distinguish between) two different explanations:
   - Background-tab CPU throttling genuinely interacts differently with Vue
     3.6's internal scheduling (a real but currently unquantifiable effect), or
   - Throttled/backgrounded measurement is dominated by non-deterministic
     OS-scheduler noise (competing host load, GC pause timing), and the
     -15.3%/-20.8% readings are this Lab's own automation noise landing on
     the "3.6 faster" side by chance, in the same way the reactive-chain
     scenario's project memory already found noise faking a 157.7%
     regression in the opposite direction.

   This validation cannot distinguish between those two — resolving it
   needs many more hidden-condition trials (n=30+) to see whether the
   -15~-21% band holds up against its own noise floor, which is out of
   scope here.

## 2.4 Raw data (Part 2)

10 trials/condition/version, read directly from the DOM (not trace-derived,
no raw trace files this round — see script for reproduction):

```
3.5.40 visible: 26.2, 20.3, 31.8, 24.8, 36.1, 34.0, 83.9, 91.0, 86.0, 86.3
3.5.40 hidden:  276.2, 136.6, 165.6, 135.3, 129.5, 204.0, 406.3, 154.2, 189.1, 283.9
3.6.0-rc.2 visible: 26.5, 20.8, 26.1, 23.0, 22.3, 45.3, 85.3, 78.9, 89.2, 74.0
3.6.0-rc.2 hidden:  165.5, 111.4, 119.2, 124.5, 148.9, 306.7, 126.3, 303.5, 131.9, 232.0
```

Note the **visible** series' own bimodal split (trials 1-6 low ~20-36ms,
trials 7-10 high ~74-91ms) — present in **both** versions at the same trial
index, so it is not a version effect. Not chased further here (candidate
cause: within-session heap growth across 10 navigations in one isolated
Chrome instance triggering a GC pause partway through — consistent with
this Lab's repeated prior finding that `performance.memory`/heap-driven
timing noise dominates at this scale), but worth flagging as yet another
noise source layered on top of the visibility effect.

### Reproduction

```
node scripts/cdp-trace/investigate-component-storm-visibility.ts
```

Requires both dev servers running (main repo :5173, `vue-pain-lab-vue36`
worktree :5174) — not spawned by this script itself, same Process
Management Rule rationale as `run-component-storm-matrix-vue36.ts`.

---

# Final Conclusion

- **Proven**: No.
- **Observed**: No reproducible improvement signal, in either direction, in
  the visible/foreground condition (Part 1's matrix, replicated in Part 2's
  visible condition: +2.4%, "Stable / No Meaningful Difference"). The
  hidden/backgrounded condition reproduces the README's -15.3%-scale
  direction (-20.8%) but is itself `Unstable` by the same classifier.
- **Insufficient Evidence**: **Yes — this is the correct verdict overall.**
  1. The cleanest, non-throttled measurement (visible, n=10/version, Part 2
     §2.2) shows the two versions are statistically indistinguishable.
  2. Every cost/attribution metric in Part 1's breakdown that could in
     principle explain a -15.3%-sized change is itself Unstable or
     explicitly low/unavailable confidence (§1.4).
  3. Vue Runtime CPU attribution — the metric most directly relevant to
     "did the Framework get faster" — shows a slightly _higher_, not lower,
     point estimate under the visible condition, with no statistically
     clean signal either way (§1.5 Q2/Q3).
  4. The README's -15.3% and Part 1's own +8.5% are both most plausibly
     explained by which harness/tab-visibility state was used (Part 2),
     not by competing claims about Vue itself — they were never measuring
     the same thing.

**Do not read this report as "Vue 3.6 made Component Storm's AllChildren
update slower," and do not read it as confirming the README's "Vue 3.6 made
it 15.3% faster" either.** The correct statement is narrower: **under the
cleanest available measurement (foreground, no background-tab throttling),
no metric shows a reproducible Vue-version effect in either direction** —
which is a different claim from "no effect exists." The README's own -15.3%
Improvement/Minor-improvement conclusion should be treated as **provisional,
pending a much larger hidden-condition sample** to determine whether that
signal survives its own noise floor (§2.3 point 3) — not confirmed, and not
superseded by this report either.

# Limitations

- **Harness mismatch with the README's own methodology** is the single
  biggest caveat behind Part 1 — resolved in Part 2 by directly reproducing
  the hidden condition, but the hidden condition itself remains noisy
  (Unstable) at n=10.
- n=10 single-trigger trials is a modest sample for ms-scale deltas this
  noisy (IQRs of 5-15ms on ~85-115ms medians in the visible condition, far
  wider once hidden); more trials would narrow but likely not eliminate the
  overlap given how close every Δ% is to the paired-favor 50/50 line.
- CPU-profiler sample-attribution's `low`/`unavailable` confidence ratings
  are inherited from vdom-stress's own calibration, not something this
  validation could improve — leaf-only attribution and profiler-overhead
  pollution are open problems in this pipeline, not specific to Component
  Storm.
- `3.6.0-rc.2` is a release candidate, not the formal release.
- `ParentOnly`/`SingleChild` were not traced (see Scope note at top).
- Mount was not traced (see §1.1).
- Part 2's bimodal visible-condition pattern (trials 1-6 vs 7-10) was
  observed but not root-caused (candidate: within-session heap growth / GC
  pause) — it affects both versions equally so doesn't change the
  conclusion, but is an unresolved thread.

# Next Step

1. If the README's -15.3% figure needs a definitive verdict, redo the CDP
   trace matrix (Part 1's protocol) **under the hidden condition** (using
   Part 2's `Target.activateTarget` mechanism) with a much larger n (20-30+)
   to see whether that band holds up against its own noise floor.
2. Increase Part 1's MEASUREMENT trials (e.g. n=20-30) in the visible
   condition too, to see whether any metric's IQR narrows enough to clear
   the classifier's overlap gate.
3. If Vue Runtime attribution confidence needs to improve beyond `low`,
   that requires walking up from leaf frames to the nearest URL-bearing
   ancestor (documented as a known undercount in `attribution.ts`'s header,
   not fixed here) — out of scope for this validation.
4. Consider tracing Mount (see §1.1) if a future task asks about the
   README's -8.7% Mount Time observation specifically.
5. Chase the bimodal visible-condition pattern (§2.4) if it recurs in a
   future run with a larger n — currently unexplained.
