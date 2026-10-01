# Vue Conf Evidence Pack

「Trust and Verify：用工程方法探索 Vue 更新的價值」事實資料庫。

本文件只整理 `vue-pain-lab` repo 內**已經實際執行過**的量測與其原始數據，不補寫未執行的實驗、不把單一 Scenario 的結果放大成「Vue 3.6 整體變快／變慢」的結論。每個 Claim 都標註可追溯的 Source 檔案。凡是量測方法本身有已知限制（雜訊帶、低信心 attribution、單次量測、量測 harness 差異）都保留在文件中，不做美化或省略。

涵蓋範圍：Vue 3.5.40 → Vue 3.6.0-rc.2（部分 Vapor 相關資料為 3.6.0-rc.4）。3.6.0-rc.2 / rc.4 皆為 release candidate，非正式版。

---

## 名詞定義（引用自 `scripts/cdp-trace/TRACE_EVIDENCE_SCHEMA.md`，量測方法論的一部分，非本文件自訂）

本 Lab 的 CDP Trace 量測分兩種結構上不同的 trace（同一份 trace 不能同時信任於兩種用途）：

- **cost-trace**（CPU profiler 關閉）→ Scripting / Rendering / Painting（self-time rollup）＋ Layout / Recalculate Style / Paint（raw-sum）。Confidence：high–medium。
- **runtime-attribution-trace**（CPU profiler 開啟）→ Vue Runtime CPU / Application CPU / DevTools Overlay CPU / V8-native CPU（CPU-profiler sample attribution，依 leaf call-frame 的 `url` 分類）。Confidence：**全部 low**（leaf-only attribution 會低估 Vue 的真實 inclusive cost；V8/native CPU 本身被文件明確標記為「too heterogeneous to interpret as one thing」）。

Signal 分類（各報告沿用同一套 classifier）：

- **Consistent Improvement / Consistent Regression**：IQR 不重疊，且配對 trial（同一 trial index 跨版本比較）中同方向比例達門檻（一般為 ≥9/10 或 favorRatio ≥0.9/≤0.1）。
- **Stable / No Meaningful Difference**：|Δ%| 很小且配對方向接近 50/50。
- **Unstable**：IQR 重疊，或配對方向不一致——多數 cell 落在此類。

以下每個 Experiment 出現「Consistent Improvement」「Unstable」等字樣時，皆指此定義，不是口語化的「看起來變快／變慢」。

---

## Experiment 01 — Reactive Chain

### Question

Vue Runtime 在深層 reactive dependency chain（`ref → computed1 → computed2 → ... → computedN → watch → watchEffect → component render`）下的 update cost 是否降低？具體包含：dependency tracking cost、computed invalidation cost、unnecessary effect execution、component update cost。

### Scenario

- Chain 用迴圈 / factory 建立，`DEPTH` 可調參數，實際驗證固定 `DEPTH=100`。
- 不做任何效能優化（不用 `shallowRef` / `markRaw` / debounce / throttle / cache workaround）。
- Component 數量：1（`ReactiveChainPage`）。
- Update 觸發：`Trigger Update` 按鈕，每次 trial 連續觸發 100 次。
- 每版本 3 次 trial，取 median。
- 僅有 Layer A（頁面 instrumentation），**沒有** CDP Trace（Scripting/Rendering/Layout 等）breakdown。

### Versions

Vue 3.5.40（baseline）vs Vue 3.6.0-rc.2（validation）。

### Measurement

- Average Update Duration（頁面 `performance.now()`，用 `MutationObserver` 監看 `Total Update Count` DOM 文字變化判定單次觸發完成，避免 `setTimeout` 被背景分頁節流）
- Computed Execute Count / Watch Trigger Count / WatchEffect Trigger Count / Render Count（結構性 counter）

### Observed

DEPTH=100，兩版本各 3 次 trial × 100 次 Trigger Update：

| Metric | Vue 3.5.40 | Vue 3.6.0-rc.2 |
| --- | --- | --- |
| Average Update Duration（median，3 trial：63.942 / 48.086 / 47.042 ms vs 44.402 / 47.943 / 47.310 ms） | 48.086 ms | 47.310 ms（-1.6%） |
| Computed Execute Count | 10100 | 10100 |
| Watch Trigger Count | 100 | 100 |
| WatchEffect Trigger Count | 101 | 101 |
| Render Count | 199 | 199 |

- 同一版本（Vue 3.5.40）自己 3 次 trial 之間的雜訊帶可達 +36%，遠大於觀察到的版本間差異（-1.6%）。
- Console 觀察兩版本皆為固定順序（`computed100 executed → watch triggered → watchEffect triggered → component render ×2`），無 error/warning。
- **重要方法論發現**：第一次量測只跑 1 個 trial、用 `setTimeout` 驅動，量到 3.5.40=4.7ms、3.6.0-rc.2=12.2ms（看似 3.6 慢 157.7%）；改用不同等待手法重跑**同一份** Vue 3.5.40 build，同一指標從 4.7ms 跳到 12/48/64/73ms——證明「157.7%」是自動化環境（分頁全程 `document.hidden === true`）的雜訊，不是版本差異。此發現直接影響了後續 Component Storm / Composable Chaos / VDOM Stress 的量測方法設計（改用 MutationObserver、多 trial、後續甚至改用 CDP 直接控制 visibility）。

### Claim

- Computed Execute Count / Watch Trigger Count / WatchEffect Trigger Count / Render Count 在兩版本、全部 3 次 trial 完全一致——Vue 3.6 沒有讓這條 100 層鏈跳過任何一次 effect 執行或 render（結構性正確性檢查，非效能宣稱）。
- Average Update Duration 的 median 差異（-1.6%）小於同一版本自身重跑的雜訊帶（可達 +36%），在目前量測精度下判定為「無顯著差異」，此結論在後續 `DAY29_FINAL_VALIDATION_REPORT.md` 的 Evidence 稽核中被重申、未被改寫。
- 此 scenario 的第一輪量測本身即證明：這套瀏覽器自動化環境（分頁全程 hidden）在缺乏多 trial / MutationObserver 手法時，量測雜訊可以偽造出接近 160% 的假性版本差異。

