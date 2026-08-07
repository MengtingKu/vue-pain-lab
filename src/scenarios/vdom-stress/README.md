# VDOM Stress Test

## Purpose

本 Scenario 研究：大量 UI Rendering 時 Vue Runtime 成本。

這不是研究 VDOM 演算法本身，也不是比較 VDOM 與其他 Rendering Model。目標只是建立一個「一次性 Render 大量結構一致 UI Node」的 Raw Rendering Baseline，之後用同一份 Scenario 比較不同 Vue 版本的 Runtime 成本。

## Hypothesis

當 UI Node 數量增加：

Rendering Cost 會增加。

## Scenario Design

可選擇 Render 數量：`100` / `500` / `1000` / `5000`。

點擊 Trigger Render 後，一次性建立對應數量的 Card 陣列並交給 Vue 掛載，每張 Card 內容固定：

- `id`
- `title`（顯示為 `Card #1`、`Card #2` ... ）

畫面顯示：

- 可切換的 Render Count 選項
- Trigger Render 按鈕
- 目前 Render Count（實際已掛載的 Card 數量）
- Render Metrics：`renderStartTime` / `renderEndTime` / `renderDuration`（皆使用 `performance.now()` 量測，`renderDuration` 等到 Vue 實際完成 DOM 掛載後才計算）

## Not Included

刻意不加入：

- API
- Pinia
- Router
- Watch
- Computed Chain
- Async Logic
- Business Logic

也不加入任何 Rendering 最佳化：

- virtual scrolling
- memoization
- component caching
- lazy rendering

原因：本 Scenario 只研究 Large UI Rendering Cost，需要建立 Raw Rendering Baseline，任何最佳化或額外邏輯都會混入其他變因，讓量測結果失真。

## Future Validation

Day18：Vue 3.5 Baseline

Day19：Vue 3.6 Validation

實際的 Question / Hypothesis / Observation / Next Step 留待用 `.claude/skills/validate-vue-update` 執行版本驗證時再補上。
