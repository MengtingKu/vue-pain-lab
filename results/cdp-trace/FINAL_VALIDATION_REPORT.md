# 正式驗證報告 — Vue 3.5.40 vs Vue 3.6.0-rc.2（WP4：VDOM Stress Test）

研究問題：

> 當 UI Scale 放大時，Vue 3.6 的 Framework-level Rendering Optimization 能降低多少 Runtime Cost？
> 而剩餘成本是否轉移到 Browser Rendering Pipeline？

`src/scenarios/vdom-stress/` 全程未被修改。Measurement Infrastructure 依
`results/cdp-trace/calibration/FINAL_CALIBRATION_REPORT.md` 凍結，中途有
一項揭露的例外（見 §3），且該例外在**分析任何資料之前**就已套用到 Mount
與 Update 兩側，並非事後為了得到某個結果才回頭修改。

---

## 1. Environment

|                 | Vue 3.5.40                                                                                                                                                                | Vue 3.6.0-rc.2                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 來源            | 本 repo，`main` 分支                                                                                                                                                      | git worktree `../vue-pain-lab-vue36`，detach 在同一個 commit（`9bf942d`） |
| Scenario 原始碼 | 相同 — 同一個 commit，未修改                                                                                                                                              | 相同 — 同一個 commit，未修改                                              |
| Vue 安裝方式    | `vue@3.5.40`（repo 預設）                                                                                                                                                 | `npm install vue@3.6.0-rc.2 --save-exact`（只改 `vue` 一個套件）          |
| Dev server      | `http://localhost:5173`                                                                                                                                                   | `http://localhost:5174`                                                   |
| Node.js         | v24.13.0                                                                                                                                                                  | v24.13.0                                                                  |
| Browser         | Chrome/151.0.7922.76，headless，isolated（每個條件獨立的暫存 profile）                                                                                                    | 相同                                                                      |
| Vapor           | **未使用** — 已確認 `vite.config.ts`、`package.json`、`VDomStressPage.vue` 皆無 `vapor` 相關字樣；`vue` package 的 exports 也沒有這次 build 實際引用到的獨立 vapor 進入點 | 相同                                                                      |

## 2. Benchmark Matrix

```
2 個 Vue 版本 × 4 個 Node Count（100/500/1000/5000）× 2 個 Operation（Mount/Update）
× 10 次 measurement trial（另 3 次 warm-up，不納入統計）× 2 種 trace source
= 160 個 measurement trial，320 個實際 trigger+trace cycle
```

每個 trial 都產生：Render Duration（Scenario 自己的 `performance.now()`）+
`cost-trace`（`TRACE_CATEGORIES_NO_CPU_PROFILER`）+
`runtime-attribution-trace`（`TRACE_CATEGORIES`，CPU profiler 開啟）+
metadata。分析前已確認全部 640 個檔案（320 traces + 320 meta）齊全 —
`results/cdp-trace/vue-{3.5.40,3.6.0-rc.2}/{mount,update}-{100,500,1000,5000}/trial-0{1-10}/`。

## 3. Measurement Protocol

凍結協定（沿用 Final Calibration 的版本）：

```
Reset（Page.navigate）→ waitForAppReady → [Update 才需要的 priming Mount]
→ waitForBrowserFrames(2) → Tracing.start(category set)
→ fireTriggerRender（不用 awaitPromise）→ waitForRenderComplete（Runtime.bindingCalled）
```

**一項揭露的協定修正，Mount 與 Update 兩側都已套用**：在
`waitForRenderComplete` resolve 之後、`Tracing.end()` 之前，加入了對稱的
`waitForBrowserFrames(2)`。用的是完全相同的既有 helper（`sync.ts`），沒有
新機制。加入原因：直接檢視 trace 後發現 Mount 的 Layout/Paint 幾乎從未被
捕捉到（整個 Mount matrix 只有 0–2/10 觀察到 Layout）——原因是一次大型、
不間斷的 Mount JS 工作會獨占主執行緒，導致 Layout/Paint 要等到「完成訊號」
發出之後才會被排程，而我們原本在完成訊號一發出就立刻呼叫
`Tracing.end()`，因此完全錯過。這屬於任務指示中明確允許修正的「會直接造成
資料錯誤的 blocker」，套用方式對兩個版本、兩種 operation 完全一致。