### Cannot Claim

- 不能判定 Vue 3.6 在此情境下改善或未改善 reactive runtime cost——雜訊帶大於觀察到的訊號，證據不足以判定方向。
- 不能把 DEPTH=100 的結論推廣到其他 depth 值（此 scenario 從未測試其他 depth）。
- 不能歸因到 Scripting / Vue Runtime CPU / Browser Rendering 哪一層——此 scenario 沒有 CDP Trace breakdown，只有頁面總時間。
- 不能推論到「Vue Application 整體的 reactivity 效能」——這只是一個線性、非跳過式的固定深度鏈。

### Source

- `src/scenarios/reactive-chain/README.md`（Validation Environment、Validation Evidence Matrix、Observation、Validation Result、Limitation、Next Step）
- `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md` Part 1 稽核表第 1–2 列

---

## Experiment 02 — Component Storm

### Question

Component 數量增加時，Component Runtime Cost（Mount Time / Update Time）是否增加？Parent 自身狀態變動是否必然連累所有 Child re-render？不同 Update Scope（ParentOnly / SingleChild / AllChildren）的 Runtime Cost 差多少？Vue 3.6 是否降低這些 cost？

### Scenario

- `ComponentStormPage`（Parent）掛載 `ComponentStormChild × COMPONENT_COUNT`，所有 Child 結構、Props、Reactive Logic（5 個 derived 數字）完全一致。
- `COMPONENT_COUNT`：100 / 500 / 1000。`UPDATE_SCOPE`：ParentOnly / SingleChild / AllChildren。
- Scenario Freeze Rule：不使用 `v-memo`、`KeepAlive`、`defineAsyncComponent`、Virtual Scroll、Lazy Render，Vue 版本是唯一允許改變的變因。
- 主要驗證方法：`claude-in-chrome` 瀏覽器自動化，分頁全程 `document.hidden === true`，每個 scale/scope 各 3 trial × 100 次 Trigger Update，取 median。
- 另有 Day 30 獨立追蹤驗證：改用**不同 harness**（isolated headless CDP，非 `claude-in-chrome`），僅測 `componentCount=500` / `AllChildren`。

### Versions

Vue 3.5.40 vs Vue 3.6.0-rc.2。**完整三 scope 比較僅在 `componentCount=500` 完成**；`componentCount=100` 與 `1000` 只有 Vue 3.5.40 baseline 數據，**未測 Vue 3.6**。

### Measurement

- Mount Time、Average Update Duration、JS Heap Δ（`performance.memory`）
- 結構性 counter：Total Update Count / Updated Component Count / Parent Render Count / Child Render Count
- Day 30 追加：CDP dual-trace（Scripting / Rendering / Recalculate Style / Layout / Painting / Paint 為 cost-trace；Vue Runtime CPU / Application CPU / DevTools Overlay CPU / V8-native CPU 為 runtime-attribution-trace，皆 low confidence）＋直接用 CDP 控制 `document.visibilityState` 做 visible vs hidden 對照實驗

### Observed

**`componentCount=500`，Vue 3.5.40 → Vue 3.6.0-rc.2（median，claude-in-chrome，分頁全程 hidden）：**

| Update Scope | Average Update Duration | Mount Time | 結構性 counter |
| --- | --- | --- | --- |
| AllChildren | 187.405 ms → 158.669 ms（-15.3%） | 350.900 ms → 320.200 ms（-8.7%） | Updated Component Count 500 / Parent Render Count 200 / Child Render Count 50000，兩版本完全一致 |
| ParentOnly | 8.770 ms → 6.488 ms（-26.0%） | 306.800 ms → 298.600 ms（-2.7%） | Updated Component Count 0 / Child Render Count 0，兩版本完全一致 |
| SingleChild | 9.000 ms → 6.635 ms（-26.3%） | 299.400 ms → 291.600 ms（-2.6%） | Updated Component Count 1 / Child Render Count 100，兩版本完全一致 |

- Component Scale Comparison（僅 Vue 3.5.40，100→1000）：ParentOnly 的 Average Update Duration 從 1.661 ms 漲到 20.839 ms（×12.5），SingleChild 從 2.313 ms 漲到 19.846 ms（×8.6）——**即使 Updated Component Count / Child Render Count 完全不變**（ParentOnly 永遠 0，SingleChild 永遠 1）。
- JS Heap Δ 在三種 Scope、兩版本下都落在同一個大範圍雜訊帶（+0.42 MB ~ +39.23 MB），無法用來區分版本或 Scope 差異。

**Day 30 Runtime Attribution Validation（不同 harness，isolated headless CDP，n=10 single-trigger trial，`componentCount=500`/`AllChildren`）：**

| 條件 | Vue 3.5.40 median | Vue 3.6.0-rc.2 median | Δ% | Signal |
| --- | --- | --- | --- | --- |
| isolated CDP（非 hidden 特別控制） | 84.9 ms | 92.1 ms | +8.5% | Unstable |
| CDP 直接控制 `document.hidden = true` | 177.3 ms | 140.4 ms | -20.8% | Unstable |
| CDP 直接控制 `document.hidden = false`（visible） | 35.0 ms | 35.9 ms | +2.4% | **Stable / No Meaningful Difference** |

- 同一批 trial 的 Vue Runtime CPU attribution（low confidence）：70.1 ms → 73.4 ms（+4.7%，變高非變低，Unstable，4/10 paired 偏向 3.6）。
- Application CPU（low confidence）：29.0 ms → 22.2 ms（-23.3%，Unstable，8/10 paired 偏向 3.6）。
- 沒有任何 cost/attribution metric 在此輪達到 Consistent Improvement；唯一達到乾淨 Signal 的是 Paint，且是 Stable/No Meaningful Difference（-2.9%），不是改善。

### Claim

