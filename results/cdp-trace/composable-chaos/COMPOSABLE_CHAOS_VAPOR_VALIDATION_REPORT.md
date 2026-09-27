# Composable Chaos — Vapor Validation：Vue 3.6.0-rc.9 Traditional vs Vapor

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。量測條件、worktree 與分析方法與
`DAY29_FINAL_VALIDATION_REPORT_rc9.md`（vdom-stress）、
`component-storm/COMPONENT_STORM_VAPOR_VALIDATION_REPORT.md` 相同；本 Scenario 自己的
Day 24 協定差異見 Part 1。

> **更正（2026-09-27，reactive-chain 驗證後補充）：** 本報告初版把「3.5.40 → 3.6 Traditional 在 Depth 10 / 20
> Update 的可重現下降」列為本 Scenario 最重要的發現。後續診斷確認，這個差異**大部分來自 computed getter 內的
> `console.log` 與 CDP `Runtime.enable` console capture 的交互作用**：關閉 `Runtime.enable` 後，Depth 20 Update
> 的差異從約 −45% 縮小到約 −16% 至 −20%，且各頁數值範圍重疊（Part 4.1）。該版本差異因此**不能**解讀為
> DevTools 關閉時的使用者可感受改善。Vapor 相關結論不受這個更正影響。

---

## Part 0 — 基本資訊

| 項目                 | 值                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Freeze Point         | 2026-09-27，`vue@3.6.0-rc.9`（與 D29 Final Validation 相同）                                                                                  |
| Validation Date      | 2026-09-27，兩次獨立 run（run1 / run2）                                                                                                       |
| Node / Vite / plugin | v24.13.0 / 8.1.5 / 6.0.8                                                                                                                      |
| Browser              | Chrome 153.0.8010.54（runner log，40 個 Chrome instance 全部相同；此 runner 的 meta 不記錄 browserVersion）                                   |
| Scenario Commit      | `d3991df`（5 個 worktree 的 `src/scenarios/composable-chaos`、`src/benchmarks/composable`、`src/benchmarks/reactive` 與 HEAD 相同）           |
| Scenario Parameters  | Depth = 1 / 5 / 10 / 20（Scenario 自己的 `DEPTH_OPTIONS`），Operation = build / update                                                        |
| Benchmark Parameters | 3 warm-up + **10** measurement × cost-trace / runtime-attribution-trace；update 每個 trace 內含 20 次點擊（`UPDATE_BATCH_SIZE`，Day 24 協定） |
| 電源                 | AC（`BatteryStatus=2`，runner pre-flight 檢查）                                                                                               |
| CDP retry            | run1 0 次、run2 0 次                                                                                                                          |

---

## Part 1 — 與 Day 24 / vdom-stress 的協定差異（已揭露）

| 項目                     | 處理                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Measurement trial 數     | Day 24 為 5；本次為 **10**，與 vdom-stress / Component Storm 一致。`runVersionMatrix()` 新增 `measurement` 參數，預設仍為 5，Day 24 呼叫方式與行為不變 |
| Update 批次              | 沿用 Day 24：一個 trace 內 20 次連續 Trigger Update（單次 update 為次毫秒級，需批次才有足夠 CPU profiler 樣本）                                        |
| Build                    | 沿用 Day 24：頁面 `onMounted` 會先自動 build Depth 1，因此每個 build trial 都是「dispose 舊 chain + 建立新 chain」的 rebuild，不是首次 Mount           |
| Instrumentation Duration | 沿用 Day 24 定義：build = 頁面的 Build Duration；update = 該批 20 次點擊的 Average Update Duration                                                     |
| 條件順序                 | 與 D29 相同：每個 Depth 內依序 3.5.40 → rc.4 T → rc.4 V → rc.9 T → rc.9 V                                                                              |

---

## Part 2 — Smoke Test 與可比性

- 5 個條件的 Page 編譯結果正確：Vapor（5174 / 5177）為 `defineVaporComponent`，其餘為 VDOM。
- Build Depth 20 後連續 3 次 Trigger Update，**所有計數器在 5 個條件完全一致**：
  Composable Instance 20 / Computed 19 / Watch 1 / WatchEffect 1；每次 update Computed Execute +19、
  Watch Trigger +1、WatchEffect Trigger +1。0 個 console error。
