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

## Composable Chaos

### Baseline Snapshot

- Vue Version：Baseline `3.5.40`（現有 `package.json` 版本，未變更）。Vue 3.6 Validation 尚未執行。
- Node.js：v24.13.0
- Browser：Chrome 151.0.0.0（透過 claude-in-chrome 擴充套件自動化操作，分頁全程為背景/hidden 狀態，`document.visibilityState === 'hidden'`）
- Vite：v8.1.5
- TypeScript：6.0.3
- Scenario Parameters：`DEPTH_OPTIONS = [1, 5, 10, 20]`（Scenario 既定選項，全部測過，未新增測試維度），每個 Depth 皆為：點擊 **Build Chain** 重建一次全新 chain（metrics store 隨之重置），再連續觸發 100 次 **Trigger Update**，共 3 次 trial 取 median
- Git Commit（實驗開始時的已提交基準）：`ad06417`（`git status` 乾淨）
- 量測手法：沿用 reactive-chain 驗證確立的 `MutationObserver` 手法，但額外處理 Build Duration 的中間態——`buildChain()` 會先把 `buildDuration.value` 設回 `null`（畫面顯示 `-`）才在 `await nextTick()` 之後寫入真正數字，若用「文字有變化即算完成」判斷會誤判在中間態，因此改為「文字變化且不等於 `-`」才視為完成。Update Phase 沒有這個中間態問題（`Total Update Count` 只會遞增），沿用原本手法即可。
- 本 Scenario 全程未使用 `setTimeout` 驅動任何等待邏輯（`nextTick()` 是 microtask，不受背景分頁 timer 節流影響），也未使用 `scripts/cdp-trace/`（該工具鏈目前的 DOM 掛勾寫死給 `vdom-stress`，未泛化，依 Scenario README 的既定範圍不在本輪擴充）。

### Vue 3.5.40（Baseline）—— Depth 1，3 次 trial，方法：MutationObserver

| Trial | Build Duration | Composable Instance Count | Computed Count | Average Update Duration（100 次累積平均） | Computed Execute Count |
| ----- | --------------- | -------------------------- | --------------- | ------------------------------------------- | ----------------------- |
| 1     | 0.900 ms        | 1                           | 0                | 0.843 ms                                     | 0                        |
| 2     | 0.600 ms        | 1                           | 0                | 0.458 ms                                     | 0                        |
| 3     | 0.500 ms        | 1                           | 0                | 0.469 ms                                     | 0                        |

Build Duration median：0.600 ms　Range：0.500–0.900 ms
Average Update Duration median：0.469 ms　Range：0.458–0.843 ms（Trial 1 明顯偏高，是本輪整個測試序列的第一次呼叫，判斷為 JIT / 首次 microtask 排程的 warm-up 雜訊，與 `[[vue36_reactive_chain_validation]]` 記錄的「首次 trial 偏高」模式一致）

結構性 counter（3 次 trial 完全一致）：Watch Count 1、WatchEffect Count 1、Watch Trigger Count 100、WatchEffect Trigger Count 101、Render Count 201。

---

### Vue 3.5.40（Baseline）—— Depth 5，3 次 trial，方法：MutationObserver

| Trial | Build Duration | Composable Instance Count | Computed Count | Average Update Duration（100 次累積平均） | Computed Execute Count |
| ----- | --------------- | -------------------------- | --------------- | ------------------------------------------- | ----------------------- |
| 1     | 1.000 ms        | 5                           | 4                | 0.730 ms                                     | 404                      |
| 2     | 1.100 ms        | 5                           | 4                | 0.760 ms                                     | 404                      |
| 3     | 2.700 ms        | 5                           | 4                | 0.582 ms                                     | 404                      |

Build Duration median：1.100 ms　Range：1.000–2.700 ms（Trial 3 明顯偏高，判斷為單次 GC / 排程雜訊）
Average Update Duration median：0.730 ms　Range：0.582–0.760 ms

