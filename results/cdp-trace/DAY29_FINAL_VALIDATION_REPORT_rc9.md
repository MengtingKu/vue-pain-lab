# Day 29 — Final Validation：Vue 3.6.0-rc.9 Traditional vs Vapor（vdom-stress）

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。

本報告**不取代** `DAY29_FINAL_VALIDATION_REPORT.md`（rc.4），該報告原封不動，
在此作為「前一個 Freeze Point」引用。

---

## Part 0 — Freeze Point 宣告

| 項目                        | 值                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Freeze Point**            | **2026-09-27**                                                                                      |
| **Final Validation 版本**   | **`vue@3.6.0-rc.9`**（exact，npm `rc` dist-tag 最新版，2026-09-18 發布）                            |
| Vue Git Commit              | rc.9 `5be279570a844b953dd44b56bdc2426f7421aecd` · rc.4 `3bafec0d84a9…` · 3.5.40 `fa2885d8c487…`     |
| 前一個 Freeze Point         | `vue@3.6.0-rc.4`（`DAY29_FINAL_VALIDATION_REPORT.md`，量測日 2026-08-17）                           |
| Validation Date             | 2026-09-27；有效量測 重複 1 05:59–06:06 UTC、重複 2 06:16–06:26 UTC（兩次獨立執行）                 |
| Node.js / Vite / plugin-vue | v24.13.0 / 8.1.5 / 6.0.8（與 rc.4 相同）                                                            |
| Browser                     | Chrome 153.0.8010.54（headless=new，全部條件、兩次 run 同一版本）                                   |
| Scenario Commit             | `d3991df`（所有 worktree 的 `src/scenarios`、`src/benchmarks`、App shell 與此 commit 逐位元組相同） |
| Repo HEAD（分析端）         | `701e52c`                                                                                           |
| Benchmark Parameters        | N=100/500/1000/5000 × Mount/Update × 3 warm-up + 10 measurement × 2 trace sources（未改）           |
| 電源                        | AC（`Win32_Battery.BatteryStatus=2`）；Windows 電源模式實際生效值為「最佳電源效率」（見 Part 2.3）  |

依 `validate-vue-update` 的 Final Validation Freeze Rule 第 4、5 條，Freeze Point
後的新 RC 不自動觸發重跑；本次重跑是使用者明確要求，因此以本報告正式宣告新的
Freeze Point。rc.9 之後若再有新 RC，只記錄 Version Change，不覆蓋本報告。

---

## Part 1 — Historical Validation（3.5.40 → 3.6.0-rc.2，未重跑、未修改）

D09 / D14 / D19 / D25 的結論**原封沿用**，本 session 沒有重跑、沒有改寫：

- Reactive Chain / Component Storm / Composable Chaos / VDOM Stress（Traditional）
  在 3.5.40 → 3.6.0-rc.2 之間，沒有可重現的 Framework-level runtime 成本改善
  （細節見 `DAY29_FINAL_VALIDATION_REPORT.md` Part 1 與 `FINAL_VALIDATION_REPORT.md`）。
- 唯一統計上乾淨的訊號是 Composable Chaos Depth 20 update Scripting（−25.6%），
  只屬 JS 層級，無法歸因到 Vue Runtime。

本報告的 3.5.40 資料是**新的同 session 對照組**（`vue-3.5.40-chrome153-run2/-run3`），
用途是讓 rc.4 / rc.9 有同一瀏覽器、同一時段的基準，**不是**重跑歷史 Validation。

---

## Part 2 — 實驗設計與環境控制

### 2.1 Matrix（5 個條件 × 2 次獨立 run，同一 Chrome，交錯執行）

| 條件                             | Worktree                      | Port | 輸出目錄（`<run>`：重複 1 = `run2`、重複 2 = `run3`） |
| -------------------------------- | ----------------------------- | ---- | ----------------------------------------------------- |
| 3.5.40（控制組）                 | `vue-pain-lab-vue35-d29ctrl`  | 5178 | `vue-3.5.40-chrome153-<run>/`                         |
| 3.6.0-rc.4 Traditional（控制組） | `vue-pain-lab-vue36rc4-trad`  | 5175 | `vue-3.6.0-rc.4-traditional-chrome153-<run>/`         |
| 3.6.0-rc.4 Vapor（控制組）       | `vue-pain-lab-vue36-vapor`    | 5174 | `vue-3.6.0-rc.4-vapor-chrome153-<run>/`               |
| **3.6.0-rc.9 Traditional**       | `vue-pain-lab-vue36rc9-trad`  | 5176 | `vue-3.6.0-rc.9-traditional-<run>/`                   |
| **3.6.0-rc.9 Vapor**             | `vue-pain-lab-vue36rc9-vapor` | 5177 | `vue-3.6.0-rc.9-vapor-<run>/`                         |

