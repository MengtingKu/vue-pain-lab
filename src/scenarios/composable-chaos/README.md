# Composable Chaos

## Scenario Purpose

這個 Scenario 屬於 WP5：Composable Explosion。

實務上一個中大型 Vue 專案的 composable 常常會疊很多層：`useForm()` 內部呼叫
`useFormField()`，`useFormField()` 內部呼叫 `useValidation()`，`useValidation()`
內部又呼叫 `useFormatting()` ……疊到後來，一個畫面上顯示的值可能是經過 10 幾層
composable 才算出來的。

這個 Scenario 想驗證的不是「composable 好不好用」，而是：

**Composable abstraction 增加時，是否會伴隨額外的 Reactive Runtime Cost？**

## Research Question

Composable Abstraction Depth（巢狀 composable 呼叫的層數）增加時：

1. Reactive Runtime Cost（computed 執行次數、update duration）是否也跟著變高？
2. 還是只有「建立這條 chain」本身變貴，之後每次 update 的成本其實跟 depth 無關？
3. Composable 疊越深，是不是代表 watcher 數量也會跟著變多？

## Hypotheses

**不預設 composable 越多一定越慢。** 這個 Scenario 要分開檢驗三個可能：

- H1（Build 變貴，Update 不變）：depth 越深，Build Duration 越長（更多 function
  call、更多 reactive primitive 要建立），但因為 watch / watchEffect 全程只掛在
  最外層一次（不隨 depth 增加），Update Duration 只跟「computed chain 有多長」有關，
  跟「這條 chain 是用幾層 composable function 包出來的」無關。
- H2（Composable 呼叫本身有額外成本）：在相同的 computed chain 長度下，用巢狀
  composable function call（本 Scenario）建出來的 chain，比用單一迴圈直接建
  computed（`reactive-chain` scenario）多出可觀測的額外成本（多出來的 call stack
  frame、closure 建立）。
- H3（Composable 只是語法糖，沒有額外 Runtime Cost）：本 Scenario 的
  Update Duration / Computed Execute Count 與 `reactive-chain` 在相同 depth 下
  的數字接近，代表「包幾層 function」本身不是 Vue Reactive Runtime 的成本來源，
  真正的成本永遠來自「建立了幾個 reactive primitive」與「更新時要重新計算幾次」。

三個假設不互斥，本 Scenario 提供的數字用來判斷哪一個（或哪幾個）成立。

## Controlled Variables

以下變數在所有 Depth 之間保持完全固定：

- **DOM Node Count**：畫面上永遠只有固定的幾組 `<dl>`/`<dt>`/`<dd>` 與一個
  `<p>{{ finalValue }}</p>`，不會因為 depth 增加而多長出任何 DOM 節點。
- **Component Count**：整個 Scenario 只有 `ComposableChaosPage` 這一個元件，
  never mount/unmount。切換 depth 或重建 chain時，元件本身不會被銷毀重建，
  改變的只是元件內部持有的 composable chain 實例。
- **Watcher 數量**：不論 depth 是 1 還是 20，永遠只建立 1 個 `watch()` 與 1 個
  `watchEffect()`，掛在 chain 最上層，不隨 depth 逐層增加。
- **Update 觸發方式**：永遠是 `source.value++`，只動最底層那顆 ref。
- **CSS / Layout**：無額外樣式差異，各 Depth 共用同一份 `<style scoped>`。

## Independent Variable

**Composable Abstraction Depth**：`useLayerN()` 巢狀呼叫的層數，可選
`1 / 5 / 10 / 20`。

```
Depth 5

ComposableChaosPage
    ↓
useLayer5()
    ↓
useLayer4()
    ↓
useLayer3()
    ↓
useLayer2()
    ↓
useLayer1()  ← 建立整條 chain 唯一的 ref
```

每一層 `useLayerN()` 都是一次真正的 function call，並且恰好建立 1 個 reactive
unit：

- Layer 1：1 個 `ref`（chain 的起點，也是 `triggerUpdate()` 唯一會動的值）
- Layer 2 以上：1 個 `computed`（值 = 上一層的值 + 1）