結構性 counter（3 次 trial 完全一致）：Watch Count 1、WatchEffect Count 1、Watch Trigger Count 100、WatchEffect Trigger Count 101、Render Count 201。Computed Execute Count = 404 = (Depth-1) × (Trigger 次數+1) = 4 × 101，其中 +1 是 Build 完成當下模板首次讀取 `finalValue` 造成的初始評估。

---

### Vue 3.5.40（Baseline）—— Depth 10，3 次 trial，方法：MutationObserver

| Trial | Build Duration | Composable Instance Count | Computed Count | Average Update Duration（100 次累積平均） | Computed Execute Count |
| ----- | --------------- | -------------------------- | --------------- | ------------------------------------------- | ----------------------- |
| 1     | 1.500 ms        | 10                          | 9                | 0.696 ms                                     | 909                      |
| 2     | 1.000 ms        | 10                          | 9                | 0.759 ms                                     | 909                      |
| 3     | 0.800 ms        | 10                          | 9                | 0.615 ms                                     | 909                      |

Build Duration median：1.000 ms　Range：0.800–1.500 ms
Average Update Duration median：0.696 ms　Range：0.615–0.759 ms

結構性 counter（3 次 trial 完全一致）：Watch Count 1、WatchEffect Count 1、Watch Trigger Count 100、WatchEffect Trigger Count 101、Render Count 201。Computed Execute Count = 909 = 9 × 101。

---

### Vue 3.5.40（Baseline）—— Depth 20，3 次 trial，方法：MutationObserver

| Trial | Build Duration | Composable Instance Count | Computed Count | Average Update Duration（100 次累積平均） | Computed Execute Count |
| ----- | --------------- | -------------------------- | --------------- | ------------------------------------------- | ----------------------- |
| 1     | 1.300 ms        | 20                          | 19               | 1.012 ms                                     | 1919                     |
| 2     | 1.000 ms        | 20                          | 19               | 0.975 ms                                     | 1919                     |
| 3     | 1.200 ms        | 20                          | 19               | 1.068 ms                                     | 1919                     |

Build Duration median：1.200 ms　Range：1.000–1.300 ms
Average Update Duration median：1.012 ms　Range：0.975–1.068 ms

結構性 counter（3 次 trial 完全一致）：Watch Count 1、WatchEffect Count 1、Watch Trigger Count 100、WatchEffect Trigger Count 101、Render Count 201。Computed Execute Count = 1919 = 19 × 101。

---

### State Flow Depth Comparison（Vue 3.5.40，median，3 trial／Depth）

| Depth | Build Duration median | Average Update Duration median | Computed Execute Count（100 次觸發累積） | Watch / WatchEffect Trigger | Render Count |
| ----: | ---------------------: | -------------------------------: | ------------------------------------------: | ---------------------------: | ------------: |
|     1 |               0.600 ms |                          0.469 ms |                                            0 |                    100 / 101 |            201 |
|     5 |               1.100 ms |                          0.730 ms |                                          404 |                    100 / 101 |            201 |
|    10 |               1.000 ms |                          0.696 ms |                                          909 |                    100 / 101 |            201 |
|    20 |               1.200 ms |                          1.012 ms |                                         1919 |                    100 / 101 |            201 |

Range Overlap 檢定（用 3 trial 的 min–max 判斷是否可排除雜訊）：

| 比較 | Depth 1 vs 5 | Depth 5 vs 10 | Depth 10 vs 20 | Depth 1 vs 20 |
| --- | --- | --- | --- | --- |
| Average Update Duration Range | [0.458,0.843] vs [0.582,0.760]（重疊） | [0.582,0.760] vs [0.615,0.759]（幾乎完全重疊） | [0.615,0.759] vs [0.975,1.068]（不重疊） | [0.458,0.843] vs [0.975,1.068]（不重疊） |
| 判定 | No Meaningful Difference（medians 差 55.6%，但 range 重疊，3 trial 不足以排除雜訊） | No Meaningful Difference（medians 幾乎相同，-4.7%） | Meaningful Difference（+45.4%，range 不重疊） | Meaningful Difference（+115.8%，range 不重疊） |