每個 N 依序跑 3.5.40 → rc.4 Trad → rc.4 Vapor → rc.9 Trad → rc.9 Vapor。
**本報告稱為「重複 1 / 重複 2」的兩次有效量測，都在 AC 供電下執行**，使用完全相同的 script / 參數 / 順序，用來確認
同一結論是否能重現。raw 資料目錄後綴是 `-run2` / `-run3`，因為第一次執行（無後綴目錄）是在電池供電下量測、已作廢
（見 2.3），後綴沿用執行順序。兩次之間重啟
dev server。每個條件每次 run 320 個 raw 檔，全數齊全。

### 2.2 Freeze 檢查（實際驗證，非假設）

- Scenario / benchmark / App shell：5 個 worktree 對 `d3991df` 做 `git diff --quiet`，全部 clean。
- Vapor 啟用方式與 rc.4 **完全相同**（`vite.config.ts` 的 `features.vapor: true`、
  `src/main.ts` 的 `app.use(vaporInteropPlugin)`）；rc.4 與 rc.9 的 Vapor patch 逐行相同。
- 編譯結果（兩次 run 前皆確認）：Vapor server 送出的 `VDomStressPage.vue` 含
  `defineVaporComponent`；Traditional 為 `createElementBlock`。
- rc.9 仍匯出 `vaporInteropPlugin`；Vite pre-bundle chunk 仍為
  `vue.runtime.esm-bundler-*.js`，`attribution.ts` 的 `bucketForUrl()` 對 rc.9 沒有盲點。
- 量測 pipeline（`chrome.ts` / `tracer.ts` / `sync.ts` / `scenario.ts` / `parser.ts` /
  `stats.ts` / `evidence.ts` / `run-validation-matrix.ts`）未修改。`attribution.ts` 在 rc.4 run
  之後有一次 additive 修改（`0a4c0da`，只新增 component-storm URL），不影響 vdom-stress。
- 分析器 `analyze-day29-final-rc9.ts` 對**原始** rc.4 資料重算，與
  `DAY29_FINAL_VALIDATION_REPORT.md` 的數字逐項一致（例：Mount Scripting 3267→2617、
  Update N=5000 Scripting 51433→12642、Recalculate Style 128→239 CR）——方法論等價已驗證。

### 2.3 環境偏差（已揭露）

| 偏差                      | 內容                                                                                                                                            | 處理                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chrome 版本               | 歷史 3.5.40/rc.2 = 151.0.7922.76；rc.4 = 151.0.7922.138；本次 = 153.0.8010.54（使用者層級自動更新；回退需改 `chrome.ts` = 改 pipeline）         | 以**同 session 對照組**比較版本效應；跨 session 比較只作 drift 描述                                           |
| `postcss` 8.5.20 → 8.5.28 | `@vue/compiler-sfc@3.6.0-rc.9` 自身宣告 `postcss ^8.5.28`，屬 Vue 版本的 transitive 變更；其餘非 Vue 依賴與 rc.4 lockfile 相同                  | 視為 Vue 版本變更的一部分                                                                                     |
| **電池量測（作廢）**      | 第一次完整 matrix（無後綴目錄）在**電池供電**下量測，同一條件在 10 次 trial 內出現 2–5 倍 regime 切換（例：3.5.40 Mount N=5000 42→50→98–122ms） | 保留為 recorded-invalid evidence，**不用於任何結論**                                                          |
| 電源模式                  | AC 供電；Windows 設定值為「最佳效能」，但 ASUS 電源管理使實際生效值仍為「最佳電源效率」                                                         | 重複 1 前以 3.5.40 N=5000 probe 驗證（Mount 30–43ms，無 regime 切換）；重複 1 / 重複 2 各區塊皆無 regime 切換 |
| CDP retry                 | 重複 1 6 次、重複 2 11 次 `Runtime.bindingCalled` timeout，全部由凍結協定 retry 成功（重複 2 有 1 次需第 3 次 attempt），無資料遺失             | 機制已確認，見 2.4                                                                                            |

### 2.4 CDP timeout 的機制（已解釋）

`fireTriggerRender()` 以「`renderDuration` 文字與觸發前不同」判定完成。Update trial
先做一次 priming Mount，因此觸發前的文字是**該次 Mount 的時間**；headless Chrome 的
`performance.now()` 解析度為 0.1ms（文字如 `"1.400 ms"`）。若 Update 的時間文字恰好與
priming Mount 相同，文字看起來沒有變，harness 等到 30 秒 timeout。