所以 `composableInstanceCount === computedCount + 1 === depth`（除了
`depth === 1` 時沒有任何 `computed`，`computedCount === 0`）。這個 1:1
對應是刻意設計的，用來跟 `reactive-chain`（同樣長度的 computed chain，但用
`for` 迴圈直接建立、完全沒有巢狀 composable 呼叫）對照，藉此拆解「Composable
呼叫層數」跟「Reactive primitive 數量」這兩個平常會被混在一起看的變數。

## Metrics

畫面分成 Build Phase 與 Update Phase 兩組，避免把「建立 chain 的成本」跟
「後續更新的成本」混在同一組數字裡：

### Build Phase（structural，只在按下 Build Chain 時 increment 一次）

- `composableInstanceCount` — 這一輪總共呼叫了幾次 `useLayerN()` / `useLayer1()`
- `computedCount` — 這一輪總共建立了幾個 `computed()`
- `watchCount` — 這一輪建立了幾個 `watch()`（固定 1）
- `watchEffectCount` — 這一輪建立了幾個 `watchEffect()`（固定 1）
- `buildDuration` — 從呼叫 `createComposableChain()` 到 Vue 完成這次
  re-render（`await nextTick()` resolve）的 wall-clock 時間

### Update Phase（execution，每次 Trigger Update 都會變動）

- `computedExecuteCount` — 累計 computed getter 實際執行（含重新計算）的次數
- `watchTriggerCount` — 累計 watch callback 被呼叫的次數
- `watchEffectTriggerCount` — 累計 watchEffect callback 被呼叫的次數
- `renderCount` — 累計元件 `onUpdated` 觸發次數
- `Total Update Count` / `Average Update Duration` — 累計觸發次數與平均每次
  `source.value++` → `await nextTick()` 完成的時間

## What This Scenario Does NOT Measure

- **不測量純粹的「函式呼叫開銷」**：`Build Duration` 混合了「N 層 function
  call」「N 個 reactive primitive 建立」與「Vue 首次 render 這個 chain」三種
  成本，不是單獨的 Composable Abstraction Cost。要單獨量到「只有巢狀 function
  call、完全没有 reactive 行為」的成本，需要另外設計一個不建立任何 `ref` /
  `computed` 的對照組（本輪刻意不做，因為題目要求是 Reactive Runtime Cost，
  不是純 JS 呼叫開銷）。
- **不測量 Browser Rendering Cost**：`await nextTick()` 只等 Vue 的 render
  effect flush 完成、DOM 已寫入，不等瀏覽器之後的 Recalculate Style / Layout /
  Paint。要測這些需要另外搭配 `requestAnimationFrame` 或 CDP Tracing（可參考
  `scripts/cdp-trace/`），本輪不做。
- **不測量大量 DOM 渲染成本**：DOM 節點數全程固定，這個 Scenario 刻意不像
  `vdom-stress` 那樣讓 DOM 節點數隨參數增加，因為研究問題是 Reactive Runtime，
  不是 Browser Rendering Pipeline。
- **不測量多元件情境**：整個 Scenario 只有一個 Component，不像
  `component-storm` 那樣讓 Component Count 變動。

## Validation Constraints

- 不引入任何效能優化（`shallowRef` / `markRaw` / `v-memo` / `v-once` /
  debounce / throttle / memoization）。這些不是目前的實驗變數。
- 不使用 Vue 私有 API 或 experimental API，只用穩定的 Composition API
  （`ref` / `computed` / `watch` / `watchEffect` / `nextTick`），確保之後
  Vue 3.5 / 3.6 比較時，程式碼本身不會是變因。
- Depth 切換不會自動觸發重建：必須明確點擊 **Build Chain**，避免 UI 綁定本身
  （例如用 `watch(selectedDepth, ...)` 自動 rebuild）變成一個隱藏的、會混進
  Reactive Graph 裡的 instrumentation watcher。
- `composableInstanceCount` 這類計數器用「plain counter increment」實作
  （`metrics.increment(...)`），不是額外掛 `watch()` 去監控被測量的 reactive
  graph——後者會改變 Reactive Graph 本身，違反 Instrumentation Rule。
