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
- `renderType`：`mount` / `update` 分類，純觀察用途，判斷依據是「觸發 Trigger Render 當下 `cards` 是否為空陣列」——空陣列代表這次是首次建立 N 個全新 vnode 並掛載（Mount），非空陣列代表這次是用既有 key（`card.id`）對舊列表做 diff/patch（Update）。判斷發生在 `renderStartTime` 記錄之前，不計入量測時間。

Mount vs Update 判斷規則（供 Evidence Matrix 記錄用）：

- **Mount**：頁面剛載入、或上一次已將 Render Count 清空後，第一次點擊 Trigger Render。
- **Update**：`cards` 已有內容時再次點擊 Trigger Render（不論是否切換 Render Count），Vue 走的是既有 vnode 的 diff/patch 路徑，而非重新建立。

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

## Question

大量 UI Rendering 時，Vue Runtime 與 Browser Rendering Pipeline 的成本在哪裡？隨 Node Count 增加，Scripting（Vue Runtime 自己的執行成本）與 Rendering（Recalculate Style / Layout，Browser Pipeline 成本）哪一個先成為瓶頸？

## Baseline Snapshot

- Vue Version：`3.5.40`
- Node.js：v24.13.0
- Browser：Chrome（人工手動操作，前景分頁，DevTools Performance 面板手動錄製）
- Vite：v8.1.5
- Scenario Parameters：Render Count `100` / `500` / `1000` / `5000`，各測 Mount（頁面重新整理後第一次 Trigger Render）與 Update（`cards` 已有內容時再次 Trigger Render）
- Git Commit（實驗開始時的已提交基準）：`1af9c2f`

## Validation Snapshot（Vue 3.6.0-rc.2）

- Vue Version：`3.6.0-rc.2`（Vue 3.6 尚未有 stable release，採用與本 Lab `reactive-chain` scenario 驗證時相同的版本，維持一致性）
- Node.js：v24.13.0（與 Baseline 相同）
- Browser：Chrome（人工手動操作，前景分頁，DevTools Performance 面板手動錄製，與 Baseline 相同操作者、相同流程）
- Vite：v8.1.5（與 Baseline 相同）
- TypeScript：6.0.3（與 Baseline 相同）
- Scenario Parameters：與 Baseline 相同——Render Count `100` / `500` / `1000` / `5000`，各測 Mount 與 Update
- 唯一變更變因：`package.json` 的 `vue` 由 `3.5.40` 改為 `3.6.0-rc.2`（`--save-exact`），Scenario 原始碼、Benchmark 邏輯、CSS 完全未動
- Dev server 依 `.claude/skills/validate-vue-update` 的 Process Management Rule 重啟（僅終止該 scenario 使用的指定 PID，未使用 `taskkill /IM node.exe`）

## Hypothesis

依 README 開頭的 Hypothesis「UI Node 數量增加，Rendering Cost 會增加」，預測：

- Mount：Render Duration、Scripting、Rendering（Recalculate Style + Layout）都應隨 Node Count 增加而增加。因為每張 Card 都是獨立 DOM 節點，Layout 需要重新計算 `.cards__list` 這個 CSS Grid（`grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`）容器內所有子節點的排版，預期 Layout 是 Rendering 成本中最主要的一項，且隨 Node Count 接近線性成長。
- Update：因為 `triggerRender()` 每次都用相同規則（`id` 從 1 開始、`title` 為 `Card #${i}`）重建陣列，內容其實與前一次完全相同，Vue 的 keyed diff 找到 `sameVnode` 後比對文字內容也會發現值相同，預期 Update 幾乎不會真的寫入 DOM，Rendering / Painting 成本應遠低於 Mount，且成本主要集中在 Scripting（vnode 建立與 diff 本身的 JS 成本）。
- Painting：因為 `.cards__list` 有 `max-height: 480px; overflow-y: auto`，超出可視範圍的 Card 理論上不需要真的被 Paint，預期 Painting 成本不會隨 Node Count 等比例增加。

## Observation

以下數字皆為人工操作 Chrome DevTools Performance 面板單次錄製讀值（非自動化、非多次 trial median），Mount 為頁面重新整理後第一次 Trigger Render，Update 為 `cards` 已有內容時再次 Trigger Render：

### Mount

| Node Count | Render Duration | Scripting | Rendering | Painting | Recalculate Style | Layout | Paint |
| ---------: | ---------------: | --------: | --------: | -------: | -----------------: | ------: | -----: |
|        100 |          4.300 ms |      9 ms |      7 ms |     3 ms |             0.6 ms | 4.8 ms | 2.3 ms |
|        500 |         11.800 ms |     16 ms |     28 ms |     5 ms |             2.5 ms | 22.4 ms | 5.0 ms |
|       1000 |         18.300 ms |     25 ms |     55 ms |     8 ms |             4.9 ms | 44.8 ms | 6.7 ms |
|       5000 |         63.200 ms |     91 ms |    251 ms |     6 ms |            16.9 ms | 218.8 ms | 5.8 ms |

### Update

| Node Count | Render Duration | Scripting | Rendering | Painting | Recalculate Style | Layout | Paint |
| ---------: | ---------------: | --------: | --------: | -------: | -----------------: | ------: | -----: |
|        100 |          1.500 ms |      4 ms |      1 ms |     1 ms |             0.1 ms | 0.2 ms | 0.4 ms |
|        500 |          4.900 ms |      8 ms |      1 ms |     1 ms |             0.4 ms | 0.4 ms | 1.1 ms |
|       1000 |          8.600 ms |     13 ms |      1 ms |     2 ms |             0.1 ms | 0.4 ms | 1.1 ms |
|       5000 |         24.900 ms |     43 ms |      3 ms |     2 ms |             0.1 ms | 1.0 ms | 1.6 ms |

### 隨 Node Count 的縮放倍數（100 → 5000，Node Count 本身 ×50）

| Metric | Mount ×倍數 | Update ×倍數 |
| ------ | ----------: | -----------: |
| Render Duration | ×14.7 | ×16.6 |
| Scripting | ×10.1 | ×10.75 |
| Rendering | ×35.9 | ×3.0 |
| Recalculate Style | ×28.2 | ×1.0（在雜訊解析度邊界，0.1ms 級） |
| Layout | ×45.6（最接近 ×50，近似線性） | ×5.0 |
| Paint | ×2.5（幾乎打平） | ×4.0 |