驗證：

- Mount 觸發前文字為 `-`，不可能碰撞 → 三次 run 的 Mount 皆 0 次 timeout。
- 由各條件的 Mount/Update 文字分佈估算碰撞機率：N=100 為 0.8%（3.5.40）至 3.0%（rc.4 Vapor），
  N≥500 ≤0.5%。三次 run 的 timeout 集中在 N=100 Update（21 次中 18 次）。
- 電池量測與重複 1 的 timeout 只出現在 3.6 條件，但重複 2 出現 3 次在 3.5.40、6 次在碰撞機率最高
  的 rc.4 Vapor → **與 Vue 版本無關**，是 harness 的量化碰撞。

影響：失敗的 attempt 整個丟棄並重新 navigate，trial 數不變；只會把少數「Update 時間恰好
等於 Mount 時間」的樣本換成新樣本，對中位數影響可忽略。修正需改 harness 判定條件，違反
Freeze Rule，故只記錄不修。

---

## Part 3 — Application Timing（Render Duration，ms，中位數，重複 1 / 重複 2）

> Part 3–8 的「重複 1 / 重複 2」是兩次 AC 供電下的獨立重複量測（說明見 Part 2.1）；兩者數字不同屬正常量測波動，
> 引用幅度時以範圍表示（例：−31% 至 −42%）。

| Mount            | N=100     | N=500     | N=1000      | N=5000      |
| ---------------- | --------- | --------- | ----------- | ----------- |
| 3.5.40           | 3.0 / 1.9 | 5.3 / 5.0 | 12.4 / 9.6  | 33.6 / 35.5 |
| rc.4 Traditional | 2.0 / 2.0 | 6.3 / 6.8 | 12.1 / 10.4 | 38.8 / 32.5 |
| rc.4 Vapor       | 1.5 / 1.9 | 6.1 / 4.5 | 10.3 / 7.7  | 28.5 / 22.9 |
| rc.9 Traditional | 2.1 / 2.0 | 6.2 / 5.5 | 10.0 / 9.2  | 37.9 / 32.8 |
| rc.9 Vapor       | 1.6 / 1.7 | 4.3 / 6.3 | 9.1 / 8.1   | 27.6 / 21.9 |

| Update           | N=100     | N=500     | N=1000    | N=5000      |
| ---------------- | --------- | --------- | --------- | ----------- |
| 3.5.40           | 1.5 / 1.2 | 1.9 / 1.7 | 3.0 / 3.0 | 12.8 / 12.1 |
| rc.4 Traditional | 1.2 / 1.0 | 2.1 / 2.2 | 2.8 / 2.8 | 11.2 / 11.6 |
| rc.4 Vapor       | 0.9 / 0.9 | 2.0 / 1.9 | 3.2 / 3.3 | 12.6 / 11.6 |
| rc.9 Traditional | 0.9 / 1.4 | 1.8 / 2.5 | 2.8 / 2.7 | 11.7 / 10.2 |
| rc.9 Vapor       | 1.0 / 1.2 | 2.0 / 2.5 | 3.9 / 3.2 | 11.4 / 12.7 |

跨重複 重現的分類（Traditional → Vapor）：

- **Mount N=5000**：rc.9 −27.0% CI / −33.3% CI；rc.4 −26.5% CI / −29.8% CI → **reproduced（4/4）**。
- **Update N=1000**：rc.9 +41.8% CR / +18.5% CR → **reproduced**（rc.4 +14.3% CR / +17.5% U）——絕對差 0.4–1.1ms。
- Update N=5000：rc.9 −2.1% S / +25.1% U → 無改善。

---

## Part 4 — Chrome Performance Cost 與 Runtime Attribution（µs 中位數）

### 4.1 rc.9 Traditional → rc.9 Vapor（重複 1 ‖ 重複 2）

| Mount           | N=100                     | N=500                     | N=1000                    | N=5000                    |
| --------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| Scripting       | −30% U ‖ −26% U           | −42% **CI** ‖ −14% U      | −33% **CI** ‖ −32% **CI** | −44% **CI** ‖ −48% **CI** |
| Rendering       | +8% U ‖ +0.5% S           | +7% U ‖ +31% U            | +4% U ‖ +1.2% S           | +2.6% U ‖ +1.0% U         |
| Layout          | −0.4% S ‖ +3.5% U         | +4% U ‖ +44% CR           | +5% U ‖ +1.3% S           | +0.1% S ‖ +1.8% S         |
| Painting        | −1% U ‖ −15% U            | −10% U ‖ +16% U           | +14% U ‖ −21% U           | +4% U ‖ +18% U            |
| Vue Runtime CPU | −67% **CI** ‖ −74% **CI** | −59% **CI** ‖ −63% **CI** | −61% **CI** ‖ −58% **CI** | −64% **CI** ‖ −61% **CI** |