修正後，**Mount 全部重跑**（8 個 cell），接著使用者要求**Update 也全部重跑**
（另外 8 個 cell），因此整個 matrix 目前使用**同一套、完全一致的協定狀態**
——不再有 Mount 用新協定、Update 用舊協定的不一致（先前版本的報告曾有此
落差，已在本版修正並重新產出全部資料）。修正後 Layout / Paint /
Recalculate Style 在**全部 320 筆 cost-trace** 中都是 10/10 觀察到。

**已知量測變異，未被消除**：依指示，先前發現但無法解釋的 Render Duration
不穩定現象（首見於 `PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md`）被保留、
不透過修改 infrastructure 來消除。本輪它再次出現在 Mount N=100 / N=5000
（見 §11），以及較輕微地出現在 Update 側幾個 cell（見 §12）——皆誠實標記，
不做掩蓋。

## 4–5. Vue 3.5 / Vue 3.6 結果

完整逐 cell 資料（Median/P25/P75/Min/Max，兩個版本，10 個 metric × 2 個
operation × 4 個 node count = 80 個 cell）：
`results/cdp-trace/validation/matrix-analysis.json`。以下 §6–§10 為摘要
表格；完整數字以該 JSON 為準。

## 6. Difference Matrix — Update

Δ% = (Vue 3.6 median − Vue 3.5 median) / Vue 3.5 median × 100。Paired =
同一個 trial index（同一個 source）中 Vue 3.6 < Vue 3.5 的次數 / 兩版本
皆有觀察到值的 trial 數。

| Metric            | N=100              | N=500              | N=1000        | N=5000        |
| ----------------- | ------------------ | ------------------ | ------------- | ------------- |
| Render Duration   | −34.9% (7/10)      | −4.8% (6/10)       | −7.9% (7/10)  | +7.2% (4/10)  |
| Scripting         | −42.9% (7/10)      | −10.8% (7/10)      | −6.2% (7/10)  | +2.4% (7/10)  |
| Rendering         | −38.7% (7/10)      | +11.6% (2/10)      | +9.3% (5/10)  | −0.3% (4/10)  |
| Recalculate Style | −45.7% (7/10)      | +15.8% (4/10)      | −19.5% (6/10) | +22.6% (3/10) |
| Layout            | −29.5% (8/10)      | +18.9% (3/10)      | +4.2% (6/10)  | +4.8% (4/10)  |
| Painting          | −45.6% (7/10)      | −45.6% (6/10)      | +55.1% (6/10) | +0.4% (5/10)  |
| Paint             | −40.6% (7/10)      | −28.6% (5/10)      | +37.2% (5/10) | +0.8% (4/10)  |
| Vue Runtime CPU   | −21.4% (5/10)      | **−63.8% (10/10)** | −39.2% (6/10) | +0.7% (4/10)  |
| Application CPU   | −100%¹ (3/10)      | +27.0% (5/10)      | +8.5% (4/10)  | −1.9% (8/10)  |
| V8/native CPU     | **−46.5% (10/10)** | **−61.0% (10/10)** | −30.0% (6/10) | +10.4% (2/10) |

¹ v35 median 166µs、v36 median 0µs — 兩者都在觀察下限附近，不宜讀成「消失
100%」。

**訊號分類：0/40 個 Update cell 達到 `Consistent Regression`，3/40 達到
`Consistent Improvement`（Vue Runtime CPU N=500、V8/native CPU N=100 與
N=500），其餘全部 `Unstable` 或 `Stable / No Meaningful Difference`。**
這三個 `Consistent Improvement` 需要在 §12 的額外檢查後才能判讀，不宜
直接讀成「Vue Runtime 變快了」。

## 7. Difference Matrix — Mount

（Mount 資料本身在後續的 Update 重跑中未被再次觸碰——但這是因為 Mount
已在更早一步的修正中，與 Update 一起套用了 §3 所述的 trailing-edge
frame-sync 修正並全部重跑過。與 Update 側同樣，本表所有 8 個 cell
背後的 80 筆 Mount cost-trace 中，Layout / Paint / Recalculate Style
皆為 10/10 觀察到，與 Update 側同一套、修正後的協定狀態一致，不是修正
前殘留的舊資料。）