- Metrics 收集邏輯（`createMetricsStore`）直接重用 `src/benchmarks/reactive/`
  既有的實作，沒有另外複製一套 metrics framework。

## Expected Interpretation

**Composable Depth ≠ Reactive Cost。**

**Composable abstraction itself is not assumed to be expensive.**

看數字時：

- 如果 `Update Duration` / `Computed Execute Count` 隨 Depth 增加而增加，
  且成長幅度跟 `reactive-chain` scenario 在相同 depth 下的數字接近，代表成本
  來自「computed chain 有多長」，不是「用了幾層 composable」——這時候該檢討的
  是「這條 derived state 鏈是不是真的需要這麼長」，而不是「composable 用太多」。
- 如果 `Build Duration` 隨 Depth 增加而增加，但 `Update Duration` 在不同
  Depth 之間差異不大，代表 Composable 疊層的成本主要發生在**建立階段**，
  跟畫面正常使用時的 update 效能無關——多數真實應用中，這種一次性建立成本
  通常不是效能瓶頸。
- 如果同一個 depth 下，本 Scenario 的數字明顯比 `reactive-chain` 差，才有
  證據支持「composable 呼叫本身」有額外 runtime 成本；否則不應該用「這個專案
  composable 用太多層」作為效能問題的結論。
- `watchCount` / `watchEffectCount` 全程固定在 1，不隨 depth 變化——這代表
  「composable 疊很多層」不等於「watcher 也會跟著變多」，這兩者是可以刻意
  設計成脫鉤的，是否脫鉤取決於工程師怎麼寫，不是 Vue Runtime 強制的行為。

## 與 CDP Trace Harness 的關係

目前 `scripts/cdp-trace/scenario.ts` 是針對 `vdom-stress` 的 DOM 結構寫死的
（radio input 的 `name="render-count"`、按鈕文字 `Trigger Render`、
`.metrics dl` 內尋找 `renderDuration`），沒有通用到可以直接套用在其他
scenario 上。本次任務照 Freeze Boundary 的指示，不修改既有 harness，也不重構
成通用架構。

如果之後要用 CDP Trace 驗證這個 scenario，`ComposableChaosPage.vue` 已經維持
跟 `vdom-stress` 相同的 DOM 慣例（`.metrics dl` 內以 `dt`/`dd` 顯示指標、
按鈕有明確文字 `Build Chain` / `Trigger Update`、radio input 有
`name="composable-depth"`），足以用類似 `scripts/cdp-trace/scenario.ts` 的
`MutationObserver` 手法驅動，但實際串接需要另外開發，不在本次任務範圍內。

## Vue Version Validation

Vue 3.5.40 Baseline vs Vue 3.6.0-rc.2 Validation 已於 Day 24 完成（Layer A
頁面 instrumentation + Layer B CDP trace 雙軌，皆為 Vue 3.5.40／3.6.0-rc.2
protocol-matched 對照）。完整 Evidence 見
[`results/cdp-trace/composable-chaos/DAY24_VUE36_VALIDATION_REPORT.md`](../../../results/cdp-trace/composable-chaos/DAY24_VUE36_VALIDATION_REPORT.md)，
摘要見下方「Day 24：Vue 3.6.0-rc.2 Validation」與
[`src/benchmarks/validation-log.md`](../../benchmarks/validation-log.md)。

依照 Scenario Freeze Rule，正式開始比較後，只允許改變：

```text
Vue package version
```

以下維持凍結，不得為了「方便測量」而修改：

```text
Depth 選項（1 / 5 / 10 / 20）
useLayerN() 的巢狀結構與每層的 reactive 行為
DOM 結構
Component Tree（固定只有一個 ComposableChaosPage）
Update 觸發方式（source.value++）
Metrics 定義
```

## Question / Hypothesis / Observation / Next Step

### Question

Composable abstraction depth 增加時，Vue Reactive Runtime 的 Update Cost
是否也跟著增加？增加的原因是「computed chain 變長」還是「composable 呼叫
本身變貴」？

