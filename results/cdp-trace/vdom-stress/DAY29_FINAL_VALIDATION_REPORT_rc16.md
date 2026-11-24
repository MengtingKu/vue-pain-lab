# Day 29 — Final Validation：Vue 3.6.0-rc.16 Traditional vs Vapor（vdom-stress）

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。

本報告**不取代** `DAY29_FINAL_VALIDATION_REPORT_rc11.md`（rc.11）、`DAY29_FINAL_VALIDATION_REPORT_rc9.md`（rc.9）與
`DAY29_FINAL_VALIDATION_REPORT.md`（rc.4），三份報告原封不動，在此作為前一個 / 更早的 Freeze Point 引用。

---

## Part 0 — Freeze Point 宣告

| 項目                        | 值                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Freeze Point**            | **2026-11-23**（宣告日；有效量測在 2026-11-24 UTC 完成）                                                                                                                                                                    |
| **Final Validation 版本**   | **`vue@3.6.0-rc.16`**（exact；使用者指定 rc.16，npm `rc` dist-tag 亦為 `3.6.0-rc.16`；2026-11-20 發布）                                                                                                                     |
| Vue Git Commit              | rc.16 `34d4d0728e937ce7bbf26e4b1bc4f975c704a9d2` · rc.11 `b55f3b92a185…` · rc.9 `5be279570a84…` · rc.4 `3bafec0d84a9…` · 3.5.40 `fa2885d8c487…`                                                                             |
| 前一個 Freeze Point         | `vue@3.6.0-rc.11`（`DAY29_FINAL_VALIDATION_REPORT_rc11.md`，Freeze Point 2026-10-14）                                                                                                                                       |
| Version Change（未量測）    | rc.12（2026-10-16，`20029bc7…`）、rc.13（2026-10-23，`0f59df27…`）、rc.14（2026-10-30，`7961f53a…`）、rc.15（2026-11-12，`1595469e…`）——在 rc.11 Freeze Point 之後、rc.16 之前；依 Freeze Rule 第 4、5 條只記錄，**不量測** |
| Validation Date             | 有效量測 2026-11-24：重複 1 01:05–01:21 UTC、重複 2 01:22–01:37 UTC（兩次獨立執行，每次前重啟 dev server）。2026-11-23 14:27–15:28 UTC 的第一個 session **作廢**（Part 2.3 / Part 9.1）                                     |
| Node.js / Vite / plugin-vue | **v24.22.1** / 8.1.5 / 6.0.8（rc.11 為 v24.13.0 / 8.1.5 / 6.0.8；見 Part 2.3）                                                                                                                                              |
| Browser                     | **Chrome 157.0.8103.79**（headless=new，全部條件、兩次 run 同一版本；rc.11 為 155.0.8059.41）                                                                                                                               |
| Scenario Commit             | `d3991df`（9 個 worktree 的 `src/scenarios`、`src/benchmarks` 與此 commit 逐位元組相同）                                                                                                                                    |
| Repo HEAD（分析端）         | `b74db2c`                                                                                                                                                                                                                   |
| Benchmark Parameters        | N=100/500/1000/5000 × Mount/Update × 3 warm-up + 10 measurement × 2 trace sources（未改）                                                                                                                                   |
| 電源                        | AC（`Win32_Battery.BatteryStatus=2`）；AC overlay `ded574b5…` = **最佳效能**（與 rc.11 相同）；有效 session 期間 AC / DC 的睡眠與螢幕關閉皆設為「永不」                                                                     |

依 `validate-vue-update` 的 Final Validation Freeze Rule 第 4、5 條，Freeze Point
後的新 RC 不自動觸發重跑；本次重跑是使用者明確要求（`/validate-vue-update 3.6.0-rc.16`），
因此以本報告正式宣告新的 Freeze Point。rc.12–rc.15 在兩個 Freeze Point 之間發布，只記錄
Version Change。rc.16 之後若再有新 RC，同樣只記錄 Version Change，不覆蓋本報告。

**Freeze Rule 第 6 條（是否有與本 Scenario 直接相關的重大變更）**：rc.12–rc.16 CHANGELOG 中標為 Performance 的
runtime / compiler 項目集中在 slots、attrs proxy、hydration、Transition / KeepAlive interop 與 compiler-vapor 的 transform；
`vdom-stress` 是單一元件內的 inline `v-for` 列表（無子元件、無 slot、無 SSR），沒有一項能直接對應到這條路徑。
rc.15 有一批 reactivity（computed dirty check / 訂閱）修正。本報告不據 CHANGELOG 歸因任何量測結果。

---

## Part 1 — Historical Validation（3.5.40 → 3.6.0-rc.2，未重跑、未修改）

D09 / D14 / D19 / D25 的結論**原封沿用**，本 session 沒有重跑、沒有改寫：

- Reactive Chain / Component Storm / Composable Chaos / VDOM Stress（Traditional）
  在 3.5.40 → 3.6.0-rc.2 之間，沒有可重現的 Framework-level runtime 成本改善
  （細節見 `DAY29_FINAL_VALIDATION_REPORT.md` Part 1 與 `FINAL_VALIDATION_REPORT.md`）。
- 唯一統計上乾淨的訊號是 Composable Chaos Depth 20 update Scripting（−25.6%），
  只屬 JS 層級，無法歸因到 Vue Runtime。

本報告的 3.5.40 / rc.4 / rc.9 / rc.11 資料是**新的同 session 對照組**（`-chrome157b-run2/-run3`），
用途是讓 rc.16 有同一瀏覽器、同一時段的基準，**不是**重跑歷史 Validation，也不取代 rc.11 / rc.9 報告的數字。

---

## Part 2 — 實驗設計與環境控制

### 2.1 Matrix（9 個條件 × 2 次獨立 run，同一 Chrome，交錯執行）

沿用 rc.11 的 7 個條件（3.5.40、rc.4 T/V、rc.9 T/V、rc.11 T/V，皆改為同 session 對照組），新增 rc.16 T/V。

| 條件                              | Worktree                       | Port / Chrome port | 輸出目錄（`<run>` = `run2` / `run3`）           |
| --------------------------------- | ------------------------------ | ------------------ | ----------------------------------------------- |
| 3.5.40（控制組）                  | `vue-pain-lab-vue35-d29ctrl`   | 5178 / 9351        | `vue-3.5.40-chrome157b-<run>/`                  |
| 3.6.0-rc.4 Traditional（控制組）  | `vue-pain-lab-vue36rc4-trad`   | 5175 / 9352        | `vue-3.6.0-rc.4-traditional-chrome157b-<run>/`  |
| 3.6.0-rc.4 Vapor（控制組）        | `vue-pain-lab-vue36-vapor`     | 5174 / 9353        | `vue-3.6.0-rc.4-vapor-chrome157b-<run>/`        |
| 3.6.0-rc.9 Traditional（控制組）  | `vue-pain-lab-vue36rc9-trad`   | 5176 / 9354        | `vue-3.6.0-rc.9-traditional-chrome157b-<run>/`  |
| 3.6.0-rc.9 Vapor（控制組）        | `vue-pain-lab-vue36rc9-vapor`  | 5177 / 9355        | `vue-3.6.0-rc.9-vapor-chrome157b-<run>/`        |
| 3.6.0-rc.11 Traditional（控制組） | `vue-pain-lab-vue36rc11-trad`  | 5179 / 9356        | `vue-3.6.0-rc.11-traditional-chrome157b-<run>/` |
| 3.6.0-rc.11 Vapor（控制組）       | `vue-pain-lab-vue36rc11-vapor` | 5180 / 9357        | `vue-3.6.0-rc.11-vapor-chrome157b-<run>/`       |
| **3.6.0-rc.16 Traditional**       | `vue-pain-lab-vue36rc16-trad`  | 5181 / 9358        | `vue-3.6.0-rc.16-traditional-chrome157b-<run>/` |
| **3.6.0-rc.16 Vapor**             | `vue-pain-lab-vue36rc16-vapor` | 5182 / 9359        | `vue-3.6.0-rc.16-vapor-chrome157b-<run>/`       |

