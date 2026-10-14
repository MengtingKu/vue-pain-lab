---
name: load-data
description: 把已量測完的 CDP 驗證結果導入 /compare 對比頁：用既有 analyze 腳本產出 analysis JSON 到 results/cdp-trace/validation/、確認選單顯示名稱、跑 build 校驗。使用者說「load-data」、「導入新版本數據」，或 validate-vue-update 完成後使用。新版本（例如 rc.10）的量測與 analyze 腳本由 validate-vue-update 負責。
user-invocable: true
---

# load-data：導入新一批 CDP 驗證數據

對比頁（`/compare`）的數據全部來自 `results/cdp-trace/validation/*-runN-analysis.json`，由 `src/data/telemetry.ts` 以 `import.meta.glob` 讀取。這個流程只負責「用既有的 analyze 腳本，把已經量測完的 trace 變成對比頁讀得到的 analysis 檔」。

不在這裡做的事（屬於 `validate-vue-update`）：量測、新版本的 worktree、新增或修改 analyze 腳本、寫 validation report。D29 Final Validation 的 Phase 6 會呼叫這個 skill；若 Phase 4 已經產出 analysis 檔，直接從步驟 2 開始。

## 0. 先確認，不要猜

開始前向使用者確認（對話裡已經說清楚的就不用再問）：

- **哪個 scenario、第幾次 Run**（例如 VDOM Stress、run4）。
- **量測時是否插電（AC power）。** 筆電用電池或省電模式跑的數據會出現 2–5 倍的假回歸；沒插電的 run 一律當成無效數據（見步驟 1 的 INVALID 命名）。
- **這次有沒有新版本**（例如第一次量 rc.10）。有的話，既有 analyze 腳本認不得新版本標籤：停下來，改走 `validate-vue-update`（`/validate-vue-update 3.6.0-rc.10`），由它的 Phase 4 新增 analyze 腳本。

再確認 raw trace 真的存在：每個 analyze 腳本的 `join(...)` 寫了它讀哪個目錄（例如 VDOM Stress 是 `results/cdp-trace/vdom-stress/vue-<label>/<operation>-<n>/trial-NN/`，其他 scenario 是 `results/cdp-trace/<scenario>/vue-<label>/…`）。目錄或 trial 數不齊就停下來回報，不要產出殘缺的 analysis。

## 1. 產出 analysis JSON（不是複製）

analyze 腳本把結果印到 stdout，沒有另外的「輸出目錄」可以撈。直接導向到 validation 目錄：

| Scenario         | 腳本                                                                                                                                                           | 指令                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| VDOM Stress      | 最新 Freeze Point 的 `analyze-day29-final-<rc>.ts`（`<rc>` 以 `results/cdp-trace/vdom-stress/` 下 RC 編號最大的 `DAY29_FINAL_VALIDATION_REPORT_<rc>.md` 為準） | `node scripts/cdp-trace/analyze-day29-final-<rc>.ts -runN > results/cdp-trace/validation/day29-final-<rc>-runN-analysis.json`                       |
| Component Storm  | 最新 Freeze Point 的 `analyze-component-storm-vapor-<rc>.ts`（目前 `-rc11`；rc.9 為無後綴的 `analyze-component-storm-vapor.ts`）                               | `node scripts/cdp-trace/analyze-component-storm-vapor-<rc>.ts -runN > results/cdp-trace/validation/component-storm-vapor-<rc>-runN-analysis.json`   |
| Composable Chaos | 最新 Freeze Point 的 `analyze-composable-chaos-vapor-<rc>.ts`（目前 `-rc11`；rc.9 為無後綴的 `analyze-composable-chaos-vapor.ts`）                             | `node scripts/cdp-trace/analyze-composable-chaos-vapor-<rc>.ts -runN > results/cdp-trace/validation/composable-chaos-vapor-<rc>-runN-analysis.json` |
| Reactive Chain   | 最新 Freeze Point 的 `analyze-reactive-chain-vapor-<rc>.ts`（目前 `-rc11`；rc.9 為無後綴的 `analyze-reactive-chain-vapor.ts`）                                 | `node scripts/cdp-trace/analyze-reactive-chain-vapor-<rc>.ts -runN > results/cdp-trace/validation/reactive-chain-vapor-<rc>-runN-analysis.json`     |

規則：

- **不覆寫既有檔案。** 目標檔已存在就停下來問。
- **無效的 run 檔名要帶 `INVALID`**（例如 `day29-final-rc9-run5-battery-INVALID-analysis.json`）：保留紀錄，但 glob 會排除，不會上對比頁。
- 命令失敗或輸出不是 JSON 時，刪掉剛產生的空檔／殘檔再回報。