### Mount：成本重心隨 Node Count 從 Scripting 移向 Rendering

Scripting 佔（Scripting + Rendering + Painting）總和的比例：100 時 47.4% → 500 時 32.7% → 1000 時 28.4% → 5000 時 26.1%，持續下降；Layout 佔 Rendering 的比例則持續上升（68.6% → 80.0% → 81.5% → 87.2%）。代表 Node Count 小時 Scripting（Vue 建立 vnode 與呼叫 DOM API）是主要成本，但隨 Node Count 增加，Browser 自己的 Layout 計算成本成長更快，逐漸取代 Scripting 成為主要瓶頸。

### Update：成本幾乎完全集中在 Scripting，且集中度隨 Node Count 上升

Scripting 佔（Scripting + Rendering + Painting）總和的比例：100 時 66.7% → 500 時 80.0% → 1000 時 81.3% → 5000 時 89.6%，持續上升，與 Mount 的趨勢相反。Rendering / Painting 全程維持在個位數 ms，5000 個節點時 Rendering 也只有 3ms（相對 Mount 同樣 5000 節點的 251ms，相差約 84 倍）。這符合 Hypothesis 的預期：因為每次 `triggerRender()` 產生的資料內容其實跟前一次完全相同（`id` / `title` 規則固定），Vue 的 keyed diff 比對到值沒變就不會真的寫入 DOM，Update 量到的幾乎是「重建陣列 + diff 比對」本身的 JS 成本，而不是真實資料變更會觸發的 DOM 寫入與 Layout 成本。

### Painting 幾乎不隨 Node Count 增加

Mount 的 Painting 從 100 節點的 3ms 到 5000 節點的 6ms，只有 ×2.0（相對 Node Count 本身 ×50），Paint 子項更只有 ×2.5。與 Layout 的 ×45.6 形成強烈對比。合理解釋：`.cards__list` 有 `max-height: 480px; overflow-y: auto`，多數 Card 在超出可視範圍後由瀏覽器的 clipping 最佳化跳過實際 Paint，但 Layout 仍須計算所有節點（含捲動範圍外）的幾何位置以決定 `scrollHeight`。也就是說：**Layout 的成本來自「有幾個節點」，Paint 的成本主要來自「畫面上看得到多少內容」**，這兩者在有 `overflow: auto` 容器的情境下會脫鉤。

### Vue 3.6.0-rc.2 Validation 數字

同樣為人工操作 Chrome DevTools Performance 面板單次錄製讀值（非自動化、非多次 trial median），與 Baseline 相同操作流程：

#### Mount

| Node Count | Render Duration | Scripting | Rendering | Painting | Recalculate Style | Layout | Paint |
| ---------: | ---------------: | --------: | --------: | -------: | -----------------: | ------: | -----: |
|        100 |          4.900 ms |      9 ms |      9 ms |     4 ms |             1.6 ms | 5.3 ms | 3.4 ms |
|        500 |         13.700 ms |     18 ms |     27 ms |     5 ms |             2.5 ms | 21.6 ms | 4.8 ms |
|       1000 |         18.700 ms |     26 ms |     55 ms |     6 ms |             4.8 ms | 45.6 ms | 5.5 ms |
|       5000 |         70.800 ms |     89 ms |    204 ms |     5 ms |            18.0 ms | 171.5 ms | 4.8 ms |

#### Update

| Node Count | Render Duration | Scripting | Rendering | Painting | Recalculate Style | Layout | Paint |
| ---------: | ---------------: | --------: | --------: | -------: | -----------------: | ------: | -----: |
|        100 |          1.900 ms |      4 ms |      1 ms |     1 ms |             0.1 ms | 0.2 ms | 0.6 ms |
|        500 |          5.200 ms |     10 ms |      1 ms |     1 ms |             0.1 ms | 0.3 ms | 0.9 ms |
|       1000 |          9.100 ms |     15 ms |      2 ms |     2 ms |             0.2 ms | 0.4 ms | 1.1 ms |
|       5000 |         29.300 ms |     49 ms |      4 ms |     2 ms |             0.1 ms | 0.9 ms | 1.6 ms |

### Evidence Matrix：Vue 3.5.40 → Vue 3.6.0-rc.2（差異百分比，正值代表 3.6 較高／較慢）

#### Mount

| Node Count | Render Duration | Scripting | Rendering | Painting | Recalculate Style | Layout | Paint |
| ---------: | ---------------: | --------: | --------: | -------: | -----------------: | ------: | -----: |
|        100 | +14.0% |  0.0% | +28.6% | +33.3% | +166.7% | +10.4% | +47.8% |
|        500 | +16.1% | +12.5% |  -3.6% |   0.0% |    0.0% |  -3.6% |  -4.0% |
|       1000 |  +2.2% |  +4.0% |   0.0% | -25.0% |   -2.0% |  +1.8% | -17.9% |
|       5000 | +12.0% |  -2.2% | -18.7% | -16.7% |   +6.5% | -21.6% | -17.2% |

#### Update

| Node Count | Render Duration | Scripting | Rendering | Painting | Recalculate Style | Layout | Paint |
| ---------: | ---------------: | --------: | --------: | -------: | -----------------: | ------: | -----: |
|        100 | +26.7% |   0.0% |    0.0% |   0.0% |    0.0% |   0.0% | +50.0% |
|        500 |  +6.1% | +25.0% |    0.0% |   0.0% |  -75.0% | -25.0% | -18.2% |
|       1000 |  +5.8% | +15.4% | +100.0% |   0.0% | +100.0% |   0.0% |   0.0% |
|       5000 | +17.7% | +14.0% |  +33.3% |   0.0% |    0.0% | -10.0% |   0.0% |

觀察重點：