每個 N 依序跑 3.5.40 → rc.4 T → rc.4 V → rc.9 T → rc.9 V → rc.11 T → rc.11 V → rc.16 T → rc.16 V。
兩次 run（重複 1 = `-run2`、重複 2 = `-run3`）使用完全相同的 script / 參數 / 順序，皆在 AC + 最佳效能下執行，
每次之前依 Process Management Rule 只以 PID 終止並重啟 9 個 dev server。每個條件每次 run 320 個 raw 檔，全數齊全。

**Label 的 `-chrome157b`**：第一個 session（label `-chrome157` 與 `3.6.0-rc.16-*`，`-run2` / `-run3`）因機器層級的
效能 regime 切換作廢（2.3、9.1），raw 目錄保留不動。`b` 是 session 標記，讓重跑仍使用 `-run2` / `-run3`
（`/compare` 依「場景 + Run N」與 rc.9 / rc.11 的 Run 2 / Run 3 對齊），又不與作廢資料重名。
run script 保留「目錄已存在即拒絕」。

前置檢查：有效 session 前以 3.5.40 N=5000 連跑 3 次 probe（`vue-3.5.40-chrome157b-probe-ac1/2/3/`），
Mount 中位數 30.9 / 33.4 / 33.8ms、Update 11.0 / 11.8 / 11.9ms，三次一致，無 regime 切換。

### 2.2 Freeze 檢查（實際驗證，非假設）

- Scenario / benchmark：9 個 worktree 對 `d3991df` 做 `git diff --quiet -- src/scenarios src/benchmarks`，全部 clean
  （重複 1 前與重複 2 前各確認一次）。
- rc.16 worktree 由 rc.11 worktree 複製 `package.json` / `package-lock.json` 後 `npm install vue@3.6.0-rc.16 --save-exact`。
  兩個 rc.16 worktree 的 lockfile 逐位元組相同。lockfile 相對 rc.11 的**非 `@vue/*` 變動**（npm 依 rc.16 的依賴範圍解析）：
  `postcss` 8.5.28 → 8.5.33（`@vue/compiler-sfc@3.6.0-rc.16` 宣告 `^8.5.32`）、`@babel/parser` / `@babel/types` 7.29.8 → 7.29.15、
  `@babel/helper-string-parser` 7.29.7 → 7.29.15、`nanoid` 3.3.19 → 3.3.20、`source-map-js` 1.2.1 → 1.2.4、`csstype` 3.2.3 → 3.2.4，
  新增 `@emnapi/core` / `@emnapi/runtime` 1.11.3。皆為 SFC 編譯期 / 型別依賴，不進入瀏覽器端 runtime bundle。
- Vapor 啟用方式與 rc.4 / rc.9 / rc.11 **逐行相同**（由 rc.11 Vapor worktree 的 diff `git apply`：
  `vite.config.ts` 的 `features.vapor: true`、`src/main.ts` 的 `app.use(vaporInteropPlugin)`）。
- rc.16 仍匯出 `vaporInteropPlugin`（`@vue/runtime-vapor` d.ts）。
- 編譯結果（兩次 run 前皆確認）：Vapor server（5174 / 5177 / 5180 / 5182）送出的 `VDomStressPage.vue`
  含 `defineVaporComponent`；Traditional（5175 / 5176 / 5178 / 5179 / 5181）為 `createElementBlock`。
- Vite pre-bundle chunk 全部為 `vue.runtime.esm-bundler-*.js`（rc.16 為 `…-BBP114pA.js`，rc.11 仍為 `…-DVwZoNSo.js`），
  `attribution.ts` 的 `bucketForUrl()` 對 rc.16 沒有盲點。
- 量測 pipeline（`chrome.ts` / `tracer.ts` / `sync.ts` / `scenario.ts` / `parser.ts` / `stats.ts` / `evidence.ts` /
  `attribution.ts` / `run-validation-matrix.ts` / `compare-day29-runs.ts`）自 rc.11 分析端 `cc24b20` 起**未修改**（`git diff --stat` 無輸出）。
- **方法論等價**：`analyze-day29-final-rc16.ts`（由 rc.11 分析器複製，只改 `HISTORICAL_LABELS` /
  `COMPARISONS` 與對應的 `COST_STRUCTURE_LABELS`）對 **rc.11 原始 重複 1 資料**（`-run1` 目錄）重算，
  `arch-rc11-original` 的 80 個 cell 與 `day29-final-rc11-run1-analysis.json` 的 `arch-rc11` **逐項相同**
  （含 signalCounts 15 CI / 9 CR / 8 S / 48 U），rc.11 T/V 的 cost structure（各 8 筆）亦逐項相同；兩次 run 的分析皆確認。

### 2.3 環境偏差（已揭露）

| 偏差                    | 內容                                                                                                                                                                                                  | 處理                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **第一個 session 作廢** | 2026-11-23 的兩次 run 出現機器層級 ~2.5–3 倍 slow regime（所有條件含 3.5.40 同步變慢、區塊本身的 wall-clock 也拉長），當時已是 AC + 最佳效能                                                          | 全部作廢（Part 9.1）；analysis 檔名帶 `regime-INVALID`；raw 保留       |
| Chrome 版本             | rc.11 Freeze Point = 155.0.8059.41；本次 = 157.0.8103.79（使用者層級自動更新；回退需改 `chrome.ts` = 改 pipeline）                                                                                    | 以**同 session 對照組**比較版本效應；跨 session 只作 drift 描述（6.3） |
| Node.js 版本            | v24.13.0 → v24.22.1（Vite dev server 與 harness 端）                                                                                                                                                  | 同 session 9 個條件一致；跨 session 不直接比較                         |
| transitive 依賴         | rc.16 worktree 的 postcss / @babel 等編譯期依賴較新（2.2）                                                                                                                                            | 只影響 SFC 編譯，編譯結果已逐一確認；不影響瀏覽器 runtime              |
| 睡眠 / 螢幕關閉         | 有效 session 期間設為「永不」（作廢 session 時 system log 有 Modern Standby 進出）                                                                                                                    | 寫入本報告；與 rc.11 session 的設定是否相同未記錄                      |
| 每次 run 第一個區塊     | 兩次 run 的 3.5.40 Mount N=100（每次 run 的第一個 Chrome instance）Render Duration 2.9 / 2.8ms，其他條件 1.1–1.7ms                                                                                    | Part 9.2；影響 `3.5.40 → *` 的 Mount N=100 cell，其他 cell 不受影響    |
| CDP retry               | `Runtime.bindingCalled` timeout：重複 1 17 次、重複 2 16 次，**全部在 Update**（重複 1 全在 N=100；重複 2 有 1 次在 N=500），全部由凍結協定 retry 成功（重複 1 有 2 次需第 3 次 attempt），無資料遺失 | 機制與 rc.9 報告 2.4 相同（0.1ms 文字碰撞），與 Vue 版本無關           |