- 結構性 counter（Updated Component Count / Parent Render Count / Child Render Count）在 `componentCount=500` 三種 Update Scope 下，Vue 3.5.40 與 Vue 3.6.0-rc.2 逐項完全一致——Vue 3.6 沒有讓任何 Child 被跳過渲染，也沒有改變渲染次數。
- Vue 3.5.40 單版本內的證據支持：即使 Child 的 Props 完全沒變（ParentOnly），Update Duration 仍隨 `componentCount`（100→1000）增加 8.6–12.5 倍——「走過 `v-for` 產生的 vnode 陣列做 key/props 比對」本身有與陣列長度成正比的成本，跟該次更新是否真的 patch 到 Child 無關。
- 在 CDP 直接控制、乾淨（foreground/visible）條件下，Vue 3.5.40 與 Vue 3.6.0-rc.2 於 `componentCount=500`/`AllChildren` 的 Average Update Duration 沒有可分辨差異（+2.4%，Stable/No Meaningful Difference，n=10）。
- README 原始記錄的「-15.3%」與「Minor improvement」判定，其量測條件（`claude-in-chrome`，分頁全程 `document.hidden === true`）在後續用 CDP 直接控制 hidden 狀態重現時，得到量級與方向都接近的數字（-20.8%）——但此訊號本身在該追蹤方法下仍被分類為 Unstable，且 visible 條件下訊號消失。最合理的解讀是：README 的 -15.3% 主要反映背景分頁 CPU 節流造成的量測效應，而不是確認的 Vue Runtime 版本改善。

### Cannot Claim

- 不能沿用 README 原文「Decision: Yes，Framework Cost 有改善」這個結論本身——Day 30 用不同 harness 與 visible/hidden 對照後，此結論被明確標記為 provisional／pending，**不是被推翻成「Vue 3.6 變慢」，也不是被確認**。
- 不能宣稱 Vue 3.6 讓 Component Storm 變慢——同樣沒有找到可重現的退步訊號（isolated CDP 的 +8.5% 本身也是 Unstable）。
- 不能把版本比較結論套用到 `componentCount=100` 或 `1000`——這兩個 scale 從未執行 Vue 3.6 Validation。
- Vue Runtime CPU / Application CPU attribution 數據本身被標記 low confidence，不能單獨作為「Vue Runtime 本身變快或變慢」的證據。
- 不能把「Child 數量本身就是成本」這個發現套用到其他 Component Tree 形狀（例如巢狀而非扁平 `v-for`、或不同 diff 路徑），本 Scenario 只驗證了單層扁平 `v-for` 的情境。
- Day 30 controlled validation（isolated CDP、visible/hidden 對照）的 Scope 僅涵蓋 `componentCount=500` / `updateScope='AllChildren'`；`ParentOnly` / `SingleChild` 沒有用相同的 controlled visible/hidden harness 重新驗證。因此：AllChildren 的 -15.3% 無法被確認為 Vue Runtime version improvement，但**不能進一步推論** ParentOnly（-26.0%）／SingleChild（-26.3%）也已被同一個 hidden-tab throttling 假象解釋——目前沒有足夠 evidence 對這兩個 scope 做同樣的降級判定。
- 「ParentOnly／SingleChild 的 -26.0%／-26.3% 缺乏可信度」這件事，其實來自**兩個不同來源、不能互相替代**的證據，必須分開陳述：(1) `DAY29_FINAL_VALIDATION_REPORT.md` Part 1 稽核表（對既有 n=3 頁面內量測資料的重新分類，**沒有新量測**）已把這兩個數字標為「不穩定（baseline 雜訊帶 19–32% 與差值重疊）」；(2) `RUNTIME_ATTRIBUTION_REPORT.md` 的 Day 30 controlled validation（全新 CDP trace、n=10、hidden/visible 對照，**有新量測**）則是從未把這兩個 scope 納入範圍。前者是「用既有資料重新判讀」，後者是「從未重新量測」——兩者結論方向一致（都指向「不能信任這兩個數字」），但成因與證據性質不同，不可合併陳述成同一件事、同一份 evidence。

### Source

- `src/scenarios/component-storm/README.md`（全篇，含 Update Scope Comparison、Component Scale Comparison、Version Comparison 表、Decision、Runtime Attribution Validation 段落）
- `results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md`（Part 1 + Part 2，含 harness 比較表、visible/hidden 對照實驗、Final Conclusion）
- `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md` Part 1 稽核表第 3–5 列

---

## Experiment 03 — Composable Chaos

### Question

Composable Abstraction Depth（巢狀 composable 呼叫層數）增加時，Reactive Runtime Cost（computed 執行次數、update duration）是否也跟著變高？增加的原因是「computed chain 變長」還是「composable 呼叫本身變貴」（H1/H2/H3，見 Scenario）？Vue 3.6 是否降低此 cost？

### Scenario

- 單一 Component（`ComposableChaosPage`），DOM 節點數全程固定，不隨 depth 增加。
- `useLayerN()` 巢狀呼叫，`Depth` 可選 1 / 5 / 10 / 20：Layer 1 建立 1 個 `ref`，Layer 2 以上各建立 1 個 `computed`（值 = 上一層 + 1）。
- Watcher 數量固定：全程只有 1 個 `watch()` + 1 個 `watchEffect()`，掛在 chain 最上層，不隨 depth 增加。
- Update 觸發方式固定：`source.value++`。
- Layer A（頁面 instrumentation）：每 depth 3 trial，每 trial 先 Build Chain 再連續觸發 100 次 Trigger Update。
- Layer B（CDP trace）：每 depth、每 operation（build / 20 次 update batch）、每 trace source，3 warm-up + 5 measurement trial。

### Versions

Vue 3.5.40（baseline）vs Vue 3.6.0-rc.2（Day 24 Validation，Layer A 與 Layer B 皆為 protocol-matched 對照）。另有 Day 23：Vue 3.5.40 單版本內的 cross-depth CDP 驗證（非版本比較）。

### Measurement

- Layer A：Build Duration、Average Update Duration、結構性 counter（Composable Instance / Computed / Watch / WatchEffect Count、Computed Execute Count、Render Count）
- Layer B：Scripting / Rendering / Recalculate Style / Layout / Painting / Paint（cost-trace）＋ Vue Runtime CPU / Application CPU / DevTools Overlay CPU / V8-native CPU（runtime-attribution-trace，全部 low confidence）

