# Day 29 — 最終驗證：Vue 3.6 Runtime vs Vapor

**先測量，後解讀。** 沒有任何結果是預先假設的。這份報告涵蓋兩項獨立工作：

1. 對本 Lab 目前已完成的所有 Vue 3.5→3.6（Traditional）驗證進行**稽核**
   （沒有重跑，也沒有改寫任何內容）。
2. 一次**全新、真實**的 CDP 雙軌追蹤測量，在 `vdom-stress` 上比較
   Vue 3.6.0-rc.4 Traditional 與 Vue 3.6.0-rc.4 Vapor —— 本次 session 實際
   執行了 640 次 trigger+trace 循環（16 個 cell × 2 個 trace 來源 ×
   [3 次暖機 + 10 次量測] trials），並以 Lab 既有、未經修改的
   `evidence.ts`/`stats.ts` 分類器進行分析。

---

## Part 1 — 最終 Evidence 稽核（既有證據，非重新論證）

| Lab                                                                   | Cost Layer                                                                             | Vue 3.5                  | Vue 3.6                                                                                                                                                                        | Evidence 狀態                                                       | Attribution（歸因）                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive Chain (DEPTH=100)                                            | Average Update Duration                                                                | 48.086 ms 中位數 (n=3)   | 47.310 ms 中位數 (n=3)，−1.6%                                                                                                                                                  | 無顯著差異（落在同一 build 的雜訊帶內，雜訊帶上限 +36%）            | 無法判定 / 證據不足（雜訊 > 訊號）                                                                                                                                         |
| Reactive Chain                                                        | Computed/Watch/Render 次數                                                             | 10100 / 100 / 199        | 完全相同                                                                                                                                                                       | 無顯著差異（正確性檢查，非效能）                                    | 不適用                                                                                                                                                                     |
| Component Storm (componentCount=500)                                  | Average Update Duration, AllChildren                                                   | 187.405 ms               | 158.669 ms，−15.3%                                                                                                                                                             | 改善（超出兩個 build 各自的雜訊帶）                                 | 證據不足 —— 僅有頁面內量測 (n=3)，沒有 CDP 歸因，無法區分是 Vue Runtime 還是 JS 層級的效果                                                                                 |
| Component Storm (500)                                                 | ParentOnly / SingleChild Update Duration                                               | 8.770 / 9.000 ms         | 6.488 / 6.635 ms (約 −26%)                                                                                                                                                     | 不穩定（baseline 雜訊帶 19–32% 與差值重疊）                         | 證據不足                                                                                                                                                                   |
| Component Storm                                                       | render/update 次數                                                                     | 三個 scope 皆相同        | 相同                                                                                                                                                                           | 無顯著差異（正確性檢查）                                            | 不適用                                                                                                                                                                     |
| VDOM Stress —— 完整 CDP 雙軌追蹤 (N=10，`FINAL_VALIDATION_REPORT.md`) | Scripting / Rendering / Layout / Paint / Vue Runtime CPU 等，Mount+Update × 4 種節點數 | 完整 baseline            | 80 個 cell 中，3 個為一致性改善（Update 側，該報告中已標註為低信心）、6 個為一致性劣化（Mount N=100/5000，該報告已歸因為量測窗口造成的假象，並非真正劣化）、71 個為不穩定/穩定 | **在該矩陣中，任何地方都未確認有可重現的 Framework 層級改善或劣化** | 已明確拆分 Scripting vs Vue Runtime CPU vs Application CPU vs V8/native CPU vs Browser Rendering —— 除了兩個已標註、未確認的候選項外，沒有任何一項乾淨地達到「一致性改善」 |
| Composable Chaos Layer A（頁面內量測，N=3）                           | Average Update Duration                                                                | Depth 1/5/10/20 baseline | Depth 20：−21.2%，顯著；Depth 1：+7.5%（變差）；Depth 5/10：無顯著差異                                                                                                         | 混合                                                                | 證據不足（僅 n=3）                                                                                                                                                         |
| Composable Chaos Layer B（CDP 雙軌追蹤，N=5，Day 24）                 | Scripting（Depth 20, update）                                                          | baseline                 | −25.6%，5/5 配對一致、IQR 不重疊                                                                                                                                               | **一致性改善** —— 本 Lab 既有證據中唯一乾淨的訊號                   | JS 層級（Scripting）已確認；明確**無法**歸因到 Vue Runtime —— 同一個 cell 的 Vue Runtime CPU 卻是「一致性劣化」（+67.1%），且該項本身已被標註為低信心                      |
| Composable Chaos Layer B                                              | 其餘約 70/88 個 cell                                                                   | baseline                 | 大多不穩定                                                                                                                                                                     | 證據不足                                                            | —                                                                                                                                                                          |
| 「Design System / Architecture」                                      | —                                                                                      | —                        | —                                                                                                                                                                              | **這個 repo 裡沒有這個 Lab。** 並非為了這份報告而虛構。             | 不適用                                                                                                                                                                     |