CDP timeout 分佈：重複 1 rc.16 Vapor 5、rc.4 Vapor 3、rc.4 T 2、rc.9 T 2、rc.9 Vapor 2、3.5.40 / rc.11 T / rc.11 Vapor 各 1；
重複 2 rc.4 Vapor 4、rc.9 Vapor 3、rc.11 Vapor 2、rc.16 T 2、rc.16 Vapor 2（N=100 1、N=500 1）、3.5.40 / rc.4 T / rc.11 T 各 1。
集中在小 N 的 Vapor 條件，3.5.40 與各 RC 都有，與 rc.9 報告 2.4 的機制一致。

---

## Part 3 — Application Timing（Render Duration，ms，中位數，重複 1 / 重複 2）

> 兩次是 AC 供電下的獨立重複量測；數字不同屬正常量測波動，引用幅度時以範圍表示。

| Mount             | N=100       | N=500     | N=1000    | N=5000      |
| ----------------- | ----------- | --------- | --------- | ----------- |
| 3.5.40            | 2.9 / 2.8\* | 4.3 / 4.5 | 7.2 / 7.0 | 30.6 / 31.6 |
| rc.4 Traditional  | 1.5 / 1.6   | 4.5 / 4.5 | 7.2 / 7.0 | 32.5 / 31.3 |
| rc.4 Vapor        | 1.4 / 1.3   | 3.6 / 3.6 | 5.7 / 5.5 | 24.6 / 24.0 |
| rc.9 Traditional  | 1.6 / 1.5   | 4.5 / 4.4 | 7.3 / 7.1 | 30.3 / 28.9 |
| rc.9 Vapor        | 1.3 / 1.2   | 3.6 / 3.3 | 5.8 / 5.4 | 24.9 / 20.6 |
| rc.11 Traditional | 1.6 / 1.5   | 4.5 / 4.5 | 7.4 / 7.4 | 32.4 / 33.5 |
| rc.11 Vapor       | 1.3 / 1.4   | 3.9 / 3.3 | 5.7 / 5.6 | 28.2 / 25.6 |
| rc.16 Traditional | 1.6 / 1.7   | 4.7 / 4.7 | 7.5 / 8.1 | 33.4 / 29.1 |
| rc.16 Vapor       | 1.1 / 1.1   | 3.3 / 3.3 | 5.3 / 7.5 | 22.8 / 21.6 |

| Update            | N=100     | N=500     | N=1000    | N=5000         |
| ----------------- | --------- | --------- | --------- | -------------- |
| 3.5.40            | 1.0 / 1.1 | 1.7 / 1.8 | 3.0 / 2.7 | 10.8 / 10.3    |
| rc.4 Traditional  | 1.3 / 0.9 | 1.7 / 1.9 | 2.7 / 2.6 | 9.8 / 9.8      |
| rc.4 Vapor        | 0.9 / 1.2 | 1.8 / 2.5 | 3.0 / 3.0 | 12.3 / 11.7    |
| rc.9 Traditional  | 1.0 / 1.1 | 1.7 / 1.9 | 2.7 / 2.7 | 11.7 / 10.2    |
| rc.9 Vapor        | 1.2 / 1.0 | 1.9 / 1.9 | 3.0 / 3.3 | 12.0 / 10.4    |
| rc.11 Traditional | 0.9 / 1.0 | 1.6 / 1.9 | 2.7 / 2.9 | 16.5\*\* / 9.8 |
| rc.11 Vapor       | 1.2 / 1.2 | 1.9 / 1.9 | 3.1 / 3.3 | 12.2 / 11.3    |
| rc.16 Traditional | 1.1 / 1.1 | 1.9 / 1.8 | 2.7 / 2.7 | 10.8 / 10.6    |
| rc.16 Vapor       | 1.3 / 1.2 | 2.0 / 2.0 | 3.3 / 3.4 | 12.8 / 10.6    |

\* 每次 run 的第一個區塊（Part 9.2）。\*\* 重複 1 的 rc.11 Traditional Update N=5000 是高變異區塊（9.7–37.2ms，Part 9.2）。

跨重複重現的分類（Traditional → Vapor）：

- **Mount N=5000**：rc.16 −31.9% CI / −25.8% CI → **2/2 reproduced**；同 session rc.9 −17.8% CI / −28.4% CI（2/2）；
  rc.11 −13.0% U / −23.7% CI；rc.4 −24.3% U / −23.2% CI。
- **Update N=1000**：rc.16 +24.5% U / +24.1% CR；rc.9 +11.1% U / +24.1% CR；rc.4 +13.0% U / +13.5% CR；rc.11 +14.8% U / +14.0% U →
  4 個 RC × 2 次 run **8 個值方向全部為正（Vapor 較慢）**，Consistent 3/8；絕對差 0.3–0.7ms。與 rc.11 / rc.9 報告的觀察方向一致。
- Update N=5000：rc.16 +17.5% U / +0.5% S → 無改善。

---

## Part 4 — Chrome Performance Cost 與 Runtime Attribution（µs 中位數）

### 4.1 rc.16 Traditional → rc.16 Vapor（重複 1 ‖ 重複 2）

| Mount           | N=100                     | N=500                     | N=1000                    | N=5000                    |
| --------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| Render Duration | −26% **CI** ‖ −32% U      | −30% **CI** ‖ −28% U      | −29% U ‖ −7% U            | −32% **CI** ‖ −26% **CI** |
| Scripting       | −32% **CI** ‖ −39% **CI** | −46% **CI** ‖ −45% **CI** | −49% **CI** ‖ −24% **CI** | −47% **CI** ‖ −44% **CI** |
| Rendering       | +1.5% S ‖ +0.1% S         | +2.8% U ‖ +2.2% S         | −5% U ‖ +15% U            | +3% U ‖ −1.7% S           |
| Layout          | +3% U ‖ +4% U             | +0.9% U ‖ +5% U           | −7% U ‖ +14% U            | +4% U ‖ −2.4% S           |
| Painting        | −2.6% U ‖ −4% U           | +1.0% S ‖ −4% U           | −2.2% S ‖ +4% U           | −1.4% S ‖ −7% U           |
| Vue Runtime CPU | −65% **CI** ‖ −22% U      | −54% **CI** ‖ −45% **CI** | −61% **CI** ‖ −58% **CI** | −56% **CI** ‖ −60% **CI** |
| Application CPU | n/a U ‖ −100% U           | −100% U ‖ −67% U          | −65% U ‖ −61% **CI**      | −75% **CI** ‖ −88% **CI** |

