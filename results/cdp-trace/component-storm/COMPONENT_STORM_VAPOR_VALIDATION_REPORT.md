# Component Storm — Vapor Validation：Vue 3.6.0-rc.9 Traditional vs Vapor

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。量測手法與 `DAY29_FINAL_VALIDATION_REPORT_rc9.md`
（vdom-stress）相同；Scenario 結構不同之處見 Part 2.2 與
`docs/decisions/component-storm-vapor-validation-scope.md`。

---

## Part 0 — 基本資訊

| 項目                 | 值                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Freeze Point         | 2026-09-27，`vue@3.6.0-rc.9`（與 D29 Final Validation 相同）                                                              |
| Validation Date      | 2026-09-27，兩次獨立 run（run1 / run2）                                                                                   |
| Vue Git Commit       | rc.9 `5be27957…` · rc.4 `3bafec0d…` · 3.5.40 `fa2885d8…`                                                                  |
| Node / Vite / plugin | v24.13.0 / 8.1.5 / 6.0.8                                                                                                  |
| Browser              | Chrome 153.0.8010.54（headless=new，所有條件與 run 相同）                                                                 |
| Scenario Commit      | `d3991df`（5 個 worktree 的 `src/scenarios/component-storm`、`src/benchmarks/component-storm` 與 HEAD 相同，只差 README） |
| Scenario Parameters  | `componentCount=500`；`updateScope` = ParentOnly / SingleChild / AllChildren；`autoUpdate=false`                          |
| Benchmark Parameters | 每個 cell 3 warm-up + 10 measurement × cost-trace / runtime-attribution-trace（與 vdom-stress、Day 30 相同）              |
| 電源                 | AC（`BatteryStatus=2`，runner pre-flight 檢查）                                                                           |
| CDP retry            | run1 0 次、run2 0 次                                                                                                      |

---

## Part 1 — 條件與流程

5 個條件，與 D29 rc.9 Final Validation 使用相同的 worktree 與執行順序：

| 條件                 | Worktree                      | Port | Page / Child 編譯結果（smoke 確認） |
| -------------------- | ----------------------------- | ---- | ----------------------------------- |
| 3.5.40（控制組）     | `vue-pain-lab-vue35-d29ctrl`  | 5178 | VDOM / VDOM                         |
| rc.4 Traditional     | `vue-pain-lab-vue36rc4-trad`  | 5175 | VDOM / VDOM                         |
| rc.4 Vapor           | `vue-pain-lab-vue36-vapor`    | 5174 | `defineVaporComponent` ×2           |
| **rc.9 Traditional** | `vue-pain-lab-vue36rc9-trad`  | 5176 | VDOM / VDOM                         |
| **rc.9 Vapor**       | `vue-pain-lab-vue36rc9-vapor` | 5177 | `defineVaporComponent` ×2           |

每次 run 依序跑 ParentOnly → SingleChild → AllChildren。每個 scope 開始前，runner 改寫 5 個
worktree 的 `config.ts` 中 `updateScope` 那一行，確認 5 個 dev server 都已送出新值才開跑；
跑完（或失敗）時還原成 `'AllChildren'`（已確認 5 個 worktree 皆已還原）。

單一 trial 流程（`runVersionMatrix()`，與 Day 30 / vdom-stress 相同）：navigate →
waitForAppReady → `readParams()` 確認 500 / scope → 等 2 frames → Tracing.start →
點一次 Trigger Update → `Total Update Count` 變化觸發 binding → 等 2 frames → Tracing.end。
完成判定看的是整數計數器，**不受** vdom-stress 的 0.1ms 文字碰撞影響（兩次 run 皆 0 retry）。

---

## Part 2 — Smoke Test 與可比性

### 2.1 功能正確性（5 條件 × 3 scope × 3 次點擊）

- 5 個條件皆 render 500 個 Child，0 個 console error / exception。
- ParentOnly：Child 值不變、Parent Tick +1。SingleChild：只有 Child 0 的值與 5 個 derived 值更新。
  AllChildren：500 個全部更新。5 個條件行為一致。
