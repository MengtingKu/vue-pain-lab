# Day 29 — Final Validation：Vue 3.6.0-rc.11 Traditional vs Vapor（vdom-stress）

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。

本報告**不取代** `DAY29_FINAL_VALIDATION_REPORT_rc9.md`（rc.9）與
`DAY29_FINAL_VALIDATION_REPORT.md`（rc.4），兩份報告原封不動，在此作為前一個 / 更早的
Freeze Point 引用。

---

## Part 0 — Freeze Point 宣告

| 項目                        | 值                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Freeze Point**            | **2026-10-14**                                                                                                                                       |
| **Final Validation 版本**   | **`vue@3.6.0-rc.11`**（exact，npm `rc` dist-tag 最新版，2026-10-10 發布）                                                                            |
| Vue Git Commit              | rc.11 `b55f3b92a185e87680ca7f69252451964be08b00` · rc.9 `5be279570a84…` · rc.4 `3bafec0d84a9…` · 3.5.40 `fa2885d8c487…`                              |
| 前一個 Freeze Point         | `vue@3.6.0-rc.9`（`DAY29_FINAL_VALIDATION_REPORT_rc9.md`，Freeze Point 2026-09-27）                                                                  |
| Version Change（未量測）    | `vue@3.6.0-rc.10`（2026-09-30 發布，tag commit `444eef4bcba9…`）——在 rc.9 Freeze Point 之後、rc.11 之前；依 Freeze Rule 第 4、5 條只記錄，**不量測** |
| Validation Date             | 2026-10-14；有效量測 重複 1 04:38–04:48 UTC、重複 2 04:49–04:58 UTC、重複 3 05:44–05:56 UTC（三次獨立執行，每次前重啟 dev server）                   |
| Node.js / Vite / plugin-vue | v24.13.0 / 8.1.5 / 6.0.8（與 rc.9 相同）                                                                                                             |
| Browser                     | Chrome 155.0.8059.41（headless=new，全部條件、三次 run 同一版本；rc.9 為 153.0.8010.54）                                                             |
| Scenario Commit             | `d3991df`（所有 worktree 的 `src/scenarios`、`src/benchmarks` 與此 commit 逐位元組相同）                                                             |
| Repo HEAD（分析端）         | `cc24b20`                                                                                                                                            |
| Benchmark Parameters        | N=100/500/1000/5000 × Mount/Update × 3 warm-up + 10 measurement × 2 trace sources（未改）                                                            |
| 電源                        | AC（`Win32_Battery.BatteryStatus=2`）；Windows AC overlay 實際值 `ded574b5…` = **最佳效能**（rc.9 為「最佳電源效率」，見 Part 2.3）                  |

依 `validate-vue-update` 的 Final Validation Freeze Rule 第 4、5 條，Freeze Point
後的新 RC 不自動觸發重跑；本次重跑是使用者明確要求（`/validate-vue-update 3.6.0-rc.11`），
因此以本報告正式宣告新的 Freeze Point。rc.10 在兩個 Freeze Point 之間發布，只記錄
Version Change。rc.11 之後若再有新 RC，同樣只記錄 Version Change，不覆蓋本報告。

---

## Part 1 — Historical Validation（3.5.40 → 3.6.0-rc.2，未重跑、未修改）

D09 / D14 / D19 / D25 的結論**原封沿用**，本 session 沒有重跑、沒有改寫：

- Reactive Chain / Component Storm / Composable Chaos / VDOM Stress（Traditional）
  在 3.5.40 → 3.6.0-rc.2 之間，沒有可重現的 Framework-level runtime 成本改善
  （細節見 `DAY29_FINAL_VALIDATION_REPORT.md` Part 1 與 `FINAL_VALIDATION_REPORT.md`）。
- 唯一統計上乾淨的訊號是 Composable Chaos Depth 20 update Scripting（−25.6%），
  只屬 JS 層級，無法歸因到 Vue Runtime。

本報告的 3.5.40 / rc.4 / rc.9 資料是**新的同 session 對照組**（`-chrome155-run1/-run2/-run3`），
用途是讓 rc.11 有同一瀏覽器、同一時段的基準，**不是**重跑歷史 Validation，也不取代 rc.9 報告的數字。

---

## Part 2 — 實驗設計與環境控制

### 2.1 Matrix（7 個條件 × 3 次獨立 run，同一 Chrome，交錯執行）

沿用 rc.9 的 5 個條件（3.5.40、rc.4 T/V、rc.9 T/V），新增 rc.11 T/V。

| 條件                             | Worktree                       | Port | 輸出目錄（`<run>` = `run1` / `run2` / `run3`） |
| -------------------------------- | ------------------------------ | ---- | ---------------------------------------------- |
| 3.5.40（控制組）                 | `vue-pain-lab-vue35-d29ctrl`   | 5178 | `vue-3.5.40-chrome155-<run>/`                  |
| 3.6.0-rc.4 Traditional（控制組） | `vue-pain-lab-vue36rc4-trad`   | 5175 | `vue-3.6.0-rc.4-traditional-chrome155-<run>/`  |
| 3.6.0-rc.4 Vapor（控制組）       | `vue-pain-lab-vue36-vapor`     | 5174 | `vue-3.6.0-rc.4-vapor-chrome155-<run>/`        |
| 3.6.0-rc.9 Traditional（控制組） | `vue-pain-lab-vue36rc9-trad`   | 5176 | `vue-3.6.0-rc.9-traditional-chrome155-<run>/`  |
| 3.6.0-rc.9 Vapor（控制組）       | `vue-pain-lab-vue36rc9-vapor`  | 5177 | `vue-3.6.0-rc.9-vapor-chrome155-<run>/`        |
| **3.6.0-rc.11 Traditional**      | `vue-pain-lab-vue36rc11-trad`  | 5179 | `vue-3.6.0-rc.11-traditional-<run>/`           |
| **3.6.0-rc.11 Vapor**            | `vue-pain-lab-vue36rc11-vapor` | 5180 | `vue-3.6.0-rc.11-vapor-<run>/`                 |