| Update          | N=100           | N=500                 | N=1000                      | N=5000                    |
| --------------- | --------------- | --------------------- | --------------------------- | ------------------------- |
| Render Duration | +24% U ‖ +9% U  | +8% U ‖ +11% **CR**   | +25% U ‖ +24% **CR**        | +18% U ‖ +0.5% S          |
| Scripting       | −10% U ‖ −18% U | −27% **CI** ‖ −23% U  | −34% **CI** ‖ −21% U        | −32% **CI** ‖ −41% **CI** |
| Rendering       | +29% U ‖ +9% U  | +32% **CR** ‖ −1.5% S | −15% U ‖ +17% U             | +14% U ‖ −5% U            |
| Layout          | +17% U ‖ +19% U | +47% **CR** ‖ −4% U   | −11% U ‖ +37% U             | +22% U ‖ −12% U           |
| Painting        | +42% U ‖ +30% U | +53% **CR** ‖ −5% U   | −31% U ‖ +35% U             | −5% U ‖ +0.8% S           |
| Vue Runtime CPU | −32% U ‖ +7% U  | +32% U ‖ +27% U       | +25% U ‖ +10% U             | −23% U ‖ −31% U           |
| Application CPU | n/a U ‖ n/a U   | −100% U ‖ −100% U     | −100% **CI** ‖ −100% **CI** | −86% **CI** ‖ −90% **CI** |

分類統計：重複 1 18 CI / 3 CR / 11 S / 48 U；重複 2 14 CI / 3 CR / 13 S / 50 U。
Update N=500 的 Rendering / Layout / Painting CR 只出現在重複 1（該區塊 Render Duration 2.0 / 2.0ms，未偏移），重複 2 皆非 Consistent。

### 4.2 同 session 對照：rc.11、rc.9、rc.4 Traditional → Vapor（Chrome 157）

- rc.11：14 / 22 CI、4 / 3 CR（重複 1 / 2）。2/2 重現 13 個 cell：Mount Scripting N=500/1000/5000、
  **Update Scripting N=500/1000/5000**（N=5000 −57% / −33% CI，重複 1 的 −57% 受 Part 9.2 高變異區塊放大）、
  Mount Vue Runtime CPU N=500/1000/5000、Mount N=5000 Recalculate Style +8% / +4% **CR**、Update N=100 Recalculate Style、
  Mount N=5000 / Update N=5000 Application CPU。
- rc.9：17 / 20 CI、2 / 4 CR。2/2 重現 13 個 cell：Mount N=1000/5000 Render Duration、Mount Scripting N=500/1000/5000、
  Mount Vue Runtime CPU N=100/500/1000/5000、Update N=500 Recalculate Style、Application CPU ×3；
  Update N=5000 Scripting −41.7% U / −42.4% CI（1/2，方向 2/2）。
- rc.4：18 / 15 CI、1 / 1 CR。2/2 重現 13 個 cell：Mount N=1000 Render Duration、Mount Scripting N=500/1000/5000、
  **Update Scripting N=1000/5000**（N=5000 −33.3% / −33.4% CI）、Mount Vue Runtime CPU N=100/500/1000/5000、Application CPU ×3。

rc.16 的架構比較與 rc.11 / rc.9 / rc.4 同構（2/2 重現 cell：rc.16 12、rc.11 13、rc.9 13、rc.4 13）。

**信心度注意（沿用既有方法論，未變）**：Vue Runtime CPU / Application CPU / V8-native CPU
依 `evidence.ts` 設計一律 `confidence: 'low'`（葉節點取樣，低估 inclusive 成本）。
方向性訊號可讀，精確數字不可讀；Application CPU 的 −100% 是 B 側取樣為 0 的結果。

---

## Part 5 — Cost Structure（Scripting / Rendering / Painting 佔三者總和，中位數）

| 條件              | Mount N=5000（重複 1 ‖ 2）        | Update N=5000（重複 1 ‖ 2）         |
| ----------------- | --------------------------------- | ----------------------------------- |
| 3.5.40            | 25.4/72.2/2.4 ‖ 26.0/71.6/2.4     | 70.4/17.9/11.7 ‖ 71.5/17.1/11.4     |
| rc.4 Traditional  | 26.2/71.3/2.5 ‖ 26.0/71.0/3.1     | 69.9/17.7/12.3 ‖ 69.1/18.0/12.9     |
| rc.4 Vapor        | 17.7/79.6/2.8 ‖ 17.7/79.4/2.8     | 60.8/22.9/16.3 ‖ 60.1/22.7/17.2     |
| rc.9 Traditional  | 25.8/71.7/2.5 ‖ 25.2/72.0/2.8     | 70.0/16.4/13.7 ‖ 71.0/16.8/12.2     |
| rc.9 Vapor        | 17.8/79.4/2.8 ‖ 15.7/81.2/3.1     | 59.8/24.2/16.0 ‖ 59.7/23.8/16.5     |
| rc.11 Traditional | 26.9/70.7/2.5 ‖ 27.1/70.2/2.6     | 74.9/13.3/11.8 ‖ 67.8/17.9/14.3     |
| rc.11 Vapor       | 19.1/77.7/3.2 ‖ 18.0/79.1/2.9     | 56.1/23.8/20.2 ‖ 58.0/26.0/16.0     |
| rc.16 Traditional | 27.7/69.7/2.6 ‖ 25.1/72.3/2.6     | 70.9/16.5/12.7 ‖ 69.8/17.6/12.5     |
| **rc.16 Vapor**   | **16.3/80.8/2.9 ‖ 16.0/81.2/2.8** | **61.0/23.8/15.2 ‖ 58.5/23.6/17.9** |

### Update N=5000：rc.16 Traditional vs rc.16 Vapor（必答）

| 指標                       | 重複 1（T → V）              | 重複 2（T → V）              | 跨重複                         |
| -------------------------- | ---------------------------- | ---------------------------- | ------------------------------ |
| Scripting absolute         | 19,399 → 13,191µs，−32.0% CI | 18,734 → 11,076µs，−40.9% CI | **2/2 CI**                     |
| Scripting share            | 70.9% → 61.0%                | 69.8% → 58.5%                | 兩次皆下降 10–11 pt            |
| Rendering absolute         | 4,516 → 5,155µs，+14% U      | 4,726 → 4,472µs，−5% U       | 方向不一致，無 Consistent      |
| Painting absolute          | 3,464 → 3,290µs，−5% U       | 3,364 → 3,391µs，+0.8% S     | 不變                           |
| Total main-thread（S+R+P） | 27,378 → 21,635µs（−21.0%）  | 26,823 → 18,939µs（−29.4%）  | 同方向（中位數之和，未另分類） |

Mount N=5000 總和（T → V）：rc.16 −10.8% / −12.5%；rc.11 −5.3% / −8.1%；rc.9 −9.2% / −12.0%；rc.4 −12.5% / −13.2%。

---

## Part 6 — Version Effect、Browser Drift 與跨重複重現性

### 6.1 跨重複重現性（兩次 run，`compare-day29-runs.ts` + 逐 cell 比對）