- **Mount 沒有一致方向**：Scripting 四個 Node Count 分別是 0.0% / +12.5% / +4.0% / -2.2%，忽高忽低，不像 `reactive-chain` 那樣有明確趨勢；Rendering / Layout 在 N=100 時明顯升高（但 N=100 的絕對值本身很小，0.6ms→1.6ms 這種變化在人工讀值的解析度邊界極易被雜訊放大），N=500/1000 大致持平，只有 N=5000 出現較大幅度下降（Rendering -18.7%、Layout -21.6%）。
- **Update 有一致方向，但方向是「變慢」**：Scripting 在 N=500/1000/5000 分別是 +25.0% / +15.4% / +14.0%，三個 Node Count 都是同方向、同量級的上升；對應 Render Duration 在全部四個 Node Count 都是正值（+5.8% ~ +26.7%）。這是本輪資料中唯一跨多個 Node Count 都同方向出現的訊號。
- 縮放倍數（100 → 5000）：Mount Scripting 3.5 是 ×10.11、3.6 是 ×9.89，幾乎相同；Update Scripting 3.5 是 ×10.75、3.6 是 ×12.25，3.6 略高。
- Cost Structure（哪個分類佔主導）與 Baseline 幾乎一致：Mount 的 Scripting 佔比隨 Node Count 從 40.9%（N=100）降到 29.9%（N=5000），與 Baseline 的 47.4%→26.1% 同方向；Update 的 Scripting 佔比從 66.7%（N=100）升到 89.1%（N=5000），與 Baseline 的 66.7%→89.6% 幾乎重疊。Layout 佔 Rendering 的比例也維持相同的上升趨勢（58.9%→84.1%，Baseline 是 68.6%→87.2%）。

## Validation Result

### Vue 3.5 Baseline

Render Count 100 / 500 / 1000 / 5000，各測 Mount 與 Update：Mount Render Duration 從 4.300 ms（100）成長到 63.200 ms（5000），Rendering（主要是 Layout）是成長最快的分類（×35.9，Layout 本身 ×45.6，最接近 Node Count 的 ×50）；Update Render Duration 從 1.500 ms 成長到 24.900 ms，成本幾乎全部集中在 Scripting（占比隨 Node Count 從 66.7% 升到 89.6%），Rendering / Painting 全程維持個位數 ms。

### Vue 3.6.0-rc.2 Validation

Render Count 100 / 500 / 1000 / 5000，各測 Mount 與 Update，Scenario 與量測流程與 Baseline 完全相同：Mount Render Duration 從 4.900 ms（100）成長到 70.800 ms（5000），比 Baseline 同 Node Count 略高（+2.2% ~ +16.1%），但 Scripting 沒有一致方向（0.0% / +12.5% / +4.0% / -2.2%）；Update Render Duration 從 1.900 ms 成長到 29.300 ms，同樣全程比 Baseline 高（+5.8% ~ +26.7%），且 Scripting 在 N=500/1000/5000 一致上升（+25.0% / +15.4% / +14.0%）。Cost Structure（Scripting 佔比隨 Node Count 下降、Layout 佔 Rendering 比例隨 Node Count 上升）與 Baseline 幾乎重疊，沒有觀察到 Bottleneck Shift。

### Improvement

**沒有觀察到全面改善。** 逐項判斷：

- **Framework Cost（Scripting）**：Mount 沒有一致方向，四個 Node Count 忽高忽低（No significant change / 方向不一致，無法判斷是改善還是雜訊）。Update 則是唯一有一致方向的訊號，但方向是**上升**（N=500/1000/5000 皆為 +14%~+25%），即 No improvement，甚至可能是 Minor regression——但因為只有 single trial，且本 Lab 在 `reactive-chain` scenario 已驗證過同一份 build 重跑雜訊可達 30%+，這個上升訊號雖然跨三個 Node Count 同方向、有一定說服力，仍不能在沒有多次 trial 的情況下下「Vue 3.6 讓 Update 變慢」的結論，只能說「本輪證據不支持 Vue 3.6 改善 Update Scripting Cost，且觀察到反方向訊號」。
- **Browser Cost（Recalculate Style / Layout / Paint）**：只有 Mount 在 N=5000 觀察到 Layout（-21.6%）、Rendering（-18.7%）下降，其餘三個 Node Count（100/500/1000）沒有同方向訊號（N=100 甚至明顯上升，但屬於 0.6ms→1.6ms 級的雜訊敏感區間）。無法判斷是 Vue 3.6 编译輸出變化間接減少了 Browser 重排成本，還是單次量測雜訊。
- **Bottleneck 位置**：與 Baseline 完全一致，未發生 Bottleneck Shift（見下方 Conclusion）。

## Limitation

- **單次量測，非多次 trial median**：本輪由人工操作 DevTools Performance 面板單次錄製，不同於本 Lab 其他 scenario（`reactive-chain` / `component-storm`）建立的「3 次 trial 取 median」慣例。`reactive-chain` 驗證時發現同一份 build 重跑雜訊可達 30%+，本輪數字（尤其 0.1ms 級的 Recalculate Style）應視為量級參考，不宜逐位數解讀。
- **人工讀值與選取範圍誤差**：DevTools Summary / Bottom-Up 面板的數字是人工框選時間軸範圍後讀取，框選邊界（是否精準只包含這次 Trigger Render 的活動）與畫面數字判讀（尤其 0.1ms 級數字）可能有主觀誤差，未經程式化驗證。
- **Rendering 分類與 Recalculate Style + Layout 加總有落差**：例如 5000 節點 Mount 時 Rendering 記錄為 251ms，但 Recalculate Style（16.9ms）+ Layout（218.8ms）＝235.7ms，落差 15.3ms 應屬 Bottom-Up 未逐項記錄的其他 Rendering 子事件（如 Update Layer Tree），不影響「Layout 是 Rendering 主要成本」的結論，但代表這組數字不是完全自洽、可加總校驗的精確拆解。
- **Update 情境下的資料其實沒有真的變**：本 Scenario 的 `triggerRender()` 不論第幾次呼叫都用相同規則重建 `id` / `title`，因此 Update 量到的是「內容相同、陣列參照不同」的 keyed diff 成本，不是真實業務情境中「資料真的變了」的 Update 成本。如果之後要驗證「資料真的變更」時的 Rendering / Layout / Paint 成本，需要另外設計會改變顯示內容的 Update 路徑，但依 Scenario Freeze Rule，本輪已用這份 Scenario 建立 Baseline，之後與 Vue 3.6 比較時不能再修改。
- **Painting 成本與 `.cards__list` 的 `overflow-y: auto` 容器耦合**：Painting 幾乎不隨 Node Count 增加的結論，只在「Card 數量多於可視範圍」時成立，是這個 Scenario 特定 CSS 造成的結果，不能直接推論成「Vue Render 大量節點時 Paint 成本一定很低」這種通用結論。
- **Vue 3.6 Validation 同樣是單次量測，且是 RC 版本**：`3.6.0-rc.2` 的數字與 Baseline 一樣是人工單次錄製，不是 3 次 trial median；且 Vue 3.6 在本次驗證時尚未有 stable release，`3.6.0-rc.2` 與最終 stable 版本的實際效能特性可能不同。
- **Update 路徑觀察到的 Scripting 上升訊號需要多次 trial 才能確認是否為真實回歸**：N=500/1000/5000 三個 Node Count 的 Scripting 都是同方向上升（+14%~+25%），比 Mount 的忽高忽低更像是訊號而非純雜訊，但依 Day18 已知的 30%+ 同 build 雜訊區間，仍不足以直接判定為 Vue 3.6 造成的效能回歸，只能記錄為「本輪觀察到但未經多次 trial 確認」的訊號。
- **兩個版本並非同一次瀏覽器工作階段（session）內背靠背錄製**：Baseline 與 Validation 分屬不同時間點的手動操作，中間經過 `npm install` 切版與 dev server 重啟，無法排除作業系統或瀏覽器本身在不同時間點的背景負載差異對讀值造成的額外雜訊。

