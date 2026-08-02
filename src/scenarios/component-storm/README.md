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