**現有結論，重申而非改寫：** 綜觀全部四個真實 Lab，最主要的發現是
Vue 3.6 Traditional 相對於 3.5.40 _沒有可重現的 Framework 層級 runtime
成本改善_。唯一一個統計上乾淨的例外（Composable Chaos Depth 20 update
Scripting）在 JS 層級確實是真的，但 Lab 本身的歸因方法無法把它歸功於
Vue 的 reactivity engine 本身。

---

## Part 2/3 — Vapor 相容性評估（本 session 新增工作）

依任務指示的優先順序：VDOM Stress 優先。本 session **只**評估了
VDOM Stress 的 Vapor 相容性 —— Component Storm 與 Composable Chaos 的
Vapor 相容性**尚未評估，也未做任何假設**。

### 技術事實（透過直接檢查確認，非依據文件說法）

- `vue@3.6.0-rc.4`（npm `rc` dist-tag）將 `@vue/runtime-vapor` 與
  `@vue/compiler-vapor` 宣告為 `vue` 套件的一般同版本相依套件。
  `npm install vue@3.6.0-rc.4 --save-exact` 會自動一併安裝這兩個套件 ——
  已透過 `npm list` 確認。沒有使用非標準 registry，也不是從原始碼建置。
  符合本 Lab 的環境規則（僅透過一般 `npm install` 改變 `vue` 版本）。
- `@vitejs/plugin-vue@6.0.8` —— 本 repo 目前所固定的版本
  (`^6.0.7`) —— 提供 `features.vapor: boolean` 選項（「強制所有
  `<script setup>` SFC 檔案以 Vapor 模式編譯……自 Vue 3.6 起可用」）。
  已透過解開已發佈的 tarball 並直接閱讀 `dist/index.d.mts` /
  `dist/index.mjs` 確認，而非依據 changelog 的說法。
- 要在整個 app 中啟用 Vapor，只需要在**兩個檔案**中做**恰好兩處**修改，
  且**都不是** Scenario 原始碼：
  1. `vite.config.ts`：`vue({ features: { vapor: true } })` —— 建置設定。
  2. `src/main.ts`：`app.use(vaporInteropPlugin)` —— 這是機制上必要的，
     不是可有可無的權宜之計：若沒有它，`app.mount()` 會拋出錯誤
     （`Vapor component found in vdom tree but vapor-in-vdom interop was
not installed`），因為 `App.vue`／`DefaultLayout`／`RouterView`
     本身並非 Vapor —— 只有葉節點的 `<script setup>` SFC 會被強制編譯，
     要把它們橋接進（仍為 Traditional 的）root tree 就需要這個 plugin。
     這是通用的 app 啟動樣板，與特定 scenario 無關。
  3. **在任何 `src/scenarios/**`或`src/benchmarks/**` 檔案中零位元組修改**
     —— 已針對兩個新 worktree，對照 commit `d3991df` 用 `git diff` 確認。