- 唯一差異：**Build 後的 Render Count**，Traditional 為 1、Vapor 為 0；之後每次 update 皆 +2，兩者一致。
  → Render Count 在 build 階段不可比（onUpdated 語意），不作為效能證據。
- 事前疑慮（未發生）：`metrics.ts` 的 counters 刻意不是 reactive，原本依賴「每次 update 整個 template
  重新 render」才會刷新畫面。實測 Vapor 下畫面計數器同樣正確刷新。
- Attribution：Traditional 與 Vapor 的 CPU profile 出現相同 URL 集合（Vue runtime chunk、
  `ComposableChaosPage.vue`、`createComposableChain.ts`、`reactive/logger.ts`、`reactive/metrics.ts`），皆落在正確 bucket。
  單次 build 只有約 2–3ms，部分 trial 的 Vue Runtime CPU 取樣為 0（Day 24 已知的取樣密度限制）。

---

## Part 3 — Architecture：rc.9 Traditional → rc.9 Vapor（Update，run1 ‖ run2）

Instrumentation Duration 單位 ms（in-page，20 次點擊的平均）；其餘單位 µs（整個 20 次批次的 trace）。中位數。

| Update Depth | Instrumentation Duration                       | Scripting            | Vue Runtime CPU       | Recalculate Style     |
| ------------ | ---------------------------------------------- | -------------------- | --------------------- | --------------------- |
| 1            | −42.6% CI ‖ −38.0% CI（0.41–0.47 → 0.25–0.27） | −38.0% U ‖ −36.4% CI | −81.2% CI ‖ −73.7% CI | −41.8% CI ‖ −27.3% CI |
| 5            | −26.2% U ‖ −28.7% CI                           | −31.0% U ‖ −33.8% CI | −71.2% CI ‖ −82.4% CI | −28.4% U ‖ −41.4% CI  |
| 10           | −18.4% U ‖ −16.0% U                            | −16.1% U ‖ −13.8% U  | −68.8% CI ‖ −59.4% CI | −18.8% U ‖ −21.1% U   |
| 20           | +3.7% U ‖ −6.1% U                              | −0.9% S ‖ −8.6% U    | −62.0% CI ‖ −62.6% CI | +0.1% S ‖ −36.7% U    |

- **Vue Runtime CPU（Update）在 4 個 Depth、兩次 run、兩個 RC 皆可重現下降**（rc.9 −59% 至 −82%；rc.4 −57% 至 −84%）。
- **Update 的整體時間與 Scripting 隨 Depth 增加而失去差異**：Depth 1 −38% 至 −43%，Depth 20 無差異。
  Depth 越深，Scripting 中 composable chain 本身（computed / watch，Traditional 與 Vapor 共用同一套 reactivity）的比重越大。
- Build：36 個 build cell 中沒有任何一個跨 run 重現；rc.9 build Depth 5 Scripting 兩次方向相反（−44.0% CI ‖ +12.5% U）。

跨 run 重現性（`compare-day29-runs.ts`，88 cells）：

| 比較                     | run1         | run2         | reproduced | conflicting |
| ------------------------ | ------------ | ------------ | ---------: | ----------: |
| rc.9 Traditional → Vapor | 9 CI / 0 CR  | 13 CI / 0 CR |      **6** |           1 |
| rc.4 Traditional → Vapor | 13 CI / 1 CR | 20 CI / 0 CR |     **10** |           2 |

rc.9 重現的 6 cells：Update Depth 1 Instrumentation Duration、Update Depth 1 Recalculate Style、
Update Vue Runtime CPU × 4 Depth。

---

## Part 4 — Version：3.5.40 → 3.6 Traditional（CDP 條件下；見 4.1 更正）

