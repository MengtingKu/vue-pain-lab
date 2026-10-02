# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

資深前端工程師：極度在意前端效能、會去讀 Vue 原始碼、習慣開著 Chrome DevTools Performance 面板看 Flame Chart 的人。他們打開某個 scenario 頁，是為了在可控的條件下觸發一次（或連續）更新，讀出量化指標，再對照 DevTools / CDP trace 判斷 Vue runtime 的成本落在哪裡。

次要受眾：VueConf 等場合的現場觀眾，透過投影看 Demo。Component Storm 與 Reactive Chain 各有專用的 Stage 頁（`/scenarios/*/stage`），可視化與動畫只放在 Stage 頁，benchmark 頁保持可量測。

## Product Purpose

Vue Pain Lab 從「每天寫 Vue 的工程師」視角，驗證新版 Vue（3.5 → 3.6 / Vapor）是否真的解決日常開發的痛點，而不是只看 release notes。每個 scenario 是一個可獨立執行的 Runtime Benchmark，搭配 Question / Hypothesis / Observation / Next Step 紀錄結論（見 `PAIN_LAB_PRINCIPLES.md`）。

**Reactive Chain Generator**（`/scenarios/reactive-chain`）以精準的量化指標，探測 Reactive Dependency Depth 對 Runtime Update Cost 的結構性影響：`ref → computed₁ … computedₙ → watch → watchEffect → component render`。指標分為兩段：

- **Initialization Phase（首航依賴建立）**：Dependency Depth、Computed Execute Count、WatchEffect Trigger Count。
- **Runtime Update Phase（狀態變更更新效能）**：Total Update Count、Average Update Duration、Total Execution Time、Watch Trigger Count、Render Count。

**Composable Chaos Abstraction Prober**（`/scenarios/composable-chaos`）探測 Composable 巢狀封裝層數（`useLayerN()`，Depth 1 / 5 / 10 / 20）是否帶來額外的 Reactive Runtime Cost。受眾是研究 composable 封裝層次與執行期成本的前端架構師。操作是明確的兩階段序列：

- **PHASE 01 // ABSTRACTION LAYER SETUP**：選 Depth → 執行 01（Build Chain）建立該深度的 composable chain。Build Phase 指標混合了 N 層 function call、reactive primitive 建立與首次 render。
- **PHASE 02 // RUNTIME INTENSITY INJECTION**：使用者親自執行過 01、且所選 Depth 等於已建立的 Depth 後，02（Trigger Update）才解鎖，可連續觸發。Update Phase 指標量測 source 變更沿 N 層 computed 傳遞的成本。

Composable Chaos 另有 Stage 頁（`/scenarios/composable-chaos/stage`）負責降低認知門檻：操作引導條、每層 composable 的方塊圖與傳導光效、以及由計數器即時算出的診斷結論（每次 update 重算 Depth−1 個 computed，成本隨層數線性增加，與 README 實測一致）。

**VDOM Stress Test — Mass Grid Injector**（`/scenarios/vdom-stress`）量測一次性大量 Render（100 / 500 / 1000 / 5000 個 card）時的 Vue Runtime 成本，受眾是研究大量資料渲染、虛擬列表與 VDOM 執行期成本的前端工程師。benchmark 頁的 `renderDuration` 只涵蓋「建立陣列 → Vue nextTick」；README 的實測顯示大量 Mount 時真正的瓶頸是之後的瀏覽器 Layout（5000 Mount Layout ≈ 219 ms，renderDuration ≈ 63 ms），而 Update（資料不變）幾乎沒有 DOM 寫入。Stage 頁（`/scenarios/vdom-stress/stage`）把這件事直接量給使用者看：注入後實測 Vue patch、MutationObserver 實際插入的節點、強制 reflow 的 Layout 與主執行緒連續佔用時間，依 frame（16.7 ms）/ long task（50 ms）預算判定 STABLE / FRAME DROP / VDOM CHOKED。

成功的定義：數字可信、可重現、可以和 CDP trace 對帳。

## Positioning

不是 demo，也不是最佳實踐範例：每個 scenario 刻意不做優化，固定控制變因，讓 Vue 版本成為唯一的變數，並以 CDP trace 與多次重複量測（median、獨立 replicate）作為證據。

## Operating Context

- 本機 `npm run dev` / `npm run preview`，Chrome DevTools Performance 面板與 console.log 並用。
- `scripts/cdp-trace/` 的 runner 透過 CDP 自動開頁、點擊、讀值。runner 依賴頁面 DOM：Reactive Chain 依賴 `.params dl`、兩個 `.metric-group dl` 內 `<dt>` 的完整文字，以及文字剛好是 `Trigger Update` 的 `<button>`。Composable Chaos 依賴 `input[name="composable-depth"][value=N]`、文字剛好是 `Build Chain` / `Trigger Update` 的按鈕、兩個 `.metric-group` 內 `<dt>` 的第一個文字節點，以及 Build Duration 從 `-` 變回數值的轉換（因此頁面 mount 時必須先自動 build 一次）。VDOM Stress 依賴 `input[name="render-count"][value=N]`、文字剛好是 `Trigger Render` 的按鈕、`.metrics` 內所有 `dt` / `dd`（`renderDuration` 的 `dd` 必須剛好是 `-` 或 `X ms`，不可有前後空白）；而且 Rendered Cards 本身就是被量測的對象，它的盒模型、字型與 `.cards__list` 的 `max-height` / `overflow` 都會影響 Layout / Paint 數字（README Limitation）。任何視覺改版都必須保留這些結構與文字。
- 量測受環境影響大（分頁可見性、電源模式、CDP console capture），驗證流程見 `.claude/skills/validate-vue-update`。

## Capabilities and Constraints

- Lab Parameters（Reactive Chain 的 `DEPTH`、`UPDATE_INTERVAL`、`AUTO_UPDATE`）是 scenario 檔頂部的編譯期常數，頁面只**唯讀顯示**；修改要改原始碼。runner 會斷言 `DEPTH=100`。
- 改視覺不能改變被量測的對象：不在 scenario 元件裡加入會隨每次更新而 patch 的 DOM、不加持續性的 main-thread 動畫。CSS 改版後 Rendering / Paint 拆解不能與舊報告直接相減，需在新 commit 重跑 baseline。
- 技術棧：Vue 3.5（Composition API）、TypeScript、Vite、Pinia、vue-router。沒有測試框架。
- 不引入框架化抽象層；composable 不操作 DOM；`src/utils/` 不依賴 Vue。

## Evidence on Hand

- `VUE_CONF_EVIDENCE_PACK.md`、`results/`、各 scenario `README.md` 的量測紀錄。
- 頁面上的數字一律是即時量測值，不得放入任何虛構或示意數據。
- 判定門檻用實測時間而不是輸入大小（例如 VDOM Stress 依主執行緒佔用時間判定，而不是「選了 5000 就是 CHOKED」）。
- 頁面上的「結論」文字必須由即時數據算出，且不得與 scenario README 的 Observation / Conclusion 矛盾（例如 Composable Chaos 的成本是線性，不是倍數增長）。

## Product Principles

1. **數字先於裝飾。** 任何視覺處理都要讓讀數更好讀、更好比對，不能蓋過讀數。
2. **不干擾量測。** 介面本身不能成為被量測成本的一部分。
3. **一個 scenario 一個問題。** 每頁獨立可讀、獨立可跑。
4. **沒有真實痛點就不做。** 不為了寫而寫，也不提前優化或抽象化。
