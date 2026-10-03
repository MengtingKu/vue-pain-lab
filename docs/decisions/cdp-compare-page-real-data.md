# CDP 跨版本對比頁：直接讀 analysis JSON，不做 Adapter Layer

## 背景

原本的規格是「Vue 2 / Vue 3 各一個 Adapter + registry，統一轉成 renderTime / memoryUsage / eventDeliveryRate」。repo 內沒有任何 Vue 2 數據，CDP 也沒量過記憶體或事件送達率；照規格做，畫面只會是 0 或虛構的數字。

## 決定

- `src/data/telemetry.ts` 用 `import.meta.glob` lazy 載入 `results/cdp-trace/validation/*-analysis.json`，一個檔 = 一個 dataset。版本清單從檔內 comparisons 的 a / b 標籤取出，不寫死；新版本重跑 analyze 產出新檔即可出現，不需要 Adapter。
- 對比頁 `/compare`（`src/app/pages/CdpComparePage.vue`）多一個 Dataset 選單：不同 scenario 的指標不同（Render / Update / Instrumentation Duration），跨檔比較沒有意義。
- **同一批次的判斷：** 標籤上的 `-runN` 相同，且 `browserVersions` 記錄的 Chrome 版本相同。沒有 `-runN` 的是之前 Freeze Point 留下的 baseline。跨批次時不擋，顯示黃色警告。
- **Signal 不重算：** 只有原始分析真的比過的那一對才顯示 signal（反向選擇時 Improvement / Regression 對調）；其他組合只列 median / IQR / Δ%，signal 顯示「—」。避免在 UI 層發明一套和 analyze 腳本不同的判定。
- 檔名帶 `INVALID` 的量測（電池模式）在 glob 階段排除，不打包。

## 取捨

- 每份 analysis 檔約 20–250 KB（gzip 3–47 KB），進頁面選到才載入；檔內的 costStructures 等欄位頁面用不到，但為了不維護第二份數據，接受這個體積。
- 只收 `*-runN-analysis.json`。`matrix-analysis.json`（3.5.40 vs 3.6.0-rc.2，WP4，見 `FINAL_VALIDATION_REPORT.md`）是舊格式（頂層陣列、`v35` / `v36` 欄位），在 glob 階段就排除，所以這組對比目前不在頁面上。要放回來得替它寫第二套解析。執行期若有檔案解析不出 comparison，也會從選單移除。
- 選單顯示「場景名稱 - Run N」：檔名前綴看不出 scenario（`day29-final-rc9` 是 VDOM Stress），所以 `telemetry.ts` 有一張前綴 → 名稱的對照表；沒登記的新檔退回顯示前綴，不會消失。名稱只寫場景（例如 `VDOM Stress Test - Run 3`），不寫 Vapor / rc.9 等版本字眼：一份檔案內有多個版本，比哪兩個由 A / B 選單決定，寫在名稱裡會和選單互相矛盾。
- composable-chaos 的 analysis 沒有 `browserVersions`，批次只靠 `-runN` 判斷。
