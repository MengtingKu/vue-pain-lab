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

## Research Objective

驗證 Vue Runtime 在深層 reactive dependency chain 下的 update cost。

主要問題：

大型後台系統中：

```
User Input
↓
Form State
↓
Computed State
↓
Validation
↓
Display State
↓
Render
```

可能形成長鏈 reactive dependency。

本 Lab 驗證：

Vue 3.6 的 reactivity runtime 是否降低：

- dependency tracking cost
- computed invalidation cost
- unnecessary effect execution
- component update cost

## Validation Environment

Baseline

- Vue 3.5.40

Validation

- Vue 3.6.0-rc.2

其他套件版本保持一致：

- Vite
- TypeScript
- Pinia
- Node.js

## Lab Parameters

集中在 `ReactiveChainPage.vue` 頂部：

- `DEPTH`：computed dependency 層數
- `UPDATE_INTERVAL`：自動更新間隔（ms）
- `AUTO_UPDATE`：是否自動觸發更新

## Runtime Metrics

畫面即時顯示：Dependency Depth、Render Count、Computed Execute Count、Watch Trigger Count、WatchEffect Trigger Count、Total Update Count、Average Update Duration、Total Execution Time。

每一層都有對應的 `console.log`（`computed1 executed` ... `watch triggered` / `watchEffect triggered` / `component render`），方便搭配 Chrome DevTools Performance 面板逐層對照。

## Validation Evidence Matrix

| Question                      | Evidence                       |
| ----------------------------- | ------------------------------ |
| Update 是否變快？             | Average Update Duration        |
| Effect 是否減少？             | Computed / Watch Count         |
| Render 是否改善？             | Render Count                   |
| Runtime bottleneck 是否消失？ | Chrome Performance Flame Chart |
| 是否值得改架構？              | Engineering Decision           |

## Benchmark Infrastructure

Chain 建立邏輯與 metrics 收集邏輯抽離到 `src/benchmarks/reactive/`，不與這個 page 耦合：

- `createReactiveChain.ts` — 用迴圈 / factory 建立 reactive dependency chain
- `metrics.ts` — 通用 keyed counters + duration 統計（其他 benchmark scenario 也可重用）
- `logger.ts` — console.log 包裝

`ReactiveChainPage.vue` 只負責顯示 Lab UI、控制參數、顯示 Metrics。

## 驗證方式

用 `.claude/skills/validate-vue-update` 按照 Vue Pain Lab 固定流程，不用改這個 scenario 的任何程式碼，即可重新量測：

### Step 1 — Vue 3.5 Baseline

Install: `npm install vue@3.5.40`

保持：

- Scenario code
- DEPTH
- UPDATE_INTERVAL
- Browser environment

不變。

記錄：

- Average Update Duration
- Computed Execute Count
- Watch Trigger Count
- Render Count
- Performance Flame Chart

---

### Step 2 — Vue 3.6 Validation

Install: `npm install vue@3.6.0-rc.2`

不修改任何 scenario code。

重新量測相同指標。

---

### Step 3 — Compare

比較（DEPTH=100，各版本各跑 3 次 trial、每次連續觸發 100 次 Trigger Update，取 median）：

| Metric                            | Vue 3.5.40 | Vue 3.6.0-rc.2 | Performance Change                |
| --------------------------------- | ---------- | -------------- | --------------------------------- |
| Render Count                      | 199        | 199            | 持平                              |
| Computed Execution                | 10100      | 10100          | 持平                              |
| Average Update Duration（median） | 48.086 ms  | 47.310 ms      | -1.6%（在雜訊範圍內，非顯著差異） |

原始數據（含每次 trial 的完整數字與雜訊分析）見 [`src/benchmarks/validation-log.md`](../../benchmarks/validation-log.md)。

## Question

Vue 3.6 runtime optimization 是否降低 reactive dependency chain 的成本？

並判斷改善是否足以改變大型專案中的：

- State Design
- Computed Architecture
- Component Boundary

## Baseline Snapshot

- Vue Version：Baseline `3.5.40` → Validation `3.6.0-rc.2`
- Node.js：v24.13.0
- Browser：Chrome 150.0.0.0（透過 claude-in-chrome 擴充套件自動化，分頁全程為背景/hidden 狀態）
- Vite：v8.1.5
- Scenario Parameters：`DEPTH=100`、`UPDATE_INTERVAL=5`、`AUTO_UPDATE=false`
- Git Commit（實驗開始時的已提交基準）：`f933262`

## Hypothesis

Vue 3.6 重寫了部分 reactivity 內部實作，release notes 提及 dependency tracking / computed 重新計算的成本有下降空間。預測在 DEPTH=100 的長鏈下，3.6 的 Average Update Duration 應該會比 3.5 略低或至少持平，但因為這條鏈是刻意用迴圈建出來的線性依賴（每一層都非跳過不可），預期 Computed Execute Count 這種「執行次數」不會變，Vue 頂多只能降低「每次執行的成本」，不太可能減少「執行次數」本身。

