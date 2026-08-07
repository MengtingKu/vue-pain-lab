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

## Validation Result

### Vue 3.5 Baseline

Render Count 100 / 500 / 1000 / 5000，各測 Mount 與 Update：Mount Render Duration 從 4.300 ms（100）成長到 63.200 ms（5000），Rendering（主要是 Layout）是成長最快的分類（×35.9，Layout 本身 ×45.6，最接近 Node Count 的 ×50）；Update Render Duration 從 1.500 ms 成長到 24.900 ms，成本幾乎全部集中在 Scripting（占比隨 Node Count 從 66.7% 升到 89.6%），Rendering / Painting 全程維持個位數 ms。

### Improvement

不適用——本輪僅為 Vue 3.5 Baseline，尚未與 Vue 3.6 比較，不判斷是否有改善。

## Limitation

- **單次量測，非多次 trial median**：本輪由人工操作 DevTools Performance 面板單次錄製，不同於本 Lab 其他 scenario（`reactive-chain` / `component-storm`）建立的「3 次 trial 取 median」慣例。`reactive-chain` 驗證時發現同一份 build 重跑雜訊可達 30%+，本輪數字（尤其 0.1ms 級的 Recalculate Style）應視為量級參考，不宜逐位數解讀。
- **人工讀值與選取範圍誤差**：DevTools Summary / Bottom-Up 面板的數字是人工框選時間軸範圍後讀取，框選邊界（是否精準只包含這次 Trigger Render 的活動）與畫面數字判讀（尤其 0.1ms 級數字）可能有主觀誤差，未經程式化驗證。
- **Rendering 分類與 Recalculate Style + Layout 加總有落差**：例如 5000 節點 Mount 時 Rendering 記錄為 251ms，但 Recalculate Style（16.9ms）+ Layout（218.8ms）＝235.7ms，落差 15.3ms 應屬 Bottom-Up 未逐項記錄的其他 Rendering 子事件（如 Update Layer Tree），不影響「Layout 是 Rendering 主要成本」的結論，但代表這組數字不是完全自洽、可加總校驗的精確拆解。
- **Update 情境下的資料其實沒有真的變**：本 Scenario 的 `triggerRender()` 不論第幾次呼叫都用相同規則重建 `id` / `title`，因此 Update 量到的是「內容相同、陣列參照不同」的 keyed diff 成本，不是真實業務情境中「資料真的變了」的 Update 成本。如果之後要驗證「資料真的變更」時的 Rendering / Layout / Paint 成本，需要另外設計會改變顯示內容的 Update 路徑，但依 Scenario Freeze Rule，本輪已用這份 Scenario 建立 Baseline，之後與 Vue 3.6 比較時不能再修改。
- **Painting 成本與 `.cards__list` 的 `overflow-y: auto` 容器耦合**：Painting 幾乎不隨 Node Count 增加的結論，只在「Card 數量多於可視範圍」時成立，是這個 Scenario 特定 CSS 造成的結果，不能直接推論成「Vue Render 大量節點時 Paint 成本一定很低」這種通用結論。

## Conclusion（僅描述 Vue 3.5 Baseline，不預測 Vue 3.6）

1. **Cost 是否隨 Node Count 增加？** 是，但不同分類的成長速率差異很大：Layout（×45.6，最接近 Node Count 本身的 ×50，近似線性）> Rendering（×35.9）> Recalculate Style（×28.2）> Render Duration（×14.7）> Scripting（×10.1）> Paint（×2.5）> Painting 分類（×2.0，幾乎打平）。
2. **主要成本位於 Scripting、Rendering 還是 Painting？** 取決於 Mount 或 Update：Mount 在小 Node Count（100）時 Scripting 略占多數（47.4%），但隨 Node Count 增加主要成本移轉到 Rendering（5000 時 Rendering 佔比最高、Layout 又佔 Rendering 的 87.2%）；Update 則全程由 Scripting 主導，且占比隨 Node Count 上升（66.7% → 89.6%）。
3. **Rendering Cost 中 Recalculate Style / Layout / Paint 哪一項最明顯？** Layout，且領先幅度隨 Node Count 擴大（Layout 佔 Rendering 從 68.6%〔100〕升到 87.2%〔5000〕）。這與 Scenario 使用 CSS Grid（`repeat(auto-fill, minmax(160px, 1fr))`）排列大量子節點的排版計算成本一致。
4. **哪些 Cost 可以合理歸因於 Vue Runtime？** Scripting——Vue 建立 vnode、執行 diff 演算法、呼叫 `createElement` / `insertBefore` 等 DOM API 的 JS 執行時間，都在呼叫堆疊內由 Vue Runtime 主導。
5. **哪些 Cost 屬於 Browser Rendering Pipeline？** Recalculate Style、Layout、Paint（及其所屬的 Rendering / Painting 分類）——這些是瀏覽器引擎收到 Vue 寫入的 DOM 之後，自己執行的樣式計算、排版、繪製工作，Vue Runtime 只決定「產生多少、什麼樣的 DOM」，不直接執行這幾項計算。
6. **哪些結果目前不能直接歸因於 Vue？** Layout 隨 Node Count 近似線性成長、Painting 幾乎打平——這兩者分別是瀏覽器 Layout 引擎處理 CSS Grid 大量子節點、以及 `overflow-y: auto` 容器 clipping 最佳化的結果，屬於 Browser 與這個 Scenario 的 CSS 設計，不是 Vue Runtime 版本可以改變的成本。Update 情境下 Rendering / Painting 極低，也是因為這個 Scenario 的資料內容本來就沒有真的變化，而不是 Vue 3.5 本身對「真實資料變更」的 Update 特別便宜。

## Next Step

1. 依 `.claude/skills/validate-vue-update` 流程，安裝 Vue 3.6，用同一份 Scenario（不修改任何程式碼）重新走一次同樣的人工 DevTools 錄製步驟，取得 Vue 3.6 Validation 數字後再做版本比較。
2. 若要提高數字可信度，比照 `reactive-chain` / `component-storm` 的作法，同一個 Node Count 至少錄 3 次取 median，尤其 Recalculate Style 這種 0.1ms 級數字目前落在人工讀值的解析度邊界。
3. 若之後想驗證「資料真的變更」情境下的 Update Rendering Cost，需要另開一個新的 Scenario（例如 `vdom-stress-mutation` 之類），而不是修改這份已凍結的 Scenario，避免污染 Day18 Baseline 與 Day19 Validation 之間的比較基準。