每個 N 依序跑 3.5.40 → rc.4 T → rc.4 V → rc.9 T → rc.9 V → rc.11 T → rc.11 V。
三次 run（重複 1 = `-run1`、重複 2 = `-run2`、重複 3 = `-run3`）使用完全相同的 script / 參數 / 順序，
皆在 AC 供電下執行，每次之前依 Process Management Rule 只以 PID 終止並重啟 7 個 dev server。
重複 3 是在重複 1 / 2 完成、分析後，使用者要求再確認 rc.11 再現性而追加，量測前重新確認電源、
Chrome 版本、worktree 與編譯結果皆未變（2.2）。每個條件每次 run 320 個 raw 檔，全數齊全。
所有新目錄名稱都不與既有目錄重疊（`-chrome155` 與 `rc.11` 為新 label），run script 保留「目錄已存在即拒絕」。

`/compare` 依「場景 + Run N」合併各 Freeze Point 的 analysis：rc.11 的 `-run2` / `-run3` 與 rc.9 Freeze Point
的 `-run2` / `-run3` 對齊（Run 2 / Run 3），`-run1` 單獨顯示為 Run 1。

前置檢查：rc.11 Vapor smoke（N=100 Mount，`vue-3.6.0-rc.11-vapor-smoke/`）正常完成；
3.5.40 N=5000 AC probe（`vue-3.5.40-chrome155-probe-ac/`）Mount 33.5–65.9ms、Update 11.5–21.8ms，
無 2–5 倍 regime 切換。

### 2.2 Freeze 檢查（實際驗證，非假設）

- Scenario / benchmark：7 個 worktree 對 `d3991df` 做 `git diff --quiet -- src/scenarios src/benchmarks`，全部 clean
  （重複 1 前與重複 3 前各確認一次）。
- rc.11 worktree 由 rc.9 Traditional worktree 複製 `package.json` / `package-lock.json` 後
  `npm install vue@3.6.0-rc.11 --save-exact`。lockfile 差異**只有 `@vue/*` 與 `vue` 從 rc.9 → rc.11**，
  沒有任何非 Vue 套件變動（`@vue/compiler-sfc@3.6.0-rc.11` 仍宣告 `postcss ^8.5.28`，與 rc.9 相同）。
  兩個 rc.11 worktree 的 lockfile 逐位元組相同。
- Vapor 啟用方式與 rc.4 / rc.9 **逐行相同**（由 rc.9 Vapor worktree 的 diff `git apply`：
  `vite.config.ts` 的 `features.vapor: true`、`src/main.ts` 的 `app.use(vaporInteropPlugin)`）。
- rc.11 仍匯出 `vaporInteropPlugin`（`@vue/runtime-vapor` d.ts）。
- 編譯結果（三次 run 前皆確認）：Vapor server（5174 / 5177 / 5180）送出的 `VDomStressPage.vue`
  含 `defineVaporComponent`；Traditional（5175 / 5176 / 5178 / 5179）為 `createElementBlock`。
- rc.11 的 Vite pre-bundle chunk 仍為 `vue.runtime.esm-bundler-*.js`（`…-DVwZoNSo.js`，三次相同），
  `attribution.ts` 的 `bucketForUrl()` 對 rc.11 沒有盲點。
- 量測 pipeline（`chrome.ts` / `tracer.ts` / `sync.ts` / `scenario.ts` / `parser.ts` /
  `stats.ts` / `evidence.ts`）自 rc.9 分析端 `701e52c` 起未修改。自 rc.9 之後有兩項非方法論變更，在此揭露：
  - **只改路徑**：2026-10-03（`ebecfa8`）VDOM Stress raw trace 由 `results/cdp-trace/vue-*` 搬到
    `results/cdp-trace/vdom-stress/vue-*`；`run-validation-matrix.ts`、`run-day29-final-rc9.ts`、
    `analyze-day29-final-rc9.ts` 只多了 `'vdom-stress'` 一層路徑，量測與分類邏輯不變
    （搬移時已重算 rc.9 run2 / run3 analysis，與原檔逐項相同）。
  - `attribution.ts`（`3882ce4`）只新增 reactive-chain 的 application URL fragment，不影響 vdom-stress。
- **方法論等價**：`analyze-day29-final-rc11.ts`（由 rc.9 分析器複製，只改 `HISTORICAL_LABELS` /
  `COMPARISONS` 與對應的 `COST_STRUCTURE_LABELS`）對 **rc.9 原始 重複 1 資料**（`-run2` 目錄）重算，
  `arch-rc9-original` 的 80 個 cell 與 `day29-final-rc9-run2-analysis.json` 的 `arch-rc9` **逐項相同**
  （含 signalCounts 13 CI / 1 CR / 7 S / 59 U），rc.9 T/V 的 cost structure 亦逐項相同。

### 2.3 環境偏差（已揭露）

| 偏差                        | 內容                                                                                                                                                                    | 處理                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Chrome 版本                 | rc.9 Freeze Point = 153.0.8010.54；本次 = 155.0.8059.41（使用者層級自動更新；回退需改 `chrome.ts` = 改 pipeline）                                                       | 以**同 session 對照組**比較版本效應；跨 session 比較只作 drift 描述（6.3） |
| 電源模式                    | 本次 AC overlay 為「最佳效能」（`ded574b5…`）；rc.9 實際生效值為「最佳電源效率」                                                                                        | 同 session 對照組吸收此差異；跨 session 絕對值不可直接比較                 |
| 背景負載                    | 量測期間有 IDE、瀏覽器、通訊軟體等使用者程式在執行（量測前 CPU Load 16–17%）；量測期間 Claude 不執行其他工作                                                            | 交錯順序讓背景負載平均分攤到各條件；以 3 次 run 的重現性判斷               |
| rc.11 N=100 Update 區塊偏移 | 重複 1 rc.11 Vapor、重複 3 rc.11 Traditional 的 N=100 Update 區塊整體偏移約 ×2.2，所有 Browser 指標同步上升；168 個區塊中只有這 2 個偏移                                | 見 **Part 9**：observed, partially reproduced, mechanism not established   |
| CDP retry                   | `Runtime.bindingCalled` timeout：重複 1 7 次、重複 2 6 次、重複 3 12 次，**全部在 Update**（N=100 為主，重複 3 有 2 次在 N=500），全部由凍結協定 retry 成功，無資料遺失 | 機制與 rc.9 報告 2.4 相同（0.1ms 文字碰撞），與 Vue 版本無關               |

