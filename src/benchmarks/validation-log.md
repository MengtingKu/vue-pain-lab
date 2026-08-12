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

## Component Storm

### Baseline Snapshot

- Vue Version：Baseline `3.5.40`（`npm install vue@3.5.40 --save-exact`）。Vue 3.6 Validation 尚未執行。
- Node.js：v24.13.0
- Browser：Chrome 150.0.0.0（透過 claude-in-chrome 擴充套件自動化操作，分頁全程為背景/hidden 狀態，`document.hidden === true`）
- Vite：v8.1.5
- Scenario Parameters：`componentCount=500`、`updateScope='AllChildren'`、`autoUpdate=false`（全程未修改）
- Git Commit（實驗開始時的已提交基準）：`375776c16b3cd3d575458bb53122d629f6563294`（2026-08-02 17:25:00 +0800）
- 量測手法：沿用 reactive-chain 驗證確立的 `MutationObserver` 監看 `Total Update Count` DOM 變化手法（避免 `setTimeout` 被背景分頁節流）。每次 trial 前重新整理頁面重置 metrics，連續觸發 100 次 Trigger Update，共 3 次 trial 取 median。額外用 `performance.memory.usedJSHeapSize` 量測每次 trial 前後的 JS Heap。

### Vue 3.5.40（Baseline）—— 3 次 trial，方法：MutationObserver

| Trial | Mount Time | Average Update Duration | Total Execution Time（換算） | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | ---------------------------- | -------------- | ------------- | -------------------------- |
| 1     | 350.900 ms | 210.861 ms              | 21086.1 ms                   | 92,305,274 B   | 92,741,092 B  | +435,818 B（+0.42 MB）     |
| 2     | 311.100 ms | 187.405 ms              | 18740.5 ms                   | 54,142,453 B   | 95,280,357 B  | +41,137,904 B（+39.23 MB） |
| 3     | 353.700 ms | 182.206 ms              | 18220.6 ms                   | 92,346,207 B   | 89,265,013 B  | -3,081,194 B（-2.94 MB）   |

Mount Time median：350.900 ms　Range：311.100–353.700 ms
Average Update Duration median：187.405 ms　Mean：193.49 ms　Range：182.206–210.861 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count（上一次 update）500、Parent Render Count 200、Child Render Count（累計）50000。

Console 觀察：全程無 error / warning，無 `Maximum recursive updates exceeded`。

Memory 觀察：Heap Δ 在三次 trial 間從 -2.94 MB 到 +39.23 MB，落差遠大於預期訊號量級，判斷主要是 V8 GC 排程時機造成的雜訊，而非 500 Child × 100 次 AllChildren 更新本身的記憶體成本差異——與 reactive-chain 驗證時「自動化環境雜訊可能大於真實版本差異」的結論一致，`performance.memory` 在目前測法下不足以作為版本比較證據。

---

### Vue 3.5.40（Baseline）—— ParentOnly，3 次 trial，方法：MutationObserver

`componentCount=500`、`updateScope='ParentOnly'`，其餘條件（Node / Browser / Vite / Git Commit / 量測手法）與上方 AllChildren 完全相同。

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 381.800 ms | 6.654 ms                | 108,780,287 B  | 115,729,098 B | +6,948,811 B（+6.63 MB）   |
| 2     | 295.900 ms | 9.711 ms                | 54,126,475 B   | 67,684,364 B  | +13,557,889 B（+12.93 MB） |
| 3     | 306.800 ms | 8.770 ms                | 51,153,844 B   | 67,194,852 B  | +16,041,008 B（+15.30 MB） |

Mount Time median：306.800 ms　Range：295.900–381.800 ms
Average Update Duration median：8.770 ms　Mean：8.378 ms　Range：6.654–9.711 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

---

### Vue 3.5.40（Baseline）—— SingleChild，3 次 trial，方法：MutationObserver