- 功能性煙霧測試（`claude-in-chrome`）：`vdom-stress` N=100 Mount 在
  Vapor 下能正確渲染全部 100 張卡片；`renderDuration` 指標透過相同的
  `nextTick()` 量測方式正常填入；zero console 錯誤。
- Pipeline 煙霧測試：**凍結、未修改**的 `runVersionNodeCount()`（來自
  `run-validation-matrix.ts`）在沒有任何調整的情況下，直接對 Vapor
  server 執行 —— 在正式完整跑測開始前，`cost-trace` 與
  `runtime-attribution-trace` 在 N=100 Mount 各自順利存下 10/10 筆 trial。
- Attribution-bucketing 交叉檢查（方法論上的盡職查核，不是理所當然假設
  安全）：直接檢查兩種條件下 trace 中原始 CPU-profiler 的
  `callFrame.url` 值。Vite 的相依套件 pre-bundler 會把
  `@vue/runtime-core` **與** `@vue/runtime-vapor` 合併進**同一個**
  `vue.runtime.esm-bundler-*.js` pre-bundled chunk（兩者都是從單一
  `vue` 套件的進入點重新匯出），因此 `attribution.ts` 既有的
  `bucketForUrl()`（`url.includes('vue.runtime.esm-bundler')`）能正確地
  把 Vapor 自身的 runtime frame 分類為 `vueRuntime` —— 已確認
  Traditional 與 Vapor 兩邊的 trace 中出現完全相同的 URL 集合。既有的
  attribution 工具對 Vapor 沒有盲點。

### 結論（Verdict）

VDOM Stress 屬於**受控的架構比較（Controlled Architectural Comparison）**
—— Scenario Freeze Rule 完全成立（Component Structure、Reactive Logic、
Benchmark Parameters、Node Count 全部逐位元組相同）；Vapor 是透過兩項
已揭露、與 scenario 無關的基礎設施變更達成的，而非修改 Scenario 本身。

### 版本注意事項（已揭露，未隱藏）

歷史上的 Vue 3.6 Traditional baseline（`FINAL_VALIDATION_REPORT.md`）
使用的是 `3.6.0-rc.2`。為了讓新比較中的「架構」變數（Traditional vs
Vapor）保持完全乾淨，本 session 把兩個新條件都建置在完全相同的 patch
版本 `3.6.0-rc.4` 上，而不是沿用舊的 rc.2 數字作為 Traditional 那一側。
後果：

- **比較 2（3.6 Traditional vs 3.6 Vapor，本 session 的新資料）是乾淨
  的**—— 相同 rc、相同 commit，只有 Vapor 開關不同。
- **比較 1 與比較 3**（任何串接回歷史 3.5.40/3.6.0-rc.2 證據的比較）
  在真正要研究的變數之外，額外帶了一個未受控的 rc.2→rc.4 版本落差。
  下方凡是用到之處都會明確標註，不會含糊帶過。

---

## Part 4 — 凍結變數（實際上保持不變的項目）

|                             | 保持不變的內容                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenario 原始碼             | `vdom-stress` 在兩個新 worktree 中都與 commit `d3991df` 逐位元組相同（`git worktree add <path> d3991df --detach`；`git diff` 確認 scenario 檔案零修改）                                                                  |
| Node.js / Vite / TypeScript | v24.13.0 / 8.1.5 / 未變 —— 與所有先前驗證同一台機器                                                                                                                                                                      |
| 量測 Pipeline               | `chrome.ts` / `tracer.ts` / `sync.ts` / `parser.ts` / `rollup.ts` / `stats.ts` / `evidence.ts` 皆未修改、直接匯入；僅新增一個呼叫既有、凍結的 `runVersionNodeCount()` 的 orchestration 檔案（`run-vapor-comparison.ts`） |
| Trial 數量                  | 維持既有凍結協定的 3 次暖機 + 10 次量測 —— 沒有為了方便而減少                                                                                                                                                            |
| 刻意引入、已揭露的變數      | 本 session 的兩個新條件使用 Vue patch 版本 `3.6.0-rc.4`（而非 `rc.2`），以在比較 2 中保持「架構」這個變數乾淨（見上方注意事項）                                                                                          |

