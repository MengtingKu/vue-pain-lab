# Component Storm

## Scenario Purpose

模擬大型後台系統常見的「一個 Parent 底下掛了大量結構一致的 Child」情境（例如表格列、卡片牆、表單欄位群）。這個 scenario 驗證的不是 VDOM diff 演算法或 Vapor Compiler，而是最基本的 **Component Runtime Cost**：

- Component 數量增加，Mount 要花多少成本？
- Parent 自己的狀態變動，會不會連累一堆跟這次變動無關的 Child 重新 Render？
- 只改一個 Child 的 Props，跟改所有 Child 的 Props，Runtime Cost 差多少？

這不是最佳實踐範例，是 Runtime Benchmark。不預設 Vue 3.6 一定改善任何問題，只建立一個公平、可重複驗證的 Baseline。

## Research Questions

1. Component Scale 增加時，Component Runtime Cost（Mount Time / Update Time）是否增加？
2. Parent Update 是否一定導致所有 Child Component 重新 Render？
3. 不同 Update Scope（ParentOnly / SingleChild / AllChildren）是否造成不同 Runtime Cost？

本 Scenario 不回答「Vue 3.6 是否改善？」「Vapor 是否改善？」，這些留給後續用 `.claude/skills/validate-vue-update` 針對這個固定 Baseline 做版本比較。

## Benchmark Matrix

Variable A — `COMPONENT_COUNT`：`100` / `500` / `1000`

Variable B — `UPDATE_SCOPE`：`ParentOnly` / `SingleChild` / `AllChildren`

兩個變因可任意組合，例如 `100 + ParentOnly`、`500 + SingleChild`、`1000 + AllChildren`，共 9 種組合。所有組合共用同一份 Component Tree 與量測流程，差異只在 `src/benchmarks/component-storm/config.ts` 裡的兩個參數。

## Component Tree

```
ComponentStormPage (Parent)
  └─ ComponentStormChild × COMPONENT_COUNT
```

所有 Child：

- Template 完全一致（label + value + 5 個 derived 數字）
- Props 結構一致（`id` / `value` / `label`）
- Reactive Logic 一致（`computed` 從 `value` 算出 5 個 derived 值）
- Render Complexity 一致

Child 之間唯一的差異是 `id` / `label`（用來識別身分），不會有任何 Child 因為 Update Scope 而跑不同邏輯——Update Scope 只決定 Parent 要動誰的 Props，不決定 Child 內部怎麼算。

## Update Scope Definition

- **ParentOnly**：只改 Parent 自身的 `parentTick`，所有 Child Props 不變。用來觀察「Parent 重新 Render 時，沒被動到 Props 的 Child 會不會也跟著重新 Render」。
- **SingleChild**：只改 `children[0].value`。用來觀察更新是否侷限在真正需要更新的那個 Child。
- **AllChildren**：改所有 Child 的 `value`。用來建立 Worst Case 的 Runtime Cost 基準。

## Validation Flow

```
Application Start
  ↓
Measure Mount
  ↓
Trigger Update
  ↓
Measure Update
  ↓
Collect Metrics
```

流程固定，不因 UPDATE_SCOPE 或 COMPONENT_COUNT 而改變，方便 Vue 3.5 / Vue 3.6 用同一套步驟重複驗證。

## Evidence Matrix

程式自動收集（畫面即時顯示，見 `src/benchmarks/component-storm/metrics.ts`）：

- Mount Time
- Update Time（Average Update Duration）
- Parent Render Count
- Child Render Count（累計）
- Updated Component Count（上一次 triggerUpdate 實際造成幾個 Child re-render，用來直接回答 Research Question 2）

Chrome DevTools 另外觀察（不需要程式自動收集）：

- JavaScript Execution Time
- Performance Flame Chart
- Memory Behavior

## Benchmark Configuration

集中在 `src/benchmarks/component-storm/config.ts`：

- `componentCount`：Child 數量（100 / 500 / 1000）
- `updateScope`：`'ParentOnly' | 'SingleChild' | 'AllChildren'`
- `autoUpdate`：是否自動觸發更新
- `updateInterval`：自動更新間隔（ms）

`ComponentStormPage.vue` 只負責顯示 Lab UI、觸發更新、顯示 Metrics，不直接寫死任何 Benchmark 參數。

## Benchmark Infrastructure

Child 狀態建立、Metrics 收集、Injection Key 都抽離到 `src/benchmarks/component-storm/`，不與 Page / Child Component 耦合：

- `config.ts` — 所有 Benchmark 參數集中管理
- `createChildren.ts` — 建立 COMPONENT_COUNT 個結構一致的 Child 初始狀態
- `metrics.ts` — Mount Time / Update Duration / Render Count / Updated Component Count 的量測儀器
- `keys.ts` — Parent／Child 之間回報 render 的 Injection Key

`ComponentStormPage.vue`（Parent）與 `ComponentStormChild.vue`（Child）只負責畫面與 Reactive Logic。

## Expected Observation

不預設 Vue 3.6 一定改善，只描述這個 Baseline 預期可能觀察到的 Runtime 行為方向：

