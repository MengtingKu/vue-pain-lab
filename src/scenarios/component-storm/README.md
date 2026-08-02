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

## Observation（Baseline only — Vue 3.6 Validation 尚未執行）

`componentCount` 覆蓋 `100`／`500`／`1000` 三個 Scale，各 Scale 下三種 `updateScope` 各跑 3 次 trial（每次 trial 前重新整理頁面重置 metrics，連續觸發 100 次 Trigger Update）。數字直接讀取畫面 Runtime Metrics。

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
| 1     | 381.800 ms | 6.654 ms                 | 103.75 MB      | 110.36 MB     | +6.63 MB  |
| 2     | 295.900 ms | 9.711 ms                 | 51.62 MB       | 64.55 MB      | +12.93 MB |
| 3     | 306.800 ms | 8.770 ms                 | 48.79 MB       | 64.09 MB      | +15.30 MB |

Mount Time median：306.800 ms（range 295.900–381.800 ms）
Average Update Duration median：8.770 ms（range 6.654–9.711 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、**Updated Component Count 0**、Parent Render Count 200、**Child Render Count 0**、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ----------------------- | -------------- | ------------- | --------- |
| 1     | 266.600 ms | 10.732 ms                | 49.05 MB       | 64.59 MB      | +15.54 MB |
| 2     | 299.400 ms | 9.000 ms                 | 51.72 MB       | 63.53 MB      | +11.80 MB |
| 3     | 309.700 ms | 8.962 ms                 | 51.70 MB       | 63.52 MB      | +11.81 MB |

Mount Time median：299.400 ms（range 266.600–309.700 ms）
Average Update Duration median：9.000 ms（range 8.962–10.732 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、**Updated Component Count 1**、Parent Render Count 200、**Child Render Count 100**。

### Update Scope Comparison（Vue 3.5.40，componentCount=500，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count（累計，100 次觸發） | Parent Render Count |
| ------------- | ------------------------ | ------------------------ | ----------------------------------- | -------------------- |
| ParentOnly    | 8.770 ms                 | 0                         | 0                                    | 200                   |
| SingleChild   | 9.000 ms                 | 1                         | 100                                  | 200                   |
| AllChildren   | 187.405 ms                | 500                       | 50000                                | 200                   |

直接回答 Research Question 2 與 3：

- **Research Question 2（Parent Update 是否一定導致所有 Child 重新 Render？）**：不會。`ParentOnly` 下 Child Render Count 全程為 0、Updated Component Count 為 0——Props 沒變的 Child 完全沒有重新 render，符合 Vue 的 Props 比對機制預期。
- **Research Question 3（不同 Update Scope 的 Runtime Cost 差多少？）**：`ParentOnly`（8.770 ms）與 `SingleChild`（9.000 ms）幾乎沒有差異（只差 0.230 ms，落在雜訊帶內）——代表這個 scenario 下，「Parent 自身 re-render 一次」和「多渲染 1 個 Child」的成本幾乎可忽略不計，真正貴的是 `AllChildren`（187.405 ms），比 `ParentOnly` 慢了約 **21.4 倍**。Parent Render Count 在三種 Scope 下都固定是 200（不受 Update Scope 影響，只受觸發次數影響），代表 Parent 本身一定會 re-render，差異完全來自「牽連了多少個 Child」。

JS Execution Time（= Average Update Duration × 100 次觸發）：AllChildren median 18740.5 ms；ParentOnly median 877.0 ms；SingleChild median 900.0 ms。與 Update Duration 的量級差異一致。

Memory（JS Heap `usedJSHeapSize`，`performance.memory`）：三種 Scope 的 Heap Δ 都落在 +0.42 MB ~ +39.23 MB 這種大範圍雜訊帶內，且 ParentOnly / SingleChild 彼此的 Heap Δ 量級（+6.6~+15.5 MB）跟 AllChildren（-2.9~+39.2 MB）沒有清楚的區隔，判斷主要受 V8 GC 排程時機影響，而非三種 Update Scope 本身的記憶體成本差異——與 reactive-chain 驗證時觀察到「這套自動化環境的量測雜訊可能大於真實訊號」的結論一致。目前的量測精度**不足以**拿 Heap Δ 區分 Update Scope 或版本差異。

Console 觀察：三種 Scope 全程皆無 error / warning，無 `Maximum recursive updates exceeded`。

## componentCount=100

### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ------------------------ | --------------- | -------------- | --------- |
| 1     | 71.000 ms  | 2.755 ms                  | 71.20 MB         | 83.57 MB        | +12.37 MB |
| 2     | 79.900 ms  | 1.466 ms                  | 48.45 MB         | 49.16 MB        | +0.71 MB  |
| 3     | 78.400 ms  | 1.661 ms                  | 48.32 MB         | 48.77 MB        | +0.45 MB  |

Mount Time median：78.400 ms（range 71.000–79.900 ms）
Average Update Duration median：1.661 ms（range 1.466–2.755 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ   |
| ----- | ---------- | ------------------------ | --------------- | -------------- | -------- |
| 1     | 77.300 ms  | 1.970 ms                  | 44.71 MB         | 46.19 MB        | +1.48 MB |
| 2     | 76.300 ms  | 2.715 ms                  | 65.11 MB         | 65.99 MB        | +0.89 MB |
| 3     | 77.000 ms  | 2.313 ms                  | 48.48 MB         | 49.37 MB        | +0.89 MB |

Mount Time median：77.000 ms（range 76.300–77.300 ms）
Average Update Duration median：2.313 ms（range 1.970–2.715 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ------------------------ | --------------- | -------------- | --------- |
| 1     | 84.300 ms  | 35.293 ms                 | 49.18 MB         | 82.82 MB        | +33.64 MB |
| 2     | 78.100 ms  | 29.364 ms                 | 45.01 MB         | 61.48 MB        | +16.47 MB |
| 3     | 81.300 ms  | 31.751 ms                 | 48.74 MB         | 63.04 MB        | +14.30 MB |

Mount Time median：81.300 ms（range 78.100–84.300 ms）
Average Update Duration median：31.751 ms（range 29.364–35.293 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 100、Parent Render Count 200、Child Render Count 10000。

### Update Scope Comparison（componentCount=100，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count |
| ------------- | ------------------------- | ------------------------- | -------------------- |
| ParentOnly    | 1.661 ms                   | 0                          | 0                     |
| SingleChild   | 2.313 ms                   | 1                          | 100                   |
| AllChildren   | 31.751 ms                  | 100                        | 10000                 |

## componentCount=1000

### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ------------------------ | --------------- | -------------- | --------- |
| 1     | 623.500 ms | 22.806 ms                 | 54.63 MB         | 70.23 MB        | +15.60 MB |
| 2     | 713.200 ms | 20.839 ms                 | 57.46 MB         | 73.79 MB        | +16.34 MB |
| 3     | 587.800 ms | 20.638 ms                 | 57.46 MB         | 73.81 MB        | +16.35 MB |

Mount Time median：623.500 ms（range 587.800–713.200 ms）
Average Update Duration median：20.839 ms（range 20.638–22.806 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ------------------------ | --------------- | -------------- | --------- |
| 1     | 574.600 ms | 19.846 ms                 | 54.70 MB         | 71.56 MB        | +16.85 MB |
| 2     | 573.200 ms | 23.256 ms                 | 57.55 MB         | 75.93 MB        | +18.38 MB |
| 3     | 569.300 ms | 19.152 ms                 | 57.55 MB         | 98.98 MB        | +41.44 MB |

Mount Time median：573.200 ms（range 569.300–574.600 ms）
Average Update Duration median：19.846 ms（range 19.152–23.256 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ    |
| ----- | ---------- | ------------------------ | --------------- | -------------- | --------- |
| 1     | 543.600 ms | 333.598 ms                | 118.61 MB        | 86.86 MB        | -31.74 MB |
| 2     | 482.500 ms | 327.393 ms                | 108.48 MB        | 85.11 MB        | -23.37 MB |
| 3     | 458.700 ms | 323.930 ms                | 108.23 MB        | 86.10 MB        | -22.14 MB |

Mount Time median：482.500 ms（range 458.700–543.600 ms）
Average Update Duration median：327.393 ms（range 323.930–333.598 ms）

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1000、Parent Render Count 200、Child Render Count 100000。

Heap Δ 這三個 trial 全部是負值（heap 反而變小），推斷是 100 次觸發、每次都新建 1000 個 derived 陣列，總耗時拉長到 ~35 秒後 V8 在期間跑了 major GC，而不是這個 Scope 不耗記憶體——再次印證 `performance.memory` 在這套環境下不可靠。

### Update Scope Comparison（componentCount=1000，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count |
| ------------- | -------------------------- | ------------------------- | -------------------- |
| ParentOnly    | 20.839 ms                   | 0                          | 0                     |
| SingleChild   | 19.846 ms                   | 1                          | 100                   |
| AllChildren   | 327.393 ms                  | 1000                       | 100000                |

## Component Scale Comparison（跨 componentCount=100/500/1000，Average Update Duration median，ms）