| Metric            | N=100              | N=500         | N=1000        | N=5000             |
| ----------------- | ------------------ | ------------- | ------------- | ------------------ |
| Render Duration   | +5.9% (4/10)       | +12.3% (2/10) | +10.5% (3/10) | **+161.1%** (2/10) |
| Scripting         | +2.0% (6/10)       | +10.6% (3/10) | +8.8% (2/10)  | **+161.9%** (2/10) |
| Rendering         | −15.2% (8/10)      | −15.1% (7/10) | −17.5% (9/10) | **+158.6%** (2/10) |
| Recalculate Style | −23.8% (7/10)      | +14.3% (5/10) | −12.8% (7/10) | **+145.3%** (2/10) |
| Layout            | −8.9% (7/10)       | −17.3% (7/10) | −16.1% (8/10) | **+164.3%** (2/10) |
| Painting          | −14.6% (7/10)      | −13.5% (7/10) | −17.8% (8/10) | **+130.3%** (3/10) |
| Paint             | −17.6% (8/10)      | −13.6% (7/10) | −17.7% (8/10) | **+129.0%** (3/10) |
| Vue Runtime CPU   | **+206.7%** (0/10) | +19.2% (3/10) | −2.4% (6/10)  | **+194.6%** (0/10) |
| Application CPU   | **+269.8%** (0/10) | −1.4% (5/10)  | −7.2% (5/10)  | **+177.0%** (0/10) |
| V8/native CPU     | **+139.5%** (0/10) | +22.7% (4/10) | −0.1% (4/10)  | **+147.7%** (0/10) |

粗體 = 本報告分類為 `Consistent Regression`（IQR 不重疊且 ≥9/10 paired
trial 偏向 3.5）。**解讀 N=100/N=5000 任何數字前請先讀 §11** ——這些數字
極可能是單一共同 artifact，不是十個獨立發現。

## 8. Paired Analysis

- **Mount N=500/N=1000，Browser Rendering 類指標**（Rendering、Layout、
  Painting、Paint，大部分的 Recalculate Style）：paired 方向持續偏向
  Vue 3.6（10 次中有 7–9 次），在這兩個 node count、這五個指標上都是同一個
  方向。這是**整個 matrix 中方向最一致的訊號**——比 Update 側任何訊號都
  更常在多個指標間互相印證。因為 IQR 有重疊（相對 trial-to-trial 變異，
  效果量偏小），依本報告門檻仍判為 `Unstable`，但八個「指標×node count」
  cell 各自獨立指向同一個方向，值得作為**未來更大樣本驗證的候選訊號**，
  不宜直接當雜訊丟棄。詳見 §9/§10。
- **Update N=100，多個 CPU attribution 與部分 cost-trace 指標**：paired
  方向也持續偏向 Vue 3.6（7/10 甚至 10/10），但如 §12 所述，這一輪的
  整體 trace window 長度本身在版本間也有差異，需要先排除「window 變短」
  這個共同原因，才能判斷這是否為獨立的 Framework 訊號。
- **Mount N=100/N=5000**：paired 方向在幾乎所有指標上都是 **0/10 或
  2–3/10**——也就是說在這兩個 node count，幾乎每個指標、每次 trial，
  Vue 3.6 都比 Vue 3.5 高。原因見 §11。

## 9. Cost Structure（描述性基準，Vue 3.5.40）

### Mount

| Node Count | Scripting |         Rendering（其中 Layout 佔比） | Painting |
| ---------: | --------: | ------------------------------------: | -------: |
|        100 |     33.3% | 50.2%（Layout 佔 Rendering 的 63.2%） |    16.5% |
|        500 |     28.0% |                        57.9%（75.4%） |    14.1% |
|       1000 |     30.3% |                        60.2%（71.8%） |     9.5% |
|       5000 |     29.4% |                        67.9%（75.9%） |     2.7% |

**與 `src/scenarios/vdom-stress/README.md` 原本人工觀察的 Baseline 形狀
幾乎一致**：Scripting 佔比大致持平（28–33%）、Rendering 佔比隨 Node Count
上升（50%→68%）、Layout 全程主導 Rendering、Painting 佔比隨 Node Count
趨近於零（與該 README 記錄的原因一致：`.cards__list` 的
`overflow-y: auto` clipping 讓大多數 Card 不需要真的被 Paint，只需要被
Layout）。這是用全自動、dual-trace pipeline 對該結構性發現的一次獨立
重現。

### Update（本輪重跑後的新結果 — 與先前版本報告的數字明顯不同）