- COMPONENT_COUNT 增加（100 → 500 → 1000）是否等比例提高 Mount Time
- ParentOnly 情境下，Child Render Count / Updated Component Count 是否維持在 0（Props 沒變，Child 理論上不該重新 Render）
- SingleChild 情境下，Updated Component Count 是否維持在 1（不受 COMPONENT_COUNT 影響）
- AllChildren 情境下，Update Time 是否隨 COMPONENT_COUNT 等比例增加
- 同一個 COMPONENT_COUNT 下，ParentOnly / SingleChild / AllChildren 三種 Update Scope 的 Update Time 差異量級

## Validation Rule（Scenario Freeze）

此 Scenario 遵守 `.claude/skills/validate-vue-update` 的 Scenario Freeze Rule。驗證 Vue 版本差異時：

不得修改：

- Component Structure（Parent / Child 的組成方式）
- Reactive Logic（Child 的 `computed` 邏輯）
- Benchmark Parameters（`config.ts` 的數值）
- 為特定 Vue 版本加入任何最佳化或 Runtime Workaround

不使用：`v-memo`、`KeepAlive`、`defineAsyncComponent`、Virtual Scroll、Lazy Render，或任何專門降低 Benchmark 成本的技巧。

Vue Runtime Version 是唯一允許改變的實驗變因。

## 驗證方式

用 `.claude/skills/validate-vue-update` 按照 Vue Pain Lab 固定流程執行 Vue 3.5 / Vue 3.6 的比較驗證，不修改本 Scenario 任何程式碼即可重新量測。實際的 Question / Hypothesis / Observation / Next Step 留待該次驗證時再補上。

## Question

Vue 3.6 runtime 是否降低 Component Storm（大量結構一致 Child）場景下的 Component Update / Render Cost？

- Parent Update 是否仍然只影響有真的被改到 Props 的 Child（Updated Component Count 是否與版本無關、只與 Update Scope 有關）？
- Average Update Duration 在 `componentCount=500`、`updateScope='AllChildren'` 這種 Worst Case 下，版本間差異是否超過同一版本自己重跑的雜訊帶？

## Hypothesis

參考 [`reactive-chain`](../reactive-chain/README.md) 驗證時的結論：Vue 3.6 較可能改善的是「每次 render / dependency tracking 的單位成本」，不太可能改變「render 次數」這種由 Component Tree 結構與 Update Scope 決定的離散指標。預測：

- Parent Render Count（200）、Child Render Count（50000）、Updated Component Count（500）在 Vue 3.5 / 3.6 應該完全一致（`AllChildren` 情境下這三個數字由 Component 數量與 Update Scope 決定，Vue 版本不會讓某些 Child 被跳過渲染）。
- Average Update Duration 可能有小幅差異，但預期會落在同一版本自己重跑 3 次的雜訊帶內（依 reactive-chain 的經驗，這個雜訊帶可達 15%+）。
- Mount Time（500 個 Child 首次掛載）方向不確定，需要實測。

## Validation Environment（Baseline）

- Vue Version：`3.5.40`（`npm install vue@3.5.40 --save-exact`）
- Node.js：v24.13.0
- Browser：Chrome 150.0.0.0（透過 claude-in-chrome 擴充套件自動化操作，分頁全程為背景/hidden 狀態，`document.hidden === true`）
- Vite：v8.1.5
- Scenario Parameters：`componentCount=500`、`updateScope='AllChildren'`、`autoUpdate=false`（全程未修改）
- Git Commit（實驗開始時的已提交基準）：`375776c16b3cd3d575458bb53122d629f6563294`（2026-08-02 17:25:00 +0800）

沿用 reactive-chain 驗證時建立的量測手法（見該 README「量測方法演進與重要發現」）：用 `MutationObserver` 監看畫面上 `Total Update Count` 的 DOM 文字變化來判斷單次 `triggerUpdate` 是否完成，避免 `setTimeout` 被背景分頁節流。每次 trial 前重新整理頁面（重置所有 metrics），連續觸發 100 次 `Trigger Update`，共 3 次 trial，取 median。

## Observation

`componentCount` 覆蓋 `100`／`500`／`1000` 三個 Scale，各 Scale 下三種 `updateScope` 各跑 3 次 trial（每次 trial 前重新整理頁面重置 metrics，連續觸發 100 次 Trigger Update）。數字直接讀取畫面 Runtime Metrics。

`componentCount=500` 已完成 Vue 3.5.40 Baseline 與 Vue 3.6.0-rc.2 Validation 的完整比較（見下方「Version Comparison」）；`componentCount=100`／`1000` 目前仍只有 Vue 3.5.40 Baseline 數據，尚未跑 Vue 3.6（見 Next Step）。

## componentCount=500

### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 350.900 ms | 210.861 ms              | 88.03 MB       | 88.44 MB      | +0.42 MB  |
| 2     | 311.100 ms | 187.405 ms              | 51.63 MB       | 90.86 MB      | +39.23 MB |
| 3     | 353.700 ms | 182.206 ms              | 88.07 MB       | 85.13 MB      | -2.94 MB  |

Mount Time median：350.900 ms（range 311.100–353.700 ms）
Average Update Duration median：187.405 ms（range 182.206–210.861 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count（上一次 update）500、Parent Render Count 200、Child Render Count（累計）50000。

### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 381.800 ms | 6.654 ms                | 103.75 MB      | 110.36 MB     | +6.63 MB  |
| 2     | 295.900 ms | 9.711 ms                | 51.62 MB       | 64.55 MB      | +12.93 MB |
| 3     | 306.800 ms | 8.770 ms                | 48.79 MB       | 64.09 MB      | +15.30 MB |

Mount Time median：306.800 ms（range 295.900–381.800 ms）
Average Update Duration median：8.770 ms（range 6.654–9.711 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、**Updated Component Count 0**、Parent Render Count 200、**Child Render Count 0**、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 266.600 ms | 10.732 ms               | 49.05 MB       | 64.59 MB      | +15.54 MB |
| 2     | 299.400 ms | 9.000 ms                | 51.72 MB       | 63.53 MB      | +11.80 MB |
| 3     | 309.700 ms | 8.962 ms                | 51.70 MB       | 63.52 MB      | +11.81 MB |

Mount Time median：299.400 ms（range 266.600–309.700 ms）
Average Update Duration median：9.000 ms（range 8.962–10.732 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、**Updated Component Count 1**、Parent Render Count 200、**Child Render Count 100**。

### Update Scope Comparison（Vue 3.5.40，componentCount=500，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count（累計，100 次觸發） | Parent Render Count |
| ------------ | ----------------------- | ----------------------- | -------------------------------------- | ------------------- |
| ParentOnly   | 8.770 ms                | 0                       | 0                                      | 200                 |
| SingleChild  | 9.000 ms                | 1                       | 100                                    | 200                 |
| AllChildren  | 187.405 ms              | 500                     | 50000                                  | 200                 |

直接回答 Research Question 2 與 3：

- **Research Question 2（Parent Update 是否一定導致所有 Child 重新 Render？）**：不會。`ParentOnly` 下 Child Render Count 全程為 0、Updated Component Count 為 0——Props 沒變的 Child 完全沒有重新 render，符合 Vue 的 Props 比對機制預期。
- **Research Question 3（不同 Update Scope 的 Runtime Cost 差多少？）**：`ParentOnly`（8.770 ms）與 `SingleChild`（9.000 ms）幾乎沒有差異（只差 0.230 ms，落在雜訊帶內）——代表這個 scenario 下，「Parent 自身 re-render 一次」和「多渲染 1 個 Child」的成本幾乎可忽略不計，真正貴的是 `AllChildren`（187.405 ms），比 `ParentOnly` 慢了約 **21.4 倍**。Parent Render Count 在三種 Scope 下都固定是 200（不受 Update Scope 影響，只受觸發次數影響），代表 Parent 本身一定會 re-render，差異完全來自「牽連了多少個 Child」。

JS Execution Time（= Average Update Duration × 100 次觸發）：AllChildren median 18740.5 ms；ParentOnly median 877.0 ms；SingleChild median 900.0 ms。與 Update Duration 的量級差異一致。

Memory（JS Heap `usedJSHeapSize`，`performance.memory`）：三種 Scope 的 Heap Δ 都落在 +0.42 MB ~ +39.23 MB 這種大範圍雜訊帶內，且 ParentOnly / SingleChild 彼此的 Heap Δ 量級（+6.6~+15.5 MB）跟 AllChildren（-2.9~+39.2 MB）沒有清楚的區隔，判斷主要受 V8 GC 排程時機影響，而非三種 Update Scope 本身的記憶體成本差異——與 reactive-chain 驗證時觀察到「這套自動化環境的量測雜訊可能大於真實訊號」的結論一致。目前的量測精度**不足以**拿 Heap Δ 區分 Update Scope 或版本差異。

Console 觀察：三種 Scope 全程皆無 error / warning，無 `Maximum recursive updates exceeded`。

## componentCount=500（Vue 3.6.0-rc.2 Validation）

### Validation Environment

- Vue Version：`3.6.0-rc.2`（`npm install vue@3.6.0-rc.2 --save-exact`）
- Node.js：v24.13.0（不變）
- Browser：Chrome 150.0.0.0（同 baseline，透過 claude-in-chrome 擴充套件自動化操作，分頁全程為背景/hidden 狀態，`document.hidden === true`）
- Vite：v8.1.5（不變）
- Scenario Parameters：`componentCount=500`，三種 `updateScope` 各測一輪，`autoUpdate=false`（全程未修改 Scenario Code，僅切換 `config.ts` 的 `updateScope`，與 Baseline 切換方式完全相同）
- 量測手法：與 Baseline 完全相同——`MutationObserver` 監看 `Total Update Count` 的 DOM 文字變化判斷單次 `triggerUpdate` 完成，每次 trial 前重新整理頁面重置 metrics，連續觸發 100 次 `Trigger Update`，共 3 次 trial，取 median。

### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 320.200 ms | 162.534 ms              | 21.91 MB       | 29.61 MB      | +7.71 MB  |
| 2     | 342.200 ms | 154.966 ms              | 21.28 MB       | 31.18 MB      | +9.90 MB  |
| 3     | 314.600 ms | 158.669 ms              | 21.57 MB       | 33.29 MB      | +11.72 MB |