## Conclusion（僅描述 Vue 3.5 Baseline，不預測 Vue 3.6）

1. **Cost 是否隨 Node Count 增加？** 是，但不同分類的成長速率差異很大：Layout（×45.6，最接近 Node Count 本身的 ×50，近似線性）> Rendering（×35.9）> Recalculate Style（×28.2）> Render Duration（×14.7）> Scripting（×10.1）> Paint（×2.5）> Painting 分類（×2.0，幾乎打平）。
2. **主要成本位於 Scripting、Rendering 還是 Painting？** 取決於 Mount 或 Update：Mount 在小 Node Count（100）時 Scripting 略占多數（47.4%），但隨 Node Count 增加主要成本移轉到 Rendering（5000 時 Rendering 佔比最高、Layout 又佔 Rendering 的 87.2%）；Update 則全程由 Scripting 主導，且占比隨 Node Count 上升（66.7% → 89.6%）。
3. **Rendering Cost 中 Recalculate Style / Layout / Paint 哪一項最明顯？** Layout，且領先幅度隨 Node Count 擴大（Layout 佔 Rendering 從 68.6%〔100〕升到 87.2%〔5000〕）。這與 Scenario 使用 CSS Grid（`repeat(auto-fill, minmax(160px, 1fr))`）排列大量子節點的排版計算成本一致。
4. **哪些 Cost 可以合理歸因於 Vue Runtime？** Scripting——Vue 建立 vnode、執行 diff 演算法、呼叫 `createElement` / `insertBefore` 等 DOM API 的 JS 執行時間，都在呼叫堆疊內由 Vue Runtime 主導。
5. **哪些 Cost 屬於 Browser Rendering Pipeline？** Recalculate Style、Layout、Paint（及其所屬的 Rendering / Painting 分類）——這些是瀏覽器引擎收到 Vue 寫入的 DOM 之後，自己執行的樣式計算、排版、繪製工作，Vue Runtime 只決定「產生多少、什麼樣的 DOM」，不直接執行這幾項計算。
6. **哪些結果目前不能直接歸因於 Vue？** Layout 隨 Node Count 近似線性成長、Painting 幾乎打平——這兩者分別是瀏覽器 Layout 引擎處理 CSS Grid 大量子節點、以及 `overflow-y: auto` 容器 clipping 最佳化的結果，屬於 Browser 與這個 Scenario 的 CSS 設計，不是 Vue Runtime 版本可以改變的成本。Update 情境下 Rendering / Painting 極低，也是因為這個 Scenario 的資料內容本來就沒有真的變化，而不是 Vue 3.5 本身對「真實資料變更」的 Update 特別便宜。

## Conclusion（Vue 3.6.0-rc.2 Validation vs Vue 3.5.40 Baseline）

### 1. Vue 3.6 是否降低 Vue Runtime Cost？

沒有觀察到降低。Mount 的 Scripting 四個 Node Count 沒有一致方向（0.0% / +12.5% / +4.0% / -2.2%），無法判斷是改善還是雜訊。Update 的 Scripting 反而在三個較大 Node Count（500/1000/5000）一致上升（+25.0% / +15.4% / +14.0%），是本輪唯一跨多個 Node Count 同方向的訊號，方向是「沒有改善」甚至可能是「變慢」。

### 2. 如果有，主要降低哪一個 Cost？

不適用——本輪沒有觀察到 Vue Runtime Cost（Scripting）有一致方向的降低。

### 3. Browser Rendering Cost 是否同步下降？

沒有全面下降。只有 Mount 在最大 Node Count（5000）觀察到 Layout 下降（-21.6%，Rendering 整體 -18.7%），但同一個 Node Count 的 Recalculate Style 反而微升（+6.5%），且 N=100/500/1000 沒有同方向訊號（N=100 甚至明顯上升，但屬雜訊敏感的低絕對值區間）。Update 情境下 Recalculate Style / Layout / Paint 全程維持在個位數以下 ms，與 Baseline 相同量級，看不出方向性差異。

### 4. Node Count 放大後，真正的 Bottleneck 在哪裡？

與 Vue 3.5 Baseline 完全一致，沒有發生 Bottleneck Shift：

- **Mount**：Bottleneck 隨 Node Count 增加從 Scripting 移向 Browser Layout。Scripting 佔（Scripting + Rendering + Painting）比例從 40.9%（N=100）降到 29.9%（N=5000）（Baseline 是 47.4%→26.1%，同方向）；Layout 佔 Rendering 比例從 58.9%（N=100）升到 84.1%（N=5000）（Baseline 是 68.6%→87.2%，同方向）。
- **Update**：Bottleneck 全程由 Scripting 主導，且集中度隨 Node Count 上升。Scripting 佔比從 66.7%（N=100）升到 89.1%（N=5000），與 Baseline 的 66.7%→89.6% 幾乎重疊。