| Node Count | Scripting | Rendering（Layout 佔比） | Painting |
| ---------: | --------: | -----------------------: | -------: |
|        100 |     42.8% |           26.9%（27.3%） |    30.2% |
|        500 |     42.4% |           19.6%（30.1%） |    38.0% |
|       1000 |     60.9% |           21.3%（34.7%） |    17.8% |
|       5000 |     80.9% |           11.8%（26.4%） |     7.3% |

**重要更正**：本報告先前版本（Update 尚未套用 trailing-edge fix 時）
顯示 Update 幾乎 100% 是 Scripting、Rendering/Painting 趨近於零。那個結論
**是 Layout/Paint 捕捉不完整造成的假象**，不是真正的 cost structure。
修正後的正確圖像是：Scripting 佔比隨 Node Count 上升（43%→81%），但
Painting 佔比在小 Node Count 時相當可觀（N=100 時 30.2%、N=500 時甚至
38.0%），隨 Node Count 增加才逐漸縮小；Rendering 佔比則相對平穩
（12–27%）。這代表 Update 路徑並非「幾乎不動 DOM」這麼單純——在小
Node Count 時，Browser Rendering Cost（尤其 Painting）其實佔有意義的比重，
只是隨 Node Count 增加，Scripting（重建陣列 + diff 比對）的絕對成本
成長更快，才逐漸把 Rendering/Painting 的相對佔比壓低。

## 10. Bottleneck Analysis

**Mount**：Bottleneck 隨 Node Count 增加，從「Scripting 佔一定比例」
轉向「Rendering/Layout 主導」——Rendering 佔比單調上升（50%→68%），
Scripting 佔比持平。與 Baseline 記錄的「Layout 是 Mount 在大規模下近似
線性成長的主要成本」一致。在可用於比較的 Node Count（100/500/1000，
N=5000 需排除，見 §11）上，Vue 3.5 與 Vue 3.6 的 cost structure 形狀
**沒有觀察到 Bottleneck Shift**。

**Update**：修正後的資料顯示 Bottleneck 並非全程都是 Scripting——小
Node Count 時 Painting 佔比不低（30–38%），隨 Node Count 增加才轉為
Scripting 主導（N=5000 時 80.9%）。這本身就是這次修正得到的新結構性
發現。兩個版本在此形狀上同樣**沒有觀察到 Bottleneck Shift**。

## 11. Signal Classification — Mount N=100/N=5000 異常（為什麼要特別標記，而非照單全收）

在 Mount N=100 與 Mount N=5000，幾乎每一個指標——Render Duration、
Scripting、Rendering、Recalculate Style、Layout、Painting、Paint、
以及三個 CPU attribution bucket——Vue 3.6 都比 Vue 3.5 高出約
**130–270%**，而這個現象在 N=500、N=1000 幾乎不存在。三個理由支持這是
「單一共同量測 artifact」，而不是十個各自獨立的 Vue 3.6 退步：

1. **跨越彼此無直接因果關係的量，卻同步等比例膨脹。** 真正的 Vue
   Runtime 退步理應選擇性出現（例如 Scripting 上升但 Layout 不受影響
   ——Vue 並不控制 Blink 跑 Layout 要花多久，只決定要求瀏覽器做哪些
   DOM 異動）。看到 Scripting、Layout、Paint，加上三個獨立的 CPU
   attribution bucket，**全部**在**同兩個** node count 同步膨脹約
   130–270%，遠比「某個 Framework 改動」更像「整個 trace window 因為
   某個外部原因變長了」。
2. **不是 Node Count 的單調函數。** N=100 與 N=5000 是測試範圍的兩個
   極端值；中間的 N=500、N=1000 完全沒有這個現象（多是
   `Stable`/`Unstable`，差異小且方向混雜）。真正與規模相關的退步理應
   隨 Node Count 漸進出現，不會只在頭尾兩端同時出現。
3. **延續一個已經揭露、尚未解決的既有問題。** §3 已標記 Render Duration
   不穩定為「已知量測變異」，源自
   `PHASE_5_1_TRIGGER_OBSERVATION_REPORT.md` 與
   `INSTRUMENTATION_ISOLATION_REPORT.md`。這正是同一個現象再度出現——
   因為 Mount 的 JS 工作是一次不間斷的大區塊，使得整個 trace window（以及
   window 內被取樣/量測到的一切）對「導致此現象的未知原因」特別敏感。