| Update          | N=100           | N=500                | N=1000               | N=5000                    |
| --------------- | --------------- | -------------------- | -------------------- | ------------------------- |
| Scripting       | −19% U ‖ −26% U | −28% **CI** ‖ −18% U | −20% U ‖ −24% **CI** | −42% **CI** ‖ −31% **CI** |
| Rendering       | −17% U ‖ +14% U | +5% U ‖ +6% U        | +3% U ‖ −13% U       | +13% U ‖ +14% U           |
| Layout          | +4% U ‖ +12% U  | +2% S ‖ +2% S        | +10% U ‖ −7% U       | +17% U ‖ +10% U           |
| Painting        | −7% U ‖ +24% U  | +18% U ‖ +4% U       | +3% U ‖ +82% U       | −12% U ‖ −5% U            |
| Vue Runtime CPU | +48% U ‖ −38% U | +39% U ‖ +6% U       | −0.2% S ‖ +8% U      | −19% U ‖ −9% U            |

分類統計：重複 1 13 CI / 1 CR / 7 S / 59 U；重複 2 13 CI / 2 CR / 9 S / 56 U。

### 4.2 rc.4 Traditional → rc.4 Vapor（同 session 對照）

重複 1 14 CI / 3 CR；重複 2 15 CI / 0 CR。與 rc.9 同構：

- Mount Vue Runtime CPU：N=500/1000/5000 兩次皆 CI（−40% 至 −68%）；N=100 重複 1 U（−78%）、重複 2 CI（−53%）。
- Mount Scripting：N=1000/5000 兩次皆 CI（−34% 至 −46%）。
- Update Scripting：N=500/1000/5000 兩次皆 CI（−30% 至 −38%）；N=100 重複 1 CI、重複 2 U。
- 重複 1 的 Update N=5000 Painting/Paint CR 在重複 2 **未重現**（+4.9% U）。

**信心度注意（沿用既有方法論，未變）**：Vue Runtime CPU / Application CPU / V8-native CPU
依 `evidence.ts` 設計一律 `confidence: 'low'`（葉節點取樣，低估 inclusive 成本）。
方向性訊號可讀，精確數字不可讀。

---

## Part 5 — Cost Structure（Scripting / Rendering / Painting 佔三者總和，中位數）

| 條件             | Mount N=5000（重複 1 ‖ 重複 2）   | Update N=5000（重複 1 ‖ 重複 2）    |
| ---------------- | --------------------------------- | ----------------------------------- |
| 3.5.40           | 25.1/72.1/2.8 ‖ 27.0/70.1/2.9     | 69.0/15.9/15.1 ‖ 70.1/17.1/12.8     |
| rc.4 Traditional | 28.8/68.2/3.1 ‖ 26.0/71.2/2.8     | 70.4/17.1/12.5 ‖ 69.4/17.3/13.3     |
| rc.4 Vapor       | 18.4/78.5/3.0 ‖ 15.7/81.1/3.3     | 56.5/24.0/19.4 ‖ 57.9/23.2/18.9     |
| rc.9 Traditional | 27.7/69.7/2.6 ‖ 26.3/70.9/2.9     | 66.3/17.1/16.6 ‖ 67.4/17.5/15.1     |
| **rc.9 Vapor**   | **17.4/79.6/3.0 ‖ 15.4/80.8/3.8** | **53.4/26.6/20.0 ‖ 57.7/24.6/17.7** |

### Update N=5000：rc.9 Traditional vs rc.9 Vapor（必答）

「跨重複」欄表示兩次獨立重複量測是否得到相同結論。

| 指標                       | 重複 1（T → V）              | 重複 2（T → V）              | 跨重複                         |
| -------------------------- | ---------------------------- | ---------------------------- | ------------------------------ |
| Scripting absolute         | 20,242 → 11,816µs，−41.6% CI | 18,982 → 13,167µs，−30.6% CI | **reproduced**                 |
| Scripting share            | 66.3% → 53.4%                | 67.4% → 57.7%                | 兩次皆下降 10–13 pt            |
| Rendering absolute         | 5,212 → 5,882µs，+12.9% U    | 4,944 → 5,618µs，+13.6% U    | 同方向（+13%），皆 Unstable    |
| Painting absolute          | 5,057 → 4,435µs，−12.3% U    | 4,253 → 4,030µs，−5.2% U     | 同方向，皆 Unstable            |
| Total main-thread（S+R+P） | 30,510 → 22,133µs（−27.5%）  | 28,178 → 22,815µs（−19.0%）  | 同方向（中位數之和，未另分類） |