```text
Vue 3.6 Validation Result

Framework Cost:
- Mount：沒有一致方向的變化（noise-level，忽高忽低）
- Update：沒有改善，N=500/1000/5000 三個 Node Count 一致觀察到 Scripting 上升 14%~25%（single trial，尚未經多次 trial 確認是否為真實回歸）

Browser Cost:
- 沒有全面下降；僅 Mount 在最大 Node Count（5000）出現 Layout/Rendering 下降訊號，其餘 Node Count 無同方向訊號
- Update 情境下 Browser Cost 本來就趨近於 0，兩版本無可辨識差異

Bottleneck:
- 與 Vue 3.5 Baseline 完全一致：Mount 隨 Node Count 增加從 Scripting 移向 Browser Layout；Update 全程由 Scripting 主導
- 未觀察到 Bottleneck Shift

Conclusion:
- 本輪 single-trial 證據下，Vue 3.6.0-rc.2 沒有在本 Scenario 中改善 Vue Runtime Cost 或 Browser Rendering Cost
- Large UI Rendering 場景下真正的成本結構（Mount 的 Browser Layout、Update 的 Scripting diff 成本）仍然存在，且不受這次 Vue 版本升級影響
- 因此在工程上，不能以「升級到 Vue 3.6」作為解決本 Scenario 所代表的大量 UI Rendering 效能問題的手段；若真的遇到這類瓶頸，仍需回到 Component Architecture（例如 virtualization、分批 render）等本 Scenario 刻意排除的最佳化手段
```

### Final Conclusion Template（依 `.claude/skills/validate-vue-update`）

1. **Vue Runtime 改善了什麼？** 沒有觀察到改善。
2. **改善到什麼程度？** No measurable improvement（Mount 無一致方向；Update 觀察到反方向訊號，但未經多次 trial 確認）。
3. **還需要工程改善嗎？** 需要。Large Node Count 下的瓶頸（Mount 的 Browser Layout、Update 的 Scripting diff 成本）都不是 Vue Runtime 版本能解決的問題，屬於 Component Architecture / Rendering Strategy 層級（virtualization、分批 render、減少一次性 DOM 節點數量），這些正是本 Scenario 刻意排除、留給「真的遇到問題時」才做的最佳化。

## Next Step

1. ~~依 `.claude/skills/validate-vue-update` 流程，安裝 Vue 3.6，用同一份 Scenario（不修改任何程式碼）重新走一次同樣的人工 DevTools 錄製步驟，取得 Vue 3.6 Validation 數字後再做版本比較。~~ 已完成（單次人工錄製，`3.6.0-rc.2`）。
2. ~~若要提高數字可信度，比照 `reactive-chain` / `component-storm` 的作法，同一個 Node Count 至少錄 3 次取 median……本輪 Update 路徑觀察到的 Scripting 一致上升訊號（+14%~+25%）特別值得用多次 trial 確認是否為真實回歸，而非單次雜訊。~~ 已完成，見下方「Controlled Re-validation」——N=10 trial 自動化重測後，**該上升訊號沒有被重現**。
3. Vue 3.6 stable release 後，應重新驗證一次本 Scenario，確認結論在 stable 版本上是否依然成立（本輪用的是 `3.6.0-rc.2`；截至本輪重測時 npm 上仍無 stable release）。
4. 若之後想驗證「資料真的變更」情境下的 Update Rendering Cost，需要另開一個新的 Scenario（例如 `vdom-stress-mutation` 之類），而不是修改這份已凍結的 Scenario，避免污染 Day18 Baseline 與 Day19 Validation 之間的比較基準。
5. 本輪 Controlled Re-validation 僅取得 Render Duration（Framework-level），DevTools Trace 分類（Scripting / Rendering / Painting / Recalculate Style / Layout / Paint）因自動化工具限制未取得——若要重新驗證 Bottleneck Shift（Mount 的 Browser Layout vs Update 的 Scripting），需要有 CDP Tracing 存取能力的自動化環境。

---

## Controlled Re-validation（Vue 3.5.40 vs Vue 3.6.0-rc.2，N=10 trials，Interleaved，自動化）

延續上方「單次人工錄製」的限制（Mount 無一致方向；Update 觀察到 Scripting 在 N=500/1000/5000 一致上升 +14%~+25%，但只有 single trial），本輪目的是用**自動化、多次 trial、interleaved** 的方式判斷上一輪訊號是否可重現。詳細協定見對話中的 Controlled Re-validation 指示與 `.claude/skills/validate-vue-update`。

### 1. Environment

| | Vue 3.5.40 | Vue 3.6.0-rc.2 |
| --- | --- | --- |
| Node.js | v24.13.0 | v24.13.0 |
| Vite | 8.1.5 | 8.1.5 |
| TypeScript | 6.0.3 | 6.0.3 |
| Browser | Chrome 151.0.0.0 | Chrome 151.0.0.0（同一個瀏覽器 session） |
| OS | Windows 11 Pro | 同左 |
| Dev Server | `http://localhost:5173`（本 repo） | `http://localhost:5174`（git worktree `../vue-pain-lab-vue36`，`--detach HEAD` 於同一 commit，`npm install vue@3.6.0-rc.2 --save-exact`） |

Environment 一致，唯一變因是 Vue Runtime Version。兩個 dev server 同時執行、同一個瀏覽器分頁群組並存，確保兩個版本共用完全相同的 Scenario 原始碼（scenario code 已在 Baseline 驗證時凍結並 commit，worktree 直接沿用該 commit，未做任何修改）。

**Metrics 範圍限制**：本輪透過 `claude-in-chrome` 瀏覽器自動化工具執行，該工具鏈沒有 Chrome DevTools Protocol Tracing 存取權限（只能執行 in-page JavaScript、點擊、讀 DOM），因此 **Scripting / Rendering / Painting / Recalculate Style / Layout / Paint 六項 DevTools Trace 分類本輪一律 Not available**（無法自動化取得，依規則不用估計值補上）。本輪只自動化取得 **Render Duration**（Scenario 自身用 `performance.now()` 量測、等待 `nextTick()` 完成後才計算，寫在 DOM 上的數字）。