- Attribution：Traditional 與 Vapor 的 CPU profile 出現相同 URL 集合
  （`vue.runtime.esm-bundler-*`、`ComponentStormPage.vue`、`ComponentStormChild.vue`、
  `benchmarks/component-storm/metrics.ts`），4 個 bucket 都有樣本 → 既有 `attribution.ts` 對 Vapor 沒有盲點。

### 2.2 Scenario 結構差異（已揭露）

| 項目                       | 處理                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mount 無法 trace           | Child 在 App 初始化時掛載，沒有可點的按鈕；只記錄 in-page `Mount Time`（setup → onMounted），沒有成本拆解           |
| `updateScope` 切換         | 用 Scenario 自己的 `config.ts` 參數；runner 的 `runVersionMatrix()` 新增 `updateScope` 參數（預設 `'AllChildren'`） |
| `Mount Time` 不隨 scope 變 | Mount 流程與 updateScope 無關，因此每次 run 的 3 個 scope 等於 3 組 Mount Time 樣本                                 |

### 2.3 結構計數器（兩次 run、每個 trial 完全一致）

| 計數器（每次點擊）      | ParentOnly        | SingleChild                 | AllChildren                 |
| ----------------------- | ----------------- | --------------------------- | --------------------------- |
| Updated Component Count | 0（全部條件）     | 1（全部條件）               | 500（全部條件）             |
| Child Render Count      | 0（全部條件）     | 1（全部條件）               | 500（全部條件）             |
| **Parent Render Count** | **2（全部條件）** | Traditional 2 / **Vapor 1** | Traditional 2 / **Vapor 1** |

Child 層級的計數在兩種架構下一致，可比。**Parent Render Count 在 SingleChild / AllChildren 不可比**：
Vapor 的 Parent `onUpdated` 每次點擊只觸發 1 次，Traditional 觸發 2 次。
這代表兩種架構在同一段程式碼下的 lifecycle 觸發次數不同 — **Observed difference, mechanism not established**，
不當作效能改善。

---

## Part 3 — 結果：rc.9 Traditional → rc.9 Vapor（run1 ‖ run2）

Update Duration / Mount Time 單位 ms（in-page wall-clock）；其餘單位 µs（trace）。中位數。

### ParentOnly

| 指標            | run1                   | run2                   | 跨 run         |
| --------------- | ---------------------- | ---------------------- | -------------- |
| Update Duration | 1.60 → 0.40，−75.0% CI | 2.10 → 0.35，−83.3% CI | **reproduced** |
| Scripting       | 3661 → 1681，−54.1% CI | 4950 → 1601，−67.7% CI | **reproduced** |
| Vue Runtime CPU | 500 → 58，−88.5% CI    | 853 → 60，−93.0% CI    | **reproduced** |
| Rendering       | 6649 → 7770，+16.9% U  | 6451 → 6880，+6.7% U   | 同方向，U      |
| Layout          | 1586 → 1690，+6.6% U   | 1645 → 1676，+1.9% S   | —              |
| Painting        | 10372 → 10642，+2.6% S | 9613 → 9569，−0.5% S   | **stable**     |

### SingleChild

| 指標              | run1                   | run2                   | 跨 run         |
| ----------------- | ---------------------- | ---------------------- | -------------- |
| Update Duration   | 2.10 → 0.45，−78.6% CI | 2.20 → 0.60，−72.7% CI | **reproduced** |
| Scripting         | 4449 → 1633，−63.3% CI | 4567 → 1827，−60.0% CI | **reproduced** |
| Vue Runtime CPU   | 2319 → 400，−82.8% CI  | 1724 → 516，−70.1% CI  | **reproduced** |
| Recalculate Style | 409 → 219，−46.6% CI   | 330 → 220，−33.2% U    | direction      |
| Rendering         | 7118 → 6010，−15.6% U  | 6144 → 6851，+11.5% U  | 方向不一致     |
| Painting          | 9455 → 8115，−14.2% U  | 8617 → 8854，+2.8% S   | 方向不一致     |

### AllChildren

