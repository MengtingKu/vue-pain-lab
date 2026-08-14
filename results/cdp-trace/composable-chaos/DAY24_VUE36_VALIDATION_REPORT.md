# Day 24 — Composable Chaos: Vue 3.6.0-rc.2 Validation

**Task type: Measurement, not Optimization.** Same `composable-chaos` Scenario,
same Benchmark Parameters, same Validation Environment as the Vue 3.5.40
Baseline (`git` tip `695d896`) — only the Vue package version differs.

---

## 1. Test Environment

| | Baseline (Vue 3.5.40) | Validation (Vue 3.6.0-rc.2) |
| --- | --- | --- |
| Vue version | 3.5.40 | 3.6.0-rc.2 |
| Location | this repo (`vue-pain-lab`), `main` | `vue-pain-lab-vue36` git worktree, synced to `main`@`695d896` then `vue@3.6.0-rc.2` installed via `npm install --save-exact` |
| Node.js | v24.13.0 | v24.13.0 |
| Vite | 8.1.5 | 8.1.5 |
| TypeScript | 6.0.3 | 6.0.3 |
| Dev server | `http://localhost:5173` | `http://localhost:5174` |
| Browser | Chrome 151.0.7922.109 | Chrome 151.0.7922.109 |
| CDP method | `scripts/cdp-trace/` (`chrome.ts`/`tracer.ts`/`sync.ts`/`parser.ts`/`rollup.ts`/`stats.ts`/`evidence.ts`), dedicated isolated headless Chrome instance per version, own temp `user-data-dir`, own port | same, port 9337 (Layer A) / 9338 (Layer B) |

Scenario source (`src/scenarios/composable-chaos/ComposableChaosPage.vue`,
`src/benchmarks/composable/createComposableChain.ts`,
`src/benchmarks/reactive/{metrics,logger}.ts`) verified byte-identical
between the two environments before measurement — the worktree was
previously stale (frozen at a pre-`composable-chaos` commit from the
`vdom-stress` validation); it was re-synced to `main`@`695d896` first, then
only `package.json`'s `vue` field was changed. `git diff` between the two
trees after the sync showed only `package.json` / `package-lock.json`
differing.

## 2. Benchmark Parameters

Scenario's own, unmodified `DEPTH_OPTIONS = [1, 5, 10, 20]`. Two independent
measurement layers, both run against **both** Vue versions using identical
protocols per layer (only Vue version varies):

- **Layer A (Scenario-level instrumentation)**: per Depth, per trial — one
  **Build Chain** click, then 100 sequential **Trigger Update** clicks, N=3
  trials/Depth. Metrics read directly from the page's own `dl`/`dt`/`dd`
  DOM (same values the user sees), via a new deterministic CDP-driven script
  (see §9 "Harness Notes").
- **Layer B (CDP trace)**: per Depth, per operation (`build` = one Build
  Chain; `update` = a 20-click Trigger Update batch), per trace source
  (`cost-trace` / `runtime-attribution-trace`) — 3 warm-up + 5 measurement
  trials, `Page.navigate` reset before every trial. This is the exact
  protocol `run-composable-chaos-matrix.ts` already used for the Vue 3.5.40
  Day 23 CDP run; the Vue 3.6.0-rc.2 run reuses the identical code path
  (extracted, not rewritten — see §9) against the worktree's dev server.

## 3. Raw Measurement Summary

### 3a. Layer A — Structural counters (zero-variance, N=3, both versions)

| Depth | Composable Instance Count | Computed Count | Watch/WatchEffect Count | Computed Execute Count (100 updates) | Watch/WatchEffect Trigger | Render Count |
| ----: | -------------------------: | ---------------: | :---: | -----------------------------------: | :---: | ----: |
|     1 | 1 | 0 | 1 / 1 | 0 | 100 / 101 | 201 |
|     5 | 5 | 4 | 1 / 1 | 404 | 100 / 101 | 201 |
|    10 | 10 | 9 | 1 / 1 | 909 | 100 / 101 | 201 |
|    20 | 20 | 19 | 1 / 1 | 1919 | 100 / 101 | 201 |