`componentCount=500`、`updateScope='SingleChild'`，其餘條件同上。

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 266.600 ms | 10.732 ms               | 51,431,599 B   | 67,722,398 B  | +16,290,799 B（+15.54 MB） |
| 2     | 299.400 ms | 9.000 ms                | 54,238,456 B   | 66,609,395 B  | +12,370,939 B（+11.80 MB） |
| 3     | 309.700 ms | 8.962 ms                | 54,213,568 B   | 66,600,831 B  | +12,387,263 B（+11.81 MB） |

Mount Time median：299.400 ms　Range：266.600–309.700 ms
Average Update Duration median：9.000 ms　Mean：9.565 ms　Range：8.962–10.732 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

---

### Update Scope Comparison（Vue 3.5.40，componentCount=500，median）

| Update Scope | Average Update Duration | Updated Component Count | Child Render Count |
| ------------ | ----------------------- | ----------------------- | ------------------ |
| ParentOnly   | 8.770 ms                | 0                       | 0                  |
| SingleChild  | 9.000 ms                | 1                       | 100                |
| AllChildren  | 187.405 ms              | 500                     | 50000              |

ParentOnly 與 SingleChild 幾乎沒有差異（差 0.230 ms，雜訊範圍內）；AllChildren 比 ParentOnly 慢約 21.4 倍。Parent Render Count 三種 Scope 皆固定 200，不受 Update Scope 影響。

---

### Vue 3.5.40（Baseline）—— componentCount=100，三種 updateScope，各 3 次 trial，方法：MutationObserver

`componentCount=100`，其餘條件（Node / Browser / Vite / Git Commit / 量測手法）同上。

#### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 71.000 ms  | 2.755 ms                | 74,659,938 B   | 87,632,334 B  | +12,972,396 B（+12.37 MB） |
| 2     | 79.900 ms  | 1.466 ms                | 50,802,372 B   | 51,546,452 B  | +744,080 B（+0.71 MB）     |
| 3     | 78.400 ms  | 1.661 ms                | 50,667,700 B   | 51,135,808 B  | +468,108 B（+0.45 MB）     |

Mount Time median：78.400 ms　Range：71.000–79.900 ms
Average Update Duration median：1.661 ms　Range：1.466–2.755 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

#### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                   |
| ----- | ---------- | ----------------------- | -------------- | ------------- | ------------------------ |
| 1     | 77.300 ms  | 1.970 ms                | 46,886,830 B   | 48,441,890 B  | +1,555,060 B（+1.48 MB） |
| 2     | 76.300 ms  | 2.715 ms                | 68,245,503 B   | 69,175,902 B  | +930,399 B（+0.89 MB）   |
| 3     | 77.000 ms  | 2.313 ms                | 50,834,104 B   | 51,764,371 B  | +930,267 B（+0.89 MB）   |

Mount Time median：77.000 ms　Range：76.300–77.300 ms
Average Update Duration median：2.313 ms　Range：1.970–2.715 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

#### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 84.300 ms  | 35.293 ms               | 51,573,378 B   | 86,845,347 B  | +35,271,969 B（+33.64 MB） |
| 2     | 78.100 ms  | 29.364 ms               | 47,193,564 B   | 64,464,597 B  | +17,271,033 B（+16.47 MB） |
| 3     | 81.300 ms  | 31.751 ms               | 51,101,415 B   | 66,099,877 B  | +14,998,462 B（+14.30 MB） |

Mount Time median：81.300 ms　Range：78.100–84.300 ms
Average Update Duration median：31.751 ms　Range：29.364–35.293 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 100、Parent Render Count 200、Child Render Count 10000。

---

### Vue 3.5.40（Baseline）—— componentCount=1000，三種 updateScope，各 3 次 trial，方法：MutationObserver

`componentCount=1000`，其餘條件同上。