---

## Part 5–7 — 原始結果、統計、成本歸因

完整逐 cell 數字：`scripts/cdp-trace/analyze-vapor-comparison.ts` 的輸出
（80 個 cell：10 個 metric × 2 種操作 × 4 種節點數）。原始 trace/meta
檔案：`results/cdp-trace/vue-3.6.0-rc.4-traditional/` 與
`results/cdp-trace/vue-3.6.0-rc.4-vapor/`（16 個「節點數×操作」目錄 ×
2 個 trace 來源 × 每項 10 次 trial = 640 個 trial 檔案，全部齊全）。
分類器與 `FINAL_VALIDATION_REPORT.md` 相同（「一致性改善」／
「一致性劣化」需要 IQR 不重疊**且**配對 trial 中至少 9/10 方向一致；
「穩定」需要 |Δ%|<3% **且**配對結果接近 50/50；其餘一律為「不穩定」）。

### Mount —— 中位數（單位 µs，除非另有註明），Traditional → Vapor

| 指標                 | N=100                            | N=500                               | N=1000                              | N=5000                               |
| -------------------- | -------------------------------- | ----------------------------------- | ----------------------------------- | ------------------------------------ |
| Render Duration (ms) | 2.0→2.0，穩定                    | 5.8→5.9，穩定                       | 15.6→10.4，**−33.3%，一致性改善**   | 130.2→85.8，−34.1%，不穩定\*         |
| Scripting            | 3267→2617，不穩定                | 8455→6463，不穩定                   | 22461→10664，**−52.5%，一致性改善** | 164433→86059，−47.7%，不穩定\*       |
| Rendering            | 5566→5041，不穩定                | 14838→22936，不穩定                 | 52026→37321，不穩定                 | 351847→360057，+2.3%，穩定           |
| Layout               | 3818→3076，不穩定                | 10557→17048，不穩定                 | 38086→27875，不穩定                 | 275017→279725，+1.7%，穩定           |
| Painting             | 1476→2025，不穩定                | 3864→4942，不穩定                   | 7327→6216，不穩定                   | 12378→11429，不穩定                  |
| Vue Runtime CPU      | 2085→707，**−66.1%，一致性改善** | 20496→11900，**−41.9%，一致性改善** | 34004→8587，**−74.7%，一致性改善**  | 123510→15361，**−87.6%，一致性改善** |
| Application CPU      | 629→0，不穩定                    | 3234→1622，**−49.8%，一致性改善**   | 4967→622，**−87.5%，一致性改善**    | 16881→2883，**−82.9%，一致性改善**   |

\* N=100/N=5000 的 Mount 出現了幅度大、方向一致的差值，卻仍落在
「不穩定」（相對於差值而言 IQR 過寬）—— 這重現了
`FINAL_VALIDATION_REPORT.md` §11 已記載、並歸因為兩個極端節點數共通的
量測窗口假象的同一種異常現象 —— 此處**不重新論證**，只是指出同樣的
已知模式再次出現。

### Update —— 中位數（單位 µs，除非另有註明），Traditional → Vapor

| 指標                 | N=100             | N=500                           | N=1000                             | N=5000                                                              |
| -------------------- | ----------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Render Duration (ms) | 1.1→1.2，不穩定   | 5.3→7.9，**+49.1%，一致性劣化** | 10.3→5.2，−49.8%，不穩定           | 28.5→12.4，**−56.5%，一致性改善**                                   |
| Scripting            | 2126→1866，不穩定 | 9402→8844，不穩定               | 17346→5894，**−66.0%，一致性改善** | 51433→12642，**−75.4%，一致性改善**                                 |
| Rendering            | 1383→1433，不穩定 | 4039→5022，不穩定               | 5944→3492，不穩定                  | 7384→5187，不穩定                                                   |
| Recalculate Style    | 282→222，不穩定   | 811→856，不穩定                 | 725→346，不穩定                    | 128→239，**+87.1%，一致性劣化**（處於次毫秒範圍 —— 見下方注意事項） |
| Vue Runtime CPU      | 556→489，不穩定   | 4656→5968，不穩定               | 9867→7976，不穩定                  | 40892→10770，**−73.7%，一致性改善**                                 |
| Application CPU      | 0→0，不穩定       | 2372→0，**−100%，一致性改善**   | 2779→0，**−100%，一致性改善**      | 14447→900，**−93.8%，一致性改善**                                   |