### 2. Trial Configuration

```text
Warm-up: 3（不納入統計）
Trials: 10（measurement）
Node Counts: 100 / 500 / 1000 / 5000
Operations: Mount / Update（同一次 reset 週期內連續量測，Mount 在前、Update 在後）
Ordering: 每個 Node Count 內，Vue 3.5 / Vue 3.6 的 warm-up 與 measurement 皆逐一配對執行（trial i 對 trial i），兩個分頁在同一個瀏覽器 session 中並存
```

**Reset 機制**：每個 trial 前用 Vue Router 的 `router.push('/')` → `router.push('/scenarios/vdom-stress')` 讓 `VDomStressPage` 元件真正 unmount/remount（`cards` 重置為 `[]`），確保每個 Mount trial 都是全新掛載，而非 SPA 內部殘留狀態。這是測試自動化的操作方式（如同使用者手動切換頁面再切回來），未修改 Scenario 原始碼或元件邏輯。

**已知環境問題與修正**（過程記錄，供之後重複實驗參考）：

1. **背景分頁計時器節流（Timer Throttling）**：一開始用 `setTimeout` 輪詢等待 DOM 更新，在分頁被瀏覽器判定為背景（`document.visibilityState === 'hidden'`）時，`setTimeout` 輪詢會被大幅節流甚至瀕臨掛起，導致單次 trial loop 超過 45 秒 CDP timeout。改用 `MutationObserver` 監聽 DOM 變化來偵測量測完成（不依賴計時器）後解決，這與 `[[vue36_reactive_chain_validation]]` 記錄的教訓一致。
2. **雙分頁可見度不對稱造成假性 10 倍差異**：兩個分頁並行執行時，一個分頁是瀏覽器認定的作用中分頁（`visible`）、另一個是背景分頁（`hidden`），這個不對稱本身會讓背景分頁的 Mount Duration 膨脹到前景分頁的 8~10 倍（例如一次驗證性測試量到 3.5 側 14ms、3.6 側 1.2ms），與 Vue 版本無關，純粹是分頁可見度造成的量測假訊號。**已排查並排除**：確認兩分頁在後續量測時皆為 `hidden`（此自動化環境的瀏覽器視窗整體不在前景），對稱狀態下 Mount Duration 恢復到正常量級（個位數到十位數 ms，與先前人工量測數量級一致）。正式量測前已用單一 trial 配對測試（見下方數字）與 5 trial 配對測試確認兩側對稱，才開始正式的 13 trial（3 warm-up + 10 measurement）× 4 Node Count 完整量測。
3. 承上，這代表**本輪 Render Duration 的絕對值本身可能因為瀏覽器視窗不在前景而普遍偏高**（背景/非前景分頁的 Scripting 可能有一定程度的 CPU 排程降級），但由於 Vue 3.5 與 Vue 3.6 全程共用完全相同的可見度狀態（皆為 hidden，對稱），**版本間的相對差異（Paired Δ%）不受此影響**，這也是本輪選擇 Paired Difference 而非絕對值作為主要結論依據的原因。

### 3. Evidence Matrix

以下皆為 **10 次 measurement trial**（不含 3 次 warm-up）的統計，單位 ms。Scripting / Rendering / Painting / Recalculate Style / Layout / Paint：**Not available**（見上方 Environment 說明）。

#### Render Duration — Mount

| Node Count | 3.5.40 Median | 3.5.40 P25 / P75 | 3.5.40 Min / Max | 3.6.0-rc.2 Median | 3.6.0-rc.2 P25 / P75 | 3.6.0-rc.2 Min / Max | Median Δ% | Signal |
| ---------: | -------------: | ----------------: | -----------------: | ------------------: | ---------------------: | ----------------------: | --------: | :----- |
| 100 | 10.75 | 7.13 / 15.67 | 5.6 / 21.2 | 7.50 | 7.13 / 9.03 | 5.4 / 11.6 | -30.2% | Unstable（IQR 大幅重疊，paired 方向 3/10 為正） |
| 500 | 39.75 | 36.92 / 45.15 | 28.1 / 56.9 | 37.35 | 34.27 / 38.45 | 28.6 / 44.5 | -6.0% | Unstable（IQR 重疊，paired 方向 3/10 為正） |
| 1000 | 76.05 | 68.65 / 78.78 | 43.7 / 87.9 | 71.40 | 68.47 / 75.80 | 45.8 / 104.8 | -6.1% | Unstable（IQR 重疊，paired 方向 6/10 為正，接近對半） |
| 5000 | 381.75 | 372.57 / 389.00 | 351.1 / 476.7 | 380.80 | 369.65 / 391.68 | 351.2 / 433.7 | -0.3% | Unstable（IQR 重疊，paired 方向 7/10 為正） |

#### Render Duration — Update

| Node Count | 3.5.40 Median | 3.5.40 P25 / P75 | 3.5.40 Min / Max | 3.6.0-rc.2 Median | 3.6.0-rc.2 P25 / P75 | 3.6.0-rc.2 Min / Max | Median Δ% | Signal |
| ---------: | -------------: | ----------------: | -----------------: | ------------------: | ---------------------: | ----------------------: | --------: | :----- |
| 100 | 4.20 | 2.95 / 4.67 | 1.5 / 5.4 | 3.80 | 3.45 / 4.47 | 1.1 / 7.0 | -9.5% | Unstable（IQR 重疊，paired 方向 5/10 為正，接近隨機） |
| 500 | 14.10 | 13.47 / 16.10 | 11.3 / 18.6 | 13.05 | 12.13 / 13.67 | 8.7 / 16.5 | -7.5% | Unstable（IQR 重疊，paired 方向 2/10 為正，偏向 3.6 較快但未達一致） |
| 1000 | 25.90 | 25.15 / 28.77 | 12.8 / 41.2 | 24.20 | 22.80 / 25.40 | 18.5 / 26.8 | -6.6% | Unstable（IQR 重疊，paired 方向 3/10 為正，偏向 3.6 較快但未達一致） |
| 5000 | 140.75 | 130.98 / 147.20 | 124.6 / 1027.8¹ | 120.25 | 117.00 / 127.20 | 110.9 / 182.2 | -14.6% | **Consistent Signal**（IQR 不重疊，paired 方向 9/10 為正即 3.6 較快，僅 1/10 例外） |

