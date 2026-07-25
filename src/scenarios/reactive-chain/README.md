# Reactive Chain Generator

## Scenario

模擬大型後台表單常見的 reactive 資料流：

```
Form State
  ↓
Computed Derived State
  ↓
Validation State
  ↓
Display State
  ↓
Component Render
```

實務上這條鏈不會只有一層 computed：一個欄位的值往往要經過好幾層 derived state（格式化、跨欄位計算、驗證、顯示用的格式）才會反映到畫面上。這個 scenario 把「鏈有多深」抽成一個可調參數 `DEPTH`，用迴圈建立 `ref → computed1 → computed2 → ... → computedN → watch → watchEffect → component render`，藉此觀察 dependency depth 對 update cost 的影響。

這不是最佳實踐範例，是 Runtime Benchmark。不做任何效能優化（不用 shallowRef / markRaw / debounce / throttle / cache workaround）。

## Lab Parameters

集中在 `ReactiveChainPage.vue` 頂部：

- `DEPTH`：computed dependency 層數
- `UPDATE_INTERVAL`：自動更新間隔（ms）
- `AUTO_UPDATE`：是否自動觸發更新

## Runtime Metrics

畫面即時顯示：Dependency Depth、Render Count、Computed Execute Count、Watch Trigger Count、WatchEffect Trigger Count、Total Update Count、Average Update Duration、Total Execution Time。

每一層都有對應的 `console.log`（`computed1 executed` ... `watch triggered` / `watchEffect triggered` / `component render`），方便搭配 Chrome DevTools Performance 面板逐層對照。

## Benchmark Infrastructure

Chain 建立邏輯與 metrics 收集邏輯抽離到 `src/benchmarks/reactive/`，不與這個 page 耦合：

- `createReactiveChain.ts` — 用迴圈 / factory 建立 reactive dependency chain
- `metrics.ts` — 通用 keyed counters + duration 統計（其他 benchmark scenario 也可重用）
- `logger.ts` — console.log 包裝

`ReactiveChainPage.vue` 只負責顯示 Lab UI、控制參數、顯示 Metrics。

## 驗證方式

用 `.claude/skills/validate-vue-update` 流程比較 Vue 3.5 vs 3.6：只需要 `npm install vue@版本號` 更新版本，不用改這個 scenario 的任何程式碼，即可重新量測。

- 實際在瀏覽器跑起來確認：每次更新週期都正確依序印出 computed1...computed5 → watch → watchEffect →  
  component render，Metrics 數字自洽（例如 Computed Execute Count = 45 = 9 個週期 × DEPTH 5）

過程中抓到一個真的 bug：一開始 metrics 的 counters 是 reactive()，因為同時被 template 讀取、又在  
 computed/watch/watchEffect/onUpdated 裡被 mutate，導致 component 的 render 在同一輪 flush
裡不斷觸發自己，Vue 丟出「Maximum recursive updates exceeded」。修法是把 counters 改成一般（非
reactive）物件——template 還是能正確顯示最新數字，因為 finalValue 和 duration 才是真正驅動 re-render 的  
 reactive 依賴。已經在 metrics.ts 留下註解說明這個坑，因為不是一眼能看出來的行為。

接下來：照專案的 validate-vue-update 流程，分別在 Vue 3.5 / 3.6 下跑這個 scenario（只需要 npm install  
 vue@版本號，不用改任何程式碼），把量到的數字填進 README 的 Hypothesis / Observation / Next Step。

## Question

在後台表單常見的 reactive dependency depth（例如 5～20 層 derived state）下，Vue 3.6 對 update cost 的改善是否有感？是否足以影響「要不要重構這條 derived state 鏈」的決策？

## Hypothesis

_(量測後填寫)_

## Observation

_(量測後填寫，記錄 DEPTH 對應的 Average Update Duration / Total Execution Time)_

## Next Step

_(量測後填寫)_