**這不是在迴避問題，而是正確地劃定範圍。** 本報告的 Final Validation
Result 與 Research Conclusion 都沒有使用 Mount N=100 或 Mount N=5000 的
任何數字。§7 的 `Consistent Regression` 標籤是分類器如實算出的結果，
但**不**代表「Vue 3.6 的 Mount 變慢了」——那正是本任務 Evidence
Classification 規則要求避免的單一原因過度推論。若要進一步追查，建議
之後獨立、背靠背重跑 Mount N=100 與 N=5000，同時監控系統資源
（CPU/記憶體），才能確認或排除外部原因——這裡不再進一步臆測。

## 12. Vue Runtime Attribution — 僅使用可信範圍

依 §11，Mount N=500、N=1000（未出現異常）以及 Update 全部 Node Count
的 Vue Runtime/Application/V8-native CPU attribution 才視為有參考價值。

**Update 側三個 `Consistent Improvement` 需要額外檢查**：Vue Runtime
CPU（N=500，−63.8%）、V8/native CPU（N=100，−46.5%；N=500，−61.0%）
在 paired 方向與 IQR 門檻上都乾淨地達標。但進一步檢查發現：在 Update
N=500，兩版本 CPU profiler 取樣的**總取樣時間**（10 個 trial 加總）從
2,765,479µs（3.5.40）降到 1,040,065µs（3.6.0-rc.2），下降約 62%——
與 V8/native CPU、Vue Runtime CPU 的降幅相近；但**同一組資料的取樣次數
反而從 318 次增加到 374 次**，且 Application CPU 幾乎持平（7,668µs →
7,830µs，未同步下降）。這代表：

- 支持「這是真訊號」的一面：Application CPU 沒有跟著等比例下降，如果
  純粹是「整個 window 變短、所有 bucket 等比例縮水」，Application CPU
  理應也同步下降，但它沒有——這點與 Mount N=100/N=5000 那種「連
  Application CPU 都一起爆炸性上升」的模式不同，比較不像單純的
  window-length artifact。
- 需要保留懷疑的一面：Render Duration 在 Update N=500 幾乎沒有差異
  （v35=2.1ms vs v36=2.0ms，−4.8%），但 CPU attribution 卻相差
  60% 以上——如果真的是 Vue Runtime 執行變快，理應在
  `performance.now()` 量到的 Render Duration 上也看到類似幅度的變化，
  但沒有看到。這個落差目前無法解釋。

**結論：這三個 `Consistent Improvement` 標記為需要後續驗證的候選訊號，
不寫成「Vue Runtime Cost 已確認改善」。** 在可用範圍內的其餘 cell
（Mount N=1000、Update 其餘 node count）：無任何 attribution bucket
達到 `Consistent Improvement` 或 `Consistent Regression`。

## 13. Vapor Attribution Limitation

已確認（§1）：本 Scenario 未使用 Vapor——`vite.config.ts`、
`package.json`、`VDomStressPage.vue` 皆無 `vapor` 相關字樣；CPU profiler
trace 中看到的都是 `vue.runtime.esm-bundler-*.js`（標準 runtime），從未
出現 vapor 專屬的 bundle。**本報告中任何結果都不得歸因於 Vapor**，
也確實沒有這樣做。凡本報告提到「Vue 3.6」，指的是 `3.6.0-rc.2` 在此
Scenario 下預設（非 Vapor）路徑所包含的編譯器／runtime 改動整體，不是
特指 Vapor。

## 14. Final Validation Result

```
Consistent Improvement:  3 / 80 cells（全部在 Update 側，需依 §12 保留態度）
Consistent Regression:   6 / 80 cells（全部在 Mount N=100 或 N=5000 — 見 §11，
                          不讀成真正的 Vue 3.6 退步）
Stable / No Meaningful:  8 / 80 cells
Unstable:                63 / 80 cells
```

**沒有任何指標、在任何 Node Count、任何 Operation 下，展現出通過本報告
自訂審核標準（IQR 不重疊 + ≥9/10 paired 方向一致 + 不被 §11/§12 的已知
artifact 解釋）的、乾淨可重現的 Vue 3.6 改善或退步。** 全 matrix 中方向
最一致的模式，是 Mount 在 N=500/N=1000 的 Browser Rendering 類指標
（Rendering/Layout/Painting/Paint）持續偏向 Vue 3.6，八個「指標×node
count」cell 互相印證，但因 IQR 重疊未達門檻，列為**未來驗證的候選訊號**，
而非確認結論。