Mount N=5000 總和：rc.9 重複 1 −10.2%、重複 2 −11.4%；rc.4 重複 1 −8.7%、重複 2 −9.7%。

---

## Part 6 — Version Effect、Browser Drift 與跨重複 重現性

### 6.1 跨重複重現性（重複 1 vs 重複 2，`compare-day29-runs.ts`）

判定：`reproduced` = 兩次皆 Consistent 且同方向；`direction` = 同號但至少一次非 Consistent；
`conflicting` = Consistent 方向相反，或號相反且至少一次 Consistent；`neither` = 兩次皆非
Consistent 且號相反。

| 比較                                | reproduced | direction | conflicting | neither |
| ----------------------------------- | ---------: | --------: | ----------: | ------: |
| rc.9 Traditional → rc.9 Vapor       |     **11** |        50 |       **0** |      19 |
| rc.4 Traditional → rc.4 Vapor       |     **12** |        49 |       **0** |      19 |
| rc.4 Traditional → rc.9 Traditional |      **0** |        40 |           5 |      35 |
| rc.4 Vapor → rc.9 Vapor             |      **0** |        35 |           1 |      44 |
| 3.5.40 → rc.9 Traditional           |      **0** |        42 |           7 |      31 |
| 3.5.40 → rc.4 Traditional           |      **0** |        41 |           0 |      39 |

rc.9 架構比較中兩次皆 CI 的 11 個 cell：Mount Vue Runtime CPU（N=100/500/1000/5000）、
Mount Scripting（N=1000/5000）、Update Scripting（N=5000）、Mount N=5000 Render Duration、
Mount N=5000 / Update N=5000 Application CPU，以及 **Update N=1000 Render Duration（CR）**。

**分類器的單次 false-positive 程度**：在沒有可重現差異的版本比較中，單次 run 仍會出現
1–5 個 Consistent cell（例：重複 1 3.5.40→rc.9 的 5 個 N=100 CI、重複 2 rc.4→rc.9 Traditional
的 Update N=100 Render Duration +45% CR），且在另一次 run 皆未重現或方向相反。
→ **單次 run 的個別 Consistent cell 不足以下結論**；這也適用於 8 月 rc.4 報告（單次 run）。

### 6.2 Version effect（同 session、同 Chrome 153）

- rc.4 Traditional → rc.9 Traditional：重複 1 0 CI / 1 CR；重複 2 1 CI / 3 CR；**0 reproduced**，
  5 conflicting。Vue Runtime CPU 無任何跨重複 一致的 Consistent cell。
- rc.4 Vapor → rc.9 Vapor：重複 1 0 / 0；重複 2 0 CI / 1 CR；**0 reproduced**。
- 3.5.40 → rc.9 Traditional：重複 1 5 CI（全在 N=100，Browser 指標）→ 重複 2 **全部未重現**；
  重複 2 的 Update N=5000 Vue Runtime CPU −26.4% CI 在重複 1 為 −6.0% U → direction only。

### 6.3 Browser / session drift（同 Vue 版本，8 月 Chrome 151 vs 今日 重複 1）

| 條件             | 分類                      | 代表 cell                                                                  |
| ---------------- | ------------------------- | -------------------------------------------------------------------------- |
| 3.5.40           | 21 CI / 1 CR / 4 S / 54 U | Update N=5000 Scripting 48,871 → 22,153µs（−54.7%）                        |
| rc.4 Traditional | 48 CI / 1 CR / 3 S / 28 U | Mount N=5000 Scripting 164,433 → 49,499µs；Update N=5000 51,433 → 20,169µs |
| rc.4 Vapor       | 23 CI / 0 CR / 7 S / 50 U | Update N=5000 Scripting 12,642 → 12,864µs（幾乎不變）                      |

同樣的程式碼，8 月量測比今天慢很多，且幅度在條件間不一致（rc.4 Traditional Update N=5000
慢約 2.5 倍，rc.4 Vapor 幾乎相同）。可能來源包括 Chrome 151→153、8 月的電源／機器狀態
（8 月 metadata 未記錄電源來源），無法區分：**Observed difference, mechanism not established.**

---

## Part 7 — Evidence Matrix