Mount Time median：320.200 ms（range 314.600–342.200 ms）
Average Update Duration median：158.669 ms（range 154.966–162.534 ms）

結構性 counter（3 次 trial 完全一致，且與 Vue 3.5.40 Baseline 完全一致）：Total Update Count 100、Updated Component Count 500、Parent Render Count 200、Child Render Count（累計）50000。

### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 360.100 ms | 6.301 ms                | 21.58 MB       | 32.96 MB      | +11.38 MB |
| 2     | 279.000 ms | 6.680 ms                | 21.42 MB       | 32.01 MB      | +10.59 MB |
| 3     | 298.600 ms | 6.488 ms                | 28.71 MB       | 39.58 MB      | +10.88 MB |

Mount Time median：298.600 ms（range 279.000–360.100 ms）
Average Update Duration median：6.488 ms（range 6.301–6.680 ms）

結構性 counter（3 次 trial 完全一致，且與 Vue 3.5.40 Baseline 完全一致）：Total Update Count 100、**Updated Component Count 0**、Parent Render Count 200、**Child Render Count 0**、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 323.100 ms | 6.635 ms                | 21.77 MB       | 34.81 MB      | +13.04 MB |
| 2     | 291.600 ms | 5.330 ms                | 21.49 MB       | 25.27 MB      | +3.78 MB  |
| 3     | 281.700 ms | 6.873 ms                | 21.89 MB       | 31.64 MB      | +9.74 MB  |

Mount Time median：291.600 ms（range 281.700–323.100 ms）
Average Update Duration median：6.635 ms（range 5.330–6.873 ms）

結構性 counter（3 次 trial 完全一致，且與 Vue 3.5.40 Baseline 完全一致）：Total Update Count 100、**Updated Component Count 1**、Parent Render Count 200、**Child Render Count 100**。

Console 觀察：三種 Scope 全程皆無 error / warning，無 `Maximum recursive updates exceeded`。

### Version Comparison（componentCount=500，median，Vue 3.5.40 → Vue 3.6.0-rc.2）

| Update Scope | Metric                  | Vue 3.5.40 | Vue 3.6.0-rc.2 | 差異   |
| ------------ | ----------------------- | ---------- | -------------- | ------ |
| AllChildren  | Average Update Duration | 187.405 ms | 158.669 ms     | -15.3% |
| AllChildren  | Mount Time              | 350.900 ms | 320.200 ms     | -8.7%  |
| ParentOnly   | Average Update Duration | 8.770 ms   | 6.488 ms       | -26.0% |
| ParentOnly   | Mount Time              | 306.800 ms | 298.600 ms     | -2.7%  |
| SingleChild  | Average Update Duration | 9.000 ms   | 6.635 ms       | -26.3% |
| SingleChild  | Mount Time              | 299.400 ms | 291.600 ms     | -2.6%  |

結構性 counter（Total Update Count / Updated Component Count / Parent Render Count / Child Render Count / Parent Tick）在三種 Scope 下，Vue 3.5.40 與 Vue 3.6.0-rc.2 **完全一致**，符合 Hypothesis 的預期——版本升級不會讓任何 Child 被跳過渲染或改變渲染次數。

Average Update Duration 在三種 Scope 下**方向一致地變快**，這點與 [`reactive-chain`](../reactive-chain/README.md) 的驗證結果（-1.6%、判定持平）不同。但幅度是否真的構成「顯著改善」需要對照雜訊帶：

- 這一輪 Vue 3.6.0-rc.2 自己 3 次 trial 之間的變異相對小（AllChildren 154.966–162.534 ms，約 ±2.4%；ParentOnly 6.301–6.680 ms，約 ±3%；SingleChild 5.330–6.873 ms，約 ±13%）。
- 但 Baseline（Vue 3.5.40）自己 3 次 trial 之間的變異明顯更大（ParentOnly 6.654–9.711 ms，約 ±19%；SingleChild 8.962–10.732 ms，約 ±9%；AllChildren 182.206–210.861 ms，約 ±7%）——尤其 ParentOnly 的 baseline 雜訊帶（單一 build 內部可以差到 32%）已經逼近甚至超過這次觀察到的版本間差異（26.0%）。
- 换句話说：**AllChildren 的 -15.3% 與 Mount Time 的全面下降，因為兩版自己的重跑變異都相對較小，比較有機會是真實訊號；但 ParentOnly / SingleChild 這種個位數 ms 等級的 -26% 差異，考慮到 baseline 自己就有將近 -32% 的雜訊帶，還不能排除是雜訊而非版本改善**——這與 reactive-chain 驗證時「這套自動化環境的量測雜訊可能大於真實訊號」的結論一致，只是這次三個 Scope 的方向剛好都一致變快，比 reactive-chain 那次（有快有慢）更像訊號，但也可能只是這次系統負載/GC 排程剛好偏向對 3.6 有利。

Heap Δ 三種 Scope 在 Vue 3.6.0-rc.2 下的範圍（+3.78 MB ~ +13.04 MB）與 Baseline（+0.42 MB ~ +39.23 MB）一樣落在大範圍雜訊帶內，沒有清楚的版本差異訊號，維持 Baseline 驗證時「`performance.memory` 在這套環境下不可靠」的結論。