`2/2` = 兩次皆同方向 Consistent；`±` = 兩次中同時出現 CI 與 CR。後四欄為 `compare-day29-runs.ts` 的分類
（reproduced / direction / conflicting / neither，定義同 rc.9 報告 6.1）。

| 比較                                  |    2/2 |   ± | reproduced | direction | conflicting | neither |
| ------------------------------------- | -----: | --: | ---------: | --------: | ----------: | ------: |
| rc.16 Traditional → rc.16 Vapor       | **12** |   0 |         12 |        40 |           3 |      25 |
| rc.11 Traditional → rc.11 Vapor       | **13** |   0 |         13 |        48 |           4 |      15 |
| rc.9 Traditional → rc.9 Vapor         | **13** |   0 |         13 |        38 |           4 |      25 |
| rc.4 Traditional → rc.4 Vapor         | **13** |   0 |         13 |        43 |           1 |      23 |
| rc.11 Traditional → rc.16 Traditional |  **0** |   0 |          0 |        38 |           2 |      40 |
| rc.11 Vapor → rc.16 Vapor             |  **1** |   0 |          1 |        44 |           4 |      31 |
| rc.9 Traditional → rc.11 Traditional  |  **0** |   0 |          0 |        41 |           3 |      36 |
| 3.5.40 → rc.16 Traditional            |  **0** |   0 |          0 |        50 |           3 |      27 |
| 3.5.40 → rc.11 Traditional            |  **0** |   0 |          0 |        46 |           2 |      32 |

（`arch-rc11-original` 兩次都是同一份 rc.11 重複 1 資料，24 個 reproduced 是必然結果，只用作等價檢查，不列入。）

rc.16 架構比較 **2/2 重現**的 12 個 cell：Mount Scripting N=100/500/1000/5000（−24% 至 −49%）、
Mount Vue Runtime CPU N=500/1000/5000（−45% 至 −61%）、Mount N=5000 Render Duration（−26% 至 −32%）、
**Update N=5000 Scripting（−32% / −41%）**、Mount N=5000 / Update N=1000 / Update N=5000 Application CPU。

**分類器的單次 false-positive 程度**（與 rc.9 / rc.11 報告一致）：沒有可重現差異的版本比較中，單次 run 仍出現
0–6 個 Consistent cell（例：3.5.40 → rc.16 Traditional 重複 1 1 CI / 6 CR、重複 2 0 / 0）。

### 6.2 Version effect（同 session、同 Chrome 157）

各次 Consistent cell 數（CI / CR，重複 1 ‖ 2）：

| 比較                                  | 重複 1 | 重複 2 | 2/2 重現 |
| ------------------------------------- | ------ | ------ | -------: |
| rc.11 Traditional → rc.16 Traditional | 1 / 3  | 2 / 0  |        0 |
| rc.11 Vapor → rc.16 Vapor             | 4 / 2  | 2 / 4  |        1 |
| 3.5.40 → rc.16 Traditional            | 1 / 6  | 0 / 0  |        0 |
| 3.5.40 → rc.11 Traditional            | 1 / 2  | 3 / 3  |        0 |
| rc.9 Traditional → rc.11 Traditional  | 0 / 1  | 0 / 6  |        0 |

- **Traditional**：rc.11 → rc.16 與 3.5.40 → rc.16 兩次 run **0 個 cell 重現**。Render Duration 在 N≥500 為 −13% 至 +15%，全部 U / S。
  單次出現的 Consistent（例：Update N=100 Vue Runtime CPU 269 → 491µs CR 只在重複 1；重複 2 309 → 286µs U）未重現。
- **Vapor**：rc.11 → rc.16 唯一 2/2 的 cell 是 **Mount N=5000 Render Duration −19% CI / −16% CI**（28.2 → 22.8ms、25.6 → 21.6ms）；
  同格 Scripting −20.6% CI / −16.6% U（29,395 → 23,327µs、26,330 → 21,972µs），Rendering −3% U / −4% U。
  但同 session 的 rc.9 Vapor（24.9 / 20.6ms；Scripting 25,503 / 21,370µs）與 rc.4 Vapor（24.6 / 24.0ms；25,218 / 24,977µs）
  與 rc.16 Vapor 在同一範圍，**是 rc.11 Vapor 在兩次 run 都是四個 Vapor 條件中最高的**。rc.11 session（Chrome 155）
  rc.9 Vapor → rc.11 Vapor 同格為 33.8 → 28.4 / 25.7 → 29.3 / 25.6 → 23.6ms，沒有一致方向。
  → **Observed difference（2/2，本 session），mechanism not established**；分析器沒有 rc.9 Vapor → rc.16 Vapor 的比較，
  本報告不新增（實驗設計變更需先確認），只以原始中位數描述。

### 6.3 Browser / session drift（同 Vue 版本，rc.11 Freeze Point 重複 1〔Chrome 155〕vs 本次〔Chrome 157〕）

| 條件              | 重複 1 ‖ 2（CI / CR） | 代表 cell                                                                                                                                  |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.5.40            | 21/1 ‖ 16/0           | Mount N=5000 Scripting −15.2% CI / −14.2% CI；Mount N=1000 Recalculate Style −40% / −43% CI；Update N=5000 Render Duration −11% U / −15% U |
| rc.11 Traditional | 21/3 ‖ 29/3           | Mount N=500 / N=1000 Render Duration −47% / −43% CI（2/2）；Mount N=5000 Scripting −9.8% U / −10.6% CI                                     |
| rc.11 Vapor       | 31/0 ‖ 26/0           | Mount N=500 Render Duration −36% / −46% CI；Update N=100 全部 Browser 指標 −54% 至 −65% CI\*                                               |

\* rc.11 Vapor 的 drift 基準（rc.11 重複 1）本身含 rc.11 報告 Part 9 的 Update N=100 偏移區塊，該列被放大。

Chrome 155 → 157（另有 Node 版本、睡眠設定不同，隔 41 天）下，同版本的差異**明顯大於** rc.11 報告中 Chrome 153 → 155 的 drift
（0–6 CI），而且集中在 Mount 的 Browser 指標（N=500/1000 −20% 至 −45%）與 Scripting（N=5000 約 −10% 至 −15%），方向一致為「變快」。
**跨 session 絕對值不可直接比較**；所有版本 / 架構結論只用同 session 對照組。

---

## Part 7 — Evidence Matrix