### Hypothesis

見上方 Hypotheses（H1 / H2 / H3）。目前預期 H1 + H3 成立：Build Duration
會隨 depth 增加，但 Update Duration 主要由 computed chain 長度決定，跟
「用幾層 function 包裝」關係不大；因此預期本 Scenario 在相同 depth 下的
`computedExecuteCount` 會跟 `reactive-chain` 一致，`Average Update Duration`
數量級也會接近。

### Observation

Vue 3.5.40 Baseline 已完成（Vue 3.6 Validation 尚未執行）。Depth 1 / 5 / 10 / 20
各跑 3 次 trial，每次 trial 都先點擊 **Build Chain** 重建全新 chain（metrics
store 隨之重置），再連續觸發 100 次 **Trigger Update**，取 median。完整原始數據
（每個 trial 的完整數字、Range Overlap 判定、console 觀察）見
[`src/benchmarks/validation-log.md`](../../benchmarks/validation-log.md) 的
「Composable Chaos」段落。

摘要（median，3 trial／Depth）：

| Depth | Build Duration | Average Update Duration | Computed Execute Count（100 次觸發累積） | Watch / WatchEffect / Render |
| ----: | --------------: | -----------------------: | ------------------------------------------: | ------------------------------ |
|     1 |         0.600 ms |                  0.469 ms |                                            0 |               100 / 101 / 201 |
|     5 |         1.100 ms |                  0.730 ms |                                          404 |               100 / 101 / 201 |
|    10 |         1.000 ms |                  0.696 ms |                                          909 |               100 / 101 / 201 |
|    20 |         1.200 ms |                  1.012 ms |                                         1919 |               100 / 101 / 201 |

重點發現：

- **Watch Trigger Count / WatchEffect Trigger Count / Render Count 在全部 4
  個 Depth、12 次 trial 完全相同**（100 / 101 / 201），跟 Depth 無關——證實
  H1 假設中「watcher 只掛在最上層一次、不隨 depth 增加」的設計在實測上成立，
  也驗證了 Controlled Variables 段落的宣稱。
- **Computed Execute Count 精確等於 `(Depth-1) × 101`**（0 / 404 / 909 /
  1919），是零雜訊的整數計數器，唯一「隨 Depth 線性增加」的確定性證據。
- **Average Update Duration 沒有在每一步都乾淨地隨 Depth 遞增**：用 3 次
  trial 的 min–max range 檢定，Depth 1 vs 5、Depth 5 vs 10 的 range 重疊，
  屬於 `No Meaningful Difference`（medians 雖分別差 55.6% 與 -4.7%，但 3
  trial 的雜訊帶蓋過這個差異，無法排除是雜訊）；只有 Depth 10 vs 20（+45.4%）
  與頭尾的 Depth 1 vs 20（+115.8%）range 不重疊，是本輪唯一站得住腳的
  Meaningful Difference。
- **Build Duration** 全部落在 0.5–2.7 ms 這個對自動化雜訊極敏感的區間
  （Depth 5 Trial 3 出現 2.700 ms 的單次離群值），沒有觀察到隨 Depth 乾淨遞增
  的訊號，判定為 Inconclusive（見下方 Limitation）。
- 支持 **H1 + H3**：Update Duration 的增加來源可歸因於 Computed Evaluation /
  Reactive Propagation Cost（隨 `(Depth-1)` 增加而增加的計算量），而不是
  Watch / WatchEffect / Render 頻率的變化（三者全程固定，與 Depth 脫鉤）。
  H2（Composable 呼叫本身有額外成本）本輪未驗證——需要 `reactive-chain`
  scenario 在相同 depth 下的對照數字才能判斷，見 Next Step。

### Cost Attribution

- **Reactive propagation cost + Computed evaluation cost**：唯一隨 Depth
  增加而增加的成本來源，證據是 Computed Execute Count 的精確線性成長
  （零雜訊）與 Depth 10→20、1→20 的 Average Update Duration Meaningful
  Difference。但每個 computed 的實際計算內容只是 `+1`，單一 node 的邊際成本
  極小（Depth 1→20 共增加 19 個 computed，Average Update Duration 只增加約
  0.54 ms，換算每個 node 邊際成本約 0.03 ms 等級，接近量測解析度邊界）。
