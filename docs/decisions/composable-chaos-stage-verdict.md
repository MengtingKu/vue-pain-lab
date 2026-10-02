# composable-chaos：引導、方塊圖與診斷結論放在 Stage 頁，結論由數據算出

## 背景

benchmark 頁改成兩階段鎖定後（見 `composable-chaos-phase-lock-restyle.md`），使用者仍不容易看懂「按的順序、為什麼按、按完證明了什麼」。想加三樣東西：操作引導條 `[ SYS_PROCESS_GUIDE ]`、每層 composable 一格的方塊圖 `[ COMPOSABLE_CHAIN_DETECTOR ]`（注入時跑一波傳導光效），以及大字診斷 `[ CORE_DIAGNOSTIC_VERDICT ]`。

原始需求的結論文字是「單次 source 變更觸發 {{ ComputedExecuteCount }} 次重算……巢狀層數越深，成本呈倍數增長」。

## 決定

- **放在獨立 Stage 頁** `/scenarios/composable-chaos/stage`（不套 `DefaultLayout`），benchmark 頁維持上一輪的狀態。方塊圖每次注入會以新 key 重建並播動畫，放在 benchmark 頁會跑進 runner 的 update batch 與 `nextTick` 量測區間。
- Stage 頁共用 `createComposableChain` 與 `createMetricsStore`（未修改），沒有 mount 自動 build，也不需要保留 runner 用的按鈕文字。預設 Depth 10（Depth 1 沒有任何 computed，第一眼看不出鏈）。
- **結論由計數器即時算出，不寫死：**
  - `Computed Execute Count` 是累計值，而且包含 build 時建立 watch / watchEffect 造成的首次計算，所以不能直接當作「單次 update 的重算數」。Stage 頁在 build 完成時記下基準值，顯示 `(目前累計 − 基準) ÷ update 次數`，實測等於 `Depth − 1`。
  - 標題改為 `[ RUNTIME COST: +N COMPUTED / UPDATE ]`。白話說明寫的是「成本隨層數**線性**增加：每多一層就多一次重算，不是倍數暴增」，與 README 的 Observation 一致（`Computed Execute Count = (Depth−1) × 101`，Depth 1→20 每層邊際成本約 0.03 ms）。
  - Depth 1 另有一句說明（只有 source ref，沒有 computed 可重算）。
  - 面板下方附 Depth → 每次重算數的對照列（D1/D5/D10/D20 → 0/4/9/19），以及一行 README 證據摘要。

## 為什麼

- 「倍數增長」與本 scenario 自己的實測結論矛盾；README 也明確提醒不要用「composable 用太多層」當作效能問題的結論。Lab 的原則是證據先於結論，畫面上的定論必須能被數據與 README 驗證。
- 用累計值當「單次」數字，第二次點擊後就會失真（例如 Depth 10 注入 3 次會顯示 36，而不是 9）。

## 取捨

- Stage 頁的 Average Update Duration 包含方塊圖重建與動畫觸發的 render 成本，不能拿來跟 benchmark 頁或 README 比較；頁面 header 有說明。
- 對照列的 0/4/9/19 是由公式 `Depth − 1` 顯示，依據是 README 的實測與 `createComposableChain` 的結構（L1 是 source ref，L2 以上各一個 computed）；若之後 chain 結構改了，要同步更新這一列與結論文字。
- Dashboard 的 Composable Chaos 卡片目前仍連到 benchmark 頁。
- 原本頁面下方有一份完整的 Runtime Metrics 表格，後來拆進兩個位置、表格移除：建立期數據（COMPOSABLES / COMPUTED_NODES / WATCH / EFFECT / BUILD_DURATION）放在方塊圖下方的 `[ LINK_STRUCTURE_TELEMETRY ]` 狀態列（綠），運行期數據（TOTAL_UPDATES / AVG_LATENCY / COMPUTED_RE_RUNS / RENDER_TRIGGERS，以及 watch / effect trigger 次數）放進診斷面板標題下方的矩陣（琥珀）。COMPUTED_RE_RUNS 與標題的「每次重算數」用同一個基準值（build 完成時的累計），而且基準值是 reactive，重新 build 時不會拿上一條 chain 的基準相減。
- 之後診斷面板再重組為「結論大字 → `[SYS_STACK_TRACE_STREAM]` 終端機 → 一行狀態列」，移除對照列與 README 摘要，改由終端機的即時 log 當證據。為了把每層 computed 的執行推到終端機而不改 benchmark 程式碼，Stage 頁改用 `stage/createTracedComposableChain.ts`：結構、metrics increment 與 `createComposableChain` 相同，只是把 `console.log` 換成 `onTrace` 回呼（比照 Reactive Chain Stage 的 `createTracedChain`），benchmark 的 chain 結構若改動要同步。log 先寫入非 reactive buffer，update 結束後才交給子元件 `ChaosTty`；lines 只存在子元件內，寫 log 不會觸發頁面 re-render，RENDER_COUNT 不受影響（實測 build 1 次 + 每次 update 2 次）。
- 標題 `×N RE-RUNS` 的 N 是 update 造成的重算累計（不含建立時的首次計算），白話句寫「每次 source 變更逐層重算 Depth−1 個 computed，成本隨層數線性增加」，沒有採用「嚴重重複執行」的說法：每個 computed 每次 update 只執行一次，是必要的傳遞，不是重複。