| Comparison                             | Result                                                                                                                                                                                                    | Evidence strength                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| rc.16 Traditional vs previous baseline | 對 rc.11 Traditional 與 3.5.40（同 session）：兩次 run **0 個 2/2**；N≥500 Render Duration −13% 至 +15%（U / S）。**Not reproduced**                                                                      | 中：2 次獨立 run × 2 個基準；與 rc.11 / rc.9 Freeze Point 的同一結論一致                                 |
| rc.16 Traditional vs rc.16 Vapor       | 12 cells 2/2 重現；與 rc.11（13）、rc.9（13）、rc.4（13）同 session 架構比較同構 → **reproduced**（跨 2 次 run、跨 4 個 RC）、**stable**                                                                  | 強（方向）；Vue Runtime CPU 數值為低信心 bucket                                                          |
| Mount                                  | Scripting −24% 至 −49%（N=100/500/1000/5000，2/2）；Vue Runtime CPU −45% 至 −61%（N=500/1000/5000，2/2）；Rendering / Layout 未下降（N=5000 −2.4% 至 +4%）；N=5000 Render Duration −26% 至 −32%（2/2 CI） | 強                                                                                                       |
| Update                                 | Scripting 下降（N=5000 −32% / −41%，2/2 CI）；Render Duration 無改善，N=1000 Vapor 較慢（+24% / +25%，1/2 CR；4 個 RC × 2 run 方向 8/8）；Browser 指標 Unstable                                           | Scripting：強；wall-clock 無改善：強；N=1000 較慢：observed（方向跨 RC 一致），mechanism not established |
| N=5000 Update                          | Scripting −32% / −41%；S+R+P −21% / −29%；Render Duration +18% U / +0.5% S                                                                                                                                | Scripting：強（rc.16 2/2 CI；rc.11 / rc.4 同 session 亦 2/2）                                            |
| Vue Runtime CPU                        | Mount：N=500/1000/5000 2/2、N=100 1/2。Update：無重現的下降（N=5000 −23% / −31%，U）。版本效應：rc.11 → rc.16 無重現差異；rc.11 報告 Part 9 的 N=100 偏高本 session 未出現（0/2）                         | Mount：方向強、數字低信心；Update：無證據                                                                |
| Scripting                              | Vapor < Traditional，跨重複、跨 RC 重現（Mount 全部 N、Update N=5000）；rc.11 → rc.16 Traditional 無可重現差異；rc.11 → rc.16 Vapor Mount N=5000 −21% CI / −17% U（6.2）                                  | 架構：強（cost-trace 指標）；Vapor 版本差異：observed，mechanism not established                         |
| Browser Rendering                      | Vapor 未降低 Rendering / Layout / Recalc（Mount N=5000：+3% U / −1.7% S、Layout +4% U / −2.4% S）；Update N=5000 Rendering 方向不一致；rc.11 → rc.16 無可重現變化                                         | Mount 不下降：強；Update：不足                                                                           |

---

## Part 8 — 必答問題

### 1. rc.16 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 同 session 對 rc.11 Traditional 與 3.5.40，兩次獨立 run **沒有任何 cell 重現**（0 個 2/2）。
單次出現的 Consistent cell（rc.11 → rc.16 重複 1 1 CI / 3 CR、重複 2 2 CI / 0 CR）在另一次皆未重現，數量在分類器的單次 false-positive 範圍內。

### 2. rc.16 Vapor 是否仍然降低 Framework / Scripting cost？

**是，2 次 run 皆重現，且與 rc.11 / rc.9 / rc.4 同構。** Mount Scripting N=100/500/1000/5000 兩次皆 CI（−24% 至 −49%）；
Mount Vue Runtime CPU N=500/1000/5000 兩次皆 CI（−45% 至 −61%）；Update N=5000 Scripting −32% / −41%（2/2 CI）。

### 3. Update 是否在較大 Node Count 下出現更明顯改善？

**只有 Scripting，且隨 N 變明顯**（rc.16：N=100 −10% / −18% U、N=500 −27% CI / −23% U、N=1000 −34% CI / −21% U、
N=5000 −32% / −41% CI）。wall-clock Render Duration 在 Update **沒有**改善：N=5000 +18% U / +0.5% S；
N=1000 Vapor 較慢（+25% U / +24% CR）。Update Vue Runtime CPU 在任何 N 皆無可重現的下降。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

rc.16 Vapor，Mount N=5000：Rendering 115,322 / 111,671µs（Layout 88,320 / 85,755）＋ Painting
4,123 / 3,824µs → Browser 側佔 S+R+P 的 **83.7% / 84.0%**（重複 1 / 2）。Vapor 沒有降低這部分
（Traditional 同條件 Rendering 111,474 / 113,620µs）。

Update N=5000：Rendering 5,155 / 4,472µs ＋ Painting 3,290 / 3,391µs → 佔 **39.0% / 41.5%**。

### 5. rc.16 是否改變原本 rc.11 Vapor 的結論？

**沒有。** rc.16 的架構比較與 rc.11 同構（Mount Scripting / Vue Runtime CPU 下降、Update N=5000 Scripting 下降、
Browser Rendering 不降、Update N=1000 Render Duration 變慢的方向）。rc.11 Vapor → rc.16 Vapor 80 個 cell 中只有 1 個 2/2
（Mount N=5000 Render Duration −16% 至 −19%），且同 session 的 rc.9 / rc.4 Vapor 與 rc.16 Vapor 在同一範圍（6.2）。

| rc.11 報告結論                                        | 本 session（rc.16，Chrome 157，2 次 run）                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Traditional 無可重現 Framework-level 改善             | **Reproduced**（rc.11 → rc.16、3.5.40 → rc.16 皆 0 個 2/2）                   |
| Mount Vue Runtime CPU 下降（N=1000/5000 3/3）         | **Reproduced**（N=500/1000/5000 2/2）                                         |
| Mount Scripting 下降（N=500/1000/5000 3/3）           | **Reproduced**（N=100/500/1000/5000 2/2）                                     |
| Update N=5000 Scripting −37% 至 −40%（2/3 CI）        | **Reproduced**（−32% / −41%，2/2 CI）                                         |
| Update N=1000 Render Duration CR（2/3）               | 方向 reproduced（+25% U / +24% CR；4 個 RC × 2 run 方向 8/8，Consistent 3/8） |
| Mount N=5000 Browser Rendering/Layout 不降            | **Reproduced**                                                                |
| Browser 側佔 Mount N=5000 S+R+P 82.1% / 82.4% / 84.0% | 83.7% / 84.0%                                                                 |
| rc.11 N=100 區塊偏移與 Vue Runtime CPU 偏高（2/3）    | **Not reproduced**（rc.11 在本 session 0/2；Part 9.3）                        |

### 6. 哪些結果可以歸因？

- **架構（Traditional → Vapor）→ Mount 的 Vue Runtime CPU 與 Scripting 下降**：2 次 run、4 個 RC、
  同 Scenario，唯一變因為 Vapor 編譯模式 → 可歸因到架構（Vue Runtime CPU 歸因的是方向）。
- **架構 → Update N=5000 Scripting 下降**：rc.16 / rc.11 / rc.4 同 session 2/2 CI、rc.9 方向 2/2 → 可歸因到架構，JS 層級。
- **Vapor 不降低 Mount 的 Browser Rendering/Layout**：可歸因——DOM 結構相同，Browser 工作量相同。
- **rc.11 → rc.16 Traditional 無可重現差異**：版本效應在本 Scenario 下 not observed。
- **第一個 session 的 2.5–3 倍變慢**：可歸因到量測環境（同一 Vue 版本 3.5.40 同步變慢、區塊 wall-clock 拉長），與 Vue 無關。
- **CDP timeout**：可歸因到 harness 的完成判定與 0.1ms 量化碰撞，與 Vue 無關（rc.9 報告 2.4）。

### 7. 哪些結果只能描述為 observed difference？