### Observed

**Layer A，Vue 3.5.40 Baseline（median，3 trial／depth）：**

| Depth | Build Duration | Average Update Duration | Computed Execute Count | Watch/WatchEffect/Render |
| --- | --- | --- | --- | --- |
| 1 | 0.600 ms | 0.469 ms | 0 | 100 / 101 / 201 |
| 5 | 1.100 ms | 0.730 ms | 404 | 100 / 101 / 201 |
| 10 | 1.000 ms | 0.696 ms | 909 | 100 / 101 / 201 |
| 20 | 1.200 ms | 1.012 ms | 1919 | 100 / 101 / 201 |

- Computed Execute Count 精確等於 `(Depth-1) × 101`，零雜訊。Watch/WatchEffect/Render 三個 counter 在全部 4 個 depth 完全相同，與 depth 脫鉤。
- Depth 1 vs 5、Depth 5 vs 10 的 Average Update Duration 差異落在 3-trial 雜訊帶內（No Meaningful Difference）；只有 Depth 10 vs 20（+45.4%）與 Depth 1 vs 20（+115.8%）range 不重疊。

> **⚠️ Harness Note（避免跨表誤讀）**：上表「Vue 3.5.40 Baseline」的數字（例如 Depth 20 = 1.012 ms）來自 **Day 22 人工 `claude-in-chrome` 手動操作**量測。下方「Day 24：Layer A 版本比較」表的數字（同一 Depth 20，Vue 3.5.40 側為 4.986 ms、Vue 3.6.0-rc.2 側為 3.930 ms）來自 **Day 24 新建的 CDP-driven deterministic script**——是完全不同的 measurement harness。兩張表的絕對數字**不可跨表直接比較**（`DAY24_VUE36_VALIDATION_REPORT.md` Harness Notes 原文：「Day 22 manual = 1.012ms vs this script = 4.986ms/3.930ms...this reflects measurement-environment differences, not a regression; only within-script, cross-version comparisons in this report are meaningful.」）。唯一可作為版本比較證據的，是 **Day 24 表格內部、同一支 script 量到的 Vue 3.5.40 → Vue 3.6.0-rc.2 差異**（即下表的 Δ% 欄位）。

**Day 24：Layer A 版本比較（median，N=3，兩版本 protocol-matched）：**

| Depth | Average Update Duration Δ% | Signal |
| --- | --- | --- |
| 1 | +7.5%（0.265→0.285 ms） | Meaningful Difference（值極小、判斷為接近量測解析度雜訊） |
| 5 | -3.1% | No Meaningful Difference |
| 10 | -12.7% | No Meaningful Difference |
| 20 | **-21.2%**（4.986→3.930 ms） | **Meaningful Difference** |

**Day 24：Layer B CDP trace 版本比較（median µs，N=5，關鍵 cell）：**

| Depth | Operation | Metric | Vue 3.5.40 | Vue 3.6.0-rc.2 | Δ% | Signal |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | update | Scripting | 156,171 | 116,145 | -25.6% | **Consistent Improvement**（5/5 paired，IQR 不重疊） |
| 20 | update | Instrumentation Duration | 6.8 ms | 4.6 ms | -32.5% | **Consistent Improvement**（5/5 paired） |
| 10 | update | Instrumentation Duration | 3.4 ms | 3.1 ms | -9.5% | **Consistent Improvement**（5/5 paired） |
| 20 | update | Vue Runtime CPU | 7,037 | 11,758 | **+67.1%** | Consistent Regression（low confidence） |
| 10 | update | Application CPU | 20,512 | 28,988 | **+41.3%** | Consistent Regression（low confidence） |

- 其餘約 70/88 個 Layer B cell（Rendering/Layout/Painting/Paint 多數 cell、Vue Runtime CPU/Application CPU 在其他 depth）為 Unstable，方向在不同 depth／不同 paired trial 間反覆翻轉，DOM 節點數全程固定，判定不是可歸因於 depth 或版本的訊號。

### Claim

- Watch Trigger Count / WatchEffect Trigger Count / Render Count 在兩版本、全部 4 個 depth 皆固定為 100 / 101 / 201——證實「watcher 只掛在最上層、不隨 depth 增加」的設計在實測上成立，且不受 Vue 版本影響。
- Computed Execute Count 精確等於 `(Depth-1) × 101`，兩版本、全部 depth 完全相同——確認 Scenario 的 reactive graph 形狀不受 Vue 版本影響（Scenario Freeze Rule 的正確性前提成立）。
- Update 階段的 JS Scripting cost 在 **Depth 20** 有可重現的降低：Layer A（頁面總時間）-21.2%、Layer B（Scripting rollup）-25.6%，兩層獨立量測互相印證，5/5 paired trial 同方向、IQR 不重疊。此改善**僅限 Depth 20 的 update 操作**。
- 此 Depth 20 的 JS-level 改善**不能**歸因於 Vue Reactivity Engine 本身：同一 cell 的 Vue Runtime CPU attribution 顯示 Consistent Regression（+67.1%），方向相反；且該 attribution bucket 本身被 `evidence.ts` 標記 low confidence（leaf-only sampling、已知低估 Vue 真實 inclusive cost）。

### Cannot Claim

- 不能宣稱「Vue 3.6 讓 Composable Chaos 整體變快」——Depth 1/5/10 的 update、以及全部 4 個 depth 的 build，皆為 No Meaningful Difference（Layer A）或 Unstable（Layer B）。
- 不能把 Depth 20 的 Scripting 改善解讀為「Vue Reactivity Engine 優化了」——證據本身矛盾（同一 cell 的 attribution bucket 顯示反方向），且該 attribution bucket 低信心。
- H2（composable 呼叫本身是否有額外 runtime cost）**本 Scenario 尚未驗證**——composable 層數與 computed 鏈長 1:1 耦合，無法單獨變動其中一個；需要另開 depth-matched 對照 scenario（未建立）。
- Rendering/Layout/Painting/Paint 出現的 Consistent Regression cell 不能歸因於 depth 或 Vue 版本——DOM 節點數全程固定，且非 depth 單調變化，判定為 headless instance-to-instance variance（GC、compositor 排程），非結構性發現。