¹ 3.5.40 在 N=5000 Update 的第 4 次 measurement trial 量到 1027.8ms，是其餘 9 次（124.6~207.9ms）的 5~8 倍，判定為 Outlier（可能是背景排程瞬間停頓），已用 Median（對 Outlier 穩健）而非 Mean 作為主要比較值，不影響上述 Signal 判定。

#### Scaling（Node Count 放大時的成本增長率，以 Median 計算）

| | 100→500 | 500→1000 | 1000→5000 | 100→5000 |
| --- | ---: | ---: | ---: | ---: |
| Mount, 3.5.40 | ×3.70 | ×1.91 | ×5.02 | ×35.51 |
| Mount, 3.6.0-rc.2 | ×4.98 | ×1.91 | ×5.33 | ×50.77 |
| Update, 3.5.40 | ×3.36 | ×1.84 | ×5.43 | ×33.51 |
| Update, 3.6.0-rc.2 | ×3.43 | ×1.85 | ×4.97 | ×31.64 |

Update 的 Scaling 倍數兩版本相近（100→5000：×33.51 vs ×31.64），Mount 則是 Vue 3.6 的 Scaling 倍數略高於 Vue 3.5（×50.77 vs ×35.51）——但因為 Mount 本身在 4 個 Node Count 都是 Unstable Signal（見上表），這個 Scaling 差異不足以判定為真實的 Framework 行為差異，更可能是 N=100 這個小 Node Count 下 Vue 3.6 Median（7.50ms）本身偏低、放大了倍數計算的分母效應。

### 4. Reproducibility

> 上一輪人工測試觀察到的差異，是否在多次 trial 中重現？

- **Mount**：上一輪（single trial）沒有一致方向（0.0% / +12.5% / +4.0% / -2.2%）。本輪（N=10 trial）**同樣沒有一致方向**——四個 Node Count 的 paired 方向都不到 8/10（100: 3/10、500: 3/10、1000: 6/10、5000: 7/10），全部落在 Unstable。**結論一致：Mount 沒有可重現的訊號**，兩輪互相印證。
- **Update**：上一輪觀察到 Scripting 在 N=500/1000/5000 **一致上升** +25.0% / +15.4% / +14.0%（3.6 較慢），並標記為「本輪唯一跨多個 Node Count 同方向的訊號，但未經多次 trial 確認」。本輪用 N=10 trial 重新量測 **Render Duration**（非 Scripting，但同一份 Scenario、同一個量測時機點）：N=500/1000 都轉為 Unstable（paired 方向只有 2/10、3/10 為正，即多數 trial 是 3.6 較快），N=5000 更是唯一的 **Consistent Signal，且方向與上一輪完全相反**（9/10 trial 是 Vue 3.6 較快）。**結論：上一輪的 Update 上升訊號沒有被重現**，本輪多次 trial 顯示的方向反而偏向 Vue 3.6 較快或持平，證實上一輪的訊號極可能是 single-trial 雜訊（與 `[[vue36_reactive_chain_validation]]` 記錄的「同一份 build 重跑雜訊可達 30%+」一致）。
- **Scripting**：本輪 Not available（工具限制），無法直接比較。
- **Render Duration**：見上——Mount 兩輪結論一致（無訊號）；Update 方向在本輪反轉且僅 N=5000 達到 Consistent Signal 標準。

### 5. Framework Cost

> Vue 3.6 是否降低 Framework-level Runtime Cost？

只能用 Render Duration 作為 Framework Cost 的整體代理指標（因為 Scripting 本輪 Not available，且 Render Duration 本身混合了 Framework Scripting 與部分 Browser Rendering 成本，見 Baseline 的 Cost Structure 分析）。

- **Mount**：8 個 Median 全部呈現 3.6 較低（-30.2% ~ -0.3%），但因為 4 個 Node Count 全數落在 Unstable（IQR 重疊、paired 方向不一致），**不能判定為真實改善**，只能說「本輪沒有觀察到 Mount Render Duration 的可信改善或退步，數字落在量測雜訊範圍內」。
- **Update**：Median 同樣全部呈現 3.6 較低（-14.6% ~ -6.6%），且 **N=5000 是唯一達到 Consistent Signal 門檻的條件**（IQR 不重疊、9/10 trial 同方向）。可以有限度地說：「在本輪證據下，Vue 3.6 於大型 Node Count（N=5000）的 Update 情境下，Render Duration 有可重現的降低訊號」，但 N=100/500/1000 的 Update 訊號仍屬 Unstable，不能推論為所有規模都改善。

### 6. Browser Cost

> Browser Rendering Pipeline 的主要成本是否同步下降？

**Not available**——本輪自動化工具無法取得 Recalculate Style / Layout / Paint，因此無法回答 Browser Rendering Cost 是否改變。上一輪（single trial，人工 DevTools 錄製）觀察到 Mount 僅在 N=5000 有 Layout / Rendering 下降訊號、其餘 Node Count 無同方向訊號，本輪無法驗證此結論是否可重現。

### 7. Bottleneck

> Node Count 放大後，主要 Bottleneck 是 Framework Runtime 還是 Browser Rendering？

**Not available（無法給出本輪自己的結論）**——Bottleneck 判定需要 Scripting vs Rendering/Layout 的分解數字，本輪只有 Render Duration 這個混合指標。Baseline（Vue 3.5.40，single trial）建立的結構性結論——Mount 的 Bottleneck 隨 Node Count 從 Scripting 移向 Browser Layout、Update 全程由 Scripting 主導——本輪無法重新驗證，僅能引用 Baseline 原文作為背景參考，不代表本輪有獨立證據支持。

### 8. Final Validation Result

```text
Inconclusive（Mount：No Significant Difference 傾向；Update：No Significant Difference，但 N=5000 例外，該條件為 Confirmed Improvement 傾向）
```

**Evidence：**