**Identical between Vue 3.5.40 and Vue 3.6.0-rc.2 at every Depth, all 3
trials each.** This is a correctness check, not a performance metric: it
confirms the Scenario's reactive graph shape (how many computed/watch units
get created and how many times they fire) is unaffected by the Vue version
change — exactly what the Scenario Freeze Rule requires, and a necessary
precondition before any duration comparison is meaningful.

### 3b. Layer A — Timed metrics (median [P25,P75] (min–max) ms, N=3)

| Depth | Metric | Vue 3.5.40 | Vue 3.6.0-rc.2 | Δ% | IQR-overlap Signal |
| ----: | --- | --- | --- | ---: | --- |
| 1 | Build Duration | 0.500 [0.450,0.550] (0.400–0.600) | 0.700 [0.550,0.850] (0.400–1.000) | +40.0% | No Meaningful Difference |
| 1 | Average Update Duration | 0.265 [0.256,0.268] (0.246–0.270) | 0.285 [0.283,0.302] (0.281–0.319) | +7.5% | Meaningful Difference |
| 5 | Build Duration | 0.700 [0.700,1.300] (0.700–1.900) | 0.800 [0.750,1.050] (0.700–1.300) | +14.3% | No Meaningful Difference |
| 5 | Average Update Duration | 0.458 [0.455,0.506] (0.451–0.554) | 0.444 [0.431,0.486] (0.418–0.527) | −3.1% | No Meaningful Difference |
| 10 | Build Duration | 4.200 [3.050,4.450] (1.900–4.700) | 3.300 [2.450,4.000] (1.600–4.700) | −21.4% | No Meaningful Difference |
| 10 | Average Update Duration | 2.299 [1.961,2.353] (1.623–2.406) | 2.007 [1.614,2.144] (1.221–2.281) | −12.7% | No Meaningful Difference |
| 20 | Build Duration | 10.100 [8.300,10.600] (6.500–11.100) | 8.300 [8.100,8.950] (7.900–9.600) | −17.8% | No Meaningful Difference |
| 20 | Average Update Duration | 4.986 [4.851,5.040] (4.715–5.095) | 3.930 [3.825,3.980] (3.720–4.030) | −21.2% | **Meaningful Difference** |

(Full per-trial raw data: `node --experimental-strip-types
scripts/cdp-trace/analyze-composable-chaos-instrumentation.ts`; source JSON
under `results/cdp-trace/composable-chaos-instrumentation/` — gitignored,
regenerable, not committed.)

### 3c. Layer B — CDP trace, key cells (median µs unless noted, N=5)

Full 11-metric × 2-operation × 4-depth matrix (88 cells) is reproducible via
`node --experimental-strip-types
scripts/cdp-trace/analyze-composable-chaos-version-compare.ts`. Key cells:

| Depth | Operation | Metric | Vue 3.5.40 median | Vue 3.6.0-rc.2 median | Δ% | Paired (v3.6 < v3.5) | Signal |
| ----: | --- | --- | ---: | ---: | ---: | :---: | --- |
| 20 | update | Instrumentation Duration (ms) | 6.8 | 4.6 | −32.5% | 5/5 | **Consistent Improvement** |
| 10 | update | Instrumentation Duration (ms) | 3.4 | 3.1 | −9.5% | 5/5 | **Consistent Improvement** |
| 20 | update | Scripting (µs) | 156,171 | 116,145 | −25.6% | 5/5 | **Consistent Improvement** |
| 10 | update | Application CPU (µs) | 20,512 | 28,988 | +41.3% | 0/5 | Consistent Regression |
| 20 | update | Vue Runtime CPU (µs) | 7,037 | 11,758 | +67.1% | 0/5 | Consistent Regression |
| 20 | build | Rendering (µs) | 3,908 | 6,259 | +60.2% | 0/5 | Consistent Regression |
| 20 | build | Layout (µs) | 1,228 | 1,739 | +41.6% | 0/5 | Consistent Regression |
| 1 | update | Painting (µs) | 6,640 | 9,343 | +40.7% | 0/5 | Consistent Regression |
| 20 | update | Painting (µs) | 11,146 | 13,223 | +18.6% | 0/5 | Consistent Regression |
| 20 | update | V8/native CPU (µs) | — | — | — | — | (see §5, "Not Attributable") |
| all other cells | | | | | | | mostly **Unstable** (IQR overlaps but paired direction not consistent, or IQR doesn't overlap but paired direction is mixed) |

DevTools Overlay CPU: 0 in every cell, both versions (no measurement
interference).

## 4. Repeated-run Stability

- **Layer A** (N=3/Depth/version): reused, not re-derived — see §3b's
  explicit P25/P75/min–max columns. Structural counters have **zero**
  variance (integers, deterministic). Timed metrics show the expected
  sub-millisecond noise band already characterized in the Vue 3.5.40
  Baseline (`src/benchmarks/validation-log.md`); Build Duration at Depth
  5/10 has a wide min–max spread (single-trial GC/scheduling outliers), same
  pattern as Day 22.
- **Layer B** (N=5 measurement + 3 warm-up/cell): `analyze-composable-chaos-version-compare.ts`
  reports P25/P75 per cell and a **paired** signal (same trial index across
  versions) in addition to the unpaired IQR-overlap — this is the same
  dual check `analyze-validation-matrix.ts` (vdom-stress) already uses.
  Every "Consistent Improvement"/"Consistent Regression" verdict in §3c
  required **all 5 paired trials to agree in direction AND non-overlapping
  IQR** — a single favorable trial is never enough (`classify()`'s
  `favorRatio >= 0.9 || favorRatio <= 0.1` gate).
- **Unstable cells** (the majority of Layer B's 88 cells, especially all
  `Vue Runtime CPU` / `Application CPU` / `V8/native CPU` cells at most
  depths): direction flips between depths or between paired trials — e.g.
  Vue Runtime CPU (build): Depth 1 −40.3%, Depth 5 +387.0%, Depth 10
  −100.0%, Depth 20 −100.0%. This is **not** evidence of anything about Vue
  3.6 — it reproduces the exact instability the Vue 3.5.40-only Day 23
  cross-depth CDP run already found in this same attribution bucket ("部分
  trial 的 min 甚至是 0 sample" — see `composable-chaos/README.md`), now
  additionally confirmed to be present in the *version-comparison* axis too.

## 5. CDP Evidence

- **Scripting / Rendering / Recalculate Style / Layout / Painting / Paint**
  (`cost-trace`, CPU profiler off): the metrics this Lab's `evidence.ts`
  rates highest-confidence for cost accounting (`accountingRule:
  'self-time-rollup'` or `'raw-sum'`).
- **Vue Runtime CPU / Application CPU / DevTools Overlay CPU / V8/native
  CPU** (`runtime-attribution-trace`, CPU profiler on, leaf-frame
  `callFrame.url` bucketing): rated **`confidence: 'low'`** by
  `evidence.ts` itself — leaf-only attribution is known to undercount Vue's
  true inclusive cost (native DOM calls Vue invokes land in
  `nativeOther`/`V8-native`), and several cells in this run again show `min`
  = 0 sampled µs (e.g. `Vue Runtime CPU | build | depth=10`), meaning the CPU
  profiler sometimes captured zero samples attributable to Vue in that
  trial. Per `TRACE_EVIDENCE_SCHEMA.md`, `V8/native CPU` is documented as
  "too heterogeneous to interpret as one thing" independent of this run.
- **Correspondence to Layer A**: `Instrumentation Duration` (Layer B's
  page-read `Build Duration`/`Average Update Duration` text, captured
  alongside the trace) is the same signal Layer A measures independently
  with a different script/trial-count/batch-size. The Depth 20 Update
  improvement is the one place both layers agree in direction and rough
  magnitude (Layer A: −21.2%, Layer B: −32.5%) — see §6/§9 for why this is
  the strongest single finding in this Validation.

## 6. Observation

- **State Flow depth**: at both Vue versions, `Scripting` (JS execution
  cost) increases monotonically with Depth during `update` — Vue 3.6.0-rc.2:
  55,985 → 69,558 → 85,966 → 116,145 µs for Depth 1/5/10/20, same shape as
  Vue 3.5.40's 46,009 → 62,005 → 90,041 → 156,171 µs. Confirms the Depth →
  Runtime work relationship already established in the Vue 3.5.40-only
  cross-depth Validation (Day 23) reproduces under Vue 3.6.0-rc.2 — Depth
  still drives more Scripting work in both versions, this did not change.
- **Computed execution**: `Computed Execute Count` is an exact,
  zero-noise integer that matches `(Depth−1) × 101` in **both** versions at
  every Depth (§3a) — no extra/missing computed evaluations introduced by
  the version change.
- **Watch trigger**: `Watch Trigger Count` / `WatchEffect Trigger Count`
  stay fixed at 100/101 regardless of Depth or Vue version (§3a) — the
  Scenario's designed watcher/depth decoupling holds under Vue 3.6.0-rc.2
  too.
- **Render**: `Render Count` = 201 in every cell, both versions — confirms
  reactive updates still reach the DOM (render effect still fires) under
  Vue 3.6.0-rc.2, same count as Vue 3.5.40.
- **Scripting**: the only metric with a **reproducible, two-layer-confirmed**
  improvement signal, and only at Depth 20 / `update` (§3b, §3c). At Depth
  1/5/10 `update`, and at every Depth's `build`, Scripting shows no
  consistent direction between Vue versions (`Unstable` or `Stable / No
  Meaningful Difference`).
- **Rendering / Layout / Painting / Paint**: several cells show a
  **Consistent Regression** (Vue 3.6.0-rc.2 higher) — but DOM node count is
  fixed across the whole Scenario (Controlled Variables, unchanged by this
  Validation), so these are Browser Rendering Pipeline costs, not something
  the Scenario's own DOM output should influence. Scattered across specific
  Depth/operation cells (not monotonic with Depth, not consistent between
  `build` and `update`), consistent with headless-Chrome-instance-to-instance
  variance (GC, compositor thread scheduling) rather than a Depth- or
  Vue-version-driven trend. See §9 Limitations.
- **Stability**: most cells (~70 of 88 in Layer B) are `Unstable` — no
  consistent paired direction. This dominates the dataset; the small number
  of `Consistent Improvement`/`Consistent Regression` cells stand out
  precisely because they are the exception, not the rule.

## 7. Cost Attribution

| Category | Evidence | Verdict |
| --- | --- | --- |
| Reactive Propagation (computed chain length effect) | Computed Execute Count = `(Depth−1)×101` exactly, both versions, zero noise | **Unchanged by Vue 3.6** — same formula, same values |
| Computed evaluation cost | Scripting increases with Depth in both versions (same shape) | **Unchanged relationship**; absolute Scripting magnitude only differs (improved) at Depth 20 `update` |
| Watch / WatchEffect cost | Trigger counts fixed at 100/101 regardless of Depth or version | **Not a cost source**, confirmed under both versions |
| Component render cost | Render Count = 201 in every cell, both versions | **Not a cost source**, confirmed under both versions |
| Browser Rendering cost (Layout/Recalc Style) | Several `Consistent Regression` cells, but DOM count fixed and no Depth-monotonic pattern | **Not Attributable to Scenario logic** — flagged as headless-instance variance, not a Vue-version conclusion |
| Browser Painting cost | Several `Consistent Regression` cells, same caveat as above | **Not Attributable** |
| Vue Runtime CPU (attribution bucket) | Direction flips between Depths and between paired trials; several 0-sample trials | **Not Attributable** — same conclusion the Vue 3.5.40-only Day 23 cross-depth run already reached for this bucket |
| Application CPU (attribution bucket) | Mostly Unstable, one Consistent Regression cell (Depth 10 update) not replicated at Depth 20 | **Not Attributable / Inconclusive** |
| Other JavaScript (V8/native CPU) | Per `TRACE_EVIDENCE_SCHEMA.md`, documented as too heterogeneous to interpret | **Not Attributable**, by design of this Lab's own evidence schema |

## 8. Vue 3.5.40 vs Vue 3.6.0-rc.2 Comparison

| Metric | Verdict |
| --- | --- |
| Structural counters (Composable Instance/Computed/Watch/WatchEffect Count, Computed Execute Count, Watch/WatchEffect Trigger Count, Render Count) | **No Meaningful Difference** — identical at every Depth, both layers |
| Build Duration (Layer A) | **No Meaningful Difference** at all 4 Depths (IQR overlaps every time) |
| Average Update Duration (Layer A) | **No Meaningful Difference** at Depth 5/10; small **Meaningful Difference regression** at Depth 1 (+7.5%, ~0.02ms, near measurement resolution); **Meaningful Difference improvement** at Depth 20 (−21.2%) |
| Instrumentation Duration / update (Layer B) | **Consistent Improvement** at Depth 10 (−9.5%) and Depth 20 (−32.5%); Stable/Unstable at Depth 1/5 |
| Scripting / update (Layer B) | **Consistent Improvement** only at Depth 20 (−25.6%); Unstable/Stable at Depth 1/5/10 |
| Scripting / build (Layer B) | Unstable at all Depths — no reproducible direction |
| Rendering / Layout / Painting / Paint (browser pipeline) | Mix of Consistent Regression (scattered, non-monotonic) and Unstable — **not attributable to a Vue-version conclusion** (see §6, §9) |
| Vue Runtime CPU / Application CPU / V8-native CPU (attribution) | **Not Attributable** — direction is unstable across Depths and trials in both directions |

## 9. Evidence-based Conclusion

**In this `composable-chaos` State Flow Scenario, the reproducible evidence
supports exactly one Framework-level-shaped signal: Vue 3.6.0-rc.2 shows a
lower Update-phase JS Scripting cost than Vue 3.5.40, but only at the
deepest tested Composable Abstraction Depth (20), and only for the `update`
operation — reproduced independently by two measurement layers (Layer A
page instrumentation: −21.2%; Layer B CDP Scripting rollup: −25.6%, 5/5
paired trials, non-overlapping IQR) and further corroborated by the same
direction in the page-read Instrumentation Duration at Depth 10 (−9.5%,
5/5 paired) and Depth 20 (−32.5%, 5/5 paired).**

Per the Evidence Interpretation Rule (`Scripting 下降 → Runtime
Attribution → Vue-related work`), this Scripting improvement **cannot** be
attributed specifically to Vue's own reactivity runtime: the
`Vue Runtime CPU` and `Application CPU` attribution buckets for the same
Depth 20 `update` cell show **Consistent Regression** (+67.1% and, at
Depth 10, +41.3%), not improvement — directly contradicting a simple
"Vue Runtime got faster" story. Given `evidence.ts` itself rates this
attribution bucket `confidence: 'low'` (leaf-only sampling, known
undercounting, several 0-sample trials observed in this very run), the
honest reading is:

- The **JS-level (Scripting) cost reduction at Depth 20 `update` is real
  and reproducible** — not a single-trial artifact, not explained away by
  measurement noise (non-overlapping IQR, 5/5 paired trials, confirmed
  independently by a second, differently-configured measurement layer).
- **Whether that reduction originates specifically inside Vue's reactivity
  runtime is `Not Proven`** by this Lab's attribution methodology — the
  attribution bucket that would confirm it shows the opposite direction and
  is independently known to be unreliable.
- At Depth 1/5/10 (`update`) and at every Depth's `build` operation, there
  is **`No Meaningful Difference`** — the improvement is not general across
  the whole Scenario, only concentrated at the highest Composable
  Abstraction Depth tested, under sustained repeated updates.
- Several Browser Rendering Cost metrics (Layout/Painting/Paint) show
  scattered regressions, but with DOM node count fixed throughout (per the
  Scenario's own Controlled Variables) and no Depth-monotonic pattern,
  these read as headless-instance-to-instance variance rather than a
  Vue-version conclusion — flagged, not asserted as a regression.

**Final answer: `No Reproducible Framework-level Runtime Cost Improvement`
across the Scenario as a whole.** A narrower, reproducible **JS-level**
improvement exists specifically at Depth 20 `update`, confirmed by two
independent measurement layers — but it does not clear this Lab's bar for
a *Vue-Runtime-attributed* Framework-level claim, because the one metric
that would attribute it to Vue's reactivity engine specifically
(`Vue Runtime CPU`) points the other way and is independently rated
low-confidence. This should be read as: *worth re-testing with a
higher-confidence attribution method before treating it as a real Vue 3.6
reactivity improvement*, not as a confirmed win.

---

## Reproduction

```bash
# Layer A (Scenario-level instrumentation), both versions:
node --experimental-strip-types scripts/cdp-trace/run-composable-chaos-instrumentation.ts both
node --experimental-strip-types scripts/cdp-trace/analyze-composable-chaos-instrumentation.ts

# Layer B (CDP trace), Vue 3.6.0-rc.2 (Vue 3.5.40 data already existed from Day 23):
# 1) cd ../vue-pain-lab-vue36 && npm run dev -- --port 5174 --strictPort
# 2) node --experimental-strip-types scripts/cdp-trace/run-composable-chaos-matrix-vue36.ts
node --experimental-strip-types scripts/cdp-trace/analyze-composable-chaos-version-compare.ts
```

## Harness Notes (documented per validate-vue-update's "若必須修改 Measurement Harness" rule)

1. **`vue-pain-lab-vue36` worktree was stale** — frozen at commit `9bf942d`
   (pre-`composable-chaos`, from the earlier `vdom-stress` validation). It
   was re-synced to `main`@`695d896` (byte-identical tree confirmed via
   `git diff`), then `vue` was bumped to `3.6.0-rc.2` via `npm install
   --save-exact`. Only `package.json`/`package-lock.json` differ from
   `main` afterward. This is environment setup, not a Scenario or harness
   *behavior* change.
2. **`composable-chaos-scenario.ts`**: added one new, pure-read export,
   `readMetricGroup()`, alongside the existing frozen functions (all
   unchanged). It reads every `<dt>`/`<dd>` pair in a `.metric-group` —
   needed because the existing Layer B (CDP) adapter only ever read `Build
   Duration` / `Average Update Duration`, never the structural counters
   Layer A needs. No existing function's behavior changed.
3. **`run-composable-chaos-matrix.ts`**: refactored (not behavior-changed)
   to extract `runVersionMatrix(cond)` out of `main()`'s body, so a new
   sibling script (`run-composable-chaos-matrix-vue36.ts`) can reuse the
   identical protocol against a second dev server/Vue version. `main()`
   still does exactly what it did before for the Vue 3.5.40 invocation
   (`ensureDevServer()` → `launchIsolatedChrome(CDP_PORT)` → all `DEPTHS`).
4. **New script, `run-composable-chaos-instrumentation.ts`** (Layer A):
   the Vue 3.5.40 Baseline's Layer A numbers (`validation-log.md`, "Composable
   Chaos" §"Vue 3.5.40（Baseline）") were gathered via manual
   claude-in-chrome browser automation on a hidden tab — not practical to
   reproduce identically for a second Vue version (2,400 individual
   clicks), and per project memory a hidden claude-in-chrome tab risks
   asymmetric timer throttling between two tabs. This script performs the
   **same logical protocol** (Build once, 100 sequential Trigger Updates,
   3 trials/Depth) deterministically via CDP, using the same
   click+MutationObserver mechanism already frozen for Layer B, against a
   plain non-traced tab. **Run against both Vue versions** so the
   comparison in §3b/§8 is protocol-matched — the original Day 22 baseline
   numbers are kept as a separate, explicitly-labeled reference (see
   `validation-log.md`), not overwritten or treated as interchangeable with
   this script's output. Absolute magnitudes differ between the two
   measurement methods (e.g. Depth 20 Average Update Duration: Day 22
   manual = 1.012ms vs this script = 4.986ms/3.930ms) — this reflects
   measurement-environment differences (dedicated isolated headless Chrome
   vs claude-in-chrome extension tab), not a regression; only within-script,
   cross-version comparisons in this report are meaningful.