| Update Depth                | 3.5.40 → rc.9 Traditional（run1 ‖ run2）                  | 3.5.40 → rc.4 Traditional（run1 ‖ run2） |
| --------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| 20 Instrumentation Duration | 1.52 → 0.89ms −41.6% CI ‖ 1.63 → 1.03ms −37.1% CI         | −30.8% CI ‖ −26.2% CI                    |
| 20 Scripting                | 38,684 → 24,350µs −37.1% CI ‖ 40,680 → 26,845µs −34.0% CI | −28.8% CI ‖ −17.8% CI                    |
| 20 Application CPU          | 23,166 → 10,113µs −56.3% CI ‖ 21,545 → 9,650µs −55.2% CI  | −58.7% CI ‖ −49.0% CI                    |
| 10 Application CPU          | −48.5% CI ‖ −39.2% CI                                     | −44.1% CI ‖ −40.1% CI                    |
| 20 Vue Runtime CPU          | +0.5% S ‖ −11.2% U                                        | 未重現                                   |
| Depth 1 / 5                 | 無差異（±5% 左右，Stable / Unstable）                     | 無差異                                   |

跨 run 重現：3.5.40 → rc.9 Traditional **5 cells**、3.5.40 → rc.4 Traditional **4 cells**，
全部集中在 Update Depth 10 / 20。rc.4 → rc.9 Traditional：**0 cells**；rc.4 Vapor → rc.9 Vapor：**0 cells**。

**與歷史證據的關係**：Day 24（3.5.40 → rc.2，Chrome 151，5 trials）唯一乾淨的訊號就是
Depth 20 update Scripting −25.6%，當時標註為「JS 層級已確認，無法歸因到 Vue Runtime」。
本次在 Chrome 153、10 trials、兩次獨立 run、rc.4 與 rc.9 兩個版本都重現同方向、同位置的下降
（−18% 至 −37%）→ **Reproduced**。

**歸因**：同 session 中唯一變因是 Vue 版本（3.5.40 → 3.6），因此這個下降**可歸因到 Vue 版本**。
但 Lab 的 attribution bucket 把省下的時間歸在 **Application CPU**（`createComposableChain.ts` 內的
computed getter / watch callback frame），而不是 Vue Runtime CPU（Depth 20 Stable / Unstable）。
這與 Day 24 的觀察一致。為何 3.6 讓應用程式 frame 的取樣時間下降，而 Vue Runtime frame 沒有：
**mechanism not established**。每次 update 的 computed / watch 執行次數在兩個版本完全相同（smoke 已確認），
所以不是「少執行了幾次」。

### 4.1 更正：差異主要來自 CDP console capture

本 Scenario 的 computed getter、watch、watchEffect 每次執行都呼叫 `log()`（= `console.log`）。
正式 pipeline 需要 CDP `Runtime.enable`（完成判定用 `Runtime.bindingCalled`），此時每次 `console.log`
都會被序列化並擷取 stack trace。reactive-chain 驗證時發現這個條件會把 3.5.40 放大成慢很多
（見 `../reactive-chain/REACTIVE_CHAIN_VAPOR_VALIDATION_REPORT.md` Part 4），因此對本 Scenario 做相同診斷：

**方法**（診斷用 script，非正式 pipeline）：每個條件開 5 個全新 headless 頁面，Build Depth 20 後點 20 次
Trigger Update，讀頁面的 Average Update Duration；只切換是否送出 `Runtime.enable`。

| Depth 20 Update（median of 5 pages） | 3.5.40   | rc.4 Traditional | rc.9 Traditional |
| ------------------------------------ | -------- | ---------------- | ---------------- |
| `Runtime.enable` 開啟                | 2.205 ms | 1.215 ms（−45%） | 1.130 ms（−49%） |
| `Runtime.enable` 關閉                | 0.735 ms | 0.585 ms（−20%） | 0.615 ms（−16%） |

各頁數值（關閉時）：3.5.40 為 0.380–0.790ms、rc.4 T 為 0.500–0.755ms、rc.9 T 為 0.550–1.360ms，範圍重疊。
（rc.9 Vapor 在關閉條件下的診斷因該診斷 script 自身的 Build 完成判定 timeout 而未取得；與版本比較無關。）

**結論更正**：上表的 CDP 條件差異可重現，但在沒有 console capture 的條件下，差異縮小到約 −16% 至 −20%，
且只有 5 頁、未經正式分類器，**無法確認仍有可重現的版本差異**。Day 24 的 −25.6% 訊號同樣是在 CDP 條件下量得，
應以相同方式解讀。

---

## Part 5 — Cost Structure（Update，S / R / P 佔三者總和，run1 ‖ run2）

