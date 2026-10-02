# reactive-chain：改成 Hardcore Dark Lab 風格，但 Lab Parameters 維持唯讀

## 背景

`/scenarios/reactive-chain` 原本是白底、沒有樣式的 benchmark 頁。這次用 Impeccable 改成暗色診斷儀器風格（規範寫在根目錄 `DESIGN.md`、產品脈絡在 `PRODUCT.md`）。

這頁同時是 CDP benchmark：`scripts/cdp-trace/reactive-chain-scenario.ts` 依賴

- 文字剛好是 `Trigger Update` 的 `<button>`；
- 兩個 `.metric-group dl`，依 `<dt>` 完整文字找 `<dd>`，並用 MutationObserver 監看 `Total Update Count`；
- `.params dl` 的 `DEPTH` / `UPDATE_INTERVAL` / `AUTO_UPDATE`（runner 會斷言 `DEPTH=100`）。

## 決定

- **`<script>` 完全不動**。被量測的 reactive chain、metrics、update 流程都沒變。
- **Lab Parameters 維持唯讀顯示**，不做成 input。三個參數是編譯期常數，做成可編輯就得在頁面上重建 chain，等於改了 scenario；頁面上加一行說明「改 ReactiveChainPage.vue 頂部後重新整理」。
- runner 依賴的 class、`dt` 文字、`dd` 的 textContent、按鈕文字都維持原樣。`$` 提示符號、燈號、`computed[DEPTH] =` 標籤都是 CSS 偽元素，不進 textContent。`ms` 包進 `<span class="unit">`，textContent 仍是 `0.000 ms`（已在瀏覽器確認）。
- 原本的黃色提示框改成狀態燈：未更新時 `STANDBY`（琥珀燈 opacity 呼吸），更新後 `LIVE`（綠燈常亮）。
- 全站 lab token 背景從 `#09090b` 調成 `#0d0e12`，並新增 panel / hairline 等 token；等寬字改為自架的 JetBrains Mono（`@fontsource-variable/jetbrains-mono`）。Dashboard、Component Storm 也會跟著換背景色與等寬字。

## 為什麼

延續 `component-storm-stage-view-separate-page.md` 的原則：改視覺不能改變被量測的對象，也不能弄壞 runner。

## 取捨

- **template 有小幅變動，不只是 CSS。** 新增靜態的拓撲 `<ol>`、`ms` 的 `<span>`、STANDBY / LIVE 的 `v-if` / `v-else`（原本只有 `v-if` 的提示框）。第一次 update 時從 STANDBY 切成 LIVE，會比原本「移除提示框」多掛載一個靜態節點；之後的 update 不再變動這些節點。Vue scripting 的量級差異很小，但嚴格來說 component render 內容不同了。
- **STANDBY 呼吸燈在第一次 update 前會常駐。** runner 每個 cycle 都會重新 navigate，所以被量測的那次 update 發生時，這個動畫是在跑的。它只動 opacity（交給 compositor），對 main thread 影響極小，但 trace 裡的 Rendering / Paint 拆解仍可能不同。
- 因此，**這個 commit 之後的 reactive-chain 量測要重跑 baseline**，不要和改版前的報告直接相減。
- 字型改為自架後，lab-theme 頁面首次載入會多一個 woff2 請求；沒有 `.lab-theme` 的 benchmark 頁不使用這個字型，不會下載。