### 成本結構 —— 佔（Scripting+Rendering+Painting）之比例，中位數

|                         | N=100                                              | N=500                 | N=1000                | N=5000                    |
| ----------------------- | -------------------------------------------------- | --------------------- | --------------------- | ------------------------- |
| **Mount, Traditional**  | Scripting 31.7% / Rendering 54.0% / Painting 14.3% | 31.1% / 54.6% / 14.2% | 27.5% / 63.6% / 9.0%  | 31.1% / 66.6% / 2.3%      |
| **Mount, Vapor**        | 27.0% / 52.1% / 20.9%                              | 18.8% / 66.8% / 14.4% | 19.7% / 68.9% / 11.5% | **18.8% / 78.7% / 2.5%**  |
| **Update, Traditional** | 43.1% / 28.1% / 28.8%                              | 40.6% / 17.4% / 42.0% | 51.2% / 17.5% / 31.3% | 80.9% / 11.6% / 7.5%      |
| **Update, Vapor**       | 41.0% / 31.5% / 27.4%                              | 34.6% / 19.7% / 45.7% | 41.6% / 24.7% / 33.7% | **57.2% / 23.5% / 19.4%** |

（Scripting+Rendering+Painting）絕對總和，Mount N=5000：**528,657µs →
457,544µs（−13.5%）**。
Update N=5000 絕對總和：**63,590µs → 22,112µs（−65.2%）**。

**信心度注意事項，沿用本 Lab 既有方法論不變**
（`scripts/cdp-trace/evidence.ts`）：Vue Runtime CPU / Application
CPU / V8-native CPU 依 Lab 自身的設計，一律為 `confidence: 'low'`
—— 這是僅取樣葉節點的 CPU-profiler，會低估 Vue 真正的 inclusive
成本，且被量測的數字本身也包含了 profiler 取樣的額外開銷。本 session
（見 Part 2/3）已驗證 URL-bucketing 機制本身對 Vapor 沒有失效，但這三
個 bucket 既有的低信心標記**並未解除**——下方幅度非常大、非常一致的
Vue Runtime CPU / Application CPU 下降，應被解讀為強烈的*方向性*訊
號，而非精確數字。

---

## Part 8 — 成本邊界分析（Cost Boundary Analysis）

**Vapor 是否從 Framework Runtime 這一層移除了成本？** 在 Mount 情境，
是的，而且方向明確、幅度顯著：Vue Runtime CPU 在**每一個**節點數上都
下降 42–88%，配對 trial 有 9–10/10 一致、IQR 不重疊 —— 這是本報告中
最一致的訊號，出現在全部 4 個規模上，而非只有一個。Scripting
（cost-trace 衍生、信心度高於 CPU-attribution bucket 的指標）在每個
節點數上也是同方向下降，在 N=1000（−52.5%）乾淨達到「一致性改善」的
門檻，在 N=100/500/5000 則方向相同但未跨過較嚴格的 IQR 不重疊門檻。

**Browser 成本是否維持不變、同時 Framework 成本下降？** 在 Mount
N=5000 —— 本 Lab 先前工作已標記為 Browser Layout 佔主導地位的規模
—— 答案是乾淨的「是」：Rendering（+2.3%）與 Layout（+1.7%）都是
「穩定／無顯著差異」，而 Scripting 下降約 48%、Vue Runtime CPU 下降約
88%。成本結構佔比表把這個位移說得很明白：Mount N=5000 時，Scripting
佔（Scripting+Rendering+Painting）的比例從 31.1%（Traditional）降到
18.8%（Vapor），而 Rendering 的佔比則從 66.6% 升到 78.7% —— 同樣的
絕對 Browser 工作量，如今在更小的總量中佔了更大的比例。**這是 Mount
情境下真實發生的、朝 Browser 傾斜的 Cost Boundary 位移，而且隨規模
放大而更明顯**（N=100 時幾乎看不出來，N=5000 時最清楚）。