Watch Trigger Count / WatchEffect Trigger Count / Render Count 在全部 4 個 Depth、全部 12 次 trial 完全相同（100 / 101 / 201），跟 Depth 無關——證實 Scenario 設計的「Watcher 數量與 Composable 疊層深度脫鉤」在實測上成立。Computed Execute Count 則精確等於 `(Depth-1) × 101`，無任何雜訊（整數計數器，非計時指標），是本輪唯一「隨 Depth 線性增加且零雜訊」的證據。

Console 觀察：每次 Trigger Update 依序輸出 `layer2 ... layerN computed executed`（由下而上，符合 computed getter 呼叫堆疊展開順序）→ `watch triggered` → `watchEffect triggered`，全程無 error / warning、無 `Maximum recursive updates exceeded`。

### CDP Controlled Validation（Day 23，Vue 3.5.40，`scripts/cdp-trace/`）

不同於上面的頁面 instrumentation 量測，本輪改用既有 `scripts/cdp-trace/` Infrastructure（`chrome.ts`／`tracer.ts`／`sync.ts`／`parser.ts`／`rollup.ts`／`stats.ts`／`evidence.ts` 原樣重用，不重新設計 tracing architecture）搭配新建的 `composable-chaos-scenario.ts` adapter（僅新增本 Scenario 的 DOM 掛勾，未修改既有 vdom-stress-only 的 `scenario.ts`，也未修改本 Scenario 原始碼）。額外把 `attribution.ts` 的 `bucketForUrl` 加上本 Scenario 的檔案路徑（`ComposableChaosPage.vue`／`createComposableChain.ts`／`benchmarks/reactive/{metrics,logger}.ts`）——純新增，vdom-stress 既有的比對規則與結果不受影響。

- Chrome：151.0.7922.109，`launchIsolatedChrome()` 啟動的專屬 headless 分頁（獨立 temp profile），非 claude-in-chrome 擴充套件分頁。
- Depth：1 / 5 / 10 / 20（Scenario 既定選項）。Operation：`build`（1 次 Build Chain）／`update`（連續 20 次 Trigger Update 為一組 batch）。每個 (Depth × Operation × trace source) 組合：3 次 warm-up（捨棄）+ 5 次 measurement trial。
- Trace source：`cost-trace`（CPU profiler off，Scripting/Rendering/Layout/Paint）與 `runtime-attribution-trace`（CPU profiler on，Vue Runtime／Application／DevTools Overlay／V8-native CPU），依 `evidence.ts` 的 Dual-Trace 規則從不混用。
- **過程中發現並修正一個 adapter bug**：初版用「文字與點擊前不同」判斷 Build 完成，但 Depth=1（以及一般而言，此 Scenario 的 duration 都四捨五入到 sub-ms 字串）連續兩次 Build 有機率湊巧算出同一個顯示字串，導致判斷邏輯永遠等不到「文字改變」而 timeout。修正為兩階段偵測（先等文字變成 `'-'` 的 reset，再等文字變回非 `'-'` 的 settle），用 8 次連續 Depth=1 Build 驗證零 retry 後才正式跑完整 matrix。

#### Instrumentation Duration（ms，page `performance.now()`，median [P25,P75] (min-max), n=5）

| Depth | Build | Update（20-click batch 累積平均） |
| ----: | ------------------------------: | ------------------------------: |
|     1 | 1.00 [0.90, 1.00] (0.70-2.00)    | 1.23 [1.22, 1.34] (1.14-1.44)   |
|     5 | 4.10 [1.90, 4.20] (1.80-4.30)    | 2.12 [2.07, 2.18] (1.99-2.47)   |
|    10 | 4.60 [4.50, 5.50] (4.40-5.50)    | 3.40 [3.29, 3.44] (3.23-3.94)   |
|    20 | 9.90 [9.70, 10.00] (8.60-13.10)  | 6.78 [6.61, 6.88] (6.11-6.90)   |