| 條件             | Depth 1                                          | Depth 20                                         |
| ---------------- | ------------------------------------------------ | ------------------------------------------------ |
| 3.5.40           | 77.6/14.7/7.7（16.3ms）‖ 78.9/14.0/7.2（18.5ms） | 83.2/11.1/5.7（46.5ms）‖ 82.8/11.7/5.5（49.1ms） |
| rc.9 Traditional | 77.7/14.9/7.4（21.5ms）‖ 78.1/13.7/8.2（18.8ms） | 85.0/10.3/4.7（28.7ms）‖ 80.4/13.4/6.2（33.4ms） |
| rc.9 Vapor       | 77.6/14.7/7.6（13.4ms）‖ 73.4/17.1/9.5（12.7ms） | 80.7/12.5/6.9（29.9ms）‖ 79.3/13.0/7.7（31.0ms） |

（括號內為 20 次 update 批次的 S+R+P 總和。）本 Scenario 的 DOM 固定且很小，Scripting 佔
約 73–85%，與 vdom-stress / Component Storm 相反：這裡的成本主體是 JS，不是 Browser Rendering。

---

## Part 6 — Drift vs Day 24（3.5.40，前 5 組 trial 配對）

| 指標                      | Day 24（Chrome 151） | 今日 run1 / run2        |
| ------------------------- | -------------------- | ----------------------- |
| Update Depth 20 Scripting | 156,171µs            | 44,981 / 41,116µs（CI） |
| Build Depth 20 Scripting  | 12,199µs             | 3,417 / 4,147µs（CI）   |

兩次 run 各 63 / 88 cells 為 CI。同一份程式碼，Day 24 慢約 3–3.5 倍，與 vdom-stress、Component Storm
的歷史 drift 現象相同：**Observed difference, mechanism not established.** 因此 Day 24 的絕對數字不能與本次直接比較；
Part 4 的版本比較只使用同 session 資料。

---

## Part 7 — Evidence Matrix

| Comparison                           | Result                                                                                                                                                                                                                 | Evidence strength                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| rc.9 Traditional vs rc.4 Traditional | 0 reproduced cells。**Not reproduced**                                                                                                                                                                                 | 對「無可重現差異」：強                                                   |
| 3.6 Traditional vs 3.5.40            | CDP 條件下：Update Depth 20 Instrumentation −26% 至 −42%、Scripting −18% 至 −37%、Application CPU −49% 至 −59%（Depth 10 亦然）；Depth 1 / 5 無差異。**關閉 console capture 後縮小到約 −16% 至 −20%，範圍重疊**（4.1） | CDP 條件下的觀察：強；一般使用下的版本改善：不足（依賴 console capture） |
| rc.9 Traditional vs rc.9 Vapor       | 6 reproduced、1 conflicting；rc.4 為 10 reproduced、2 conflicting                                                                                                                                                      | 中–強                                                                    |
| Update                               | Vue Runtime CPU 4/4 Depth 可重現下降；整體時間與 Scripting 只在淺 Depth 下降（Depth 1 −38% 至 −43%），Depth 20 無差異                                                                                                  | Vue Runtime CPU：方向強、數值低信心；淺 Depth 時間：中                   |
| Build（rebuild）                     | 無任何 cell 跨 run 重現                                                                                                                                                                                                | 無證據（單次 build 僅 2–3ms，取樣密度低）                                |
| Scripting                            | Vapor 在淺 Depth 下降、Depth 20 無差異；3.6 相對 3.5.40 在 Depth 20 下降                                                                                                                                               | 強（cost-trace）                                                         |
| Browser Rendering                    | 佔比小（約 15–25%）；Recalculate Style 在 Update Depth 1 可重現下降，其餘 Unstable                                                                                                                                     | 弱                                                                       |

---

## Part 8 — 必答問題

### 1. rc.9 Traditional 是否出現可重現的 Framework-level improvement？

**相對 rc.4：否**（0 cells 重現）。**相對 3.5.40：CDP 條件下是，一般條件下無法確認。**
CDP 條件下深層 composable chain 的 Update（Depth 10 / 20）可重現下降，但主要來自 `console.log` × CDP console capture
的交互作用；關閉 console capture 後差異縮小到約 −16% 至 −20% 且範圍重疊（4.1）。

### 2. rc.9 Vapor 是否降低 Framework / Scripting cost？

