# reactive-chain：TTY 診斷面板放在獨立 Stage 頁，用自己的 traced chain

## 背景

想把 benchmark 頁說明裡「搭配 DevTools 看每一層的 console.log」直接畫在畫面上：一個 TTY 面板列出每個 computed / watch / watchEffect / render 的觸發時間與值，觸發時按鈕進入 `[ EXECUTING... ]`，拓撲圖跑一道傳導光效。

但 `/scenarios/reactive-chain` 是 CDP benchmark（見 `reactive-chain-dark-lab-restyle.md`）：

- 在 100 個 computed 裡寫入 reactive 的 log 陣列，每次 update 會多上百次 reactive 寫入，再加上渲染上百行 log 與自動捲動，Average Update Duration 量到的會變成 log 面板，不是 reactive chain。
- 在 computed / watch 執行中改 template 會讀到的 reactive 狀態，會在同一輪 flush 觸發自己再 render（`metrics.ts` 的 counters 刻意不做成 reactive 就是這個原因）。
- runner 用文字 `Trigger Update` 找按鈕，按鈕文字不能變；光效動畫也會出現在 trace 的 Rendering / Paint。

## 決定

比照 Component Storm，新增 `/scenarios/reactive-chain/stage`（`src/scenarios/reactive-chain/stage/`），不套 `DefaultLayout`。benchmark 頁、`src/benchmarks/reactive/*` 與 runner 都沒有改。

- **自己的鏈：** `stage/createTracedChain.ts` 與 `createReactiveChain` 結構相同，但每個節點執行時呼叫 `onTrace`（帶 `performance.now()` 與算出的值），不呼叫 `console.log`、不碰 metrics store。
- **兩段式寫入：** `onTrace` 只把格式化好的行 push 進非 reactive 的 `pending` 陣列；`await nextTick()` 量完 duration 之後，才一次 `lines.value = [...]`（`shallowRef`）交給畫面。這樣追蹤期間沒有 reactive 寫入，flush log 造成的那次 render 也不會被記成 RENDER（`tracing` 旗標已關）。
- **DEPTH 不共用：** Stage 頁自己寫 `const DEPTH = 100`。benchmark 頁的常數是編譯期常數、runner 會斷言，抽到共用檔就得改 benchmark 頁，所以刻意重複，改其中一邊時要記得同步。
- **EXECUTING 至少 700ms：** 實際 update 只要幾 ms，太短看不到；期間按鈕停用，避免連點把多次 update 的 log 混在一起。
- Dashboard 的 Reactive Chain 卡片仍連到 benchmark 頁；Stage 頁 header 有連回 benchmark 頁的連結。

## 取捨

- Stage 頁的 Last / Average Update Duration 包含每個節點一次 `performance.now()` 與一次陣列 push，**不能**拿來跟 benchmark 頁或 README 的數據比較。頁面上有一行說明。
- RENDER 行來自 Stage 頁元件自己的 `onUpdated`，是「這個元件 patch 了一次」，不是 benchmark 頁的 Render Count。
- 時間戳的微秒位數受瀏覽器 `performance.now()` 精度限制（Chrome 約 5–100µs 粒度），同一毫秒內多個節點常顯示相同時間，這是真實精度，不是 bug。
- TTY 最多保留 1500 行（約 14 次 update），超過就丟掉最舊的。
- 用 claude-in-chrome 自動化操作時分頁可能是 hidden，動畫與計時會被節流；要看光效請在實際可見的螢幕上操作。

## 後續：色彩語意與 Composable Chaos 對齊

- TTY 不再用整片青色。時間戳與 `└─` 符號冷灰；首航建立時的 `[DEP_xxx]` computed 節點綠（`#10b981`），update 期間的重算標為琥珀 `[RE-RUN]`（與 Composable Chaos 一致）；WATCH / EFFECT / RENDER 等鏈結終點副作用琥珀；INIT / SETTLED 總結綠。傳導光效與 EXECUTING 狀態也改為琥珀（屬於運行期更新），`STAGE VIEW` 標籤改為綠。全站不再有 `--lab-trace` / `--lab-tty-text` 這組青色 token。
- 左欄底部的 Final Value 區塊移除，改成 Initialization Phase 面板底部的 `FINAL_VAL` 小字列；左欄改為 flex，兩個相位面板吸收多餘高度，讓左欄底邊與右側 TTY 底邊對齊。
