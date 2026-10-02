# vdom-stress：benchmark 頁只換顏色，Mass Injector 與實測判定放在 Stage 頁

## 背景

想把 VDOM Stress 改成暗色實驗室風格，並讓使用者一眼看懂「按了之後證明了什麼」：數量切換矩陣、`[ ⚡ INJECT MASS UI NODES ]`、依結果炸出 `VDOM CHOKED` 大字、`[SYS_VDOM_PATCH_STREAM]` 終端機、以及把 Rendered Cards 改成發光的方格矩陣。

但這頁是 CDP runner（`scripts/cdp-trace/scenario.ts`）量測的 benchmark，而且：

- **Rendered Cards 本身就是被量測的對象。** README 的 Limitation 指出 Painting 幾乎不隨節點數增加，是因為 `.cards__list` 的 `max-height: 480px; overflow-y: auto`；改 card 的尺寸、字型、捲軸或加發光，都會改變 Layout / Paint 數字。
- **`renderDuration` 不包含真正的瓶頸。** 它只量「建立陣列 → Vue nextTick」；5000 Mount 的主要成本是之後的瀏覽器 Layout（README：renderDuration ≈ 63 ms、Layout ≈ 219 ms）。Update 因為資料不變，幾乎沒有 DOM 寫入。所以「選 5000 就判 CHOKED」或「主線程卡死 {{ renderDuration }} ms」都會講錯成本在哪裡。
- card 是一般 `<li>`，沒有逐節點的生命週期事件，逐行印 `Node #001 … #5000 instantiated` 只會是迴圈印出來的假 log。

## 決定

**benchmark 頁（`VDomStressPage.vue`）：只換暗色，script 不動。**

- 參數改成切換矩陣、按鈕與 metrics 改暗色；`input[name="render-count"]`、`Trigger Render` 按鈕文字、`.metrics` 內 dt / dd 都不變。`dd` 用 `<!-- prettier-ignore -->` 維持單行，確保 `textContent` 剛好是 `-` 或 `X ms`（runner 的完成偵測比對 `!== '-'`）。
- `.cards__list` / `.cards__item` 的盒模型完全不變，只換顏色；card 字型用 `font-family: initial` 維持瀏覽器預設（改版前的狀態），捲軸也維持預設寬度。實測改版前後同一畫面寬度下：card 183×52、list 可用寬 945、500 張時 scrollHeight 5992，完全相同（一開始加了 `scrollbar-width: thin`，card 變寬 1px，已移除）。

**Stage 頁（`/scenarios/vdom-stress/stage`）：所有新介面。**

- 判定依「主執行緒連續被佔用的時間」＝資料準備＋Vue patch＋強制 reflow 的 Layout，對照 16.7 ms（1 frame）/ 50 ms（long task）分成 STABLE / FRAME DROP / VDOM CHOKED，不看選了幾個節點。
- TTY 只列實測事件：ALLOC、PATCH（與 renderDuration 同定義）、MutationObserver 實際插入 / 移除的 `<li>`（頭尾各 3 個加省略數）、LAYOUT、到下一個 frame 的時間、SETTLED。
- 診斷句由 script 依實測值組成（也避免中文在 template 換行產生多餘空白），會點出瓶頸在 Layout 還是 Vue patch；資料沒變的 Update 另有一句說明 keyed diff 沒有寫 DOM。
- 方格矩陣是獨立子元件、只接 `cards`；點亮、光暈與掃描光由父層 class 與另一個 keyed 元素控制，判定 / 狀態列 / TTY 更新時不會重新 patch 幾千格。TTY 也是獨立子元件。

## 實作上踩到的坑

- MutationObserver 的 callback 會在 `nextTick` 之前以 microtask 先跑掉並帶走紀錄，只呼叫 `takeRecords()` 會拿到 0 筆，所以 callback 也要收集。
- 計時前先讀一次 `offsetHeight` 結清之前累積的 style / layout（上一次的點亮、PURGE 移除的節點），否則會把不屬於這次注入的工作算進 Layout；背景分頁不畫 frame 時特別明顯（5000 Update 曾因此量到 258 ms Layout）。
- 背景分頁不跑 `requestAnimationFrame`，`nextFrame()` 加了 100 ms 的 timeout 保底，TTY 會標示「tab hidden · no frame presented」。

## 取捨

- benchmark 頁加了 `lab-theme`、標題、說明與控制項樣式改變；card 之外的少量節點與 style 也算在同一次 Layout 裡，嚴格來說 Rendering 拆解與改版前不同（量級遠小於 card），之後的版本比較應在同一個 commit 上重跑 baseline。
- Stage 頁的數字包含強制 reflow、方格樣式與動畫，不可與 benchmark 頁或 README 比較；頁面 header 有說明。
- 判定門檻是瀏覽器效能預算的慣例值（60fps 一個 frame、Long Tasks API 的 50 ms），不是本 Lab 自己的實驗結論。
- Dashboard 的 VDOM Stress 卡片目前仍連到 benchmark 頁。