**Framework（Vue Runtime CPU）：是**，Update 的 4 個 Depth 都可重現（−59% 至 −82%）。
**Scripting：只在淺 Depth**（Depth 1 / 5 下降 −31% 至 −38%，兩次 run 中各有一次達 CI），Depth 20 無差異。

### 3. Depth 越深，Vapor 越有效嗎？

**相反。** Depth 越深，composable chain 的 reactivity 成本（兩種架構共用）佔比越高，Vapor 能省的
render 部分被稀釋：Update 整體時間 Depth 1 −38% 至 −43% → Depth 20 無差異。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

本 Scenario DOM 很小且固定，Browser 側只佔約 15–27%；成本主體是 Scripting（73–85%）。

### 5. 結果是否與 vdom-stress / Component Storm 一致？

- **一致**：Vapor 降低 Vue Runtime CPU；rc.4 → rc.9 無可重現差異；歷史資料有約 3 倍 drift。
- **不同**：CDP 條件下出現可重現的 3.5 → 3.6 Traditional 差異，但它依賴 computed 內的 `console.log`
  與 CDP console capture（4.1）；vdom-stress 與 Component Storm 的 hot path 沒有 `console.log`，版本比較都是 0 cells 重現。

### 6. 哪些結果可以歸因？

- **CDP console capture 條件下的 Vue 版本（3.5.40 → 3.6）→ Depth 10 / 20 Update 的 Scripting 與時間下降**：
  同 session、唯一變因為版本，兩次 run、兩個 RC 重現；但只在 `Runtime.enable` 開啟時成立（4.1）。
- **架構（Traditional → Vapor）→ Update 的 Vue Runtime CPU 下降**：兩次 run、兩個 RC 重現。
- **Depth 20 Vapor 無時間差異**：可歸因——兩者共用同一套 reactivity，差異只在 render。

### 7. 哪些結果只能描述為 observed difference？

- 版本效應在 attribution 上落在 Application CPU 而非 Vue Runtime CPU。
- Build 後 Render Count：Traditional 1 / Vapor 0。
- 與 Day 24 約 3–3.5 倍的 drift。

### 8. 哪些結果仍然無法解釋？

- 為何在 CDP console capture 下，3.5.40 的應用程式 frame（含 `console.log`）取樣時間約為 3.6 的兩倍，
  而 computed / watch 執行次數相同（stack 深度等假說未直接量測）。
- Build 為何在任何比較中都沒有可重現的差異（可能只是 2–3ms 的量測解析度不足，但未驗證）。

---

## Part 9 — 跨 Scenario 對照（rc.9 Freeze Point，同一套 5 條件 × 2 次獨立 run）

| 項目（跨 run 重現者）      | vdom-stress                 | Component Storm               | Composable Chaos                                               | Reactive Chain                                 |
| -------------------------- | --------------------------- | ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Vapor 降低 Vue Runtime CPU | 是（Mount 4 個 N）          | 是（Update 3 種 updateScope） | 是（Update 4 個 Depth）                                        | rc.9 是；rc.4 未重現                           |
| Vapor 降低實際時間         | 只有 Mount N=5000           | 是（Update 3 種 updateScope） | 只有淺 Depth（Depth 1）                                        | 否                                             |
| rc.4 → rc.9 Traditional    | 無可重現差異                | 無可重現差異                  | 無可重現差異                                                   | 無可重現差異                                   |
| 3.5.40 → 3.6 Traditional   | 無可重現差異                | 無可重現差異                  | CDP 條件下 Depth 10 / 20 下降；關閉 console capture 後無法確認 | CDP 條件下約 −80%；關閉 console capture 後消失 |
| hot path 有 `console.log`  | 否                          | 否                            | 是                                                             | 是                                             |
| 成本主體                   | Browser Rendering（Layout） | Browser Rendering + Painting  | Scripting（73–85%）                                            | Scripting（63–89%）                            |

來源：`../DAY29_FINAL_VALIDATION_REPORT_rc9.md`、`../component-storm/COMPONENT_STORM_VAPOR_VALIDATION_REPORT.md`、
`../reactive-chain/REACTIVE_CHAIN_VAPOR_VALIDATION_REPORT.md`、本報告。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** 3.6 Traditional 相對 3.5.40 的 Depth 10 / 20 Update 下降只在 CDP console capture
   條件下可重現，一般條件下無法確認（4.1 更正）；rc.4 → rc.9 沒有變化。Vapor 可重現地降低 Update 的 Vue Runtime CPU。