| Comparison                            | Result                                                                                                                                                                                           | Evidence strength                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| rc.9 Traditional vs previous baseline | 對 rc.4 Traditional 與 3.5.40（同 session）：兩次 run **0 個 reproduced cell**；單次出現的 Consistent cell 在另一次 run 未重現或方向相反。**Not reproduced**                                     | 對「無可重現差異」：強（2 次獨立 run × 2 個基準）                                                  |
| rc.9 Traditional vs rc.9 Vapor        | 11 cells reproduced、0 conflicting；與 rc.4 架構比較同構（12 reproduced、0 conflicting）→ **reproduced**（跨 2 次 run、跨 2 個 RC）、**stable**                                                  | 強（方向）；Vue Runtime CPU 數值為低信心 bucket                                                    |
| Mount                                 | Vue Runtime CPU −58% 至 −74%（4/4 N 兩次皆 CI）；Scripting −32% 至 −48%（N=1000/5000 兩次皆 CI）；Rendering/Layout 持平（N=5000 +0.1%～+1.8%）；N=5000 Render Duration −27% / −33% CI            | 強                                                                                                 |
| Update                                | Scripting 下降（rc.9 N=5000 兩次 CI；rc.4 N=500/1000/5000 兩次 CI）；Render Duration 無改善，N=1000 rc.9 兩次 CR（+0.4～1.1ms）；Browser 指標 Unstable                                           | Scripting：強；wall-clock 無改善：中；N=1000 CR：observed（reproduced），mechanism not established |
| N=5000 Update                         | Scripting −42% / −31% CI；S+R+P −28% / −19%；Render Duration −2% S / +25% U。8 月 −75.4% / −65.2% 幅度 **not reproduced**                                                                        | Scripting 方向：強；8 月幅度：observed difference, mechanism not established                       |
| Vue Runtime CPU                       | Mount：reproduced（rc.9 4/4、rc.4 3/4 兩次皆 CI）。Update：rc.9 兩次皆無 CI（N=5000 −19% / −9% U）；8 月 Update N=5000 −73.7% CI **not reproduced**                                              | Mount：方向強、數字低信心；Update：無證據                                                          |
| Scripting                             | Vapor < Traditional，跨重複、跨 RC 重現（Mount N≥1000、Update N=5000 at rc.9）；rc.4→rc.9 本身無可重現差異                                                                                       | 強（cost-trace 指標，信心高於 attribution bucket）                                                 |
| Browser Rendering                     | Vapor 未降低 Rendering / Layout / Recalc（Mount N=5000 Layout 兩次皆 Stable）；Update N=5000 Rendering 兩次 +13%（Unstable）；rc.4 重複 1 的 Painting CR 在重複 2 未重現；rc.4→rc.9 無可重現變化 | Mount 持平：強；Update：不足                                                                       |

---

## Part 8 — 必答問題

### 1. rc.9 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 同 session 對 rc.4 Traditional 與 3.5.40，兩次獨立 run 中**沒有任何一個 cell 重現**。
單次 run 出現的 Consistent cell（重複 1 3.5.40→rc.9 的 5 個 N=100 CI、重複 2 rc.4→rc.9 的 3 個 CR）
在另一次 run 皆未重現或方向相反，屬於分類器的單次 false positive 範圍。

### 2. rc.9 Vapor 是否仍然降低 Framework / Scripting cost？

**是，已在 2 次獨立 run 與 2 個 RC 之間重現。** Mount Vue Runtime CPU 在 4 個 N 兩次皆 CI
（−58% 至 −74%）；Mount Scripting N=1000/5000、Update Scripting N=5000 兩次皆 CI。

### 3. Update 是否在較大 Node Count 下出現更明顯改善？

**只有 Scripting，且只在 N=5000 跨重複 重現**（rc.9：−42% / −31% CI）；N=100/500/1000
的 Scripting 下降方向一致但只有單次 CI。wall-clock Render Duration 在 Update **沒有**改善：
N=5000 −2% S / +25% U；N=1000 兩次皆 CR。Update Vue Runtime CPU 在任何 N 皆無可重現的下降。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

rc.9 Vapor，Mount N=5000：Rendering 118,796–127,409µs（Layout 90,817–95,752）＋ Painting
4,781–5,574µs → Browser 側佔 S+R+P 的 **82.6% / 84.6%**（重複 1 / 重複 2）。Vapor 沒有降低這部分。

Update N=5000：Rendering 5,618–5,882µs ＋ Painting 4,030–4,435µs → 佔 **46.6% / 42.3%**。

### 5. rc.9 是否改變原本 rc.4 Vapor 的結論？

**rc.9 本身沒有改變結論**：rc.4 Vapor → rc.9 Vapor 兩次 run 0 個 reproduced cell；
rc.9 的架構比較與 rc.4 同構。