| 指標              | run1                     | run2                     | 跨 run         |
| ----------------- | ------------------------ | ------------------------ | -------------- |
| Update Duration   | 25.05 → 18.25，−27.1% CI | 30.25 → 20.70，−31.6% CI | **reproduced** |
| Scripting         | 26813 → 18786，−29.9% CI | 32482 → 21192，−34.8% CI | **reproduced** |
| Vue Runtime CPU   | 17448 → 13649，−21.8% CI | 18180 → 13225，−27.3% CI | **reproduced** |
| Application CPU   | 4424 → 1522，−65.6% CI   | 6943 → 928，−86.6% CI    | **reproduced** |
| Recalculate Style | 2612 → 244，−90.7% CI    | 2964 → 247，−91.7% CI    | **reproduced** |
| Rendering         | 42096 → 36795，−12.6% U  | 43189 → 36270，−16.0% U  | 同方向，U      |
| Layout            | 27574 → 28483，+3.3% U   | 30496 → 27354，−10.3% U  | 方向不一致     |
| Painting          | 10925 → 11954，+9.4% U   | 13192 → 11799，−10.6% U  | 方向不一致     |

### Mount Time（in-page，3 個 scope = 3 組樣本）

| 條件      | ParentOnly 組          | SingleChild 組         | AllChildren 組         |
| --------- | ---------------------- | ---------------------- | ---------------------- |
| rc.9 run1 | 39.8 → 31.0，−22.1% CI | 39.0 → 31.1，−20.4% CI | 40.1 → 34.7，−13.4% CI |
| rc.9 run2 | 40.4 → 29.2，−27.8% CI | 36.6 → 27.9，−23.8% U  | 44.1 → 35.1，−20.5% U  |
| rc.4 run1 | 37.0 → 29.7，−19.6% CI | 44.4 → 27.5，−38.1% CI | 42.8 → 34.7，−18.9% CI |
| rc.4 run2 | 38.5 → 31.9，−17.3% CI | 37.9 → 27.9，−26.4% CI | 39.7 → 33.8，−14.9% CI |

12 組中 12 組 Vapor 較低（−13% 至 −38%），其中 10 組達 CI。

### 分類統計與跨 run 重現性

| 比較                     | run1                     | run2         | reproduced | conflicting |
| ------------------------ | ------------------------ | ------------ | ---------: | ----------: |
| rc.9 Traditional → Vapor | 15 CI / 0 CR（36 cells） | 12 CI / 0 CR |     **12** |       **0** |
| rc.4 Traditional → Vapor | 12 CI / 0 CR             | 12 CI / 3 CR |     **10** |       **0** |

rc.4 run2 的 3 個 CR（SingleChild Rendering +20%、Painting +16%、Paint +18%）在 run1 為 Unstable，未重現。

---

## Part 4 — Cost Structure（Scripting / Rendering / Painting 佔三者總和，run1 ‖ run2）

| 條件             | ParentOnly                        | SingleChild                         | AllChildren                         |
| ---------------- | --------------------------------- | ----------------------------------- | ----------------------------------- |
| 3.5.40           | 23.8/32.4/43.9 ‖ 20.1/32.4/47.5   | 21.4/35.8/42.8 ‖ 22.0/31.6/46.4     | 36.6/48.8/14.6 ‖ 37.2/49.5/13.4     |
| rc.9 Traditional | 17.7/32.1/50.2 ‖ 23.6/30.7/45.7   | 21.2/33.9/45.0 ‖ 23.6/31.8/44.6     | 33.6/52.7/13.7 ‖ 36.6/48.6/14.8     |
| **rc.9 Vapor**   | **8.4/38.7/53.0 ‖ 8.9/38.1/53.0** | **10.4/38.1/51.5 ‖ 10.4/39.1/50.5** | **27.8/54.5/17.7 ‖ 30.6/52.4/17.0** |

Total main-thread（S+R+P，rc.9 Traditional → Vapor）：

| Scope       | run1                        | run2                        |
| ----------- | --------------------------- | --------------------------- |
| ParentOnly  | 20,682 → 20,092µs（−2.9%）  | 21,013 → 18,050µs（−14.1%） |
| SingleChild | 21,022 → 15,758µs（−25.0%） | 19,328 → 17,532µs（−9.3%）  |
| AllChildren | 79,833 → 67,535µs（−15.4%） | 88,862 → 69,261µs（−22.1%） |