- **rc.11 Vapor → rc.16 Vapor Mount N=5000 Render Duration −16% 至 −19%（2/2）**——observed, reproduced within this session,
  mechanism not established；rc.16 Vapor 與同 session rc.9 / rc.4 Vapor 同一範圍，無法區分是 rc.16 變快還是 rc.11 Vapor 在 Chrome 157 下偏高（6.2）。
- Vapor Update N=1000 Render Duration 較慢（方向 8/8，Consistent 3/8，+0.3～0.7ms）——observed（跨 RC、跨 session），mechanism not established。
- Chrome 155 → 157 的 drift（Mount Browser 指標與 Scripting 普遍變快）——observed，無法從 Vue 版本中分離出單一原因（Chrome、Node、session 皆不同）。
- 所有只在單次 run 出現的 Consistent cell（例：rc.16 Update N=500 Rendering / Layout / Painting CR、rc.11 → rc.16 Traditional Update N=100 Vue Runtime CPU CR）。

### 8. 哪些結果仍然無法解釋？

- **為何 Vapor 降低 Update Scripting，但 Update wall-clock Render Duration 沒有下降**（N=1000 方向一致變慢）。
  `renderDuration` 以頁面內 `nextTick()` 量測，與 trace 的 main-thread 成本量測窗口不同；
  本 pipeline 無法在兩者之間做歸因（與 rc.9 / rc.11 報告相同，未解決）。
- **第一個 session 的 slow regime 來源**（Part 9.1）：AC + 最佳效能下仍發生，system log 只看到 Modern Standby 進出，
  沒有處理器降頻事件；有效 session 改為睡眠 / 螢幕「永不」後未再出現，但只有 2 次 run，無法證明兩者有因果關係。

---

## Part 9 — 區塊偏移掃描

一個「區塊」= 一個條件、一個 N、一個 operation 在同一個 Chrome instance 內的 10 個 measurement trial。

### 9.1 作廢的第一個 session（2026-11-23，`-chrome157-run2/-run3`、`3.6.0-rc.16-*-run2/-run3`）

以正常值為基準（Mount N=5000 ≈ 32ms、Update N=5000 ≈ 11.5ms、Update N=500 ≈ 1.9ms）逐區塊排時間軸：

| run                   | 狀況                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重複 1（14:27–14:51） | 14:37 UTC（N=500）起幾乎所有 N≥500 區塊變慢 ×1.6～×4.7，**包含 3.5.40**（Mount N=5000 100.8ms、Update N=500 5.5ms）；N=5000 的 18 個區塊全部 ×2.3～×3.3，每個區塊的 wall-clock 約 8s（正常約 3s） |
| 重複 2（15:08–15:28） | N=100–1000 與 N=5000 前 6 個條件正常；15:25 UTC（rc.11 T Update N=5000）起剩下 7 個區塊全部 ×2.2～×3.3（rc.11 T Update、rc.11 V、rc.16 T/V）                                                      |

交錯順序讓 rc.16 的 N=5000 在兩次 run 都落在慢區段，版本比較（例：rc.11 → rc.16 Traditional 重複 1 出現 11 個 CR）不可信。
量測當時：AC（BatteryStatus=2）、AC overlay `ded574b5`（最佳效能，以 `powercfg /overlaysetactive` 設定）。
System log（14:20–15:35 UTC）只有 Kernel-Power 506 / 507（Modern Standby 因 Idle Timeout 進入、因滑鼠 / 鍵盤離開，
14:50、14:59–15:06、15:17），沒有 Processor-Power 降頻事件；慢區段的起點與這些事件沒有一一對應。
→ 整個 session 作廢，analysis 檔名改為 `day29-final-rc16-run2-regime-INVALID-analysis.json`、`…-run3-regime-INVALID-analysis.json`、
`day29-final-rc16-run2-vs-run3-regime-INVALID.json`；raw 保留。

### 9.2 有效 session（`-chrome157b`）

對 2 次 run × 9 條件 × 4 個 N × Mount/Update（144 個區塊）逐一比較 Render Duration 中位數與
「同條件兩次 run 的中位數」，偏離 ×1.6 以上：**0 個**。補充兩種掃描：

| 區塊                                   | 該區塊中位數 | 對照                       |  倍率 | 10 個 trial（ms）                              |
| -------------------------------------- | -----------: | -------------------------- | ----: | ---------------------------------------------- |
| 重複 1 rc.11 Traditional Update N=5000 |      16.50ms | 重複 2 同條件 9.80ms       | ×1.68 | 31.8 18.3 14.7 12.2 37.2 11.2 11 19.7 9.7 23.7 |
| 重複 1 3.5.40 Mount N=100              |       2.90ms | 同 run 9 條件中位數 1.50ms | ×1.93 | 2.6 2.9 3.2 3.5 2.9 2.9 1.4 3.6 1.7 2.8        |
| 重複 2 3.5.40 Mount N=100              |       2.80ms | 同 run 9 條件中位數 1.50ms | ×1.87 | 2.9 2.9 2.8 2.2 2.5 2.8 2.8 2.6 1.5 3          |

- rc.11 T Update N=5000（重複 1）不是整體偏移，而是高變異（9.7～37.2ms）；同區塊 Scripting 29,593µs（重複 2 17,478µs）。
  它影響 rc.11 的架構比較（Update N=5000 Scripting −57%）與以 rc.11 T 為基準的版本比較同格，不影響 rc.16 的任何比較。
- 3.5.40 Mount N=100 是每次 run 的**第一個區塊**（第一個 Chrome instance），兩次都偏高約 1.3ms；作廢 session 與 rc.11 session
  的同一位置也偏高（2.85 / 2.75ms；2.1 / 2.5 / 3.0ms）。執行順序固定，無法與 3.5.40 本身分離 → 影響 `3.5.40 → *` 的 Mount N=100 cell
  （−39% 至 −47%，皆 U），本報告不據此下結論。

### 9.3 rc.11 報告 Part 9（rc.11 N=100 偏移與 Vue Runtime CPU 偏高）的追蹤

本 session rc.11 的 N=100 區塊沒有偏移（Update Render Duration T 0.9 / 1.0ms、V 1.2 / 1.2ms），
Vue Runtime CPU 也沒有偏高：

| 比較（Vue Runtime CPU 中位數，µs） | 重複 1          | 重複 2        |
| ---------------------------------- | --------------- | ------------- |
| rc.9 T → rc.11 T，Mount N=100      | 1,486 → 1,385 U | 1,377 → 987 U |
| rc.9 T → rc.11 T，Update N=100     | 290 → 269 U     | 359 → 309 U   |
| rc.11 T → rc.16 T，Update N=100    | 269 → 491 CR    | 309 → 286 U   |
| rc.11 V → rc.16 V，Mount N=100     | 598 → 468 U     | 783 → 922 U   |

rc.11 報告記為「observed, partially reproduced（2/3）」的現象在 Chrome 157 session **0/2**。合計 5 次 run 中 2 次出現，
仍無法歸因到 rc.11；rc.16 Traditional Update N=100 的 CR 只出現 1 次（1/2）。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** 在 rc.16 Freeze Point：Traditional Runtime 相對 rc.11 與 3.5.40
   **沒有可重現的 Framework-level 改善**（2 次獨立 run，0 個 2/2 cell）。Vapor（不同的 Rendering Architecture）在 rc.16
   仍降低 Mount 的 Scripting（全部 N）與 Vue Runtime CPU（N≥500），以及 Update N=5000 的 Scripting（2/2）；
   結論與 rc.11 / rc.9 / rc.4 相同。rc.16 Vapor 的 Mount N=5000 比 rc.11 Vapor 快 16–19%（2/2），但與同 session 的 rc.9 / rc.4 Vapor
   同一範圍，屬 observed、mechanism not established。