- Mount（N=100/500/1000/5000）：4/4 Node Count 皆為 Unstable Signal（IQR 大幅重疊，paired trial 方向不一致，3/10~7/10 分布分散）。**判定：No Significant Difference**，與上一輪 single-trial 觀察（Mount 無一致方向）互相印證。
- Update N=100/500/1000：3/3 Node Count 為 Unstable Signal（paired 方向 2/10~5/10）。**判定：No Significant Difference**。與上一輪同一批 Node Count 觀察到的「一致上升 +14%~+25%」訊號**方向相反、且該訊號未被重現**——上一輪訊號應歸因於 single-trial 雜訊。
- Update N=5000：唯一的 Consistent Signal（IQR 不重疊，9/10 trial 同方向，Median -14.6%）。**判定：這個條件傾向 Confirmed Improvement**，但僅限這一個 Node Count，不能推論到其他規模。
- 因為本輪 DevTools Trace 分類（Scripting/Rendering/Layout/Paint）Not available，無法驗證這個 Update N=5000 改善訊號的成因（是 Vue Runtime 內部 diff/patch 演算法變化，還是編譯輸出差異間接影響），也無法確認 Bottleneck 是否位移。

**不宜做的結論**：不能說「Vue 3.6 全面改善了 VDOM Stress Test 的效能」（Mount 與 Update 的多數 Node Count 都是 No Significant Difference）；也不能說「Vue 3.6 有效能回歸」（上一輪觀察到的上升訊號本輪沒有重現，且方向相反）。最站得住腳的結論是：**本輪沒有找到可重現的效能回歸證據，Update 在最大 Node Count（5000）有一個值得後續關注的改善訊號，其餘條件都落在測量雜訊範圍內、無法判定方向**。

### Final Conclusion Template（依 `.claude/skills/validate-vue-update`，本輪 Controlled Re-validation 版本）

1. **Vue Runtime 改善了什麼？** 在本輪多次 trial 的證據下，沒有找到跨所有 Node Count 都成立的改善或退步。唯一站得住腳的訊號是 Update 情境在 N=5000（最大測試規模）有可重現的 Render Duration 降低。
2. **改善到什麼程度？** No measurable improvement（Mount 全部 Node Count；Update N=100/500/1000）／Minor improvement（Update N=5000 單一條件，Median -14.6%，Consistent Signal）。
3. **還需要工程改善嗎？** 需要，且結論與 Baseline／上一輪一致：Large Node Count 下的瓶頸（無論是 Mount 的 Browser Layout 或 Update 的 Scripting diff 成本，見 Baseline 分析）都不是單靠 Vue Runtime 版本升級可以解決的問題，仍然是 Component Architecture / Rendering Strategy 層級的問題（virtualization、分批 render、減少一次性 DOM 節點數量）。

### Interpretation Guardrails（為什麼不能說「Vue 3.6 比較快」、也不能把 -14.6% 歸因給 Framework）

這兩點容易被後續讀者誤讀，特別記錄推理過程：

**為什麼 Update N=5000 的 Consistent Signal 不能推論成「Vue 3.6 比較快」：**

1. **Multiple Comparisons**：本輪測試了 8 個條件（4 個 Node Count × Mount/Update）。如果實際上完全沒有版本差異、每次 paired trial 的正負號都是純雜訊的 50/50，單一條件出現 9/10（或 10/10）同方向的機率約 2.1%；但測試 8 個條件時，「至少有一個條件出現這種極端分佈」的機率約 `1-(1-0.021)^8 ≈ 16%`。8 個條件中剛好出現 1 個這樣的極端分佈，完全符合「其實沒有任何條件有真實差異，這只是巧合」的情境，不足以推翻虛無假設。
2. **Scenario 特定性**：本 Scenario 的 Update 路徑每次都用相同規則重建 `id`/`title`（見上方「Not Included」與 Limitation），量到的是「資料內容沒變的 keyed diff」成本，不是「資料真的變更」的 Update 成本。就算這個訊號是真的，也只能說「在這個特定的 no-op diff 路徑、N=5000 這個特定規模下」，不能推論到 Vue 3.6 Update 效能整體。
3. **非典型執行環境**：本輪兩個分頁全程處於瀏覽器判定的背景狀態（`visibilityState: hidden`，見 Environment 說明）。這對「版本間的相對比較」是公平的（兩版本對稱），但不代表這個訊號在正常前景執行時也會以同樣幅度出現。

**為什麼不能把 -14.6% 歸因給「Vue Framework 內部最佳化」：**

`renderDuration` 量的是「點擊 → `await nextTick()` resolve」這段 wall-clock，`nextTick()` 只等 Vue 的 render effect flush 完成（DOM 已寫入），**不會等瀏覽器之後的 Recalculate Style / Layout / Paint**（那些發生在下一個 rendering 時機，在 `nextTick` resolve 之後）。理論上這個窗口應該比較接近 DevTools 的「Scripting」而非「Rendering/Painting」。

但這只是理論推測，不能直接採信——**上一輪人工 DevTools 數字本身就跟這個理論矛盾**：Baseline（3.5.40）Update N=5000 量到 `Render Duration = 24.9ms`，但 `Scripting = 43ms`，Scripting 反而比 Render Duration 大，代表這兩個指標並非簡單的包含關係（Render Duration ⊆ Scripting）。最可能的原因是上一輪「Scripting」數字來自人工在 DevTools 手動框選時間軸範圍讀值（原始 README Limitation 已記錄「人工讀值與選取範圍誤差」），框選範圍不是精準對齊這次 Trigger Render 的活動。

結論：本輪沒有辦法（不論用理論推導或用上一輪數字回推）把 Render Duration 的變化拆解成 Scripting / Layout / Paint 各佔多少，因此也回答不了「Vue 3.6 的 Framework-level Rendering Optimization 降低了多少 Runtime Cost、剩餘成本是否轉移到 Browser Rendering Pipeline」這組原始研究問題——這正是第 6 節（Browser Cost）與第 7 節（Bottleneck）標記 Not available 的原因，不是保守，而是本輪證據能力的真實邊界。要回答這組問題，需要用同樣的 N=10、interleaved、paired trial 規格，但搭配真正有 CDP Tracing 存取權限的自動化環境，針對 Update N=5000 這個條件重新驗證。