#### cost-trace（µs，self-time rollup／raw-sum，median，n=5）

| Depth | Scripting (update) | Scripting (build) | Layout (update) | Recalculate Style (update) | Paint (update) |
| ----: | ------------------: | ------------------: | ----------------: | ----------------------------: | ---------------: |
|     1 |               46,009 |                2,138 |              5,203 |                         4,260 |             8,488 |
|     5 |               62,005 |                6,052 |              6,080 |                         4,137 |            12,084 |
|    10 |               90,041 |                8,214 |              9,299 |                         4,606 |            15,507 |
|    20 |              156,171 |               12,199 |              9,032 |                         4,554 |            14,704 |

#### runtime-attribution-trace（µs，sample-attribution，median，n=5）

| Depth | Vue Runtime CPU (update) | Application CPU (update) | Application CPU (build) | V8/native CPU (update) |
| ----: | -------------------------: | --------------------------: | --------------------------: | ------------------------: |
|     1 |                       6,412 |                        1,536 |                        1,090 |                    337,195 |
|     5 |                      13,221 |                       10,442 |                          916 |                    560,584 |
|    10 |                       8,306 |                       20,512 |                        3,561 |                    420,824 |
|    20 |                       7,037 |                       81,171 |                        7,047 |                    678,084 |

DevTools Overlay CPU：全部 depth、全部 trial 皆為 0（無干擾）。

#### Depth-Pair Signal（IQR overlap 判定，`scripts/cdp-trace/analyze-composable-chaos.ts`）

| Metric | Op | 1 vs 5 | 5 vs 10 | 10 vs 20 | 1 vs 20 |
| --- | --- | --- | --- | --- | --- |
| Instrumentation Duration | update | Meaningful (+72.4%) | Meaningful (+60.6%) | Meaningful (+99.0%) | Meaningful (+450.8%) |
| Scripting | update | Meaningful (+34.8%) | Meaningful (+45.2%) | Meaningful (+73.4%) | Meaningful (+239.4%) |
| Application CPU | update | Meaningful (+579.8%) | Meaningful (+96.4%) | Meaningful (+295.7%) | Meaningful (+5184.6%) |
| Vue Runtime CPU | update | Meaningful (+106.2%) | Meaningful (-37.2%) | No Meaningful Diff | No Meaningful Diff |
| Layout | update | No Meaningful Diff | Meaningful (+52.9%) | No Meaningful Diff | Meaningful (+73.6%) |
| Recalculate Style | update | No Meaningful Diff | No Meaningful Diff | No Meaningful Diff | No Meaningful Diff |
| V8/native CPU | update | Meaningful (+66.2%) | Meaningful (-24.9%) | No Meaningful Diff | No Meaningful Diff |

完整逐 metric／逐 operation 數字（含 build 側全部欄位）見 `scripts/cdp-trace/analyze-composable-chaos.ts` 執行輸出，原始 trace／meta 檔在 `results/cdp-trace/composable-chaos/vue-3.5.40/`。

**與頁面 instrumentation 量測（上方章節）的一處不一致**：instrumentation 判定 Depth 5 vs 10 為 No Meaningful Difference（3 trial，batch=100，同一頁面不重新整理）；CDP 判定同一組為 Meaningful Difference（5 trial，batch=20，每個 trial 皆重新 `Page.navigate`）。同一份 Scenario、同一組 Depth，差異來自量測協定本身，不代表 Vue 行為在兩輪之間改變，兩個結果都保留記錄，不互相覆蓋。

**Vue Runtime CPU 與 V8/native CPU 明確標記 `Not Attributable`**：前者沒有隨 Depth 一致的方向（部分 trial min 為 0 sample），後者依 `scripts/cdp-trace/TRACE_EVIDENCE_SCHEMA.md` 自身文件記載「too heterogeneous to interpret as one thing」，兩者都不可解讀成「Vue Runtime 變慢／變快」。