**Update 情境是否也一樣？** 只有部分成立。在 Update N=5000，Scripting
的下降幅度（−75.4%）比 Rendering（−29.8%，不穩定）或 Painting
（−10.2%，不穩定）更大、更快，所以 Scripting 的成本結構佔比仍然下降
（80.9%→57.2%）——但與 Mount 不同的是，*絕對*的 Browser 側數字也呈
下降趨勢，而非持平。Update 的（Scripting+Rendering+Painting）總量整
體下降了 65.2%——Vapor 不只是在移動 Update 的成本邊界，也在減少
Update 的總 main-thread 工作量，其中 Scripting 縮減得最快。

**兩個值得保留、而非捨棄的例外。** Update N=500 的 Render Duration 是
「一致性劣化」（+49.1%，只有 1/10 trial 偏向 Vapor）——這是唯一一個
Vapor 的 wall-clock Update 一致性變差的節點數，且恰好夾在兩個沒有這種
劣化現象的節點數（N=100、N=1000）之間。一個合理但**未經證實**的解
釋：`vaporInteropPlugin` 在（非 Vapor 的）root tree 與（Vapor 的）葉
元件之間的橋接成本，可能是一種近似固定的 per-update 開銷，在這個中
段規模下佔比最大，只有在更大規模時才會被 diff/patch 節省下來的成本
所淹沒——這是一個假說，不是已證實的機制，且已如實標註。Update N=5000
的 Recalculate Style 也是「一致性劣化」（128µs→239µs，配對 0/10），
但兩個數值都落在本 Lab `vdom-stress` README 先前已標記為對解析度敏
感的次毫秒範圍——已記錄，但不予以高度採信。

---

## Part 9 — 最終 Evidence Matrix

| Cost Layer        | Vue 3.5.40 |                                                      Vue 3.6 Runtime (rc.2，歷史資料) |                                                                                         Vue 3.6 Vapor (rc.4，本 session，對比 rc.4 Traditional) | Attribution（歸因）                                                         |
| ----------------- | ---------: | ------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------- |
| Scripting         |   baseline | 無可重現的變化（`FINAL_VALIDATION_REPORT.md` 中 80 個 cell 均為 0/80 達到「一致性」） | 在全部 4 個 Mount 節點數與兩個較大的 Update 節點數皆呈方向性下降；在 Mount N=1000（−52.5%）與 Update N=1000/5000（−66%/−75%）達到「一致性改善」 | JS 層級、cost-trace（信心度高於 CPU-attribution bucket）                    |
| Vue Runtime CPU   |   baseline |                                                  排除低信心候選項後，無「一致性改善」 |                                                         Mount **全部 4 個**節點數皆為「一致性改善」（−42% 至 −88%）；Update 僅 N=5000（−73.7%） | 低信心（Lab 自身的葉節點取樣限制），但在 Mount 情境下跨規模的一致性異常突出 |
| Rendering         |   baseline |                                                                        無可重現的變化 |                                                                                                 大多不穩定；Mount N=5000 為「穩定／無顯著差異」 | Browser Rendering Pipeline                                                  |
| Recalculate Style |   baseline |                                                                        無可重現的變化 |                                                                            大多不穩定；Update N=5000 有一個「一致性劣化」（次毫秒範圍，權重低） | Browser Rendering Pipeline                                                  |
| Layout            |   baseline |                                                                        無可重現的變化 |                                                                                                 大多不穩定；Mount N=5000 為「穩定／無顯著差異」 | Browser Rendering Pipeline                                                  |
| Paint             |   baseline |                                                                        無可重現的變化 |                                                                                                                                      大多不穩定 | Browser Rendering Pipeline                                                  |