CDP timeout 分佈：重複 1 rc.9 Vapor 4、rc.4 Vapor 2、rc.11 T 1；重複 2 rc.4 Vapor 2、rc.4 T 1、
rc.9 Vapor 1、rc.11 Vapor 1；重複 3 rc.11 Vapor 4、rc.4 Vapor 3、3.5.40 2、rc.9 Vapor 2、rc.9 T 1。
集中在碰撞機率最高的小 N Vapor 條件，3.5.40 與 rc.9 也有發生，與 rc.9 報告 2.4 的機制一致。
（重複 1 有 2 次、重複 2 有 1 次需第 3 次 attempt；重複 3 全部第 2 次 attempt 成功。）

---

## Part 3 — Application Timing（Render Duration，ms，中位數，重複 1 / 重複 2 / 重複 3）

> 三次是 AC 供電下的獨立重複量測；數字不同屬正常量測波動，引用幅度時以範圍表示。

| Mount             | N=100           | N=500            | N=1000             | N=5000             |
| ----------------- | --------------- | ---------------- | ------------------ | ------------------ |
| 3.5.40            | 2.1 / 2.5 / 3.0 | 8.1 / 6.2 / 6.5  | 10.9 / 10.9 / 11.1 | 36.4 / 36.0 / 35.0 |
| rc.4 Traditional  | 1.9 / 1.9 / 1.9 | 8.6 / 8.3 / 10.3 | 13.4 / 14.5 / 12.2 | 45.7 / 35.0 / 33.9 |
| rc.4 Vapor        | 2.0 / 2.2 / 1.9 | 6.5 / 5.1 / 7.0  | 10.3 / 9.1 / 8.2   | 27.3 / 37.9 / 26.9 |
| rc.9 Traditional  | 1.8 / 2.5 / 1.9 | 9.5 / 8.1 / 7.5  | 13.4 / 11.1 / 11.4 | 41.7 / 37.4 / 35.5 |
| rc.9 Vapor        | 2.4 / 2.0 / 1.7 | 6.8 / 6.8 / 4.6  | 9.2 / 9.8 / 7.9    | 33.8 / 25.7 / 25.6 |
| rc.11 Traditional | 2.7 / 1.9 / 2.7 | 8.5 / 8.7 / 7.3  | 12.9 / 11.8 / 13.2 | 38.5 / 40.3 / 35.8 |
| rc.11 Vapor       | 2.6 / 2.4 / 2.0 | 6.1 / 6.9 / 6.2  | 9.0 / 9.3 / 8.1    | 28.4 / 29.3 / 23.6 |

| Update            | N=100             | N=500           | N=1000          | N=5000             |
| ----------------- | ----------------- | --------------- | --------------- | ------------------ |
| 3.5.40            | 0.9 / 0.9 / 1.0   | 1.9 / 1.9 / 2.2 | 3.0 / 3.0 / 3.4 | 12.1 / 12.4 / 11.4 |
| rc.4 Traditional  | 0.8 / 1.3 / 1.1   | 1.8 / 1.9 / 2.0 | 3.3 / 2.7 / 3.0 | 15.0 / 11.2 / 10.8 |
| rc.4 Vapor        | 1.3 / 1.2 / 0.9   | 2.0 / 2.1 / 2.5 | 3.3 / 4.2 / 3.9 | 15.1 / 12.8 / 12.7 |
| rc.9 Traditional  | 0.8 / 1.1 / 1.0   | 2.6 / 1.8 / 1.8 | 2.6 / 2.6 / 2.9 | 11.6 / 11.8 / 10.4 |
| rc.9 Vapor        | 0.9 / 1.1 / 0.8   | 3.4 / 2.8 / 2.7 | 3.7 / 3.8 / 3.5 | 11.8 / 14.5 / 11.1 |
| rc.11 Traditional | 0.9 / 1.1 / 2.3\* | 1.9 / 2.0 / 2.4 | 3.0 / 2.8 / 3.0 | 11.6 / 12.9 / 10.5 |
| rc.11 Vapor       | 2.4\* / 1.1 / 1.1 | 2.9 / 2.5 / 2.1 | 3.8 / 4.3 / 3.4 | 12.3 / 14.9 / 11.8 |

\* 區塊偏移（Part 9）。

跨重複重現的分類（Traditional → Vapor）：

- **Mount N=5000**：rc.11 −26.3% CI / −27.3% CI / −34% CI → **3/3 reproduced**；rc.9（同 session）
  −18.9% U / −31.2% CI / −28% CI（2/3）；rc.4 −40.4% CI / +8.1% U / −20.7% U。
- **Update N=1000**：rc.11 +27.1% CR / +55.4% CR / +15% U；rc.9 +42.3% CR / +46.2% CR / +19% U → 兩者皆 **2/3**
  （絕對差 0.7–1.5ms），與 rc.9 報告的觀察方向一致；rc.4 +3.1% U / +53.7% U / +33.9% CR。
- Update N=5000：rc.11 +6.0% U / +15.9% U / +11.9% U → 無改善。

---

## Part 4 — Chrome Performance Cost 與 Runtime Attribution（µs 中位數）

### 4.1 rc.11 Traditional → rc.11 Vapor（重複 1 ‖ 重複 2 ‖ 重複 3）

| Mount           | N=100                             | N=500                                   | N=1000                                  | N=5000                                  |
| --------------- | --------------------------------- | --------------------------------------- | --------------------------------------- | --------------------------------------- |
| Scripting       | −28% **CI** ‖ +2% U ‖ −38% **CI** | −40% **CI** ‖ −37% **CI** ‖ −40% **CI** | −44% **CI** ‖ −34% **CI** ‖ −49% **CI** | −42% **CI** ‖ −44% **CI** ‖ −50% **CI** |
| Rendering       | +10% U ‖ +14% U ‖ −26% CI         | +17% U ‖ −11% U ‖ +8% U                 | +9% U ‖ +4% U ‖ +10% U                  | +8% U ‖ +7% U ‖ −1.3% S                 |
| Layout          | +2% S ‖ +14% U ‖ −24% U           | +18% U ‖ −23% U ‖ +11% U                | +8% U ‖ +10% U ‖ +11% U                 | +9% U ‖ +3% U ‖ −1.6% S                 |
| Painting        | +20% U ‖ +37% U ‖ −35% U          | −12% U ‖ −23% U ‖ −5% U                 | +4% U ‖ −18% U ‖ −24% U                 | −9% U ‖ −8% U ‖ +16% U                  |
| Vue Runtime CPU | +20% U ‖ −13% U ‖ −30% U          | −48% U ‖ −52% **CI** ‖ −37% **CI**      | −49% **CI** ‖ −65% **CI** ‖ −57% **CI** | −69% **CI** ‖ −64% **CI** ‖ −62% **CI** |