#### ParentOnly

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 623.500 ms | 22.806 ms               | 57,280,313 B   | 73,637,821 B  | +16,357,508 B（+15.60 MB） |
| 2     | 713.200 ms | 20.839 ms               | 60,243,367 B   | 77,375,432 B  | +17,132,065 B（+16.34 MB） |
| 3     | 587.800 ms | 20.638 ms               | 60,246,908 B   | 77,392,393 B  | +17,145,485 B（+16.35 MB） |

Mount Time median：623.500 ms　Range：587.800–713.200 ms
Average Update Duration median：20.839 ms　Range：20.638–22.806 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 0、Parent Render Count 200、Child Render Count 0、Parent Tick 100。

#### SingleChild

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 574.600 ms | 19.846 ms               | 57,361,886 B   | 75,032,043 B  | +17,670,157 B（+16.85 MB） |
| 2     | 573.200 ms | 23.256 ms               | 60,338,521 B   | 79,609,126 B  | +19,270,605 B（+18.38 MB） |
| 3     | 569.300 ms | 19.152 ms               | 60,346,006 B   | 103,794,911 B | +43,448,905 B（+41.44 MB） |

Mount Time median：573.200 ms　Range：569.300–574.600 ms
Average Update Duration median：19.846 ms　Range：19.152–23.256 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1、Parent Render Count 200、Child Render Count 100。

#### AllChildren

| Trial | Mount Time | Average Update Duration | JS Heap Before | JS Heap After | Heap Δ                     |
| ----- | ---------- | ----------------------- | -------------- | ------------- | -------------------------- |
| 1     | 543.600 ms | 333.598 ms              | 124,364,717 B  | 91,083,916 B  | -33,280,801 B（-31.74 MB） |
| 2     | 482.500 ms | 327.393 ms              | 113,759,424 B  | 89,251,166 B  | -24,508,258 B（-23.37 MB） |
| 3     | 458.700 ms | 323.930 ms              | 113,493,679 B  | 90,278,969 B  | -23,214,710 B（-22.14 MB） |

Mount Time median：482.500 ms　Range：458.700–543.600 ms
Average Update Duration median：327.393 ms　Range：323.930–333.598 ms

結構性 counter（3 次 trial 完全一致）：Total Update Count 100、Updated Component Count 1000、Parent Render Count 200、Child Render Count 100000。

三次 trial 的 Heap Δ 全部是負值（單次 trial wall time ~35 秒，期間 V8 應該跑了 major GC），再度證明 `performance.memory` 在這套環境下量不出可信的 Memory 訊號。

---

### Component Scale Comparison（Vue 3.5.40，Average Update Duration median，ms）

| Update Scope | componentCount=100 | componentCount=500 | componentCount=1000 | 100→1000 倍數 |
| ------------ | ------------------ | ------------------ | ------------------- | ------------- |
| ParentOnly   | 1.661 ms           | 8.770 ms           | 20.839 ms           | ×12.5         |
| SingleChild  | 2.313 ms           | 9.000 ms           | 19.846 ms           | ×8.6          |
| AllChildren  | 31.751 ms          | 187.405 ms         | 327.393 ms          | ×10.3         |

關鍵發現：ParentOnly／SingleChild 的 Updated Component Count 與 Child Render Count 完全不受 componentCount 影響（永遠是 0 / 1），但 Average Update Duration 仍隨 componentCount 明顯增加（×8.6~×12.5），推斷是 `v-for` 走過整個 vnode 陣列做 key／props 比對的成本本身正比於陣列長度，跟「有沒有真的 patch 到 Child」是兩件事。詳細分析與工程意涵見 `src/scenarios/component-storm/README.md` 的「Component Scale Comparison」段落。

### Vue 3.6.0-rc.2（Validation）

尚未執行，待下次驗證時補上（沿用完全相同的 3 trial × 100 次 Trigger Update / MutationObserver 手法，涵蓋 `componentCount=100/500/1000` × 三種 updateScope，共 9 組合）。