| 問題                                     | 證據                                                                                                                                            | 信心度                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Vue 3.6 Runtime（Traditional）是否改善？ | 否 —— `FINAL_VALIDATION_REPORT.md` 發現除了 3 個已標註低信心的候選項外，0/80 個 cell 達到「一致性改善」                                         | 對「未確認改善」這個結論信心高                                            |
| Vapor 是否降低 Scripting？               | 在每一個 Mount 節點數與 Update N≥1000 皆呈方向性下降；多個個別 cell 達到「一致性改善」                                                          | 中等 —— 屬於 cost-trace 指標，但僅為本 session 單次執行，尚無獨立重跑驗證 |
| Vapor 是否降低 Rendering？               | 否 —— Browser Rendering 指標在 Mount N=5000 持平，其餘規模不穩定                                                                                | 中等 —— 持平結果在唯一可檢驗的規模上本身就是相當乾淨的訊號                |
| Browser Layout 是否仍是主要成本？        | 是，在 Vapor 下更加明顯 —— Mount N=5000 時，Rendering 佔總 main-thread 成本的比例從 66.6% 升到 78.7%，正是因為 Scripting 下降而 Layout 沒有下降 | 中高（cost-structure 佔比，源自 cost-trace 中位數）                       |
| Cost Boundary 是否發生位移？             | Mount 情境下是（Framework 成本下降、Browser 成本持平 → 邊界朝 Browser 位移）；Update 情境下部分成立（兩者皆下降，但 Scripting 下降更快）        | 中等                                                                      |

---

## Part 10 — 解讀

### Q1 — Vue 3.6 Traditional Runtime：目前有什麼 evidence 可以證明它改善了什麼？

沒有能通過本 Lab 自訂門檻的證據。`FINAL_VALIDATION_REPORT.md` 的結論
非常明確：排除該報告自身標註為未確認的三個候選項後，0/80 個 cell 達到
「一致性改善」。Component Storm 在 Average Update Duration 上顯示出
方向一致、幅度中等的改善，但僅有 3 次 trial、也沒有 CDP 歸因，無法拆
分究竟是 Framework 層級還是 JS 層級的效果。Composable Chaos 只有一個
乾淨訊號（Depth 20 update Scripting，−25.6%），且明確只屬於 JS 層級。

### Q2 — 哪些改善可以 attribution 到 Vue Framework Runtime？

Traditional 3.6 沒有任何一項可以。至於 **Vapor**（這是不同的軸線
——架構，而非單純的 runtime 版本），Vue Runtime CPU 在 Mount 情境
展現出強烈、且不受規模影響的訊號（全部 4 個節點數皆為「一致性改
善」）——但這個指標本身帶有 Lab 既有的低信心標記，所以這裡的說法是
「強烈的方向性歸因」，而非「已確認的數字」。

### Q3 — 哪些改善只能說是 JS-level improvement？

Composable Chaos 的那個訊號。以及，就 Vapor 而言：Scripting
（cost-trace 指標，比 CPU-attribution bucket 更值得信賴）在 Mount
N=1000 與 Update N=1000/5000 的下降，是本報告能提出的最站得住腳的
「JS-level improvement」說法。

### Q4 — Vapor 到底改變了哪一層 Cost？

主要是 Framework/Scripting 這一層，而且主要發生在 Mount。Vue Runtime
CPU 在每一個 Mount 規模上都一致下降。Update 呈現相同方向，但只有在
最大規模（N=5000）才乾淨過線，而在該規模下，總 main-thread 成本也整
體下降（−65%），而不只是位移。

### Q5 — Vapor 是否讓 Browser Cost 更加凸顯？

是的，在 Mount 情境，而且隨規模放大而更明顯：Rendering 佔總
main-thread 成本的比例在 N=5000 時從 66.6%（Traditional）升到
78.7%（Vapor），而 Rendering 的絕對數字則維持不變（「穩定／無顯著
差異」）。這直接回應了本 Lab 在 `vdom-stress` baseline README 中原本
就懸而未決的問題（Layout 在大規模 Mount 時佔主導）——並提供了新的
資料點：**移除 Framework overhead 並不會移除 Layout 成本——它只是讓
Layout 在剩下的成本中佔更大的比例。**