- **Watch / WatchEffect trigger cost**：不是成本來源。觸發次數全程固定
  （100 / 101），且每次觸發只讀取已快取的 `finalValue.value`（O(1)），不隨
  Depth 增加。
- **Component render cost**：不是成本來源。Render Count 全程固定
  （201 = 1 次 Build render + 100 次 Update × 2 次 render），且每次 render
  顯示的 DOM 內容（`dl`/`dt`/`dd` 固定結構）不隨 Depth 變化。
- **Other JavaScript cost（量測 harness 本身）**：外部驅動用的
  `MutationObserver` + `button.click()` 開銷（`wallClockAvgMs` 與 app 內部
  `Average Update Duration` 的差值，約 0.3–0.7 ms）與 Depth 無明顯相關，
  確認不是造成上述 Depth 10→20 訊號的原因。

### No Meaningful Difference 標記

- Depth 1 vs Depth 5（Average Update Duration）
- Depth 5 vs Depth 10（Average Update Duration，medians 幾乎相同）
- Build Duration 在全部 4 個 Depth 之間（0.5–2.7 ms 區間雜訊蓋過任何趨勢）

### Limitation

- 只跑 3 次 trial／Depth（比照 `reactive-chain` / `component-storm` 的慣例），
  對 sub-millisecond 等級的 Build Duration 而言可能不夠——`vdom-stress`
  Controlled Re-validation 曾用 N=10 trial 才把訊號與雜訊分開，本輪 Depth
  1 vs 5、5 vs 10 的 Inconclusive 判定有可能在更多 trial 下改變。
- 分頁全程 `document.visibilityState === 'hidden'`（claude-in-chrome 的固有
  限制）。本 Scenario 的計時全部基於 `nextTick()`（microtask），理論上不受
  `setTimeout`／`requestAnimationFrame` 的背景節流影響，但無法完全排除背景
  分頁對 renderer process 整體 CPU 排程優先權的間接影響。
- ~~未使用 Chrome DevTools Performance / CDP Trace 取得 Scripting / Layout /
  Paint 等分類數據~~ 已補上，見下方「CDP Controlled Validation（Day 23）」。
- Build Duration 判定為 Inconclusive，不代表「Build 成本一定跟 Depth 無關」，
  只代表本輪 3 trial 的雜訊帶不足以下結論（CDP 輪用 5 trial 對 Build
  Instrumentation Duration 重新量測後，Depth 1 vs 5、5 vs 10、10 vs 20 皆為
  Meaningful Difference，見下方——本項 Limitation 已被下一輪證據部分推翻）。

### CDP Controlled Validation（Day 23，Vue 3.5.40，同版本內 cross-depth，非版本比較）

用 `scripts/cdp-trace/` 既有 Infrastructure（`chrome.ts`／`tracer.ts`／
`sync.ts`／`parser.ts`／`rollup.ts`／`stats.ts`／`evidence.ts` 全部原樣重用）
加上新建的 `composable-chaos-scenario.ts` adapter（僅描述本 Scenario 的 DOM，
沒有修改既有 `scenario.ts` 或本 Scenario 原始碼），對 Depth 1/5/10/20 各跑
3 次 warm-up + 5 次 measurement trial，`build`／`update`（20 次連續 Trigger
Update 為一組 batch）× `cost-trace`／`runtime-attribution-trace` 雙軌量測。
完整數字與 Signal 分類見 `src/benchmarks/validation-log.md`。

重點發現：

- **Scripting、Application CPU、Instrumentation Duration 三項獨立指標**
  在 Depth 1/5/10/20 的每一個相鄰區間都是 Meaningful Difference（IQR 不
  重疊），比 Day 22 只用頁面內建 3-trial instrumentation 量到的訊號更乾淨。