| Update          | N=100                           | N=500                    | N=1000                    | N=5000                             |
| --------------- | ------------------------------- | ------------------------ | ------------------------- | ---------------------------------- |
| Scripting       | +117% CR\* ‖ −18% U ‖ −61% CI\* | −2% S ‖ −16% U ‖ −43% CI | −28% CI ‖ −15% U ‖ −36% U | −40% **CI** ‖ −38% U ‖ −37% **CI** |
| Rendering       | +147% CR\* ‖ +10% U ‖ −58% CI\* | +3% U ‖ −12% U ‖ −25% U  | +7% U ‖ −0.3% S ‖ +10% U  | +2% S ‖ −7% U ‖ +7% U              |
| Layout          | +152% CR\* ‖ +3% U ‖ −55% CI\*  | +2% S ‖ −14% U ‖ −17% U  | +29% U ‖ +6% U ‖ −7% U    | +2% S ‖ −4% U ‖ +10% U             |
| Painting        | +238% CR\* ‖ +24% U ‖ −60% CI\* | +14% U ‖ +21% U ‖ −12% U | −15% U ‖ −4% U ‖ +19% U   | +18% U ‖ +6% U ‖ +3% U             |
| Vue Runtime CPU | −70% U ‖ −100% U ‖ −69% U       | −8% U ‖ +17% U ‖ +14% U  | +27% U ‖ +76% CR ‖ +31% U | −25% U ‖ −7% U ‖ −23% U            |

\* Update N=100 區塊偏移（Part 9）：重複 1 是 Vapor 偏高（→ CR），重複 3 是 Traditional 偏高（→ CI），方向相反、都不是架構效應。

分類統計：重複 1 15 CI / 9 CR / 8 S / 48 U；重複 2 10 CI / 4 CR / 7 S / 59 U；重複 3 22 CI / 0 CR / 5 S / 53 U。

### 4.2 同 session 對照：rc.9 與 rc.4 Traditional → Vapor（Chrome 155）

- rc.9：12 / 14 / 24 CI、5 / 4 / 2 CR（重複 1 / 2 / 3）。3/3 重現 9 個 cell：Mount Scripting N=500/1000/5000、
  Mount Vue Runtime CPU N=500/1000/5000、**Update N=5000 Scripting −48% / −47% / −38% CI**、Mount N=5000 / Update N=5000
  Application CPU。Update N=1000 Render Duration CR 2/3。
- rc.4：12 / 12 / 18 CI、2 / 4 / 1 CR。3/3 重現 8 個 cell：Mount Scripting N=500/5000、Mount Vue Runtime CPU
  N=500/1000/5000、Application CPU；Update N=5000 Scripting −38% CI / −36% CI / −37% U（2/3）。

rc.11 的架構比較與 rc.9 / rc.4 同構（3/3 重現 cell：rc.11 8、rc.9 9、rc.4 8）。

**信心度注意（沿用既有方法論，未變）**：Vue Runtime CPU / Application CPU / V8-native CPU
依 `evidence.ts` 設計一律 `confidence: 'low'`（葉節點取樣，低估 inclusive 成本）。
方向性訊號可讀，精確數字不可讀。

---

## Part 5 — Cost Structure（Scripting / Rendering / Painting 佔三者總和，中位數）

| 條件              | Mount N=5000（重複 1 ‖ 2 ‖ 3）                    | Update N=5000（重複 1 ‖ 2 ‖ 3）                      |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------- |
| 3.5.40            | 27.4/70.1/2.5 ‖ 27.4/69.7/2.9 ‖ 26.7/70.5/2.8     | 68.7/17.7/13.6 ‖ 72.2/15.8/12.0 ‖ 70.6/16.4/12.9     |
| rc.4 Traditional  | 30.3/66.7/3.0 ‖ 26.4/70.9/2.7 ‖ 25.5/71.9/2.6     | 67.2/17.5/15.3 ‖ 70.5/16.8/12.7 ‖ 70.0/16.0/13.9     |
| rc.4 Vapor        | 17.9/79.1/3.0 ‖ 19.6/77.4/3.0 ‖ 17.1/79.8/3.1     | 59.9/22.8/17.2 ‖ 57.5/24.4/18.1 ‖ 55.5/25.8/18.7     |
| rc.9 Traditional  | 27.4/70.0/2.6 ‖ 28.4/69.1/2.5 ‖ 26.9/70.5/2.6     | 68.6/18.2/13.2 ‖ 73.4/14.5/12.1 ‖ 67.6/18.2/14.2     |
| rc.9 Vapor        | 19.0/78.3/2.7 ‖ 16.2/80.8/3.0 ‖ 17.0/80.0/2.9     | 55.0/25.5/19.5 ‖ 59.9/22.5/17.6 ‖ 54.1/27.0/18.8     |
| rc.11 Traditional | 28.6/68.7/2.8 ‖ 28.8/68.0/3.2 ‖ 27.3/70.0/2.8     | 68.5/17.5/13.9 ‖ 70.7/16.8/12.5 ‖ 68.1/18.5/13.4     |
| **rc.11 Vapor**   | **17.9/79.4/2.7 ‖ 17.6/79.1/3.3 ‖ 16.0/80.3/3.7** | **54.6/23.7/21.7 ‖ 60.0/21.6/18.3 ‖ 56.3/25.8/17.9** |

### Update N=5000：rc.11 Traditional vs rc.11 Vapor（必答）