## Research Conclusion

### Q1 — Vue 3.6 是否降低 Framework Runtime Cost？

在可用資料範圍內，沒有任何 cell 對 Scripting 或 Vue Runtime CPU 達到
`Consistent Improvement`（Update 側的三個 Consistent Improvement 皆為
CPU attribution 而非 Scripting，且依 §12 需要保留態度）。**未獲確認。**

### Q2 — 哪一個 Node Count 開始出現可重現的改善？

沒有一個 Node Count 全面達標。最接近的候選：Mount N=500/N=1000 的
Browser Rendering 類指標（見 Q3），以及 Update N=500 的 CPU attribution
（見 §12，需進一步驗證）。

### Q3 — 改善是否來自 Vue Runtime，還是 Browser Rendering Pipeline？

兩者在本輪都未達到 `Consistent` 標準。**如果**未來更大樣本的驗證確認了
Mount N=500/N=1000 的 Browser Rendering 傾向（§8、§11），那會指向
Browser Rendering Pipeline（Layout/Paint），而非 Vue Runtime／Scripting
——因為同樣的 Node Count 下 Scripting 並未出現同等一致的傾向。Update
側的 CPU attribution 候選訊號（§12）則指向相反方向，但尚未通過交叉檢查。

### Q4 — UI Scale 放大後，剩餘成本主要落在哪裡？

在可比較的 Node Count 範圍內，兩版本間的 cost structure 形狀不變
（§10）：Mount 隨 Node Count 增加，成本從「Scripting 佔一定比例」轉向
「Rendering/Layout 主導」；Update 則隨 Node Count 增加，從「Painting
佔相當比重」轉向「Scripting 主導」（本輪修正後的新發現，見 §9）。兩者
皆**未觀察到 Bottleneck Shift**。

```
Framework Cost        → 未確認有變化（Q1）
        ↓
Browser Cost           → 未確認有變化；一個候選訊號（Mount
                          Rendering/Layout/Paint，N=500/1000）尚未達到
                          Consistent 標準——標記待後續驗證，非結論
        ↓
Bottleneck              → 與 Vue 3.5.40 相比形狀不變（Q4）——Mount：
                          隨 N 增加從 Scripting 轉向 Layout 主導；
                          Update：隨 N 增加從 Painting 佔比可觀轉向
                          Scripting 主導
        ↓
Vue 3.6 Contribution     → 本 Scenario、本輪未能確立
        ↓
Architecture Implication → 與 Baseline 本身的結論一致
                          （`src/scenarios/vdom-stress/README.md`）：
                          如果這個 Scenario 所代表的 Node-Count 驅動成本
                          是真正的問題，解法在 Component Architecture
                          （virtualization、分批 render），不是升級 Vue
                          版本。本輪再加上一點：即使用了一套經過
                          contamination 控管的 dual-trace 量測 pipeline，
                          依然沒有找到可歸因於版本升級、足以支持「應該
                          為此升級」的改善證據。
```

## Vue 3.6 到底改善了哪一個 Cost？

**在本 Scenario、本規模、本量測 pipeline 下：沒有任何一個獲得確認。**
Render Duration、Scripting、Rendering、Recalculate Style、Layout、
Painting、Paint，或三個 Vue Runtime／Application／V8-native CPU
attribution bucket 中，沒有任何一項在任何 Node Count、任何 Operation
下，展現出可重現（IQR 分離、≥9/10 paired 方向一致）且不受已知 artifact
解釋的改善。值得帶入未來驗證的兩個候選訊號——Mount 在 N=500/N=1000 的
Browser Rendering 類指標傾向 Vue 3.6（八個相關 cell 互相印證，但效果量
偏小）、Update 在 N=100/N=500 的部分 CPU attribution 大幅下降（但與
Render Duration 走勢不一致，需要進一步排查）——都誠實記錄為候選而非
結論。這是一個**用專門建置並校準過、能夠誠實回答「有沒有差異」的量測
pipeline，得到的空結果**（Mount contamination 已修正並驗證、CPU-profiler
造成的 Scripting 污染已修正並驗證、cost/attribution 兩種來源全程保持
結構性分離）——不論資料指向哪個方向，這正是這個驗證階段原本要能夠誠實
給出的答案。