2. **改善到什麼程度？** Traditional rc.16：No measurable improvement。Vapor vs Traditional：
   Mount Scripting −24% 至 −49%、Vue Runtime CPU −45% 至 −61%（N≥500，方向）、Mount N=5000 wall-clock −26% 至 −32%；
   Update N=5000 Scripting −32% 至 −41%；Update wall-clock：No measurable improvement；Browser Rendering：不變。
3. **還需要工程改善嗎？** 是。Mount N=5000 時 Browser 側（Layout 為主）在 Vapor 下佔 main-thread
   成本約 84%——這部分由 DOM 數量與 CSS/Layout 決定，Vue（含 Vapor）無法移除，屬 Component
   Architecture / 虛擬化 / 分批渲染 等應用層決策。

---

## Limitations

- 2 次有效獨立重複量測（同一天、連續執行），每次 10 measurement trials；比 rc.11 的 3 次少，2/2 的門檻比 3/3 寬鬆。
- 第一個 session 作廢，slow regime 的來源未確定；有效 session 只能說明「在睡眠 / 螢幕永不、AC + 最佳效能下 2 次未出現」。
- 條件執行順序固定（每個 N 內 3.5.40 → rc.4 T → … → rc.16 V），未做順序反轉；每次 run 第一個區塊偏高（9.2）。
- rc.12–rc.15 未量測（Version Change only）。
- Chrome 157 與 rc.11 Freeze Point 的 Chrome 155 不同、Node 版本亦不同，跨 session 絕對值不可直接比較（drift 明顯，6.3）。
- 分析器沒有 rc.9 Vapor → rc.16 Vapor 的直接比較；6.2 的判讀只用原始中位數。
- 量測期間有使用者背景程式在執行，未隔離。
- Vue Runtime CPU / Application CPU 為低信心 bucket（既有方法論）。
- CDP completion 判定有已知的量化碰撞（rc.9 報告 2.4），靠 retry 補足，未修正（Freeze Rule）。
- 只驗證 `vdom-stress`；Component Storm / Composable Chaos 的 Vapor 表現未評估。

---

## Files generated

新增（主 repo，未 commit）：

- `results/cdp-trace/vdom-stress/DAY29_FINAL_VALIDATION_REPORT_rc16.md`（本報告）
- `scripts/cdp-trace/run-day29-final-rc16.ts`：由 `run-day29-final-rc11.ts` 複製，只改 label、worktree、port
  （預設 `RUN_SUFFIX` 為 `-run2`）；作廢 session 後 label 改為 `-chrome157b`；保留 AC 電源 pre-flight 與「目錄已存在即拒絕」
- `scripts/cdp-trace/analyze-day29-final-rc16.ts`：由 `analyze-day29-final-rc11.ts` 複製，只改
  `HISTORICAL_LABELS` / `COMPARISONS` / `COST_STRUCTURE_LABELS`；`classify()` 門檻、paired-trial 定義、metrics 清單不動
- `results/cdp-trace/validation/day29-final-rc16-run2-analysis.json`、`-run3-analysis.json`、`day29-final-rc16-run2-vs-run3.json`
- 作廢：`results/cdp-trace/validation/day29-final-rc16-run2-regime-INVALID-analysis.json`、`-run3-regime-INVALID-analysis.json`、
  `day29-final-rc16-run2-vs-run3-regime-INVALID.json`
- Raw（gitignored）：
  - 有效：9 條件 × `-chrome157b-run2` / `-chrome157b-run3`（18 × 320 檔）
  - 作廢：7 條件 × `-chrome157-run2` / `-run3` ＋ `3.6.0-rc.16-{traditional,vapor}-run2` / `-run3`（18 × 320 檔）
  - 前置檢查：`vue-3.5.40-chrome157b-probe-ac1/`、`-ac2/`、`-ac3/`

新增 worktree（`d3991df`，未 commit）：`vue-pain-lab-vue36rc16-trad`、`vue-pain-lab-vue36rc16-vapor`
（含與 rc.4 / rc.9 / rc.11 相同的 Vapor patch）。

未修改：`DAY29_FINAL_VALIDATION_REPORT.md`、`_rc9.md`、`_rc11.md`、所有 rc.11 / rc.9 / rc.4 / rc.2 / 3.5.40 既有 raw 資料與
analysis JSON、Scenario、量測 pipeline、既有 worktree、主 repo 的 `package.json`（仍為 `vue: 3.5.40`）。

## Commands executed

```bash
# 版本確認
npm view vue dist-tags                             # rc = 3.6.0-rc.16
npm view vue versions --json                       # 3.6.0-rc.12 … 3.6.0-rc.16 皆存在
npm view vue time --json                           # 發布日期
git ls-remote https://github.com/vuejs/core 'refs/tags/v3.6.0-rc.1[1-6]*'

# 環境
git worktree add ../vue-pain-lab-vue36rc16-trad  d3991df --detach
git worktree add ../vue-pain-lab-vue36rc16-vapor d3991df --detach
(rc16 x2) cp ../vue-pain-lab-vue36rc11-<trad|vapor>/package{,-lock}.json . && npm install vue@3.6.0-rc.16 --save-exact
(rc16-vapor) git apply <rc.11 vapor worktree 的 vite.config.ts + src/main.ts diff>
(each worktree) git diff --quiet d3991df -- src/scenarios src/benchmarks
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5182> --strictPort   # 每次 run 前各啟動一次
taskkill /PID <pid> /T /F                                                             # 每次 run 後，逐一終止 9 個 dev server PID
MSYS_NO_PATHCONV=1 powercfg /overlaysetactive ded574b5-45a0-4f42-8737-46345c09c238   # AC overlay → 最佳效能（使用者要求）

# 作廢 session（2026-11-23，label -chrome157 / 3.6.0-rc.16-*）
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-day29-final-rc16.ts
RUN_SUFFIX=-run3 node scripts/cdp-trace/run-day29-final-rc16.ts

# 前置檢查（有效 session 前）
node <probe>     # runVersionNodeCount(3.5.40, N=5000) ×3 → vue-3.5.40-chrome157b-probe-ac1/2/3

# 量測（有效 session，label -chrome157b）
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-day29-final-rc16.ts   # 重複 1（AC）
RUN_SUFFIX=-run3 node scripts/cdp-trace/run-day29-final-rc16.ts   # 重複 2（AC）

# 分析
node scripts/cdp-trace/analyze-day29-final-rc16.ts -runN > .../day29-final-rc16-runN-analysis.json   # N = 2, 3
node scripts/cdp-trace/compare-day29-runs.ts .../rc16-run2-analysis.json .../rc16-run3-analysis.json > .../day29-final-rc16-run2-vs-run3.json
```