| Update Scope | 100        | 500        | 1000       | 100→1000 倍數 |
| ------------- | ---------- | ---------- | ---------- | -------------- |
| ParentOnly    | 1.661 ms   | 8.770 ms   | 20.839 ms  | ×12.5           |
| SingleChild   | 2.313 ms   | 9.000 ms   | 19.846 ms  | ×8.6            |
| AllChildren   | 31.751 ms  | 187.405 ms | 327.393 ms | ×10.3           |

這是本輪最意外的發現，直接回答 Research Question 1（Component Scale 增加時 Runtime Cost 是否增加）：

- **AllChildren 隨 componentCount 幾乎線性增加**（100→1000，count ×10，duration ×10.3），符合直覺——props 真的變了的 Child 數量越多，patch 成本越高。
- **ParentOnly 和 SingleChild 不是常數，也隨 componentCount 明顯增加**（ParentOnly 100→1000 duration ×12.5、SingleChild ×8.6），即使兩者的 Updated Component Count／Child Render Count 完全不隨 componentCount 改變（ParentOnly 永遠是 0，SingleChild 永遠是 1）。換句話說：**Child Props 沒變不代表 Update 免費**——Parent re-render 時，Vue 仍需要走過 `v-for` 產生的整個 vnode 陣列做 key 比對／props 比對來判斷「這個 Child 要不要 patch」，這個「走過陣列」的成本本身就跟陣列長度（componentCount）成正比，只是比 AllChildren 的「走過陣列 + 真的 patch 每一個」還便宜一個量級（1000 時：ParentOnly 20.839ms vs AllChildren 327.393ms，約 15.7 倍）。
- 這對「大型後台系統一個 Parent 掛大量結構一致 Child」的真實開發意涵：**Child 數量本身就是成本，跟改了幾個 Child 的 Props 是兩件事**——就算只改 Parent 自己的狀態、完全不碰任何 Child Props，Child 數量從 100 長到 1000，這次「無關」的 re-render 也會慢十幾倍。這不是 Vue 的 bug，是 `v-for` 掃描陣列的必要成本，光靠換 Vue 版本不會消失，真正該做的工程改善是 Component Boundary 設計（例如把不常變動的大量 Child 拆到 Parent re-render 不會牽連到的獨立元件 / 用 `key` 穩定住 vnode reuse），這點呼應 Research Rule 第 4 條「不在沒有真實問題前先做效能優化」——但這裡是先有實測數字才看到問題，不是先猜。

Console 觀察：全部 18 次 trial（2 個新 Scale × 3 Scope × 3 trial）皆無 error / warning，無 `Maximum recursive updates exceeded`。

## Limitation

- 分頁全程 `document.hidden === true`（claude-in-chrome 的固有限制），無法排除背景分頁 CPU 排程降級對 ms 等級數字的影響，已用 MutationObserver 手法緩解但無法完全消除。
- `performance.memory.usedJSHeapSize` 受 V8 GC 時機影響極大（`componentCount=1000` 的 AllChildren 甚至因為 trial 耗時夠長而觀察到 heap 不升反降），不能作為版本或 Scope 比較的可靠證據；之後如需更可信的 Memory 證據，應改用 Chrome DevTools Memory 面板的 Heap Snapshot diff（需要真人操作，非目前自動化管道能可靠取得）。
- 本輪已完成 Vue 3.5.40 Baseline（`componentCount=100/500/1000` × 三種 `updateScope`，共 9 組合、27 次 trial），但尚未執行 Vue 3.6 Validation，因此還不能回答 Question 中的版本比較問題。
- Mount Time 未特別分析隨 componentCount 的縮放（雖然數字方向符合直覺：100→81.3ms、500→350.9ms、1000→623.5ms，粗略也接近線性），因為 Mount 只發生一次、單一 trial 的雜訊佔比更高，這裡先不下結論。

## Next Step

1. 安裝 `vue@3.6.0-rc.2`，用完全相同手法（MutationObserver、3 trial × 100 次 Trigger Update）對 `componentCount=500` 的三種 `updateScope` 分別重新量測，取得 Validation 數據後與本 Baseline 比較。
2. 若要讓 Memory 證據更可信，改用真人操作 + Chrome DevTools Memory 面板 Heap Snapshot diff，而非目前的 `performance.memory` 自動化讀值。
3. 若時間允許，可再補測 `componentCount=100/1000`（維持三種 `updateScope`），觀察 Component Scale 是否改變 Update Scope 之間的相對差距（例如 AllChildren 相對 ParentOnly 的倍數是否隨數量增加而擴大）。