| 指標                       | 重複 1（T → V）              | 重複 2（T → V）             | 重複 3（T → V）              | 跨重複                         |
| -------------------------- | ---------------------------- | --------------------------- | ---------------------------- | ------------------------------ |
| Scripting absolute         | 20,976 → 12,594µs，−40.0% CI | 25,038 → 15,414µs，−38.4% U | 18,991 → 12,029µs，−36.7% CI | **2/3 CI**，方向 3/3           |
| Scripting share            | 68.5% → 54.6%                | 70.7% → 60.0%               | 68.1% → 56.3%                | 三次皆下降 11–14 pt            |
| Rendering absolute         | 5,369 → 5,460µs，+1.7% S     | 5,951 → 5,553µs，−6.7% U    | 5,172 → 5,525µs，+6.8% U     | 不變（±7%，無 Consistent）     |
| Painting absolute          | 4,267 → 5,016µs，+17.6% U    | 4,446 → 4,702µs，+5.8% U    | 3,730 → 3,830µs，+2.7% U     | 同方向（+），皆非 Consistent   |
| Total main-thread（S+R+P） | 30,611 → 23,069µs（−24.6%）  | 35,435 → 25,669µs（−27.6%） | 27,892 → 21,384µs（−23.3%）  | 同方向（中位數之和，未另分類） |

Mount N=5000 總和（T → V）：rc.11 −6.9% / −8.5% / −13.9%；rc.9 −3.5% / −5.5% / −9.6%；rc.4 −17.8% / +14.3% / −10.5%。

---

## Part 6 — Version Effect、Browser Drift 與跨重複重現性

### 6.1 跨重複重現性（三次 run，`compare-day29-runs.ts` 兩兩比較 + 三次合併）

`3/3` = 三次皆同方向 Consistent；`2/3` = 兩次同方向 Consistent、第三次非 Consistent（無反向 Consistent）；
`±` = 三次中同時出現 CI 與 CR。兩兩比較的 `reproduced` 定義同 rc.9 報告 6.1。

| 比較                                 |   3/3 | 2/3 |   ± | reproduced（1v2 / 2v3 / 1v3） | 備註                                                       |
| ------------------------------------ | ----: | --: | --: | ----------------------------- | ---------------------------------------------------------- |
| rc.11 Traditional → rc.11 Vapor      | **8** |   4 |   7 | 9 / 9 / 10                    | 7 個 ± 全是 Update N=100（Part 9 的兩個偏移區塊）          |
| rc.9 Traditional → rc.9 Vapor        | **9** |   8 |   1 | 10 / 15 / 10                  |                                                            |
| rc.4 Traditional → rc.4 Vapor        | **8** |   3 |   1 | 9 / 10 / 8                    |                                                            |
| rc.9 Traditional → rc.11 Traditional | **0** |   1 |   0 | 0 / 0 / 1                     | 2/3：Update N=100 Vue Runtime CPU（Part 9）                |
| rc.9 Vapor → rc.11 Vapor             | **0** |   5 |   0 | 0 / 1 / 4                     | 2/3 全在 N=100（Part 9）                                   |
| 3.5.40 → rc.11 Traditional           | **0** |   0 |   0 | 0 / 0 / 0                     |                                                            |
| 3.5.40 → rc.9 Traditional            | **0** |   0 |   0 | 0 / 0 / 0                     |                                                            |
| rc.4 Traditional → rc.9 Traditional  | **0** |   1 |   0 | 1 / 0 / 0                     | 2/3：Mount N=500 Vue Runtime CPU（+22% / +44% CR / −9% U） |

rc.11 架構比較 **3/3 重現**的 8 個 cell：Mount Scripting N=500/1000/5000（−34% 至 −50%）、
Mount Vue Runtime CPU N=1000/5000（−49% 至 −69%）、Mount N=5000 Render Duration（−26% 至 −34%）、
Mount N=5000 / Update N=5000 Application CPU。2/3：Update N=5000 Scripting、Update N=1000 Render Duration（CR）、
Mount N=100 Scripting、Mount N=500 Vue Runtime CPU。

**分類器的單次 false-positive 程度**（與 rc.9 報告結論一致）：沒有可重現差異的版本比較中，單次 run 仍可出現
0–5 個 Consistent cell；重複 3 的 rc.9 → rc.11 Traditional 有 18 個，其中 13 個在 N=100（Part 9 的偏移區塊），
N≥500 的 5 個（例：Update N=500 Painting +36% CR）在重複 1 / 2 皆未出現。

### 6.2 Version effect（同 session、同 Chrome 155）

各次 Consistent cell 數（CI / CR，重複 1 ‖ 2 ‖ 3）：

| 比較                                 | 重複 1 | 重複 2 | 重複 3 | 3/3 重現 |
| ------------------------------------ | ------ | ------ | ------ | -------: |
| rc.9 Traditional → rc.11 Traditional | 0 / 1  | 0 / 0  | 2 / 16 |        0 |
| rc.9 Vapor → rc.11 Vapor             | 2 / 8  | 0 / 1  | 1 / 5  |        0 |
| 3.5.40 → rc.11 Traditional           | 0 / 2  | 1 / 2  | 3 / 11 |        0 |
| 3.5.40 → rc.9 Traditional            | 2 / 1  | 0 / 2  | 0 / 0  |        0 |
| rc.4 Traditional → rc.9 Traditional  | 3 / 1  | 0 / 1  | 4 / 0  |        0 |

- **N≥500**：rc.9 → rc.11（Traditional 與 Vapor）、3.5.40 → rc.11 在三次 run 中**沒有任何一個 cell 重現兩次以上**。
- **N=100**：rc.11 的 CR 集中在重複 1（Vapor）與重複 3（Traditional）的偏移區塊，以及 N=100 Vue Runtime CPU（Part 9）。

### 6.3 Browser / session drift（同 Vue 版本，rc.9 Freeze Point 重複 1〔Chrome 153〕vs 今日〔Chrome 155〕）

| 條件             | 重複 1 / 2 / 3（CI / CR） | 代表 cell（重複 1）                                            |
| ---------------- | ------------------------- | -------------------------------------------------------------- |
| 3.5.40           | 2/2 ‖ 0/1 ‖ 3/2           | Update N=5000 Scripting −1.8% S；Mount N=5000 Scripting +11% U |
| rc.9 Traditional | 4/1 ‖ 0/3 ‖ 1/1           | Update N=5000 Scripting +15% U；Mount N=5000 Scripting +4.0% U |
| rc.9 Vapor       | 0/6 ‖ 0/4 ‖ 6/2           | Update N=5000 Scripting +2.8% S；Mount N=5000 Scripting +24% U |

Chrome 153 → 155、電源模式不同、隔 17 天，同版本的差異**遠小於** rc.9 報告中 8 月 → 9 月的 drift
（該次 rc.4 Traditional 48 CI）。跨 session 絕對值大致可比，但仍以同 session 對照為準。

