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

這個 Scenario 之後會用於 Vue 3.5 Baseline vs Vue 3.6 Validation 比較。目前
尚未執行驗證，流程請依 `.claude/skills/validate-vue-update`。

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

尚未執行驗證。待 `.claude/skills/validate-vue-update` 的 Vue 3.5 Baseline
與 Vue 3.6 Validation 完成後補上，格式比照 `src/scenarios/reactive-chain/README.md`
與 `src/scenarios/vdom-stress/README.md` 的 Observation / Validation Result /
Limitation / Conclusion 段落。

### Next Step

1. 用 `.claude/skills/validate-vue-update` 流程，在 Vue 3.5.40 上跑
   Depth 1 / 5 / 10 / 20 各數次 trial，記錄 Build Duration、Average Update
   Duration、Computed Execute Count 作為 Baseline。
2. 安裝 Vue 3.6，不修改本 Scenario 任何程式碼，重新量測同樣的 Depth 組合。
3. 把同 depth 下的 `Average Update Duration` / `Computed Execute Count` 拿去
   跟 `reactive-chain` scenario 的對應 depth 數字對照，判斷 H2（Composable
   呼叫本身是否有額外 Runtime Cost）是否成立。
4. 若要單獨量測「純 Composable Abstraction Cost（不含任何 reactive 行為）」，
   需要另開一個新的對照 scenario（例如 `composable-chaos-noop`），而不是修改
   這份已依 Freeze Boundary 設計好的 scenario。
