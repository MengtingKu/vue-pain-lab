# Validation Log

## Reactive Chain

### Baseline Snapshot

- Vue Version：Baseline `3.5.40` → Validation `3.6.0-rc.2`（`npm install vue@版本號 --save-exact`，其餘套件版本不變）
- Node.js：v24.13.0
- Browser：Chrome 150.0.0.0（透過 claude-in-chrome 擴充套件自動化操作，分頁為背景/hidden 狀態）
- Vite：v8.1.5
- Scenario Parameters：`DEPTH=100`、`UPDATE_INTERVAL=5`、`AUTO_UPDATE=false`（全程未修改）
- Git Commit（實驗開始時的已提交基準）：`f933262f3102dd068f86ed91d8cddeb668dc976d`（2026-07-25 17:50:47 +0800）

固定條件：`DEPTH=100`，每次量測連續觸發 100 次 Trigger Update。數字直接讀取畫面 Runtime Metrics（由 component 內 `performance.now()` 量測，非外部估算）。

### ⚠️ 量測方法演進與重要發現：自動化本身的雜訊比 Vue 版本差異還大

第一輪量測（第一次執行本 skill）只跑了 1 次 trial，用 `btn.click()` + `setTimeout(10ms)` 驅動，得到 Vue 3.5.40 = 4.729ms、Vue 3.6.0-rc.2 = 12.188ms，看起來像是 3.6 慢了 157.7%。

重新驗證時發現：

- `document.hidden === true`（claude-in-chrome 操作的分頁一直是背景/hidden 狀態，即使 `hasFocus()` 為 true 也一樣），Chrome 會對背景分頁的 timer 做節流、甚至疑似降低該分頁 renderer process 的 CPU 排程優先權。
- 改用不同的等待策略（`setTimeout` vs 忙碌輪詢 microtask vs `MutationObserver`）重跑**同一個** Vue 3.5.40 build，得到的 Average Update Duration 從 4.7ms 一路跳到 12ms、48ms、64ms、73ms——同一份程式碼，同一個 Vue 版本，只因為我方自動化手法不同就有 15 倍以上的落差。

結論：**這個 DEPTH=100 場景下，ms 等級的 Average Update Duration 對這套瀏覽器自動化環境的雜訊極度敏感，單次量測不能拿來下版本結論。** 於是改成：固定同一種量測手法（`MutationObserver` 監看 `Total Update Count` 的 DOM 變化來判斷單次 update 是否完成，避免 `setTimeout` 被背景節流、也避免忙碌輪詢造成的額外 CPU 競爭），每個版本各跑 3 次 trial，取 median 並記錄 range 來呈現雜訊帶。

### Vue 3.5.40（Baseline）—— 3 次 trial，方法：MutationObserver

| Trial | Average Update Duration | Total Execution Time |
| ----- | ----------------------- | -------------------- |
| 1     | 63.942 ms               | 6394.2 ms            |
| 2     | 48.086 ms               | 4808.6 ms            |
| 3     | 47.042 ms               | 4704.2 ms            |

Median：48.086 ms　Mean：53.02 ms　Range：47.042 – 63.942 ms（trial 1 明顯偏高，判斷是背景分頁 CPU 排程雜訊，非穩定訊號）

結構性 counter（3 次 trial 完全一致）：Computed Execute Count 10100、WatchEffect Trigger Count 101、Watch Trigger Count 100、Render Count 199、Final Value 200。

---

### Vue 3.6.0-rc.2（Validation）—— 3 次 trial，方法：MutationObserver（與 Baseline 完全相同手法）

| Trial | Average Update Duration | Total Execution Time |
| ----- | ----------------------- | -------------------- |
| 1     | 44.402 ms               | 4440.2 ms            |
| 2     | 47.943 ms               | 4794.3 ms            |
| 3     | 47.310 ms               | 4731.0 ms            |

Median：47.310 ms　Mean：46.55 ms　Range：44.402 – 47.943 ms（三次 trial 彼此非常接近）

結構性 counter（3 次 trial 完全一致，與 Vue 3.5.40 相同）：Computed Execute Count 10100、WatchEffect Trigger Count 101、Watch Trigger Count 100、Render Count 199、Final Value 200。

---

### Compare（取兩版 median）

| Metric                            | Vue 3.5.40 | Vue 3.6.0-rc.2 | Change                            |
| --------------------------------- | ---------- | -------------- | --------------------------------- |
| Average Update Duration（median） | 48.086 ms  | 47.310 ms      | -1.6%（在雜訊範圍內，非顯著差異） |
| Computed Execute Count            | 10100      | 10100          | 持平                              |
| Watch / Render Count              | 100 / 199  | 100 / 199      | 持平                              |

Console 觀察（兩版皆相同）：每次 update 依序輸出 `computed100 executed` → `watch triggered` → `watchEffect triggered` → `component render` → `component render`（render 出現兩次，是 scenario 自己的 metrics 寫入模式造成，兩版行為一致，非版本差異）。全程無 `Maximum recursive updates exceeded` 或其他 error/warning。

Result：

改善：無法判定有改善。Median Average Update Duration 只差 -1.6%，遠小於同一版本重跑 3 次之間的雜訊帶（Vue 3.5.40 自己 3 次 trial 之間就有到 +36% 的落差）。Effect 執行次數（Computed / Watch / WatchEffect / Render）在兩版完全一致，代表 Vue 3.6 沒有減少這條 100 層 dependency chain 的任何一次必要計算。

沒有改善：在目前的量測精度下，看不出 Vue 3.6.0-rc.2 對這個長鏈 reactivity 場景有任何有感的 runtime cost 改善或退步——兩者在雜訊範圍內持平。