---

## Part 7 — Evidence Matrix

| Comparison                             | Result                                                                                                                                                                                        | Evidence strength                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| rc.11 Traditional vs previous baseline | 對 rc.9 Traditional 與 3.5.40（同 session）：三次 run **0 個 3/3**；N≥500 沒有任何 cell 重現兩次以上。**Not reproduced**。N=100 有 2/3 的 Vue Runtime CPU 偏高（Part 9）                      | 對「N≥500 無可重現差異」：強（3 次獨立 run × 2 個基準）；N=100：observed，機制未建立                    |
| rc.11 Traditional vs rc.11 Vapor       | 8 cells 3/3 重現；與 rc.9（9）、rc.4（8）同 session 架構比較同構 → **reproduced**（跨 3 次 run、跨 3 個 RC）、**stable**                                                                      | 強（方向）；Vue Runtime CPU 數值為低信心 bucket                                                         |
| Mount                                  | Scripting −34% 至 −50%（N=500/1000/5000，3/3）；Vue Runtime CPU −49% 至 −69%（N=1000/5000，3/3）；Rendering/Layout 未下降（N=5000 −1.6%～+9%）；N=5000 Render Duration −26% 至 −34%（3/3 CI） | 強                                                                                                      |
| Update                                 | Scripting 下降（N=5000 −37% 至 −40%，2/3 CI）；Render Duration 無改善，N=1000 Vapor 較慢（+15%～+55%，2/3 CR）；Browser 指標 Unstable                                                         | Scripting 方向：強；wall-clock 無改善：強；N=1000 CR：observed（2/3，跨 RC），mechanism not established |
| N=5000 Update                          | Scripting −37% 至 −40%；S+R+P −23% 至 −28%；Render Duration +6% 至 +16%（皆 U）                                                                                                               | Scripting 方向：強（rc.9 同 session 3/3 CI）                                                            |
| Vue Runtime CPU                        | Mount：N=1000/5000 3/3、N=500 2/3。Update：無重現的下降（N=5000 −7% 至 −25%，U）。版本效應：N=100 rc.11 偏高 2/3（Part 9）                                                                    | Mount：方向強、數字低信心；Update：無證據                                                               |
| Scripting                              | Vapor < Traditional，跨重複、跨 RC 重現（Mount N≥500）；rc.9 → rc.11 本身 N≥500 無可重現差異                                                                                                  | 強（cost-trace 指標，信心高於 attribution bucket）                                                      |
| Browser Rendering                      | Vapor 未降低 Rendering / Layout / Recalc（Mount N=5000：+8% U / +7% U / −1.3% S）；Update N=5000 Rendering 不變；rc.9 → rc.11 無可重現變化                                                    | Mount 不下降：強；Update：不足                                                                          |

---

## Part 8 — 必答問題

### 1. rc.11 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 同 session 對 rc.9 Traditional 與 3.5.40，三次獨立 run **沒有任何改善方向的 cell 重現兩次以上**。
單次出現的 CI（重複 3 的 Application CPU Update N=5000 −29%、V8/native Mount N=5000 −24% 等）在另兩次皆未重現。

### 2. rc.11 Vapor 是否仍然降低 Framework / Scripting cost？

**是，3 次 run 皆重現，且與 rc.9 / rc.4 同構。** Mount Scripting N=500/1000/5000 三次皆 CI（−34% 至 −50%）；
Mount Vue Runtime CPU N=1000/5000 三次皆 CI（−49% 至 −69%）。Update N=5000 Scripting −37% 至 −40%（2/3 CI，方向 3/3）。

### 3. Update 是否在較大 Node Count 下出現更明顯改善？

**只有 Scripting，且集中在 N=5000**（rc.11：−40% / −38% / −37%；同 session rc.9 −48% / −47% / −38%，3/3 CI）。
N=500/1000 的 Scripting 下降幅度較小且不穩定。wall-clock Render Duration 在 Update **沒有**改善：
N=5000 +6% 至 +16%（U）；N=1000 Vapor 較慢（2/3 CR）。Update Vue Runtime CPU 在任何 N 皆無可重現的下降。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

rc.11 Vapor，Mount N=5000：Rendering 119,220–131,479µs（Layout 89,673–94,658）＋ Painting
4,316–5,521µs → Browser 側佔 S+R+P 的 **82.1% / 82.4% / 84.0%**（重複 1 / 2 / 3）。Vapor 沒有降低這部分
（Traditional 同條件 Rendering 116,414–123,474µs）。

Update N=5000：Rendering 5,460–5,553µs ＋ Painting 3,830–5,016µs → 佔 **45.4% / 40.0% / 43.7%**。

### 5. rc.11 是否改變原本 rc.9 Vapor 的結論？

**在 N≥500 沒有。** rc.9 Vapor → rc.11 Vapor 三次 run 0 個 3/3、N≥500 沒有任何 cell 重現兩次以上；rc.11 的架構比較與
rc.9 同構（Mount Scripting / Vue Runtime CPU 下降、Browser Rendering 不降、Update N=1000 Render Duration 變慢）。
**新增一項 observed**：rc.11 在 N=100 的區塊偏移與 Vue Runtime CPU 偏高（2/3），未建立機制（Part 9）。

| rc.9 報告結論                                    | 本 session（rc.11，Chrome 155，3 次 run）                    |
| ------------------------------------------------ | ------------------------------------------------------------ |
| Traditional 無可重現 Framework-level 改善        | **Reproduced**（rc.9 → rc.11、3.5.40 → rc.11 皆 0 個 3/3）   |
| Mount Vue Runtime CPU 下降（rc.9 4/4 N 兩次 CI） | **Reproduced**（N=1000/5000 3/3；N=500 2/3；N=100 未重現）   |
| Mount Scripting 下降（N=1000/5000 兩次 CI）      | **Reproduced**（N=500/1000/5000 3/3）                        |
| Update N=5000 Scripting −31% 至 −42%（兩次 CI）  | 方向 reproduced（−37% 至 −40%），2/3 CI                      |
| Update N=1000 Render Duration CR（reproduced）   | 2/3（rc.11 +27% / +55% CR / +15% U；同 session rc.9 亦 2/3） |
| Mount N=5000 Browser Rendering/Layout 不降       | **Reproduced**                                               |
| Browser 側佔 Mount N=5000 S+R+P 82.6% / 84.6%    | 82.1% / 82.4% / 84.0%                                        |

