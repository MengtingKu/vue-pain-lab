# composable-chaos：兩階段鎖定與暗色改版，在不動 runner 的前提下完成

## 背景

`/scenarios/composable-chaos` 原本是白底頁面，Build Chain 與 Trigger Update 兩顆按鈕並排、沒有狀態約束。這次改成 Hardcore Dark Lab 風格（`DESIGN.md`），並強化「先 01 建立 chain、後 02 注入更新」的操作序列：按鈕畫面標籤改為 `[ 01 // INITIALIZE LAYER CHAIN ]` / `[ 02 // INJECT STATE UPDATE ]`，未執行 01 或切換 Depth 後 02 鎖定。

這頁同時是 CDP benchmark，`scripts/cdp-trace/composable-chaos-scenario.ts` 依賴：

- `input[name="composable-depth"][value=N]`；
- 文字剛好是 `Build Chain` / `Trigger Update` 的 `<button>`（`textContent.trim()` 完全比對）；
- 兩個 `.metric-group` 內 `<dt>` 的**第一個文字節點**；
- Build Duration 的 `<dd>` 先變成 `-` 再寫入數值（兩段式完成偵測）。

## 決定

- **按鈕 DOM 文字不改。** 舊文字放在視覺隱藏的 `<span class="step__legacy">`，畫面上的 `[ 01 // … ]` 由 CSS `::before` 產生，`textContent` 仍是 `Build Chain` / `Trigger Update`。runner 與舊 commit 的重跑都不需要改 adapter。
- **mount 時仍自動 build 一次。** 如果拿掉，Build Duration 一開始就是 `-`，runner 點 Build 後的 `null → '-'` 不會產生 DOM mutation，兩段式偵測會等到 timeout。所以「02 要等使用者按過 01」改用獨立的 `instantiated` 旗標表達，而不是「沒有 chain」。
- **`instantiated` 在 `buildChain()` 裡、與 `buildDuration` 同一個同步區塊寫入（只有使用者點擊時）。** 若在 `await buildChain()` 之後才寫，會多觸發一次 render，Render Count 會多 1。同一步驟在改版前後的頁面上跑過，所有計數（含 Render Count）一致。
- **Lock 條件：** `!chain || !instantiated || selectedDepth !== builtDepth`。runner 的流程永遠是「選 radio → 點 Build →（update 時）再點 Trigger」，解鎖條件在 Trigger 前已滿足。
- Average Update Duration 的 `<dd>` 用 `<!-- prettier-ignore -->` 維持單行，避免 Prettier 換行後 `textContent` 多出結尾空白（`"4.000 ms "`）。
- 原本的黃色提示框改成 Reactor 狀態條（STANDBY → READY → LIVE）；Depth 不一致的提示文字移到 PHASE 02 面板的說明句。

## 取捨

- **template 與 script 都有變動。** 多了 `instantiated`、`lockReason`、`reactorStatus` 兩個 computed，以及鎖定標籤、狀態條等節點。每次 update 會重新計算 `reactorStatus`（依賴 `totalUpdateCount`），只有第一次 update 時狀態條與按鈕 class 會真的 patch。Vue scripting 的增量很小，但 component render 內容與改版前不同。
- **READY 狀態有常駐動畫**（02 光暈、狀態燈呼吸，只動 opacity），從 01 完成持續到第一次 update。runner 的 update batch 第一次觸發時這些動畫正在跑。
- 因此，**這個 commit 之後的 composable-chaos 量測要重跑 baseline**，不要和改版前的報告直接相減。
- 若之後 adapter 改成用新標籤找按鈕，可以拿掉 `step__legacy`；目前刻意不動 adapter。
