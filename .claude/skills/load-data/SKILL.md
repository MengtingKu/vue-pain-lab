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

再確認 raw trace 真的存在：每個 analyze 腳本的 `join(...)` 寫了它讀哪個目錄（例如 `results/cdp-trace/vue-<label>/<operation>-<n>/trial-NN/`）。目錄或 trial 數不齊就停下來回報，不要產出殘缺的 analysis。

## 1. 產出 analysis JSON（不是複製）

analyze 腳本把結果印到 stdout，沒有另外的「輸出目錄」可以撈。直接導向到 validation 目錄：

| Scenario | 腳本 | 指令 |
| --- | --- | --- |
| VDOM Stress | 最新 Freeze Point 的 `analyze-day29-final-<rc>.ts`（目前 `rc9`） | `node scripts/cdp-trace/analyze-day29-final-<rc>.ts -runN > results/cdp-trace/validation/day29-final-<rc>-runN-analysis.json` |
| Component Storm | `analyze-component-storm-vapor.ts` | `node scripts/cdp-trace/analyze-component-storm-vapor.ts -runN > results/cdp-trace/validation/component-storm-vapor-runN-analysis.json` |
| Composable Chaos | `analyze-composable-chaos-vapor.ts` | `node scripts/cdp-trace/analyze-composable-chaos-vapor.ts -runN > results/cdp-trace/validation/composable-chaos-vapor-runN-analysis.json` |
| Reactive Chain | `analyze-reactive-chain-vapor.ts` | `node scripts/cdp-trace/analyze-reactive-chain-vapor.ts -runN > results/cdp-trace/validation/reactive-chain-vapor-runN-analysis.json` |

規則：

- **不覆寫既有檔案。** 目標檔已存在就停下來問。
- **無效的 run 檔名要帶 `INVALID`**（例如 `day29-final-rc9-run5-battery-INVALID-analysis.json`）：保留紀錄，但 glob 會排除，不會上對比頁。
- 命令失敗或輸出不是 JSON 時，刪掉剛產生的空檔／殘檔再回報。

每支 analyze 腳本的版本標籤與比較組合是寫死的；這裡**不修改** analyze 腳本。需要改，就是新版本驗證，回到 `validate-vue-update`。

## 2. 檢查命名

`telemetry.ts` 只收 `*-runN-analysis.json`，再用檔名開頭的**場景關鍵字**（`SCENARIOS` 陣列，例如 `vdom-stress`、`day29-final`、`component-storm`）對應成「場景名稱 - Run N」；版本號（rc9、rc10、vapor）不影響比對。認不得的前綴會退回 Title Case 顯示，不會從選單消失。

用這個指令列出選單會看到的名稱，並確認每份都解析得出來：

```bash
node --input-type=module -e "import { createServer } from 'vite'; const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' }); const t = await s.ssrLoadModule('/src/data/telemetry.ts'); for (const d of t.listDatasets()) { const ds = await t.loadDataset(d.id); console.log((ds ? 'OK ' : 'BAD') + '  ' + d.title.padEnd(30) + d.id + (ds ? '  versions=' + ds.versions.length : '')) } await s.close()"
```

- 新檔顯示成 fallback 名稱（例如 `Huge Table Vapor - Run 1`）→ 這是新 scenario，在 `SCENARIOS` 加一筆關鍵字；只加場景名稱，不要把版本或對比關係寫進名稱。
- 出現 `BAD` → 格式不是 analyze 輸出（沒有 `comparisons`），找出原因，不要靠改 `telemetry.ts` 硬吃。
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