### 6. 哪些結果可以歸因？

- **架構（Traditional → Vapor）→ Mount 的 Vue Runtime CPU 與 Scripting 下降**：3 次 run、3 個 RC、
  同 Scenario，唯一變因為 Vapor 編譯模式 → 可歸因到架構（Vue Runtime CPU 歸因的是方向）。
- **架構 → Update N=5000 Scripting 下降**：rc.9 同 session 3/3 CI、rc.4 與 rc.11 2/3 → 可歸因到架構，JS 層級。
- **Vapor 不降低 Mount 的 Browser Rendering/Layout**：可歸因——DOM 結構相同，Browser 工作量相同。
- **rc.9 → rc.11 在 N≥500 無可重現差異**：版本效應在本 Scenario 下 not observed（Traditional 與 Vapor 皆是）。
- **CDP timeout**：可歸因到 harness 的完成判定與 0.1ms 量化碰撞，與 Vue 無關（rc.9 報告 2.4）。

### 7. 哪些結果只能描述為 observed difference？

- Vapor Update N=1000 Render Duration 較慢（rc.11 / rc.9 同 session 皆 2/3 CR，+0.4～1.5ms）——
  **observed（跨 RC、跨 session），mechanism not established**。
- **rc.11 N=100 的區塊偏移與 Vue Runtime CPU 偏高**（3 次中 2 次，Part 9）——**observed, partially reproduced,
  mechanism not established**；不足以歸因到 rc.11，也不足以排除。
- rc.4 Traditional → rc.9 Traditional Mount N=500 Vue Runtime CPU +22% / +44% CR / −9% U（2/3，低信心 bucket）。
- 所有只在單次 run 出現的 Consistent cell。

### 8. 哪些結果仍然無法解釋？

- **為何 Vapor 降低 Update Scripting，但 Update wall-clock Render Duration 沒有下降**（N=1000
  多數 run 變慢）。`renderDuration` 以頁面內 `nextTick()` 量測，與 trace 的 main-thread 成本量測窗口不同；
  本 pipeline 無法在兩者之間做歸因（與 rc.9 報告相同，未解決）。
- **rc.11 N=100 區塊偏移的來源**（Part 9）：只出現在 rc.11、只在 N=100 Update，同一個 Chrome instance 的
  Mount 未偏移；是版本相關的 bimodal 行為還是巧合，現有資料無法區分。

---

## Part 9 — rc.11 N=100 區塊偏移（三次 run 掃描）

一個「區塊」= 一個條件、一個 N 的一個 Chrome instance 內的 10 個 measurement trial。
對 3 次 run × 7 條件 × 4 個 N × Mount/Update（168 個區塊）逐一比較 Render Duration 中位數與
「同條件三次 run 的中位數」，偏離 ×1.6 以上的只有 2 個：

| 區塊                                  | 該區塊中位數 | 同條件三次中位數 |  倍率 | 10 個 trial（ms）                       |
| ------------------------------------- | -----------: | ---------------: | ----: | --------------------------------------- |
| 重複 1 rc.11 Vapor Update N=100       |       2.40ms |           1.05ms | ×2.29 | 2.7 1.9 1.9 3.3 3.0 2.1 1.8 2.7 2.8 2.0 |
| 重複 3 rc.11 Traditional Update N=100 |       2.25ms |           1.05ms | ×2.14 | 2.2 2.5 2.3 1.9 2.0 2.8 1.8 2.5 3.0 1.7 |

- 兩個都是 **rc.11、N=100、Update**，整個區塊 10 個 trial 一致偏移，所有 Browser 指標同步上升（+112%～+238%）；
  同一個 Chrome instance 的 Mount N=100 Render Duration 未偏移。
- 其他 5 個條件 × 3 次 run 的 N=100 Update 區塊（15 個）沒有一個偏移；rc.11 的 6 個 N=100 Update 區塊中 2 個偏移。
- rc.11 N=100 的 **Vue Runtime CPU**（runtime-attribution-trace，與 cost-trace 是不同次執行）在 3 次中有 2 次明顯偏高：

| 比較（Vue Runtime CPU 中位數，µs）    | 重複 1         | 重複 2        | 重複 3           |
| ------------------------------------- | -------------- | ------------- | ---------------- |
| rc.9 T → rc.11 T，Mount N=100         | 1,398 → 2,845  | 1,713 → 1,128 | 1,066 → 4,521 CR |
| rc.9 T → rc.11 T，Update N=100        | 363 → 1,441 CR | 280 → 388     | 211 → 1,353 CR   |
| rc.9 V → rc.11 V，Mount N=100         | 681 → 3,411 CR | 862 → 976     | 482 → 3,185 CR   |
| rc.9 V → rc.11 V，Mount N=500（對照） | 3,749 → 4,345  | 3,922 → 4,631 | 3,627 → 4,338    |

N≥500 沒有任何一次出現同樣的偏高。

判讀：**Observed, partially reproduced（2/3），mechanism not established.** 若偏移與版本無關、隨機落在
N=100 Update 的 21 個區塊上，兩個都落在 rc.11 的 6 個區塊上的機率約 7%（6/21 × 5/20）——不足以排除巧合，
也不足以歸因到 rc.11。可能的方向（未驗證）：小 N 時 Vue Runtime 工作量很小，per-instance 的 JIT tier-up 或
排程差異佔比大。釐清需要針對 N=100 用更多 Chrome instance（例如 rc.9 / rc.11 各 10 個 instance）追加量測；
本報告不做，也不據此修改 Final Conclusion。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** 在 rc.11 Freeze Point：Traditional Runtime 相對 rc.9 與 3.5.40
   **沒有可重現的 Framework-level 改善**（3 次獨立 run，0 個 3/3 cell；N≥500 沒有任何 cell 重現兩次以上）。
   Vapor（不同的 Rendering Architecture）在 rc.11 仍降低 Mount 的 Vue Runtime CPU 與 Scripting（3/3），以及
   Update N=5000 的 Scripting（2/3 CI、方向 3/3）；結論與 rc.9 / rc.4 相同。rc.11 在 N=100 有 2/3 run 出現的
   區塊偏移與 Vue Runtime CPU 偏高，屬 observed、mechanism not established（Part 9）。