## componentCount=100

### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 71.000 ms  | 2.755 ms                | 71.20 MB       | 83.57 MB      | +12.37 MB |
| 2     | 79.900 ms  | 1.466 ms                | 48.45 MB       | 49.16 MB      | +0.71 MB  |
| 3     | 78.400 ms  | 1.661 ms                | 48.32 MB       | 48.77 MB      | +0.45 MB  |

Mount Time median：78.400 ms（range 71.000–79.900 ms）
Average Update Duration median：1.661 ms（range 1.466–2.755 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ   |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------- |
| 1     | 77.300 ms  | 1.970 ms                | 44.71 MB       | 46.19 MB      | +1.48 MB |
| 2     | 76.300 ms  | 2.715 ms                | 65.11 MB       | 65.99 MB      | +0.89 MB |
| 3     | 77.000 ms  | 2.313 ms                | 48.48 MB       | 49.37 MB      | +0.89 MB |

Mount Time median：77.000 ms（range 76.300–77.300 ms）
Average Update Duration median：2.313 ms（range 1.970–2.715 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 84.300 ms  | 35.293 ms               | 49.18 MB       | 82.82 MB      | +33.64 MB |
| 2     | 78.100 ms  | 29.364 ms               | 45.01 MB       | 61.48 MB      | +16.47 MB |
| 3     | 81.300 ms  | 31.751 ms               | 48.74 MB       | 63.04 MB      | +14.30 MB |

Mount Time median：81.300 ms（range 78.100–84.300 ms）
Average Update Duration median：31.751 ms（range 29.364–35.293 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 100、Parent Render Count 200、Child Render Count 10000。

### Update Scope Comparison（componentCount=100，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count |
| ------------ | ----------------------- | ----------------------- | ------------------ |
| ParentOnly   | 1.661 ms                | 0                       | 0                  |
| SingleChild  | 2.313 ms                | 1                       | 100                |
| AllChildren  | 31.751 ms               | 100                     | 10000              |

## componentCount=1000

### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 623.500 ms | 22.806 ms               | 54.63 MB       | 70.23 MB      | +15.60 MB |
| 2     | 713.200 ms | 20.839 ms               | 57.46 MB       | 73.79 MB      | +16.34 MB |
| 3     | 587.800 ms | 20.638 ms               | 57.46 MB       | 73.81 MB      | +16.35 MB |

Mount Time median：623.500 ms（range 587.800–713.200 ms）
Average Update Duration median：20.839 ms（range 20.638–22.806 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 574.600 ms | 19.846 ms               | 54.70 MB       | 71.56 MB      | +16.85 MB |
| 2     | 573.200 ms | 23.256 ms               | 57.55 MB       | 75.93 MB      | +18.38 MB |
| 3     | 569.300 ms | 19.152 ms               | 57.55 MB       | 98.98 MB      | +41.44 MB |

Mount Time median：573.200 ms（range 569.300–574.600 ms）
Average Update Duration median：19.846 ms（range 19.152–23.256 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 543.600 ms | 333.598 ms              | 118.61 MB      | 86.86 MB      | -31.74 MB |
| 2     | 482.500 ms | 327.393 ms              | 108.48 MB      | 85.11 MB      | -23.37 MB |
| 3     | 458.700 ms | 323.930 ms              | 108.23 MB      | 86.10 MB      | -22.14 MB |

Mount Time median：482.500 ms（range 458.700–543.600 ms）
Average Update Duration median：327.393 ms（range 323.930–333.598 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1000、Parent Render Count 200、Child Render Count 100000。

Heap Δ 這三個 trial 全部是負值（heap 反而變小），推斷是 100 次觸發、每次都新建 1000 個 derived 陣列，總耗時拉長到 ~35 秒後 V8 在期間跑了 major GC，而不是這個 Scope 不耗記憶體——再次印證 `performance.memory` 在這套環境下不可靠。

### Update Scope Comparison（componentCount=1000，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count |
| ------------ | ----------------------- | ----------------------- | ------------------ |
| ParentOnly   | 20.839 ms               | 0                       | 0                  |
| SingleChild  | 19.846 ms               | 1                       | 100                |
| AllChildren  | 327.393 ms              | 1000                    | 100000             |

## Component Scale Comparison（跨 componentCount=100/500/1000，Average Update Duration median，ms）

| Update Scope | 100       | 500        | 1000       | 100→1000 倍數 |
| ------------ | --------- | ---------- | ---------- | ------------- |
| ParentOnly   | 1.661 ms  | 8.770 ms   | 20.839 ms  | ×12.5         |
| SingleChild  | 2.313 ms  | 9.000 ms   | 19.846 ms  | ×8.6          |
| AllChildren  | 31.751 ms | 187.405 ms | 327.393 ms | ×10.3         |

這是本輪最意外的發現，直接回答 Research Question 1（Component Scale 增加時 Runtime Cost 是否增加）：