ParentOnly / SingleChild 在 Vapor 下，Browser 側（Rendering + Painting）佔 **約 90%**
（約 16–17ms，其中 Painting 約 8–11ms）；Scripting 本身只剩 1.6–1.8ms。

---

## Part 5 — Version Effect 與 Drift

### 5.1 Version effect（同 session，run1 vs run2）

| 比較                                | reproduced | conflicting | 備註                                                                                                             |
| ----------------------------------- | ---------: | ----------: | ---------------------------------------------------------------------------------------------------------------- |
| rc.4 Traditional → rc.9 Traditional |      **0** |           4 | run2 有 5 個 CR（AllChildren Rendering/Layout/Painting/Mount Time、SingleChild V8/native），run1 皆非 Consistent |
| rc.4 Vapor → rc.9 Vapor             |      **1** |           1 | 唯一重現：SingleChild Painting −21.3% / −21.9%（見 Part 7）                                                      |
| 3.5.40 → rc.9 Traditional           |      **0** |           2 | —                                                                                                                |
| 3.5.40 → rc.4 Traditional           |      **0** |           0 | —                                                                                                                |

### 5.2 Drift vs Day 30（3.5.40 AllChildren，Chrome 152 → 153）

| 指標            | Day 30（2026-09-06） | 今日 run1 / run2        |
| --------------- | -------------------- | ----------------------- |
| Update Duration | 84.9ms               | 27.3 / 28.2ms（CI）     |
| Scripting       | 85,204µs             | 29,332 / 29,537µs（CI） |
| Rendering       | 108,486µs            | 39,166 / 39,318µs（CI） |
| Vue Runtime CPU | 70,087µs             | 18,829 / 19,564µs（CI） |

同一份程式碼，Day 30 比今日慢約 3 倍（與 vdom-stress 8 月資料的現象相同）。可能來源包括
Chrome 152→153、當時的電源／機器狀態（Day 30 metadata 未記錄電源），無法區分：
**Observed difference, mechanism not established.** 因此 Day 30 的 3.5.40 → rc.2 數字
不能與本次資料直接比較。

---

## Part 6 — Evidence Matrix

| Comparison                            | Result                                                                                                                                                            | Evidence strength                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| rc.9 Traditional vs previous baseline | 對 rc.4 Traditional 與 3.5.40：兩次 run **0 個 reproduced cell**。**Not reproduced**                                                                              | 對「無可重現差異」：強（2 run × 2 基準）                                         |
| rc.9 Traditional vs rc.9 Vapor        | 12 reproduced、0 conflicting；與 rc.4 架構比較同構（10 reproduced、0 conflicting）                                                                                | 強（2 run × 2 RC）                                                               |
| Update — ParentOnly / SingleChild     | Update Duration −73% 至 −83%、Scripting −54% 至 −68%、Vue Runtime CPU −70% 至 −93%，兩次 run、兩個 RC 皆 CI（rc.4 SingleChild Vue Runtime CPU 為一次 CI、一次 U） | 強；Vue Runtime CPU 為低信心 bucket（方向）                                      |
| Update — AllChildren                  | Update Duration −27% / −32% CI；Scripting −30% / −35% CI；Vue Runtime CPU −22% / −27% CI；Recalculate Style −91% CI（rc.4 亦 −88% CI）                            | rc.9：強；rc.4 Update Duration / Scripting 一次 CI、一次 U                       |
| Mount（in-page Mount Time）           | 12 組中 12 組 Vapor 較低（−13% 至 −38%），10 組 CI                                                                                                                | 中：方向一致，但只有 wall-clock，無 trace 成本拆解，`onMounted` 時機跨架構未驗證 |
| Vue Runtime CPU                       | 三種 scope 皆下降，且 scope 越小降幅越大（ParentOnly −89% 至 −93%，AllChildren −22% 至 −27%）                                                                     | 方向：強；數值：低信心                                                           |
| Scripting                             | 三種 scope 皆可重現下降；ParentOnly / SingleChild 的 Scripting share 從約 18–24% 降到約 8–10%                                                                     | 強（cost-trace）                                                                 |
| Browser Rendering                     | Painting / Layout 未因 Vapor 下降（ParentOnly Painting 兩次 Stable）；AllChildren Recalculate Style 可重現下降 −91%；其他 Rendering 指標 Unstable                 | Painting 持平：中；Recalc 下降：強（observed），機制未確立                       |