2. **改善到什麼程度？** Traditional rc.11：No measurable improvement。Vapor vs Traditional：
   Mount Scripting −34% 至 −50%（N≥500）、Vue Runtime CPU −49% 至 −69%（N≥1000，方向）；Update N=5000
   Scripting −37% 至 −40%；Update wall-clock：No measurable improvement；Browser Rendering：不變。
3. **還需要工程改善嗎？** 是。Mount N=5000 時 Browser 側（Layout 為主）在 Vapor 下佔 main-thread
   成本約 82–84%——這部分由 DOM 數量與 CSS/Layout 決定，Vue（含 Vapor）無法移除，屬 Component
   Architecture / 虛擬化 / 分批渲染 等應用層決策。

---

## Limitations

- 3 次有效獨立重複量測（同一天），每次 10 measurement trials；重複 3 是在看過重複 1 / 2 的結果後追加。
- 條件執行順序固定（每個 N 內 3.5.40 → rc.4 T → rc.4 V → rc.9 T → rc.9 V → rc.11 T → rc.11 V），未做順序反轉。
- rc.11 N=100 的區塊偏移（Part 9）只以既有 protocol 觀察到，未做針對性追加量測。
- rc.10 未量測（Version Change only）。
- Chrome 155 與 rc.9 Freeze Point 的 Chrome 153 不同、電源模式亦不同，跨 session 絕對值不可直接比較。
- 量測期間有使用者背景程式在執行，未隔離。
- Vue Runtime CPU / Application CPU 為低信心 bucket（既有方法論）。
- CDP completion 判定有已知的量化碰撞（rc.9 報告 2.4），靠 retry 補足，未修正（Freeze Rule）。
- 只驗證 `vdom-stress`；Component Storm / Composable Chaos 的 Vapor 表現未評估。

---

## Files generated

新增（主 repo，未 commit）：

- `results/cdp-trace/vdom-stress/DAY29_FINAL_VALIDATION_REPORT_rc11.md`（本報告）
- `scripts/cdp-trace/run-day29-final-rc11.ts` — 由 `run-day29-final-rc9.ts` 複製，只改 label、worktree、port
  （預設 `RUN_SUFFIX` 為 `-run2`，與 rc.9 的 Run 編號一致）；保留 AC 電源 pre-flight 與「目錄已存在即拒絕」
- `scripts/cdp-trace/analyze-day29-final-rc11.ts` — 由 `analyze-day29-final-rc9.ts` 複製，只改
  `HISTORICAL_LABELS` / `COMPARISONS` / `COST_STRUCTURE_LABELS`；`classify()` 門檻、paired-trial 定義、metrics 清單不動
- `results/cdp-trace/validation/day29-final-rc11-run1-analysis.json`、`-run2-analysis.json`、`-run3-analysis.json`
- `results/cdp-trace/validation/day29-final-rc11-run1-vs-run2.json`、`-run2-vs-run3.json`、`-run1-vs-run3.json`
- Raw（gitignored）：
  - 有效：7 條件 × `-run1` / `-run2` / `-run3`（21 × 320 檔）
  - 前置檢查：`vue-3.6.0-rc.11-vapor-smoke/`、`vue-3.5.40-chrome155-probe-ac/`

新增 worktree（`d3991df`，未 commit）：`vue-pain-lab-vue36rc11-trad`、`vue-pain-lab-vue36rc11-vapor`
（含與 rc.4 / rc.9 相同的 Vapor patch）。

未修改：`DAY29_FINAL_VALIDATION_REPORT.md`、`DAY29_FINAL_VALIDATION_REPORT_rc9.md`、所有 rc.9 / rc.4 /
rc.2 / 3.5.40 既有 raw 資料與 analysis JSON、Scenario、量測 pipeline、既有 worktree、主 repo 的
`package.json`（仍為 `vue: 3.5.40`）。

## Commands executed

```bash
# 版本確認
npm view vue dist-tags --json                      # rc = 3.6.0-rc.11
npm view vue versions --json                       # 3.6.0-rc.10、3.6.0-rc.11 皆存在
git ls-remote https://github.com/vuejs/core refs/tags/v3.6.0-rc.11 refs/tags/v3.6.0-rc.10

# 環境
git worktree add ../vue-pain-lab-vue36rc11-trad  d3991df --detach
git worktree add ../vue-pain-lab-vue36rc11-vapor d3991df --detach
(rc11 x2) cp ../vue-pain-lab-vue36rc9-trad/package{,-lock}.json . && npm install vue@3.6.0-rc.11 --save-exact
(rc11-vapor) git apply <rc.9 vapor worktree 的 vite.config.ts + src/main.ts diff>
(each worktree) git diff --quiet d3991df -- src/scenarios src/benchmarks
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5180> --strictPort   # 每次 run 前各啟動一次
taskkill /PID <pid> /T /F                                                             # 每次 run 後，逐一終止 7 個 dev server PID

# 前置檢查
node <precheck>  # runVersionNodeCount(rc.11 vapor, N=100, mount) → vue-3.6.0-rc.11-vapor-smoke
                 # runVersionNodeCount(3.5.40, N=5000)            → vue-3.5.40-chrome155-probe-ac

# 量測
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-day29-final-rc11.ts   # 重複 1（AC）
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-day29-final-rc11.ts   # 重複 2（AC）
RUN_SUFFIX=-run3 node scripts/cdp-trace/run-day29-final-rc11.ts   # 重複 3（AC，追加再現性驗證）

# 分析
node scripts/cdp-trace/analyze-day29-final-rc11.ts -runN > .../day29-final-rc11-runN-analysis.json   # N = 1, 2, 3
node scripts/cdp-trace/compare-day29-runs.ts .../rc11-run1-analysis.json .../rc11-run2-analysis.json > .../day29-final-rc11-run1-vs-run2.json
node scripts/cdp-trace/compare-day29-runs.ts .../rc11-run2-analysis.json .../rc11-run3-analysis.json > .../day29-final-rc11-run2-vs-run3.json
node scripts/cdp-trace/compare-day29-runs.ts .../rc11-run1-analysis.json .../rc11-run3-analysis.json > .../day29-final-rc11-run1-vs-run3.json
```