### Source

- `src/scenarios/composable-chaos/README.md`（Observation、Cost Attribution、CDP Controlled Validation Day 23、Day 24 段落）
- `results/cdp-trace/composable-chaos/DAY24_VUE36_VALIDATION_REPORT.md`（全篇）
- `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md` Part 1 稽核表倒數第 2–3 列

---

## Experiment 04 — VDOM Stress

### Question

大量 UI Node 一次性 Render 時，Vue Runtime 與 Browser Rendering Pipeline 的成本各自在哪裡？隨 Node Count 增加，Scripting（Vue Runtime 執行成本）與 Rendering（Recalculate Style / Layout，Browser Pipeline 成本）哪一個先成為瓶頸？Vue 3.6 是否降低 Framework-level rendering cost？剩餘成本是否轉移到 Browser Rendering Pipeline？

### Scenario

- 刻意排除 API / Pinia / Router / Watch / Computed Chain / Async Logic / Business Logic，也不加入任何 rendering 最佳化（virtual scrolling / memoization / component caching / lazy rendering）——目標是建立 Raw Rendering Baseline。
- Render Count 選項：100 / 500 / 1000 / 5000。
- 點擊 Trigger Render 後一次性建立對應數量的 `{id, title}` Card 陣列並交給 Vue 掛載。
- **Mount**：頁面重新整理後第一次觸發（`cards` 為空）。**Update**：`cards` 已有內容時再次觸發（既有 key 的 diff/patch，且每次內容規則相同，實質是「內容沒變的 keyed diff」，非真實資料變更）。

### Versions

Vue 3.5.40（baseline）vs Vue 3.6.0-rc.2（validation）——三種不同方法各自獨立測過一輪。另有一組**架構比較**（非版本比較）：Vue 3.6.0-rc.4 Traditional vs Vue 3.6.0-rc.4 Vapor。

### Measurement

四輪量測，方法互不相同，數字不可直接互相比較：

1. **人工 DevTools 單次錄製**（Day18/19）：Render Duration、Scripting、Rendering、Painting、Recalculate Style、Layout、Paint。前景分頁、人工操作、非多 trial。
2. **Controlled Re-validation**（自動化、N=10 trial、interleaved，兩版本共用同一瀏覽器 session、兩個 dev server 並存）：僅 Render Duration（DevTools Trace 分類因工具限制 Not available）。
3. **`FINAL_VALIDATION_REPORT.md`**：獨立 isolated headless Chrome、CDP dual-trace、N=10 measurement + 3 warm-up trial，Mount+Update × 4 Node Count，10 個 metric（Render Duration + cost-trace 6 項 + runtime-attribution-trace 3 項）——本 Lab 對此 Scenario 最嚴謹的一輪。
4. **`DAY29_FINAL_VALIDATION_REPORT.md` Part 2/3**：沿用方法 3 的 pipeline，比較對象改為 Vue 3.6.0-rc.4 Traditional vs Vapor（架構軸線，不是 3.5→3.6 版本軸線）。

### Observed

**方法 1（人工單次錄製，Vue 3.5.40 → Vue 3.6.0-rc.2）：**

| Node Count | Mount Render Duration | Update Render Duration |
| --- | --- | --- |
| 100 | 4.300→4.900 ms（+14.0%） | 1.500→1.900 ms（+26.7%） |
| 500 | 11.800→13.700 ms（+16.1%） | 4.900→5.200 ms（+6.1%） |
| 1000 | 18.300→18.700 ms（+2.2%） | 8.600→9.100 ms（+5.8%） |
| 5000 | 63.200→70.800 ms（+12.0%） | 24.900→29.300 ms（+17.7%） |

- Mount 的 Scripting 差異無一致方向（0.0% / +12.5% / +4.0% / -2.2%）。
- Update 的 Scripting 在 N=500/1000/5000 一致上升（+25.0% / +15.4% / +14.0%），是本輪唯一跨多 Node Count 同方向的訊號，方向是「沒有改善」。
- Cost Structure 形狀（Mount 隨 Node Count 從 Scripting 轉向 Layout 主導；Update 全程 Scripting 主導）兩版本幾乎重疊，未觀察到 Bottleneck Shift。

**方法 2（Controlled Re-validation，N=10，僅 Render Duration）：**

- Mount：4 個 Node Count 全數為 Unstable（paired 方向 3/10~7/10，不到一致門檻）。
- Update：N=100/500/1000 皆 Unstable；**唯一** N=5000 達到 Consistent Signal（IQR 不重疊，9/10 paired 偏向 3.6，Median -14.6%）。
- **方法 2 沒有量測 Scripting**（見上方 Measurement：這輪僅測 Render Duration，DevTools Trace 分類因工具限制 Not available），因此不能直接拿方法 2 的結果去反駁方法 1 的「Update Scripting 一致上升」——那是兩個不同的 metric。真正可以拿來對照方法 1 該項 claim 的是方法 3 的 Scripting 資料（見下方）：Update N=500/1000/5000 的 Scripting Δ% 分別為 -10.8%/-6.2%/+2.4%，三者皆為 `Unstable`（`FINAL_VALIDATION_REPORT.md` §6）——用多 trial、CDP 直接量測 Scripting 後，方法 1 觀察到的「一致上升」方向沒有被重現，也沒有反轉成一致下降，而是落回雜訊範圍。
- 方法 2 本身觀察到的是另一個獨立訊號：Update N=5000 的 **Render Duration**（而非 Scripting）達到 Consistent Signal（-14.6%）。**Update N=5000 的 Render Duration 三種方法互相對照**：方法 1（人工單次）+17.7%；方法 2（N=10，claude-in-chrome/interleaved harness）**-14.6%（Consistent Signal）**；方法 3（N=10，isolated headless CDP，本 Lab 最嚴謹的一輪）+7.2%（`Unstable`，7/10 paired 方向未達一致門檻，見 `FINAL_VALIDATION_REPORT.md` §6）。方法 2 的 -14.6% 訊號**沒有在方法 3（不同 harness）中被重現**——三個方法對同一個 cell 給出三個不同方向/量級的數字，直接示範跨 harness 數字不可比較，也不可互相確認。