- **AllChildren 隨 componentCount 幾乎線性增加**（100→1000，count ×10，duration ×10.3），符合直覺——props 真的變了的 Child 數量越多，patch 成本越高。
- **ParentOnly 和 SingleChild 不是常數，也隨 componentCount 明顯增加**（ParentOnly 100→1000 duration ×12.5、SingleChild ×8.6），即使兩者的 Updated Component Count／Child Render Count 完全不隨 componentCount 改變（ParentOnly 永遠是 0，SingleChild 永遠是 1）。換句話說：**Child Props 沒變不代表 Update 免費**——Parent re-render 時，Vue 仍需要走過 `v-for` 產生的整個 vnode 陣列做 key 比對／props 比對來判斷「這個 Child 要不要 patch」，這個「走過陣列」的成本本身就跟陣列長度（componentCount）成正比，只是比 AllChildren 的「走過陣列 + 真的 patch 每一個」還便宜一個量級（1000 時：ParentOnly 20.839ms vs AllChildren 327.393ms，約 15.7 倍）。
- 這對「大型後台系統一個 Parent 掛大量結構一致 Child」的真實開發意涵：**Child 數量本身就是成本，跟改了幾個 Child 的 Props 是兩件事**——就算只改 Parent 自己的狀態、完全不碰任何 Child Props，Child 數量從 100 長到 1000，這次「無關」的 re-render 也會慢十幾倍。這不是 Vue 的 bug，是 `v-for` 掃描陣列的必要成本，光靠換 Vue 版本不會消失，真正該做的工程改善是 Component Boundary 設計（例如把不常變動的大量 Child 拆到 Parent re-render 不會牽連到的獨立元件 / 用 `key` 穩定住 vnode reuse），這點呼應 Research Rule 第 4 條「不在沒有真實問題前先做效能優化」——但這裡是先有實測數字才看到問題，不是先猜。

Console 觀察：全部 18 次 trial（2 個新 Scale × 3 Scope × 3 trial）皆無 error / warning，無 `Maximum recursive updates exceeded`。

## Validation Result

### Vue 3.5 Baseline

`componentCount=500`，三種 `updateScope` 各 3 次 trial × 100 次 update：Average Update Duration median——AllChildren 187.405 ms、ParentOnly 8.770 ms、SingleChild 9.000 ms。結構性 counter（Updated Component Count / Parent Render Count / Child Render Count）三種 Scope 各自的 3 次 trial 完全一致。

### Vue 3.6 Validation

`componentCount=500`（相同 Scenario Code、相同瀏覽器分頁、相同量測手法），三種 `updateScope` 各 3 次 trial × 100 次 update：Average Update Duration median——AllChildren 158.669 ms、ParentOnly 6.488 ms、SingleChild 6.635 ms。結構性 counter 與 Vue 3.5.40 Baseline **逐項完全一致**（見上方「Version Comparison」表）。

### Improvement

三種 Update Scope 的 Average Update Duration 與 Mount Time 在 Vue 3.6.0-rc.2 下**方向一致地變快**（-2.6% ~ -26.3%），這點與 reactive-chain 驗證（-1.6%、判定持平）不同，是本次驗證與先前驗證最大的差異。但幅度是否構成「顯著改善」需分開看：

- **AllChildren（-15.3% Update Duration、-8.7% Mount Time）**：兩版自己的 3 次 trial 內部變異都相對小（3.6 約 ±2.4%、3.5.40 約 ±7%），版本間差異大於雙方各自的雜訊帶，判定為**有觀察到改善**，但仍建議以更多 trial 數驗證。
- **ParentOnly／SingleChild（-26% 上下）**：這兩個 Scope 的絕對時間落在個位數 ms，Baseline 自己的雜訊帶就達 19%~32%（尤其 ParentOnly），版本間的 -26% 差異雖然數字上更大，但無法排除是雜訊而非真實改善——**方向上像是變快，但目前的量測精度不足以下「顯著改善」的結論**。

結構性 counter（Updated Component Count / Parent Render Count / Child Render Count）在兩版完全相同，代表 Vue 3.6 沒有讓任何 Child 被跳過渲染，也沒有改變渲染次數本身——與 Hypothesis 預期一致。

## Final Conclusion（componentCount=500）

### 1. Vue Runtime 改善了什麼？

Component Update 與 Mount 的**單位執行成本**可能降低了（三種 Update Scope 的 Average Update Duration、Mount Time 都朝同一方向變快），但**沒有改變**渲染次數 / 波及範圍這類離散指標——Updated Component Count、Parent Render Count、Child Render Count 在兩版完全相同。

### 2. 改善到什麼程度？

- AllChildren（Worst Case，大量 Child 真的被 patch）：**Minor–Moderate improvement**（-15.3%，訊號強度足以與雜訊區分）。
- ParentOnly／SingleChild（少量或零 Child 被 patch，純粹是「走過 vnode 陣列」的成本）：**方向像 Minor improvement，但因絕對值小、雜訊帶大，實際上接近 No measurable improvement 的邊界**，不排除是雜訊。

整體判定：**Minor improvement**，且需要更多 trial／正式版 Vue 3.6 才能把「像改善」的訊號和自動化環境雜訊分開。

### 3. 還需要工程改善嗎？