## Observation

DEPTH=100，兩版都各跑 3 次 trial、每次連續觸發 100 次 Trigger Update：

- Vue 3.5.40：Average Update Duration median 48.086 ms（3 次 trial：63.942 / 48.086 / 47.042 ms）
- Vue 3.6.0-rc.2：Average Update Duration median 47.310 ms（3 次 trial：44.402 / 47.943 / 47.310 ms）
- 兩版 median 只差 -1.6%，落在同一版本自己重跑 3 次的雜訊帶內（Vue 3.5.40 自己 3 次 trial 之間就有到 +36% 的落差）——**不足以判定有版本差異**
- Computed Execute Count（10100）、WatchEffect Trigger Count（101）、Watch Trigger Count（100）、Render Count（199）在兩版、所有 trial 完全一致，符合 Hypothesis 裡「執行次數不會變」的預期
- Console 觀察：兩版都是 `computed100 executed → watch triggered → watchEffect triggered → component render → component render` 的固定順序，無 error / warning
- Unexpected Behavior 1：`component render` 每次 update 都觸發兩次（並非版本差異，是 scenario 自己的 metrics 寫入模式造成，細節見 `src/benchmarks/validation-log.md`）
- Unexpected Behavior 2（本輪重跑才發現，是本次驗證最重要的發現）：這個瀏覽器自動化環境的分頁 `document.hidden` 全程是 `true`，Chrome 會對背景分頁做 timer 節流／CPU 排程降級。第一次量測只跑 1 個 trial、用 `setTimeout` 驅動，得到 3.5.40 = 4.7ms、3.6.0-rc.2 = 12.2ms（看起來像 3.6 慢了 157.7%）；但改用不同等待手法重跑**同一份** Vue 3.5.40 build，同一個指標就從 4.7ms 跳到 12ms、48ms、64ms、73ms——證明第一輪的「157.7% 變慢」結論其實是自動化環境的雜訊，不是真的 Vue 版本差異。詳細過程見 `src/benchmarks/validation-log.md`。

## Validation Result

### Vue 3.5 Baseline

DEPTH=100，3 次 trial × 100 次 update：Average Update Duration median 48.086 ms（range 47.042–63.942 ms）、Computed Execute Count 10100、Watch Trigger Count 100、Render Count 199（3 次 trial 皆相同）。

### Vue 3.6 Validation

DEPTH=100，3 次 trial × 100 次 update（相同 scenario code、相同瀏覽器分頁、相同量測手法）：Average Update Duration median 47.310 ms（range 44.402–47.943 ms）、Computed Execute Count 10100、Watch Trigger Count 100、Render Count 199（3 次 trial 皆相同）。

### Improvement

沒有觀察到改善，也沒有觀察到退步。Effect 執行次數（Computed / Watch / WatchEffect / Render）在兩版完全相同，代表 Vue 3.6 並沒有讓這條 100 層 dependency chain 少算任何一層，也沒有跳過任何一次 effect trigger。Average Update Duration 的 median 差異（-1.6%）遠小於同一 build 重跑的雜訊帶，在目前的量測精度下判定為持平。

### Limitation

- 這個瀏覽器自動化環境本身的量測雜訊（同一份 3.5.40 build 重跑可以差到 36%）比目前觀察到的版本間差異（-1.6%）還大，代表現在的方法**分辨不出**個位數到十位數 ms 等級的效能差異，只能用來偵測「數量級」等級的落差或「執行次數」這種離散指標
- 3.6.0-rc.2 是 release candidate，非正式版，可能還有 dev-only assertion 或尚未完成的最佳化
- 分頁全程 `document.hidden === true`（claude-in-chrome 的固有限制，無法透過點擊或視窗操作改變），無法排除仍有殘留的背景 CPU 排程影響

## Next Step

1. 用真人手動操作、分頁保持真正前景 focus 的方式重跑一次，排除自動化環境固有的背景節流雜訊，確認 -1.6% 是否仍然成立
2. 若要繼續用自動化量測，應該把 trial 數拉高（例如 10+ 次）並報告標準差，而不是只看單次或 3 次的 median
3. 等 Vue 3.6 出正式版後（而非 rc.2）用相同方法再驗證一次
4. 在目前的證據下，不建議只因為「升級 Vue 版本」就去改這條 derived state 鏈的 State Design / Computed Architecture / Component Boundary——Computed Execute Count 這種執行次數本來就不會因為換 Vue 版本而減少，真正該優化的是「這條鏈是不是真的需要 100 層」，這是工程設計問題，不是 Vue runtime 能單方面解決的（呼應 `.claude/skills/validate-vue-update` 的 Final Conclusion Template 第三題：No measurable improvement）