**方法 3（`FINAL_VALIDATION_REPORT.md`，最嚴謹，N=10，isolated headless CDP）：**

```
Consistent Improvement:  3 / 80 cells（全部在 Update 側，且全部屬於 low-confidence CPU attribution bucket——
                          見下方 Cannot Claim，不讀成「3/80 有改善」）
Consistent Regression:   6 / 80 cells（全部在 Mount N=100 或 N=5000，已歸因為量測 window artifact）
Stable / No Meaningful:  8 / 80 cells
Unstable:                63 / 80 cells
```

（Source：`FINAL_VALIDATION_REPORT.md` §6、§11、§12）

- 這 3 個 Consistent Improvement cell 分別是 Vue Runtime CPU（Update N=500，-63.8%）、V8/native CPU（Update N=100，-46.5%；Update N=500，-61.0%）——三者皆屬於本 Lab 方法論中固定標記 `confidence: low` 的 CPU-profiler attribution bucket，不是 Scripting 或 Render Duration。
- Update N=500 的額外交叉檢查（`FINAL_VALIDATION_REPORT.md` §12）：兩版本 CPU profiler 總取樣時間從 2,765,479µs 降到 1,040,065µs（約 -62%，與 CPU attribution 降幅相近），但同一批資料的取樣次數反而從 318 次增加到 374 次；Application CPU 幾乎持平（7,668µs→7,830µs，未同步下降）；而同一 cell 的 Render Duration 幾乎沒有差異（2.1ms→2.0ms，-4.8%）——CPU attribution 降了 60% 以上，但 wall-clock Render Duration 幾乎沒變，這個落差目前無法解釋。
- 因此這 3 個 cell 目前只能標記為「需要後續驗證的候選訊號」，不能當成乾淨的 Vue improvement。

- Mount N=100/N=5000 的 6 個 Consistent Regression：幾乎每個獨立指標（含彼此無直接因果關係的 Scripting、Layout、Paint、三個 CPU bucket）同步膨脹約 130–270%，只在頭尾兩個極端 Node Count 出現、中間 N=500/1000 完全沒有——判定為單一共同量測 artifact（trace window 因未知外部原因變長），而非 10 個獨立的 Vue 3.6 退步。
- Mount N=500/N=1000 的 Browser Rendering 類指標（Rendering/Layout/Painting/Paint）paired 方向持續偏向 Vue 3.6（10 次中 7–9 次），是全 matrix 方向最一致的模式，但因 IQR 重疊仍判為 Unstable，列為未來驗證候選訊號，非結論。
- Cost Structure：Mount 隨 Node Count 從 Scripting（33.3%→29.4%）轉向 Rendering/Layout 主導（50.2%→67.9%）；Update 修正 Layout/Paint 捕捉不完整的 bug 後，發現小 Node Count 時 Painting 佔比不低（N=100 時 30.2%），隨 Node Count 增加才轉為 Scripting 主導（N=5000 時 80.9%）——兩版本 Cost Structure 形狀一致，未觀察到 Bottleneck Shift。

**方法 4（Day 29 Part 2/3，Vue 3.6.0-rc.4 Traditional vs Vapor，架構比較）：**

Mount：

| 指標 | Mount N=1000 | Mount N=5000 |
| --- | --- | --- |
| Vue Runtime CPU（4 個 Node Count 全部 Consistent Improvement，low confidence） | -74.7% | -87.6% |
| Scripting | -52.5%（Consistent Improvement） | -47.7%（方向相同，Unstable） |
| Render Duration | -33.3%（Consistent Improvement） | -34.1%（方向相同，Unstable） |
| Rendering / Layout | 不穩定 | +2.3% / +1.7%（Stable/No Meaningful Difference） |

Update：

| 指標 | Update N=1000 | Update N=5000 |
| --- | --- | --- |
| Scripting | -66.0%（Consistent Improvement） | -75.4%（Consistent Improvement） |
| Render Duration | -49.8%（Unstable） | -56.5%（Consistent Improvement） |
| Vue Runtime CPU | 不穩定 | -73.7%（Consistent Improvement，low confidence） |

- Update N=500 的 Render Duration 出現 **Consistent Regression**（+49.1%，僅 1/10 trial 偏向 Vapor），原因未證實——是 Update 側唯一一個方向朝「變慢」的 Consistent 訊號，且恰好夾在 N=100／N=1000 兩個沒有此現象的 Node Count 之間。
- Mount N=5000：Scripting 佔（Scripting+Rendering+Painting）比例從 31.1%（Traditional）降到 18.8%（Vapor），Rendering 佔比從 66.6% 升到 78.7%——Framework 成本下降、Browser 成本持平，Cost Boundary 朝 Browser 位移。
- **Mount N=5000 的（Scripting+Rendering+Painting）絕對總和**：528,657µs → 457,544µs（**-13.5%**）。
- **Update N=5000 的（Scripting+Rendering+Painting）絕對總和**：63,590µs → 22,112µs（**-65.2%**）。這兩個百分比指的都是「Scripting+Rendering+Painting 三者加總」的絕對總量變化，**不是**「Vapor 整體應用程式成本下降 13.5%/65.2%」——本輪量測沒有涵蓋這三者以外的 main-thread 成本，也沒有涵蓋記憶體、bundle size 等其他面向；同理，Mount N=1000「Scripting 下降 52.5%」也不能讀成「整體成本下降 52.5%」，那只是 Scripting 單一分類的降幅，不等於 Scripting+Rendering+Painting 總量的降幅。

### Claim

