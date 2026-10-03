# VDOM Stress — CDP 驗證結果

這個資料夾放 VDOM Stress（`/scenarios/vdom-stress`）的所有 CDP 驗證報告與 raw trace，和 `component-storm/`、`composable-chaos/`、`reactive-chain/` 的結構一致。

## 報告

| 檔案 | 內容 |
| --- | --- |
| `FINAL_VALIDATION_REPORT.md` | Historical Validation：Vue 3.5.40 vs 3.6.0-rc.2（WP4） |
| `DAY29_FINAL_VALIDATION_REPORT.md` | D29 Final Validation，Freeze Point `3.6.0-rc.4`（Traditional vs Vapor） |
| `DAY29_FINAL_VALIDATION_REPORT_rc9.md` | D29 Final Validation，Freeze Point `3.6.0-rc.9`（Traditional vs Vapor） |

之後的 Freeze Point 依 `validate-vue-update` skill 產出 `DAY29_FINAL_VALIDATION_REPORT_<rc>.md`，放在這裡。

## Raw trace

`vue-<label>/<operation>-<n>/trial-NN/` 是各版本的 raw trace（`.gitignore` 排除，只存在量測的那台機器上，可用 `scripts/cdp-trace/` 重新產生）。各目錄屬於哪一次量測：

| 目錄 | 屬於 | 狀態 |
| --- | --- | --- |
| `vue-3.5.40`、`vue-3.6.0-rc.2` | Historical Validation（`FINAL_VALIDATION_REPORT.md`，Chrome 151） | 有效 |
| `vue-3.6.0-rc.4-traditional`、`vue-3.6.0-rc.4-vapor` | D29 rc.4（`DAY29_FINAL_VALIDATION_REPORT.md`，Chrome 151） | 有效 |
| `vue-3.5.40-chrome153`、`vue-3.6.0-rc.4-traditional-chrome153`、`vue-3.6.0-rc.4-vapor-chrome153`、`vue-3.6.0-rc.9-traditional`、`vue-3.6.0-rc.9-vapor` | D29 rc.9 的第一次 matrix | **作廢**：電池供電量測，對應 `day29-final-rc9-run1-battery-INVALID-analysis.json` |
| 上述 rc.9 matrix 的 `-run2`、`-run3` 版本 | D29 rc.9 的重複 1、重複 2（`DAY29_FINAL_VALIDATION_REPORT_rc9.md`，Chrome 153，AC） | 有效 |
| `vue-3.6.0-rc.4-vapor-smoke`、`vue-3.6.0-rc.9-vapor-smoke`、`vue-3.5.40-chrome153-probe-ac` | 正式量測前的前置檢查 | 不進分析 |
| `vue-3.5.40-poc` | `run-poc.ts` 的 3 trial 概念驗證 | 不是正式數據 |

`-chrome153` 是在 Chrome 153 上重跑的同版本控制組；`-runN` 是同一批次的第 N 次獨立量測。

## 2026-10-03 搬移紀錄

這些檔案原本在 `results/cdp-trace/` 最上層（VDOM Stress 是第一個做 CDP 驗證的 scenario，當時還沒有每個 scenario 一個資料夾的慣例）。2026-10-03 整理成目前的結構：

| 舊路徑 | 新路徑 |
| --- | --- |
| `results/cdp-trace/FINAL_VALIDATION_REPORT.md` | `results/cdp-trace/vdom-stress/FINAL_VALIDATION_REPORT.md` |
| `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md` | `results/cdp-trace/vdom-stress/DAY29_FINAL_VALIDATION_REPORT.md` |
| `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT_rc9.md` | `results/cdp-trace/vdom-stress/DAY29_FINAL_VALIDATION_REPORT_rc9.md` |
| `results/cdp-trace/vue-<label>/…` | `results/cdp-trace/vdom-stress/vue-<label>/…` |
| `results/cdp-trace/vdom-stress/vue-3.5.40/`（PoC） | `results/cdp-trace/vdom-stress/vue-3.5.40-poc/` |

**歷史報告的內文刻意沒有改**（Final Validation Freeze Rule：歷史 Validation 結果不修改），所以上面三份報告裡寫的 `results/cdp-trace/vue-…` 等路徑都是搬移前的位置，請用這張表對照。

搬移後，讀寫這些路徑的 8 支腳本（`run-validation-matrix.ts`、`run-day29-final-rc9.ts`、`analyze-day29-final-rc9.ts`、`analyze-validation-matrix.ts`、`analyze-vapor-comparison.ts`、`run-final-calibration.ts`、`run-vapor-comparison.ts`、`run-poc.ts`）只多了 `vdom-stress` 一層路徑。用新路徑重算 `day29-final-rc9-run2`、`-run3` 與 `matrix-analysis.json`，結果與搬移前 commit 的檔案逐項相同（只有 `generatedAt` 不同）。