---

## Part 7 — 必答問題

### 1. rc.9 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 對 rc.4 Traditional 與 3.5.40，兩次 run 0 個 cell 重現；run2 rc.4 → rc.9 出現的
5 個 CR 在 run1 皆非 Consistent。

### 2. rc.9 Vapor 是否降低 Framework / Scripting cost？

**是，三種 updateScope 皆可重現**，且在 rc.4 與 rc.9 同構。降幅隨 Update 範圍縮小而變大：
Vue Runtime CPU ParentOnly −89% 至 −93%、SingleChild −70% 至 −83%、AllChildren −22% 至 −27%。

### 3. Vapor 對「只更新少數元件」的情境是否特別有效？

**是，這是本 Scenario 最清楚的訊號。** ParentOnly / SingleChild 的 in-page Update Duration
從約 1.6–2.2ms 降到約 0.35–0.6ms（−73% 至 −83%），兩次 run、兩個 RC 都重現。
AllChildren（500 個全部更新）降幅較小（−27% 至 −32%）。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

- ParentOnly / SingleChild：Vapor 下 Browser 側佔 S+R+P 約 **90%**（約 16–17ms），Painting 約 8–11ms
  且未因 Vapor 下降。Scripting 省下的約 2–3ms，被這部分稀釋 → total main-thread 只少 −3% 至 −25%，
  兩次 run 幅度差異大。
- AllChildren：Browser 側佔約 **70%**；Recalculate Style 可重現地從約 2.6–3.0ms 降到約 0.25ms，
  Layout / Painting 未一致下降。

### 5. 結果是否與 vdom-stress 一致？

**一致的部分**：Vapor 降低 Scripting 與 Vue Runtime CPU、Traditional rc.4 → rc.9 無可重現差異、
Browser Layout / Painting 不因 Vapor 下降、歷史資料有約 3 倍的 session drift。

**不同的部分**：vdom-stress 的 Update wall-clock 沒有改善（N=1000 甚至變慢），Component Storm 的
Update wall-clock 在三種 scope 都可重現地改善。兩個 Scenario 的 Update 性質不同（vdom-stress 是
整個 `cards` 陣列替換；Component Storm 是改動既有元件的 prop / 父層狀態），但本資料**無法**建立兩者差異的機制。

### 6. 哪些結果可以歸因？

- **架構（Traditional → Vapor）→ Update 的 Scripting、Vue Runtime CPU、Update Duration 下降**：
  2 次 run、2 個 RC、同 Scenario、同參數，唯一變因為 Vapor 編譯模式 → 可歸因到架構。
- **Vapor 不降低 Painting / Layout**：DOM 結構相同 → 可歸因（Browser 工作量不變）。
- **rc.4 → rc.9 無可重現差異**。

### 7. 哪些結果只能描述為 observed difference？

- **Parent Render Count**：Vapor 1 次 vs Traditional 2 次（SingleChild / AllChildren）。
- **AllChildren Recalculate Style −91%**：兩個 RC、兩次 run 都重現，但機制未確立。
- **Mount Time 下降**：方向 12/12 一致，但只有 in-page wall-clock。
- **rc.4 Vapor → rc.9 Vapor 的 SingleChild Painting −21%**：兩次 run 皆 CI，但為 36 個 cell 中唯一重現者、
  屬 Browser 指標，rc.9 Traditional 端無對應變化。
- Day 30 與今日約 3 倍的 drift。

### 8. 哪些結果仍然無法解釋？

- Vapor 下 Parent `onUpdated` 觸發次數為何不同。
- AllChildren 的 Recalculate Style 為何在 Vapor 下大幅下降，而 Layout / Painting 沒有。
- 為何 Component Storm 的 Update wall-clock 改善，而 vdom-stress 的 Update wall-clock 沒有。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** Traditional rc.9 相對 rc.4 / 3.5.40：No measurable improvement。
   Vapor（不同的 Rendering Architecture）在三種 updateScope 都可重現地降低 Update 的 Scripting、
   Vue Runtime CPU 與 in-page Update Duration。