### Q6 — 前面五個 Lab 的 Final Conclusion 是否需要修改？

不需要。本 session 沒有重跑或推翻任何既有 Lab 對 Traditional runtime
的結論。本 session 只是在 `vdom-stress` 之上新增了一個獨立的軸線
（架構），並未觸及 Reactive Chain、Component Storm 或 Composable
Chaos，它們既有的 Final Conclusion 維持不變。

### Q7 — 這次結果屬於哪一種？

- **VDOM Stress，比較 2（3.6.0-rc.4 Traditional vs 3.6.0-rc.4
  Vapor）：屬於受控驗證（Controlled Validation）。** Scenario Freeze
  Rule 完全成立；只需要兩項與 scenario 無關的基礎設施變更即可啟用
  Vapor。
- **比較 1 與比較 3**（任何串接回歷史 3.5.40/3.6.0-rc.2 證據的比較）：
  屬於**探索性（Exploratory）**，不是受控驗證——rc.2→rc.4 的版本落差
  是伴隨著架構變數一起出現的未受控變數。
- **Component Storm / Composable Chaos 在 Vapor 下的表現：本 session
  未評估**——不做任何方向的斷言。

---

## 一句話

**目前 Evidence 最支持的說法是**：Vue 3.6 Traditional Runtime 本身，在這個
Lab 已完成的四個場景中，沒有找到可重現的 Framework-level 改善（`Insufficient
Evidence` 佔壓倒性多數）；而 Vapor（作為一個不同的 Rendering Architecture，
僅在 vdom-stress 上以 Controlled 方式驗證過）確實把 Mount 情境下的
Framework/Scripting 成本降低了，且這個訊號在全部四個 Node Count 上方向一致
——但它沒有讓 Browser Rendering／Layout 成本消失，只是讓 Layout 在剩下的總成
本中佔比更高；Update 情境下的訊號較弱、只在最大規模（N=5000）才乾淨過線，
且 N=500 出現一個尚無法解釋的 Wall-clock Regression。這些都是本輪單次
Controlled 執行的結果，尚未經過獨立重跑驗證，讀成「方向性訊號」比讀成
「已確認的結論」更誠實。

---

## Appendix — 本 session 產生的檔案

- `scripts/cdp-trace/run-vapor-comparison.ts` —— 僅負責 orchestration，
  重用未修改的 `runVersionNodeCount()`。
- `scripts/cdp-trace/analyze-vapor-comparison.ts` —— 分析用，重用未修改
  的 `evidence.ts`/`parser.ts`/`stats.ts`，分類門檻與
  `analyze-validation-matrix.ts` 相同。
- `results/cdp-trace/vue-3.6.0-rc.4-traditional/`、
  `results/cdp-trace/vue-3.6.0-rc.4-vapor/` —— 640 個原始 trial 檔案
  （trace + meta JSON）。
- 兩個新的 git worktree（在主要 tree 之外，未 commit）：
  `vue-pain-lab-vue36rc4-trad`（僅改 `vite.config.ts`/`package.json`
  —— Vue 版本升級，沒有 vapor flag）、`vue-pain-lab-vue36-vapor`
  （`vite.config.ts` 的 `features.vapor: true`、`src/main.ts` 註冊
  `vaporInteropPlugin`、`package.json` Vue 版本升級 —— 沒有動到任何
  Scenario 檔案，已對照 `d3991df` 以 `git diff` 驗證）。
- 以上皆尚未 commit。`results/cdp-trace/vue-3.6.0-rc.4-*/` 與這份報告
  是主要 repo 中新增的、尚未追蹤的檔案；兩個 worktree 則是主要 repo 之
  外的獨立目錄。這裡的任何內容都不會覆蓋或修改任何先前已 commit 的
  evidence。