- （Vue 3.5.40 單版本內，方法 1 與方法 3 互相獨立重現）Cost 隨 Node Count 增加，成長速率因分類而異；Mount 的 bottleneck 隨 Node Count 增加從 Scripting 移向 Browser Layout，Update 全程由 Scripting 相關成本主導——此 cost structure 形狀在人工單次錄製與自動化 CDP 矩陣兩種獨立方法下一致重現。
- 最嚴謹的方法 3（N=10，80 cell）：**沒有任何指標、任何 Node Count、任何 Operation，展現出通過該報告自訂審核標準（IQR 不重疊 + ≥9/10 paired 方向一致 + 不被已知 artifact 解釋）的、乾淨可重現的 Vue 3.6 改善或退步。**
- 方法 1 觀察到「像訊號」的差異（Update Scripting 在 N=500/1000/5000 一致上升 14–25%），但這個訊號**沒有在後續真正量測 Scripting 的多 trial 方法（方法 3）中被重現**——方法 3 同一組 Node Count 的 Scripting Δ% 為 -10.8%/-6.2%/+2.4%，三者皆 `Unstable`，方向甚至反轉。方法 2 是另一個獨立示例：它只量 Render Duration（未量 Scripting），在 Update N=5000 得到 Consistent Signal -14.6%，但這個訊號同樣沒有在方法 3（不同 harness）中被重現（方法 3 同一 cell 是 +7.2%，`Unstable`）。兩者合起來是「單一 trial／單一 harness 量測不可靠」的兩個獨立示例，而非同一個訊號的兩次驗證——不可把方法 2 的 Render Duration 結果當成方法 1 Scripting claim 的反駁證據。
- Vapor 架構比較（獨立問題）：在 Mount 情境，Vue Runtime CPU 在全部 4 個 Node Count 皆為 Consistent Improvement（-42%~-88%，但屬 low confidence attribution bucket，需解讀為方向性訊號而非精確數字）；Browser Rendering（Layout/Recalculate Style）在 Mount N=5000 維持 Stable/No Meaningful Difference；Cost Boundary 確實朝 Browser 位移。
- Vapor 架構比較，Update 情境：Scripting 在 N=1000（-66.0%）與 N=5000（-75.4%）皆達 Consistent Improvement（cost-trace 指標，信心度高於 CPU attribution bucket）；同一個 N=5000 cell 的 Vue Runtime CPU 也達 Consistent Improvement（-73.7%，low confidence）。Update N=5000 的（Scripting+Rendering+Painting）絕對總和下降 65.2%（63,590→22,112µs）——這是本次 Vapor 比較中，唯一同時有 cost-trace（Scripting）與絕對總量雙重支持的改善訊號，但**僅限 N≥1000**：N=100/500 的 Scripting 皆為 Unstable，N=500 的 Render Duration 甚至是 Consistent Regression（+49.1%）。

### Cannot Claim

- 不能宣稱「Vue 3.6 Traditional 全面改善了 VDOM Stress 效能」——方法 3 的 80 個 cell 中 0 個乾淨的、不受已知 artifact 解釋的改善。
- 不能宣稱「Vue 3.6 讓 VDOM Stress 變慢」——6 個 Consistent Regression 全部集中在 Mount N=100/N=5000 兩個極端值且同步等比例膨脹，已判定為量測 window artifact，不讀成真實退步。
- 不能把 Vapor 的結果解讀成「升級到 Vue 3.6 Traditional 就能得到 Vapor 的效能」——Vapor 是不同的 rendering architecture（需額外的 `features.vapor: true` build 設定與 `vaporInteropPlugin`），不是單純的版本升級；且歷史 Traditional baseline 用的是 `3.6.0-rc.2`，Vapor 比較用的是 `3.6.0-rc.4`，兩者串接比較時帶有未受控的 patch 版本落差。
- 不能把 Vapor 的 Mount 結果推論到 Update（Update 側訊號較弱，只在 N=5000 才乾淨過線，且 N=500 出現一個未解釋的 wall-clock regression），也不能推論到 Component Storm / Composable Chaos（Day 29 明確聲明這兩個 scenario 的 Vapor 相容性未評估，不做任何方向的斷言）。
- Vue Runtime CPU / Application CPU / V8-native CPU 這三個 attribution bucket 全程被標記 low confidence，即使數字方向一致、跨規模重現，也只能讀成「強烈的方向性訊號」，不是「已確認的數字」。
- 不能把 Update 情境「內容沒變的 keyed diff」量到的低 Rendering/Painting 成本，推論成「Vue 更新真實資料變更時 Paint 成本也很低」——這是 Scenario 本身刻意設計（每次重建陣列內容規則相同）造成的結果，非通用結論。
- 不能將此結果推論為純 Vapor application 的整體效能——本次測試的條件是 **interop** 模式：root tree（`App.vue`／`DefaultLayout`／`RouterView`）仍是 Traditional，只有葉節點的 `<script setup>` SFC 被強制編譯成 Vapor，且需要 `vaporInteropPlugin` 把兩者橋接在一起（`DAY29_FINAL_VALIDATION_REPORT.md` Part 2/3 技術事實）。目前沒有任何資料涵蓋「整個 component tree 都是 Vapor、不經過 interop bridge」的情境。
- 目前 Vapor 數據為單次受控執行（本 session 唯一一輪，640 個 trial 檔案），因此不能視為已完成獨立重複驗證的 final performance conclusion——`DAY29_FINAL_VALIDATION_REPORT.md` Part 9、Part 10、結尾「一句話」段落皆明講「這些都是本輪單次 Controlled 執行的結果，尚未經過獨立重跑驗證」。

### Source

- `src/scenarios/vdom-stress/README.md`（全篇，含 Baseline Snapshot、Vue 3.6 Validation、Controlled Re-validation、Interpretation Guardrails）
- `src/scenarios/vdom-stress/VDomStressPage.vue`（Scenario 原始碼，確認 Mount/Update 判斷邏輯與量測時機點）
- `results/cdp-trace/FINAL_VALIDATION_REPORT.md`（全篇）
- `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md`（全篇，Part 1 為既有證據稽核，Part 2/3 為 Vapor 架構比較新資料）

### Method / Decision Sources