- **與 Day 22 的一處不一致，明確記錄而非硬調和**：Day 22 判定 Depth 5 vs 10
  為 No Meaningful Difference；本輪 CDP（5 trial、batch=20、每 trial 皆重新
  `Page.navigate`）判定同一組為 Meaningful Difference。兩輪用的是同一份
  Scenario、同樣的 Depth 值，差異來自量測協定本身（batch 大小、trial 數、
  是否每次重新整理頁面），不是 Vue 版本或 Scenario 行為的差異。
- **Vue Runtime CPU 沒有隨 Depth 的一致訊號**（部分 trial 的 min 甚至是 0
  sample）——明確標記 `Not Attributable`，不可推論成「Vue Runtime 本身的
  bookkeeping cost 隨 Depth 增加」。
- **Layout / Paint / Recalculate Style 等 Browser Rendering 指標**只在
  Depth 1→5 有一次乾淨跳升，5→10、10→20 幾乎全部 No Meaningful Difference
  ——證實 Rendering Cost 不是主要隨 Depth 成長的成本來源，跟 DOM 節點數全程
  固定的 Controlled Variables 設計一致。
- **Application CPU 的成長不能單純解讀成「computed 計算本身變貴」**：
  這個 bucket 同時包含 computed getter 本體（`upstream.value.value + 1`）
  與 Scenario 自己在同一個 getter 裡呼叫的 `metrics.increment(...)`，兩者
  都算進同一個 Application 分類，目前的 pipeline 無法拆分「真實計算成本」
  與「計數 instrumentation 本身的開銷」。

Proven / Not Proven（本輪 CDP 證據範圍內）：

| 結論 | 狀態 |
|---|---|
| 總 JS 成本隨 Depth 增加 | **Proven**（Scripting 每個相鄰區間皆不重疊） |
| 增加主因是 computed 計算量增加（Application CPU） | **Proven**，但含計數 instrumentation 開銷，無法拆分 |
| Watch/WatchEffect/Render 頻率與 Depth 脫鉤 | 僅 instrumentation 證明，CDP 本輪未獨立驗證（trace 看不到單次 callback 計數） |
| Browser Rendering Cost 隨 Depth 增加 | **Not Proven**（只有 1→5 一次跳升，之後打平） |
| Vue Runtime 自身 bookkeeping cost 隨 Depth 增加 | **Not Proven** / Not Attributable |
| H2（Composable 呼叫本身有額外 Runtime Cost） | **Not Proven**——本 Scenario 的 Composable 層數與 Computed 鏈長完全 1:1 耦合，沒有任何條件能單獨變動其中一個，需要下方 H2 Control Scenario 才能拆解 |

### Day 24：Vue 3.6.0-rc.2 Validation

用 `vue-pain-lab-vue36` worktree（重新同步至 `main`@`695d896` 後改裝
`vue@3.6.0-rc.2`，環境除 Vue 版本外與本репо一致）跑完整雙軌量測：

- **Layer A**（頁面 instrumentation，新建 `run-composable-chaos-instrumentation.ts`，
  與 Layer B 共用 `composable-chaos-scenario.ts` 的 click+MutationObserver
  機制，非 claude-in-chrome 手動操作）：Vue 3.5.40／3.6.0-rc.2 皆用同一支
  script 重新量測（3 trial／Depth），確保「量測方法」本身不是版本比較的
  變因。結構性 counter（Composable Instance/Computed/Watch/WatchEffect
  Count、Computed Execute Count、Watch/WatchEffect Trigger Count、Render
  Count）在兩個版本、全部 Depth 完全相同——確認 Scenario 的 reactive graph
  形狀不受 Vue 版本影響。Average Update Duration 只在 Depth 20 出現
  Meaningful Difference（Vue 3.6 快 21.2%），Depth 1/5/10 皆 No Meaningful
  Difference（Depth 1 有一個方向相反、量值極小的 Meaningful Difference，
  判斷為量測解析度雜訊）。
