# Trace Accounting — how raw CDP trace events become DevTools' Scripting / Rendering / Painting numbers

Phase 3 deliverable of the CDP Trace Measurement Calibration. Answers: which raw
trace events map to which DevTools concept, which can be measured directly,
which require roll-up, which can't be summed, and which metrics this
pipeline can't reconstruct yet.

**Source of truth used**: `front_end/panels/timeline/TimelineUIUtils.ts` and
`front_end/models/trace/Styles.ts` / `front_end/models/trace/types/TraceEvents.ts`
in [ChromeDevTools/devtools-frontend](https://chromium.googlesource.com/devtools/devtools-frontend/+/refs/heads/main/front_end/),
fetched from the `main` branch on 2026-08-09. **Version-skew caveat**: this is
tip-of-tree, not necessarily byte-identical to the DevTools frontend actually
bundled with the Chrome 151.0.7922.76 build used in this Lab's calibration
run. The category *names* and general architecture are stable across recent
Chrome versions, but exact event lists do drift — treat specific inclusions/
exclusions below as "true as of this research", not eternally fixed.

## 1. The category model

DevTools' Performance panel does not classify events by raw `cat` string.
Each event gets a **style** via `TimelineUIUtils.eventStyle()`, which looks
the event's `name` up in a static map (`eventStylesMap` in `Styles.ts`) and
falls back to category `other` if the name isn't in the map. That style
carries one category tag: `scripting`, `rendering`, `painting`, `loading`,
`gpu`, `async`, `other`, `idle` (a few more granular keys like `layout`/
`drawing`/`rasterizing` exist in the enum but weren't confirmed as
distinct from `rendering`/`painting` in the panel's visible groupings —
**open question**, not verified this round).

The Summary pie chart's "Scripting / Rendering / Painting / …" numbers come
from `TimelineUIUtils.aggregatedStatsForTraceEvent()`, which walks the
**nested event tree** for the selected range and accumulates **self time**
(an event's own duration minus the total duration of its children) into
each event's category bucket — not simple duration summation. This is the
core reason `sum(dur where cat = X)` over raw JSON is wrong: nested events
already have their time counted inside their parent's `dur`, so summing
both double-counts.

## 2. Event → category mapping (entries relevant to this Lab's traces)

Confirmed from `eventStylesMap` (raw event `name` → category):

| Raw event name | Category | Notes |
|---|---|---|
| `EvaluateScript` | scripting | top-level script/`eval` execution (includes our own CDP-injected `Runtime.evaluate` snippets — see §5) |
| `FunctionCall` | scripting | |
| `EventDispatch` | scripting | DOM event dispatch, e.g. our synthetic `click`/`change` |
| `TimerInstall` / `TimerRemove` / `TimerFire` | scripting | |
| `XHRReadyStateChange` / `XHRLoad` | scripting | not seen in this Scenario (no network calls) |
| `Compile` / `CompileCode` / `CompileModule` / `EvaluateModule` | scripting | |
| `ProfileCall` / `JSSample` | scripting | CPU-profiler-derived JS frames |
| `ParseHTML` / `ParseAuthorStyleSheet` | loading | |
| `ScheduleStyleRecalculation` | rendering | |
| **raw `UpdateLayoutTree`** (aliased internally to `RecalcStyle`, displayed as **"Recalculate Style"**) | rendering | see §3 — the alias, not a 1:1 raw-name match |
| `InvalidateLayout` | rendering | |
| `Layout` | rendering | |
| `Layerize` / `UpdateLayerTree` | rendering | |
| `PrePaint` | rendering | |
| `HitTest` / `ComputeIntersections` | rendering | |
| `Animation` / `AnimationFrame` (frame-lifecycle events) | rendering | mostly hidden/instrumentation events, `true` "hidden" flag on several |
| `PaintSetup` / `PaintImage` / `UpdateLayer` | painting | |
| `Paint` | painting | |
| `RasterTask` | painting | runs on a **Raster** thread (`CompositorTileWorker*`), not Main |
| `Commit` / `CompositeLayers` | painting | Commit runs on Main; CompositeLayers is Compositor-thread work |
| `RunTask` / `Program` / `StartProfiling` | other | scheduler bookkeeping |

## 3. The `UpdateLayoutTree` ↔ `RecalcStyle` alias — a naming trap for naive parsers

`TraceEvents.ts` defines `Name.RECALC_STYLE = 'RecalcStyle'`, and the
codebase itself documents this with a comment: the real Chrome trace event
is emitted as `'UpdateLayoutTree'`, and DevTools' newer trace engine aliases
it to `RecalcStyle`/"Recalculate Style" during ingestion — **not** in the
raw JSON. This Lab's own captured traces confirm the raw name empirically:
every "Recalculate Style" event in `results/cdp-trace/` shows up as
`"name": "UpdateLayoutTree"`, never `"RecalcStyle"`.

**Implication for `parser.ts`**: matching on raw event names must know this
alias explicitly (`extractMetric(events, ['UpdateLayoutTree'])`, with a
comment explaining why) — matching literally on `'RecalcStyle'` against raw
JSON will silently find nothing.

## 4. Thread / process scoping — Main ≠ Compositor ≠ Raster ≠ GPU

A single Scenario trigger's rendering work is **not** confined to one
thread. Confirmed from this Lab's own traces (`getThreadNames()` in
`parser.ts`):

| Thread name | Process | What runs there |
|---|---|---|
| `CrRendererMain` | Renderer process | Vue/JS execution, style recalc, layout, `Paint` (record), `Commit` |
| `Compositor` | Renderer process (same pid, separate thread) | frame scheduling, `CompositeLayers` |
| `CompositorTileWorker*` | Renderer process | `RasterTask` (actual pixel rasterization) |
| `CrGpuMain` / `VizCompositorThread` | separate GPU process | final compositing / swap |
| `CrBrowserMain` | Browser process (Chrome itself, not the page) | not page work at all — do not attribute to the Scenario |

A Summary/self-time computation scoped only to the Main thread's selected
range **will not include** Raster-thread or GPU-process work, which can
happen slightly later (rasterization is often deferred past the frame's
Main-thread commit). This is a plausible explanation for a gap this Lab
already noticed by hand: the `vdom-stress` README's Baseline Observation
recorded Mount N=5000 `Rendering = 251ms` but
`Recalculate Style (16.9ms) + Layout (218.8ms) = 235.7ms`, a 15.3ms
unexplained gap the README flagged as "not fully self-consistent". Missing
cross-thread/cross-process raster work is a plausible cause — **not
confirmed against that specific historical dataset in this round**, noted
here only as a candidate explanation worth checking next time.

## 5. What can be measured directly from raw events (no roll-up needed)

Single events with `ph: 'X'` (complete events, `dur` already computed by
Chrome) and no meaningful nested children of the same category can be read
directly: `Layout`, `Paint`, `UpdateLayoutTree` ("Recalculate Style"),
`RasterTask`, `CompositeLayers`. **Caveat**: "directly measurable" here means
the *event's own field* (`dur`) is trustworthy once you've found it — it
does **not** mean summing several same-named events in a trace window is
automatically correct. This Lab's calibration run found that summing all
`Layout` events in a trial can accidentally include a Layout pass that
belongs to a **different, preceding action** than the one being measured
(a harness bug, not a DevTools-accounting problem — see
`results/cdp-trace/calibration/CALIBRATION_REPORT.md` §Phase 2).

## 6. What must be rolled up (self-time tree walk) — not implemented here

The actual "Scripting: Xms / Rendering: Yms / Painting: Zms" totals DevTools
shows in its Summary tab require: build the nested-event tree per thread
(events ordered by `ts`, nested by containment), compute each event's self
time (`dur` minus sum of children's `dur`), then bucket self time by that
event's category. `parser.ts` / `analyze-calibration.ts` in this Lab do
**not** do this yet — every duration reported by this tooling so far is a
raw per-event `dur` or a raw sum of same-named events, explicitly labeled as
such, never presented as a DevTools category total.

## 7. What currently cannot be reliably reconstructed

- **DevTools category totals** (Scripting/Rendering/Painting/…, §6) — no
  self-time roll-up implementation exists yet.
- **Vue Runtime Cost as a single number** — see Phase 4 findings in
  `results/cdp-trace/calibration/CALIBRATION_REPORT.md`. The raw ingredients
  for this (CPU profiler samples with per-frame `url`) do exist in the
  trace and *can* distinguish Vue's own runtime bundle from application code
  from unrelated devtools-overlay code — but this Lab has not built or
  validated a decoder for the `Profile`/`ProfileChunk` sample stream, so no
  number is claimed.
- **A trustworthy "Update-only" Layout/Paint/Scripting number for this
  Scenario at N=5000** — see the CALIBRATION_REPORT's Phase 2 contamination
  finding: the current harness's trace window can bleed in leftover
  rendering work from the priming Mount step in most trials.