- `docs/decisions/vapor-worktree-devtools-panel-unreliable.md` — 支撐「Vapor 相容性驗證採用 isolated headless Chrome / CDP automation，而不是依賴人工 DevTools panel 判讀」的 methodology decision。此文件**沒有量測數據**、**不支撐任何 performance Claim**，也**不影響已 commit 的 automated measurement results**（文件本身已註明：`DAY29_FINAL_VALIDATION_REPORT.md` 的自動化資料是用無頭瀏覽器擷取，沒有開內嵌 DevTools 面板，所以沒踩到這個坑）。不列入 Primary Sources。

---

## Note — AI Coding / Design System（本 repo 沒有對應的 Lab）

`results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md` Part 1 稽核表最後一列明確記錄：「Design System / Architecture」這個 Lab **這個 repo 裡沒有**，且該報告特別註明「並非為了這份報告而虛構」。

本 Pack 據此補上這條 provenance：本 repo 目前**沒有**任何關於 AI-assisted coding、Design System 或 Architecture Lab 的效能實驗、程式碼或原始數據。**若 Conference 場合要談 AI Coding，那是工程上的延伸詮釋（engineering interpretation），不是本 Lab 已執行、有數據支持的 performance experiment 結果**——不應與 Experiment 01–04 的量測數字並列成同等級的證據。

### Source

- `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md` Part 1 稽核表最後一列

---

## Cross-Experiment Notes（跨實驗的方法論事實，非結論）

以下是四個 Experiment 中重複出現、且有明確 Source 佐證的方法論事實，記錄於此避免在各 Experiment 內重複：

1. **背景分頁（`document.hidden === true`）的量測雜訊可以偽造出與真實版本差異同量級、甚至相反方向的訊號。** 最早見於 Reactive Chain（單次量測差 157.7%，重跑同一份 build 可差到 73ms），在 Component Storm Day 30 用 CDP 直接控制 visibility 重現並定位（hidden 狀態下重現 README 的 -15.3%~-20.8%，visible 狀態下訊號消失）。Source：`src/scenarios/reactive-chain/README.md`、`results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md`。
2. **Vue Runtime CPU / Application CPU / V8-native CPU 三個 CPU-profiler attribution bucket，在本 Lab 全部驗證中都被標記 `confidence: low`（或 V8-native 為 `unavailable`）**，原因是 leaf-only sample attribution 低估 Vue 的真實 inclusive cost，且該 trace 本身的 profiler overhead 會污染取樣分佈。這三個 bucket 在 Composable Chaos（Depth 20 update）與 VDOM Stress Vapor 比較中都出現「與 cost-trace 方向相反」或「需要額外檢查」的情況。Source：`scripts/cdp-trace/TRACE_EVIDENCE_SCHEMA.md`（low confidence 定義本身）、`results/cdp-trace/composable-chaos/DAY24_VUE36_VALIDATION_REPORT.md`（Composable Chaos Depth 20 update 的方向相反案例）、`results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT.md`（VDOM Stress Vapor 比較中 attribution bucket 需額外檢查的案例）。
3. **單一 trial（或 single-trial 人工量測）觀察到的「一致方向」訊號，在多 trial 重測後可能不被重現，方向甚至反轉。** VDOM Stress 的方法 1→方法 2 是本 Lab 內最直接的示例。Source：`src/scenarios/vdom-stress/README.md` 的「Reproducibility」段落。
4. **不同量測 harness（`claude-in-chrome` 瀏覽器擴充套件 vs isolated headless CDP）量到的絕對數字可以相差 2 倍以上，且方向可能相反**——不能跨 harness 直接比較或相減。Component Storm README（187.405ms）與 Day 30 CDP（84.9ms）即為一例。Source：`results/cdp-trace/component-storm/RUNTIME_ATTRIBUTION_REPORT.md` §1.1。
5. **`performance.memory`（JS Heap `usedJSHeapSize`）在本 Lab 的自動化環境下不可靠**，受 V8 GC 排程時機影響極大，多次驗證中 Heap Δ 落在大範圍雜訊帶內、無法區分版本或 Update Scope 差異，甚至出現「總耗時拉長反而 heap 變小」的反直覺結果（V8 major GC）。Source：`src/scenarios/component-storm/README.md`。

---

## 總結性限制（給讀這份文件的人）

- 3.6.0-rc.2 / 3.6.0-rc.4 皆為 release candidate，四個 Experiment 的所有「Vue 3.6」數字都可能與正式版不同。
- 四個 Experiment 沒有一個在其最嚴謹的量測方法下，對「Vue 3.6 Runtime（Traditional）降低了 Framework-level cost」給出可重現、通過本 Lab 自訂統計門檻的正面證據。Composable Chaos 有一個窄範圍（Depth 20 update）的 JS-level Scripting 改善，但無法歸因到 Vue Reactivity Engine 本身。
- 在 **Vapor 架構比較**（VDOM Stress）中，跨規模（全部 4 個 Node Count）一致訊號**僅出現在 Vue Runtime CPU**（Mount 情境，−42%~−88%）——但這是 low-confidence CPU attribution bucket，不是 Scripting。**Scripting**（cost-trace，信心度較高的指標）在 Mount 只有 **N=1000** 一個規模達到 Consistent Improvement（N=100/500/5000 皆 Unstable），在 **Update** 則是 **N=1000 與 N=5000** 兩個規模達到 Consistent Improvement（N=100/500 Unstable）——都不是「跨全部規模一致」。這是架構選擇（Traditional vs Vapor）帶來的訊號，不是版本升級（3.5→3.6）本身能取得的收益，且不應把 Vue Runtime CPU 的跨規模一致性誤讀成 Scripting 本身也跨規模一致。
- 四個 Experiment 一致指向同一個工程結論（非行銷結論，而是各自 Baseline 驗證階段就已用實測數字支持的發現）：Component Tree / Reactive Graph / DOM Node Count 的**結構**決定了 Runtime Cost 的量級上限，Vue Runtime 版本升級頂多影響「單位操作成本」這個乘數，不會改變「要做幾次操作」這個底數。這個發現本身分別記錄在各 Experiment 的 README（Reactive Chain 的 Computed Execute Count 不隨版本改變、Component Storm 的 Component Scale Comparison、Composable Chaos 的 Computed Execute Count 精確公式、VDOM Stress 的 Node Count 縮放倍數），不是本文件新提出的推論。