但**今日兩次同 session 對照改變了 rc.4 報告中部分結論的幅度與可重現性**（與 rc.9 無關）：

| rc.4 報告原結論（單次 run，8 月）         | 今日 重複 1 / 重複 2（rc.4 與 rc.9 皆同）         |
| ----------------------------------------- | ------------------------------------------------- |
| Mount Vue Runtime CPU 4/4 CI              | **Reproduced**                                    |
| Mount N=5000 Rendering/Layout 持平        | **Reproduced**                                    |
| Mount N=5000 Scripting share 31.1%→18.8%  | **Reproduced**（rc.9 ≈ 27%→15–17%）               |
| Update N=5000 Scripting −75.4%            | 方向 reproduced，幅度 −31% 至 −42%                |
| Update N=5000 S+R+P −65.2%                | −19% 至 −28%                                      |
| Update N=5000 Vue Runtime CPU −73.7% CI   | **Not reproduced**（−5% 至 −19%，Unstable）       |
| Update N=500 Render Duration +49.1% CR    | **Not reproduced**；改在 N=1000 出現且跨重複 重現 |
| Update N=5000 Recalculate Style +87.1% CR | **Not reproduced**                                |
| Update Browser 絕對成本亦下降             | **Not reproduced**（Rendering +11% 至 +14%，U）   |

### 6. 哪些結果可以歸因？

- **架構（Traditional → Vapor）→ Mount 的 Vue Runtime CPU 與 Scripting 下降**：2 次 run、2 個 RC、
  同 Scenario，唯一變因為 Vapor 編譯模式 → 可歸因到架構（Vue Runtime CPU 歸因的是方向）。
- **架構 → Update N=5000 Scripting 下降**：可歸因到架構，JS 層級。
- **Vapor 不降低 Mount 的 Browser Rendering/Layout**：可歸因——DOM 結構相同，Browser 工作量相同。
- **rc.4 → rc.9 無可重現差異**：版本效應在本 Scenario 下 not observed。
- **CDP timeout**：可歸因到 harness 的完成判定與 0.1ms 量化碰撞，與 Vue 無關（2.4）。

### 7. 哪些結果只能描述為 observed difference？

- Vapor Update N=1000 Render Duration 較慢（rc.9 兩次 CR，+0.4～1.1ms）——**reproduced，但
  mechanism not established**。
- 8 月（Chrome 151）與今日（Chrome 153）同版本的大幅差異，以及因此造成 rc.4 報告 Update 幅度
  無法重現——**Observed difference, mechanism not established.**
- 所有只在單次 run 出現的 Consistent cell。

### 8. 哪些結果仍然無法解釋？

- **為何 Vapor 降低 Update Scripting，但 Update wall-clock Render Duration 沒有下降**（N=1000
  甚至可重現地變慢）。`renderDuration` 以頁面內 `nextTick()` 量測，與 trace 的 main-thread
  成本量測窗口不同；本 pipeline 無法在兩者之間做歸因。
- **為何 8 月 Traditional 的 Update N=5000 比今日慢約 2.5 倍，而 Vapor 幾乎相同。**

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** 在 rc.9 Freeze Point：Traditional Runtime 相對 rc.4 與 3.5.40
   **沒有可重現的 Framework-level 改善**（2 次獨立 run，0 個重現 cell）。Vapor（不同的 Rendering
   Architecture）在 rc.9 與 rc.4、兩次 run 中都降低 Mount 的 Vue Runtime CPU 與 Scripting，以及
   Update N=5000 的 Scripting。
2. **改善到什麼程度？** Traditional rc.9：No measurable improvement。Vapor vs Traditional：
   Mount Scripting −32% 至 −48%（N≥1000）、Vue Runtime CPU −58% 至 −74%（方向）；Update N=5000
   Scripting −31% 至 −42%；Update wall-clock：No measurable improvement；Browser Rendering：不變。
3. **還需要工程改善嗎？** 是。Mount N=5000 時 Browser 側（Layout 為主）在 Vapor 下佔 main-thread
   成本約 83–85%——這部分由 DOM 數量與 CSS/Layout 決定，Vue（含 Vapor）無法移除，屬 Component
   Architecture / 虛擬化 / 分批渲染 等應用層決策。

---

## Limitations

- 2 次有效獨立重複量測（重複 1 / 重複 2），每次 10 measurement trials；未做 3 次以上的重複。
- 條件執行順序固定（每個 N 內 3.5.40 → rc.4 T → rc.4 V → rc.9 T → rc.9 V），兩次 run 相同，未做順序反轉。
- Windows 實際生效電源模式為「最佳電源效率」（ASUS 管理）；兩次 run 皆無 regime 切換，但與
  最佳效能模式下的絕對數值可能不同。