每支 analyze 腳本的版本標籤與比較組合是寫死的；這裡**不修改** analyze 腳本。需要改，就是新版本驗證，回到 `validate-vue-update`。

## 2. 檢查命名

`telemetry.ts` 只收 `*-runN-analysis.json`，再用檔名開頭的**場景關鍵字**（`SCENARIOS` 陣列，例如 `vdom-stress`、`day29-final`、`component-storm`）對應成「場景名稱 - Run N」；版本號（rc9、rc10、vapor）不影響比對。**同場景、同 Run N 的檔案會合成一個 dataset**（例如 `day29-final-rc9-run2` + `day29-final-rc11-run2` → `VDOM Stress Test - Run 2`），A / B 選單列出所有檔案的版本聯集，所以新一輪量測的 Run 編號要和前一輪一致（見 `validate-vue-update` Phase 3）。認不得的前綴會退回 Title Case 顯示，不會從選單消失，也不會和別的檔案誤合併。

用這個指令列出選單會看到的名稱、合併了哪些檔、預設帶入的 A / B，以及 A / B 選單的分組（一組 = 一個量測批次，例如「Chrome 155 · run2」），並確認每份都解析得出來：

```bash
node --input-type=module -e "import { createServer } from 'vite'; const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' }); const t = await s.ssrLoadModule('/src/data/telemetry.ts'); for (const d of t.listDatasets()) { const ds = await t.loadDataset(d.id); console.log((ds ? 'OK ' : 'BAD') + '  ' + d.title.padEnd(30) + d.id + (ds ? '  versions=' + ds.versions.length + '  sources=' + ds.sources.join(',') + '  default=' + ds.defaultPair?.a + ' vs ' + ds.defaultPair?.b : '')); if (ds) for (const g of t.groupVersions(ds.versions)) console.log('       [' + g.title + '] ' + g.versions.map((v) => v.name).join(' | ')) } await s.close()"
```

- 新檔顯示成 fallback 名稱（例如 `Huge Table Vapor - Run 1`）→ 這是新 scenario，在 `SCENARIOS` 加一筆關鍵字；只加場景名稱，不要把版本或對比關係寫進名稱。
- 出現 `BAD` → 格式不是 analyze 輸出（沒有 `comparisons`），找出原因，不要靠改 `telemetry.ts` 硬吃。
- 偶爾會出現 `transport invoke timed out after 60000ms`（Vite SSR 讀大型 JSON 逾時），與資料無關，重跑一次即可；連續失敗才當成問題處理。
- 新的 Freeze Point 檔案裡會帶著前一個 Freeze Point 的原始 label（等價檢查用，例如 rc.11 的 Run 3 會多一組「Chrome 153 · run2」），這是預期的，不要刪。
- 預設的 A / B 應該是最新 Freeze Point 的 Traditional vs Vapor（`defaultPair` 取 `generatedAt` 最新的檔的第一組 comparison）；不是的話，檢查新 analyze 腳本的 `COMPARISONS` 第一組是否為 `arch-<rc>`，以及是否重新產生過舊的 analysis 檔（會讓舊檔變成「最新」）。
- 同一 Run 的不同 Chrome session 應分成不同組。某個 scenario 的 analysis 沒有 `browserVersions`、標籤也沒有 `-chrome<major>` 時，不同 session 會被併成同一組（跨批次警告會失準）；Composable Chaos 的 meta 不記錄 Chrome 版本，見 `analyze-composable-chaos-vapor-rc11.ts` 的做法。
- 分組標題出現兩個相同名稱、或某個版本顯示成完整 label（沒被縮成「3.6.0-rc.11 · Vapor」），代表 label 格式和 `telemetry.ts` 的 `VERSION_PATTERN` 不符，回報再決定要不要改。
- 檢查新檔內的版本標籤都帶 `-runN`：對比頁用 `-runN` + Chrome 版本判斷「同一批次」，沒帶的標籤會被當成 baseline，跨 run 警告會失準。

## 3. 校驗

```bash
npm run build
```

`build` 會並行跑 `vue-tsc` 型別檢查與 Vite 打包。確認：

- 沒有型別或打包錯誤。
- 輸出的 chunk 清單裡有新的 `<名稱>-analysis-*.js`，而且沒有任何 `INVALID` 或 `matrix-analysis` chunk。

## 4. 回報

告訴使用者：

- 新增了哪些 analysis 檔、對比頁選單上的名稱。
- 新檔的版本清單，以及哪些標籤沒有 `-runN`（會被當成 baseline）。
- build 結果。
- 提醒：分析結論（signal）要和該 scenario 的 validation report 對得上；這個流程不寫報告、不 commit（commit 用 `git-commit` skill）。