2. **改善到什麼程度？** 局部更新（ParentOnly / SingleChild）：Update Duration −73% 至 −83%、
   Scripting −54% 至 −68%；全量更新（AllChildren）：Update Duration −27% 至 −32%、Scripting −30% 至 −35%。
   Total main-thread：−3% 至 −25%（受 Browser 側成本稀釋）。Mount：in-page −13% 至 −38%（方向，未拆解）。
3. **還需要工程改善嗎？** 是。局部更新時 Vapor 讓 Scripting 幾乎消失，但剩下約 90% 的 main-thread 成本
   是 Rendering / Painting（500 個 Child 的清單結構與樣式）。這部分由 DOM 規模與 CSS 決定，Vue（含 Vapor）
   無法移除，屬 Component Architecture / 虛擬化 / 減少重繪範圍等應用層決策。

---

## Limitations

- componentCount 只測 500；100 / 1000 未測。
- Mount 沒有 trace（見 `docs/decisions/component-storm-vapor-validation-scope.md`）。
- 2 次獨立 run；條件與 scope 執行順序固定、兩次 run 相同。
- Windows 實際生效電源模式為「最佳電源效率」（ASUS 管理），AC 供電。
- Vue Runtime CPU / Application CPU 為低信心 bucket（既有方法論）。
- Parent Render Count 在 Vapor 下不可比。
- 與 Day 30（Chrome 152）的歷史資料不可直接比較。

---

## Files generated

新增／修改（主 repo，未 commit）：

- `results/cdp-trace/component-storm/COMPONENT_STORM_VAPOR_VALIDATION_REPORT.md`（本報告）
- `docs/decisions/component-storm-vapor-validation-scope.md`
- `scripts/cdp-trace/run-component-storm-vapor.ts` — orchestration，AC pre-flight、目錄存在即拒絕、scope 切換與還原
- `scripts/cdp-trace/run-component-storm-matrix.ts` — **修改**：`runVersionMatrix()` 新增 `updateScope` 參數（預設 `'AllChildren'`，Day 30 行為不變；diff 14+/7−）
- `scripts/cdp-trace/analyze-component-storm-vapor.ts` — 與 `analyze-component-storm.ts` 相同的 `classify()`，輸出格式與 D29 分析器相同
- `results/cdp-trace/validation/component-storm-vapor-run1-analysis.json`
- `results/cdp-trace/validation/component-storm-vapor-run2-analysis.json`
- `results/cdp-trace/validation/component-storm-vapor-run1-vs-run2.json`（`compare-day29-runs.ts` 產生）
- Raw（gitignored）：`results/cdp-trace/component-storm/vue-{5 條件}-run1|run2/update-500-{scope}/`（10 × 120 檔）、
  smoke：`vue-3.6.0-rc.9-traditional-smoke/`、`vue-3.6.0-rc.9-vapor-smoke/`

未修改：Scenario（`src/scenarios/component-storm/*`、`src/benchmarks/component-storm/*`）、
`component-storm-scenario.ts`、共用量測 pipeline、Day 30 的 `vue-3.5.40/`、`vue-3.6.0-rc.2/` 資料、
主 repo 的 `package.json`（`vue: 3.5.40`）。

## Commands executed

```bash
# 環境（沿用 D29 的 5 個 worktree，各自啟動 dev server）
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5178> --strictPort

# Smoke（scratchpad script，非 repo 檔案）
node cs-smoke.mts          # 5 條件 × 3 scope × 3 次點擊：計數器、DOM 值、console error
node cs-attr-smoke.mts     # runVersionMatrix(rc.9 T / rc.9 V, AllChildren) → *-smoke，檢查 attribution URL

# 量測
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-component-storm-vapor.ts
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-component-storm-vapor.ts

# 分析
node scripts/cdp-trace/analyze-component-storm-vapor.ts -run1 > .../component-storm-vapor-run1-analysis.json
node scripts/cdp-trace/analyze-component-storm-vapor.ts -run2 > .../component-storm-vapor-run2-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../run1-analysis.json .../run2-analysis.json > .../component-storm-vapor-run1-vs-run2.json
```