需要，而且比 Vue 版本差異重要得多。呼應本 Baseline 驗證時發現的「Component Scale Comparison」結果：componentCount 從 100 長到 1000，ParentOnly／SingleChild 的 Update Duration 各自被拉長 12.5 倍／8.6 倍——**即使 Child 的 Props 完全沒變**。Vue Runtime 版本頂多把「走過這個陣列」的單位成本降低幾個百分點，無法讓這個成本消失，因為它源自 Component Tree 的結構（一個 Parent 掛大量結構一致的 Child），這是 Component Architecture／State Design 的問題，不是 Reactivity Engine 的問題。

---

## Decision

**Framework Cost 是否改善？**
Yes——三種 Update Scope 的 Average Update Duration、Mount Time 在 Vue 3.6.0-rc.2 下都朝同一方向變快，其中 AllChildren（-15.3%）的訊號強度足以與雙方自身的雜訊帶區分；ParentOnly／SingleChild（各約 -26%）方向一致但因絕對值小、雜訊帶大，訊號沒那麼確定。整體判定為「有觀察到改善，但幅度中等偏小、部分指標接近雜訊邊界」。

**是否值得升級 Vue 3.6？**
No（目前階段）——`3.6.0-rc.2` 仍是 release candidate，非正式版；且本次觀察到的改善多數是個位數到十位數 ms 等級，幅度不足以構成「不升級會拖慢真實產品」的急迫理由。應等正式版釋出、且用更多 trial／真人前景操作重新驗證訊號是否穩定，再決定是否升級。

**是否仍需改善 Component Architecture？**
Yes（幾乎所有大型專案都是如此）——Baseline 驗證已經證明：Child 數量本身就是成本，跟改了幾個 Child 的 Props 是兩件事。就算只改 Parent 自己的狀態、完全不碰任何 Child Props，Child 數量從 100 長到 1000，這次「無關」的 re-render 也會慢十幾倍。這個成本來自 `v-for` 掃描陣列與 key/props 比對的必要開銷，屬於 Component Boundary／Tree 設計問題，Vue Runtime 版本升級無法讓它消失。

### 結論

Framework 可以降低 Runtime Cost——本輪驗證中，Vue 3.6.0-rc.2 在三種 Update Scope 下都讓「每次 update / mount 的單位執行成本」變快，代表 Vue 團隊優化 Runtime 內部實作（例如 patch / diff / mount 路徑）確實能讓同一份 Component Tree 跑起來更快，這是版本升級能單方面提供的收益，不需要動任何一行應用程式碼。

Architecture 決定 Runtime 的上限——但這個收益是**乘數性的、不是結構性的**：不管 Framework 把單位成本壓得多低，Component Tree 的形狀（掛了多少個 Child、Update 牽連多少個 Child）決定了這個乘數要乘上多大的底數。Baseline 驗證已經證明，光是 componentCount 從 100 長到 1000，即使完全不碰 Child Props，Update Duration 也被拉長 8.6~12.5 倍——這個倍數是 Framework 版本救不了的，因為它不是「每次操作多花多少 ms」的問題，是「一次操作要做幾次操作」的問題。Framework 優化的是斜率，Architecture 決定的是自變數的量級；只升級 Vue 版本、不重新設計 Component Boundary（例如把不常變動的大量 Child 獨立拆分、避免無關 Parent 更新牽連整個陣列），Runtime Cost 的上限依然被 Architecture 卡住。

## Limitation

- 分頁全程 `document.hidden === true`（claude-in-chrome 的固有限制），無法排除背景分頁 CPU 排程降級對 ms 等級數字的影響，已用 MutationObserver 手法緩解但無法完全消除。
- `performance.memory.usedJSHeapSize` 受 V8 GC 時機影響極大，不能作為版本或 Scope 比較的可靠證據；之後如需更可信的 Memory 證據，應改用 Chrome DevTools Memory 面板的 Heap Snapshot diff（需要真人操作，非目前自動化管道能可靠取得）。
- `componentCount=500` 的 3 次 trial 樣本數偏少，尤其 ParentOnly／SingleChild 這種個位數 ms 等級的指標，雜訊帶（±19%~32%）已經逼近觀察到的版本間差異（-26%），現有數據**不足以**排除「這次觀察到的改善其實是雜訊」的可能性。
- `componentCount=100`／`1000` 目前仍只有 Vue 3.5.40 Baseline，尚未執行 Vue 3.6 Validation，因此還不能確認「componentCount 越大，版本差異是否越明顯」這類延伸問題。
- `3.6.0-rc.2` 是 release candidate，非正式版，可能還有 dev-only assertion 或尚未完成的最佳化，正式版數字可能不同。

## Next Step