- Chrome 153 與 8 月 Chrome 151 不同，跨 session 絕對值不可直接比較。
- Vue Runtime CPU / Application CPU 為低信心 bucket（既有方法論）。
- CDP completion 判定有已知的量化碰撞（2.4），靠 retry 補足，未修正（Freeze Rule）。
- 只驗證 `vdom-stress`；Component Storm / Composable Chaos 的 Vapor 表現未評估。

---

## Files generated

新增（主 repo，未 commit）：

- `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT_rc9.md`（本報告）
- `scripts/cdp-trace/run-day29-final-rc9.ts` — orchestration，只呼叫凍結的 `runVersionNodeCount()`；
  AC 電源 pre-flight、「目錄已存在即拒絕」、`RUN_SUFFIX` 環境變數（預設 `-run2`）
- `scripts/cdp-trace/analyze-day29-final-rc9.ts` — 與 `analyze-vapor-comparison.ts` 相同的 `classify()`，label 參數化
- `scripts/cdp-trace/compare-day29-runs.ts` — 對齊兩次 run 的分類結果，不引入新統計
- `results/cdp-trace/validation/day29-final-rc9-run2-analysis.json`
- `results/cdp-trace/validation/day29-final-rc9-run3-analysis.json`
- `results/cdp-trace/validation/day29-final-rc9-run2-vs-run3.json`
- `results/cdp-trace/validation/day29-final-rc9-run1-battery-INVALID-analysis.json` — 作廢 run 的分析
- Raw（gitignored）：
  - 有效：5 條件 × `-run2` / `-run3`（10 × 320 檔）
  - 作廢（電池）：同名無後綴的 5 個目錄
  - 前置檢查：`vue-3.6.0-rc.9-vapor-smoke/`、`vue-3.5.40-chrome153-probe-ac/`

新增 worktree（`d3991df`，未 commit）：`vue-pain-lab-vue36rc9-trad`、`vue-pain-lab-vue36rc9-vapor`
（含與 rc.4 相同的 Vapor patch）、`vue-pain-lab-vue35-d29ctrl`。

未修改：`DAY29_FINAL_VALIDATION_REPORT.md`、所有 rc.4 / rc.2 / 3.5.40 歷史 raw 資料（另備份於
session scratchpad `rc4-results-backup.tgz`）、Scenario、量測 pipeline、主 repo 的 `package.json`
（仍為 `vue: 3.5.40`）。

## Commands executed

```bash
# 環境
git worktree add ../vue-pain-lab-vue36rc9-trad  d3991df --detach
git worktree add ../vue-pain-lab-vue36rc9-vapor d3991df --detach
git worktree add ../vue-pain-lab-vue35-d29ctrl  d3991df --detach
(vue35-d29ctrl) npm ci
(rc9 x2) cp ../vue-pain-lab-vue36rc4-trad/package{,-lock}.json . && npm install vue@3.6.0-rc.9 --save-exact
(rc9-vapor) git apply <rc.4 vapor worktree 的 vite.config.ts + src/main.ts diff>
git ls-remote https://github.com/vuejs/core refs/tags/v3.6.0-rc.9 ...
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5178> --strictPort   # 重複 1、重複 2 前各啟動一次

# 前置檢查
node <smoke>  # runVersionNodeCount(rc.9 vapor, N=100, mount) → vue-3.6.0-rc.9-vapor-smoke
node <probe>  # runVersionNodeCount(3.5.40, N=5000) → vue-3.5.40-chrome153-probe-ac

# 量測
node scripts/cdp-trace/run-day29-final-rc9.ts                     # 電池量測（作廢；無後綴目錄）
node scripts/cdp-trace/run-day29-final-rc9.ts                     # 重複 1（AC，目錄後綴 -run2）
RUN_SUFFIX=-run3 node scripts/cdp-trace/run-day29-final-rc9.ts    # 重複 2（AC，目錄後綴 -run3）

# 分析
node scripts/cdp-trace/analyze-day29-final-rc9.ts       > .../day29-final-rc9-run1-battery-INVALID-analysis.json
node scripts/cdp-trace/analyze-day29-final-rc9.ts -run2 > .../day29-final-rc9-run2-analysis.json
node scripts/cdp-trace/analyze-day29-final-rc9.ts -run3 > .../day29-final-rc9-run3-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../run2-analysis.json .../run3-analysis.json > .../day29-final-rc9-run2-vs-run3.json
```