2. **改善到什麼程度？** 版本：CDP 條件下 Depth 20 Update 時間 −26% 至 −42%；無 console capture 時約 −16% 至 −20%
   且範圍重疊 → 一般條件下無法確認有可測量的改善。Vapor：Vue Runtime CPU −59% 至 −84%；Update 時間只在
   Depth 1 −38% 至 −43%，Depth 20 No measurable improvement。
3. **還需要工程改善嗎？** 是。Depth 20 時成本主體是 composable chain 本身的 reactive 計算，Vapor 對此沒有幫助。
   減少巢狀 composable 的 computed 層數（State Design / Composable 架構）才是直接的手段。

---

## Limitations

- 2 次獨立 run；條件與 Depth 執行順序固定、兩次 run 相同。
- Build 為 rebuild（非首次 Mount），單次僅 2–3ms，CPU profiler 取樣密度不足。
- Update 為 20 次點擊的批次，無法看單次 update 的分布。
- Measurement 10 次與 Day 24 的 5 次不同；drift 比較只用前 5 組配對。
- 此 runner 的 meta 不記錄 browserVersion（改由 runner log 確認）。
- Windows 實際生效電源模式為「最佳電源效率」（ASUS 管理），AC 供電。
- Vue Runtime CPU / Application CPU 為低信心 bucket（既有方法論）。

---

## Files generated

新增／修改（主 repo，未 commit）：

- `results/cdp-trace/composable-chaos/COMPOSABLE_CHAOS_VAPOR_VALIDATION_REPORT.md`（本報告）
- `scripts/cdp-trace/run-composable-chaos-vapor.ts` — orchestration，AC pre-flight、目錄存在即拒絕、依 Depth 交錯 5 條件
- `scripts/cdp-trace/run-composable-chaos-matrix.ts` — **修改**：`runVersionMatrix()` 新增 `measurement` 參數（預設 5，Day 24 行為不變）
- `scripts/cdp-trace/analyze-composable-chaos-vapor.ts` — 與 Day 24 分析器相同的 `classify()` 與 Instrumentation Duration 定義，輸出格式與 D29 分析器相同
- `results/cdp-trace/validation/composable-chaos-vapor-run1-analysis.json`
- `results/cdp-trace/validation/composable-chaos-vapor-run2-analysis.json`
- `results/cdp-trace/validation/composable-chaos-vapor-run1-vs-run2.json`
- Raw（gitignored）：`results/cdp-trace/composable-chaos/vue-{5 條件}-run1|run2/`（10 × 320 檔）；
  smoke：`vue-3.6.0-rc.9-traditional-smoke/`、`vue-3.6.0-rc.9-vapor-smoke/`（Depth 20，5 trials）

未修改：Scenario（`src/scenarios/composable-chaos/*`、`src/benchmarks/composable/*`、`src/benchmarks/reactive/*`）、
`composable-chaos-scenario.ts`、共用量測 pipeline、Day 24 的 `vue-3.5.40/`、`vue-3.6.0-rc.2/` 資料、
主 repo 的 `package.json`（`vue: 3.5.40`）。

## Commands executed

```bash
# 環境（沿用 D29 的 5 個 worktree）
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5178> --strictPort

# Smoke（scratchpad script，非 repo 檔案）
node cc-smoke.mts          # 5 條件：Build Depth 20 + 3 次 update，計數器與 console error
node cc-attr-smoke.mts     # runVersionMatrix(rc.9 T / rc.9 V, [20]) → *-smoke，檢查 attribution URL

# 量測
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-composable-chaos-vapor.ts
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-composable-chaos-vapor.ts

# 分析
node scripts/cdp-trace/analyze-composable-chaos-vapor.ts -run1 > .../composable-chaos-vapor-run1-analysis.json
node scripts/cdp-trace/analyze-composable-chaos-vapor.ts -run2 > .../composable-chaos-vapor-run2-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../run1-analysis.json .../run2-analysis.json > .../composable-chaos-vapor-run1-vs-run2.json
```