1. 等 Vue 3.6 出正式版（而非 rc.2）後，用相同方法對 `componentCount=500` 重新驗證一次，確認這次觀察到的方向一致的改善是否穩定重現。
2. 把 trial 數拉高（例如 10+ 次）並報告標準差，或改用真人操作、分頁保持前景 focus 的方式重跑，排除自動化環境固有的背景節流雜訊，才能確認 ParentOnly／SingleChild 的 -26% 差異是訊號還是雜訊。
3. 若要讓 Memory 證據更可信，改用真人操作 + Chrome DevTools Memory 面板 Heap Snapshot diff，而非目前的 `performance.memory` 自動化讀值。
4. 若時間允許，可再補測 `componentCount=100/1000` 的 Vue 3.6 Validation（維持三種 `updateScope`），觀察 Component Scale 是否放大或縮小版本間的差異。
5. 在目前證據下，不建議只因為「升級 Vue 版本」就去改這個 scenario 的 Component Boundary／Architecture——真正該優化的是「一個 Parent 是否真的需要掛上千個結構一致的 Child」，這是工程設計問題，Framework 版本只能緩解、不能解決。
6. **見下方「Runtime Attribution Validation」——上面 -15.3% 的判定目前只有 wall-clock 總時間證據，尚未有 Framework-layer 拆解證據支持，應視為 pending。**

## Runtime Attribution Validation（Day 30，componentCount=500 / AllChildren）

### Question

上面「Vue 3.6.0-rc.2 −15.3% Update Duration」這個總時間差異，主要來自哪一層——Application
JavaScript？Vue Runtime？Browser Rendering/Painting？還是無法歸類的 Other Browser cost？

### Hypothesis

參考 vdom-stress／composable-chaos 的 CDP Trace 雙軌量測（Dual-Trace Architecture：
cost-trace 測 Scripting/Rendering/Painting，runtime-attribution-trace 測 CPU-profiler
sample attribution），預期可以把總時間拆成幾個獨立成本層，並觀察 Vue Runtime CPU 這一層
本身是否有可重現的下降。

### Observation

用既有 CDP Trace Infrastructure（沿用 vdom-stress／composable-chaos 已驗證的
chrome.ts/tracer.ts/sync.ts/parser.ts/rollup.ts/attribution.ts/evidence.ts，新增
`component-storm-scenario.ts` adapter，Scenario 本身完全未修改）對 `componentCount=500`、
`updateScope='AllChildren'` 做單次 Trigger Update 的 n=10 trial 拆解，發現：

1. **這套 isolated headless CDP 環境量到的 Update Duration（84.9ms → 92.1ms，+8.5%）跟上面
   claude-in-chrome 背景分頁量到的（187.405ms → 158.669ms，-15.3%）量級與方向都不一致**——
   兩者是不同 harness（是否為背景/hidden 分頁），不能直接比較或相減。
2. 拆解出的每個 metric（Scripting、Rendering、Recalculate Style、Layout、Painting、
   Vue Runtime CPU、Application CPU）在這個 harness 下 Signal 皆為 `Unstable`（只有
   Paint 達到 `Stable / No Meaningful Difference`），沒有任何一項達到 `Consistent
   Improvement`。
3. **Vue Runtime CPU 本身中位數是變高、不是變低**（70.1ms → 73.4ms，+4.7%，Unstable）——
   沒有證據支持「Vue Runtime 變快了」。

完整方法論、逐 metric 表格、cost breakdown chart 見
[`results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md`](../../../results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md)。

### Conclusion

**Insufficient Evidence**（不是 Proven，也不是乾淨的 Observed）：上面的 -15.3% 目前只有
wall-clock 總時間證據，這次的 Framework-layer 拆解既沒有重現同方向的訊號，也沒有找到任何
一層有可重現的改善——尤其 Vue Runtime CPU 這一層，點估計甚至是變高。上面「Minor
improvement」的判定應視為 **pending**，需要用相同 harness（背景/hidden 分頁）重新驗證才能
確認 -15.3% 本身是不是真訊號，而不是被本次結果推翻。

**Follow-up（已找到根因）**：用 CDP 直接控制 `document.hidden` 狀態（開第二個 tab 並
`Target.activateTarget` 即可把原本的 tab 推到 hidden，不需要靠 claude-in-chrome）重跑同一支
protocol 發現：**hidden 狀態下幾乎完全重現 README 的量級與方向**（177.3ms → 140.4ms，
-20.8%，對照 README 187.405ms → 158.669ms，-15.3%），但 **visible 狀態下兩版幾乎沒有差異**
（35.0ms → 35.9ms，+2.4%，判定 Stable / No Meaningful Difference）。換句話說：**上面的
-15.3% 很可能主要是背景分頁 CPU 節流的量測假象，不是 Vue Runtime 真的變快**——但也不能反過來
說「Vue 3.6 變差了」，因為乾淨（無節流）條件下兩版根本測不出有意義的差異。細節見
[`results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md`](../../../results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md) 的 Part 2。

### Next Step（Attribution 專用）

1. 用 claude-in-chrome（或任何能強制 `document.hidden === true` 的方式）重跑這套 CDP Trace
   矩陣，讓 harness 跟原本 -15.3% 觀察一致，才能真正回答「這個特定數字」的歸因問題。
2. 若要提高 Vue Runtime CPU attribution 的 confidence（目前 `low`），需要把 leaf-only
   sample attribution 改成往上找最近有 `url` 的 ancestor frame——這是 `attribution.ts`
   已知但未修的限制，不在本次範圍。
3. 若之後有人想知道上面 Mount Time 的 -8.7% 怎麼拆解，需要另外設計「Tracing.start 在
   Page.navigate 之前」的協定（Component Storm 的 Mount 不像 vdom-stress 能用按鈕觸發），
   本次未做。