- **Layer B**（CDP trace，沿用 Day 23 建立的 `run-composable-chaos-matrix.ts`
  協定，重構出 `runVersionMatrix()` 給新的 `run-composable-chaos-matrix-vue36.ts`
  重用，未改變既有 Vue 3.5.40 呼叫路徑的行為）：Scripting 與頁面
  Instrumentation Duration 在 Depth 20 update 出現 5/5 paired trial 一致、
  IQR 不重疊的 Consistent Improvement（Scripting −25.6%、Instrumentation
  Duration −32.5%），Depth 10 update 的 Instrumentation Duration 也是
  Consistent Improvement（−9.5%）。但同一批 trial 的 `Vue Runtime CPU` /
  `Application CPU` attribution bucket 在相同 cell 卻是 Consistent
  Regression（+67.1%／+41.3%），且該 bucket 本身被 `evidence.ts` 標記
  `confidence: 'low'`——因此這個 Scripting 改善**不能**歸因成「Vue Runtime
  本身變快」。

完整證據、Cost Attribution 與逐 cell 數字見
[`results/cdp-trace/composable-chaos/DAY24_VUE36_VALIDATION_REPORT.md`](../../../results/cdp-trace/composable-chaos/DAY24_VUE36_VALIDATION_REPORT.md)
與 `src/benchmarks/validation-log.md`。

**Evidence-based Conclusion**：`No Reproducible Framework-level Runtime
Cost Improvement`（整個 Scenario 範圍）。存在一個較窄、兩層量測互相驗證的
JS-level（Scripting）改善，但僅限 Depth 20 update，且無法用本 Lab 的
Runtime Attribution 方法證實來自 Vue Reactivity Engine 本身——值得用更高
信心的 attribution 方法重新檢驗，目前不視為已確認的 Vue 3.6 改善。

### Next Step

1. ~~用 `.claude/skills/validate-vue-update` 流程，在 Vue 3.5.40 上跑
   Depth 1 / 5 / 10 / 20 各數次 trial，記錄 Build Duration、Average Update
   Duration、Computed Execute Count 作為 Baseline。~~ 已完成。
2. ~~用既有 `scripts/cdp-trace/` Infrastructure 對本 Scenario 做 Controlled
   Validation，取得 Scripting / Rendering / Vue Runtime CPU 等分類證據。~~
   已完成，見上方「CDP Controlled Validation（Day 23）」。
3. ~~安裝 Vue 3.6，不修改本 Scenario 任何程式碼，重新量測同樣的 Depth 組合
   （instrumentation 與 CDP 雙軌皆重跑一次）。~~ 已完成，見上方「Day 24：
   Vue 3.6.0-rc.2 Validation」。
4. 把同 depth 下的 `Average Update Duration` / `Computed Execute Count` 拿去
   跟 `reactive-chain` scenario 的對應 depth 數字對照，判斷 H2（Composable
   呼叫本身是否有額外 Runtime Cost）是否成立——`reactive-chain` 目前
   `DEPTH` 寫死 100、非可選 1/5/10/20，直接比對前需先確認是否要另開
   depth-matched control（見下一項）。
5. 若要單獨量測「純 Composable Abstraction Cost（不含任何 reactive 行為）」
   以回答 H2，需要另開一個新的對照 scenario（例如 `composable-chaos-noop`
   或 depth-matched 版本的 `reactive-chain`）：與本 Scenario 使用完全相同的
   computed 鏈長、watch/watchEffect 數量、DOM 結構與 metrics instrumentation，
   但用 flat loop 建鏈、不使用巢狀 composable function call。不修改這份已
   依 Freeze Boundary 設計好的 scenario。
6. Day 22 與 Day 23 對 Depth 5 vs 10 的判定不一致（見上方 CDP 段落），
   之後若要下定論，應該用同一套協定（trial 數、batch 大小、是否重新整理
   頁面）重跑兩次並比較，而不是直接採信任何一輪的結論。
7. Day 24 發現的「Scripting 改善但 Vue Runtime CPU attribution 卻是
   Regression」矛盾，需要更高信心的 attribution 方法（目前
   `runtime-attribution-trace` 的 leaf-only sampling 被 `evidence.ts` 標記
   低信心）才能判斷 Depth 20 update 的 Scripting 改善是否真的來自 Vue
   Reactivity Engine 本身。
