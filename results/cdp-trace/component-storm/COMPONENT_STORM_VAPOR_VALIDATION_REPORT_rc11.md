# Component Storm — Vapor Validation：Vue 3.6.0-rc.11 Traditional vs Vapor

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。方法、runner、scope 切換與分類器和 rc.9 報告
（`COMPONENT_STORM_VAPOR_VALIDATION_REPORT.md`，原封不動）相同；本次只換條件清單。

> **本 session 的 run2 有一段整台機器變慢的時段**（06:34:31–06:37:52 UTC）：SingleChild 的 6 個條件與
> AllChildren 的前 3 個條件（3.5.40、rc.4 T、rc.4 V）落在其中（Part 2.3）。表格中以 **†** 標示，
> 結論只採用兩次 run 都不在 slow window 的 cell，或在 slow window 內但兩次方向與幅度一致的 cell（會註明）。

---

## Part 0 — 基本資訊

| 項目                 | 值                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Freeze Point         | 2026-10-14，`vue@3.6.0-rc.11`（與 `DAY29_FINAL_VALIDATION_REPORT_rc11.md` 相同；rc.10 只記錄 Version Change）                        |
| Validation Date      | 2026-10-14，兩次獨立 run（run1 06:19–06:22 UTC、run2 06:33–06:38 UTC）                                                               |
| Vue Git Commit       | rc.11 `b55f3b92a185…` · rc.9 `5be279570a84…` · rc.4 `3bafec0d84a9…` · 3.5.40 `fa2885d8c487…`                                         |
| Node / Vite / plugin | v24.13.0 / 8.1.5 / 6.0.8（7 個 worktree 相同）                                                                                       |
| Browser              | Chrome 155.0.8059.41（所有條件、兩次 run；rc.9 session 為 153.0.8010.54）                                                            |
| Scenario Commit      | `d3991df`（7 個 worktree 的 `src/scenarios`、`src/benchmarks` 對 `d3991df` 皆 clean；跑完後 `updateScope` 皆還原為 `'AllChildren'`） |
| Scenario Parameters  | `componentCount=500`；`updateScope` = ParentOnly / SingleChild / AllChildren；`autoUpdate=false`                                     |
| Benchmark Parameters | 每個 cell 3 warm-up + 10 measurement × cost-trace / runtime-attribution-trace（與 rc.9 相同）                                        |
| 電源                 | AC（`BatteryStatus=2`）；AC overlay `ded574b5…` = 最佳效能（rc.9 session 為「最佳電源效率」）                                        |
| CDP retry            | run1 0 次、run2 0 次                                                                                                                 |

---

## Part 1 — 條件與流程

7 個條件（oldest first），與 VDOM Stress rc.11 Final Validation 相同的 worktree。rc.9 session 的 5 個條件因
Chrome 153 → 155 以 `-chrome155` 標籤重跑，原 rc.9 資料不覆蓋：

| 條件                  | Worktree                       | Port | Page / Child 編譯結果（smoke 確認） |
| --------------------- | ------------------------------ | ---- | ----------------------------------- |
| 3.5.40（控制組）      | `vue-pain-lab-vue35-d29ctrl`   | 5178 | VDOM / VDOM                         |
| rc.4 Traditional      | `vue-pain-lab-vue36rc4-trad`   | 5175 | VDOM / VDOM                         |
| rc.4 Vapor            | `vue-pain-lab-vue36-vapor`     | 5174 | `defineVaporComponent` ×2           |
| rc.9 Traditional      | `vue-pain-lab-vue36rc9-trad`   | 5176 | VDOM / VDOM                         |
| rc.9 Vapor            | `vue-pain-lab-vue36rc9-vapor`  | 5177 | `defineVaporComponent` ×2           |
| **rc.11 Traditional** | `vue-pain-lab-vue36rc11-trad`  | 5179 | VDOM / VDOM                         |
| **rc.11 Vapor**       | `vue-pain-lab-vue36rc11-vapor` | 5180 | `defineVaporComponent` ×2           |

每次 run 依序跑 ParentOnly → SingleChild → AllChildren，每個 scope 內 7 個條件依上表順序。三個 Scenario 在同一個
session 依序跑（Component Storm → Composable Chaos → Reactive Chain），run1 與 run2 之間依 PID 重啟 7 個 dev server。

---

## Part 2 — Smoke Test、可比性與 session 品質

### 2.1 Smoke

rc.11 Traditional / Vapor 的 AllChildren 各 10 trial（`*-smoke`），0 error、0 retry；Vue Runtime CPU、Application CPU
皆有樣本（attribution 對 rc.11 沒有盲點）。

### 2.2 結構計數器（兩次 run、每個 trial 完全一致，與 rc.9 相同）

| 計數器（每次點擊）      | ParentOnly        | SingleChild                 | AllChildren                 |
| ----------------------- | ----------------- | --------------------------- | --------------------------- |
| Updated Component Count | 0（全部條件）     | 1（全部條件）               | 500（全部條件）             |
| Child Render Count      | 0（全部條件）     | 1（全部條件）               | 500（全部條件）             |
| **Parent Render Count** | **2（全部條件）** | Traditional 2 / **Vapor 1** | Traditional 2 / **Vapor 1** |

rc.11 Vapor 仍然只觸發 1 次 Parent `onUpdated`（rc.9 報告已列為 observed difference，不當作效能改善）。

### 2.3 方法論等價檢查與 slow window

- **等價檢查**：新分析腳本對 rc.9 原始資料（Chrome 153）重算的 `arch-rc9-original`，與既有
  `component-storm-vapor-run1/run2-analysis.json` 的 `arch-rc9` **36 / 36 cells 逐項相同**（兩個 run）。
- **Slow window**：每個 block（條件 × scope）的 wall-clock 時間（到下一個 block 開始為止）與同一 scope 跨兩次 run 的中位數比較，
  ≥ 1.5 倍標為 slow。量測值是毫秒級，不可能讓 block 多出 10 秒以上；變長代表整台機器在那段時間變慢。

| Run  | 時段（UTC）         | Slow block                                                         | wall-clock           |
| ---- | ------------------- | ------------------------------------------------------------------ | -------------------- |
| run1 | —                   | 0 個                                                               | —                    |
| run2 | 06:34:31 – 06:37:52 | SingleChild：rc.4 T / rc.4 V / rc.9 T / rc.9 V / rc.11 T / rc.11 V | 19–24s（正常約 10s） |
| run2 | 同上                | AllChildren：3.5.40 / rc.4 T / rc.4 V                              | 19–28s（正常約 12s） |

rc.9 session 用同一檢查：30 個 block **0 個** slow。slow block 的量測值同時偏高，例如 run2 AllChildren 3.5.40
Update Duration 75.8ms（run1 30.0ms）、SingleChild 的 in-page Mount Time 119–143ms（其他 block 約 28–46ms）。
Block-shift 掃描（Update Duration 與 Scripting 中位數 run1 → run2 同時變動 ≥ ×1.6）也找到 6 個 block，其中 4 個在上表內。

只用兩次 run 都不在 slow window 的 cell 重新統計：

| 比較                             | clean cells | run1 CI / CR | run2 CI / CR | reproduced | conflicting |
| -------------------------------- | ----------: | ------------ | ------------ | ---------: | ----------: |
| rc.11 Traditional → Vapor        |     24 / 36 | 11 / 0       | 7 / 1        |      **6** |       **0** |
| rc.9 Traditional → Vapor（C155） |     24 / 36 | 8 / 0        | 10 / 0       |          8 |           0 |
| rc.9 T → rc.11 T                 |     24 / 36 | 0 / 2        | 0 / 0        |      **0** |           1 |
| rc.9 V → rc.11 V                 |     24 / 36 | 1 / 0        | 0 / 0        |      **0** |           1 |

---

## Part 3 — 結果：rc.11 Traditional → rc.11 Vapor（run1 ‖ run2）

Update Duration / Mount Time 單位 ms（in-page wall-clock）；其餘單位 µs（trace）。中位數。

### ParentOnly（兩次 run 皆 clean）

| 指標            | run1                   | run2                   | 跨 run               |
| --------------- | ---------------------- | ---------------------- | -------------------- |
| Update Duration | 2.00 → 0.40，−80.0% CI | 1.20 → 0.40，−66.7% CI | **reproduced**       |
| Scripting       | 4728 → 1835，−61.2% CI | 2860 → 1790，−37.4% CI | **reproduced**       |
| Vue Runtime CPU | 1070 → 188，−82.5% CI  | 1028 → 250，−75.7% CI  | **reproduced**       |
| Mount Time      | 36.5 → 27.6，−24.4% CI | 37.1 → 28.6，−22.9% CI | **reproduced**       |
| Rendering       | 6394 → 7052，+10.3% U  | 5383 → 6597，+22.6% CR | 同方向（Vapor 較高） |
| Layout          | 1391 → 1600，+15.0% U  | 1427 → 1757，+23.1% U  | 同方向（Vapor 較高） |
| Painting        | 9347 → 10762，+15.1% U | 7758 → 8617，+11.1% U  | 同方向（Vapor 較高） |

### SingleChild（run2 為 †）

| 指標            | run1                   | run2                     | 跨 run              |
| --------------- | ---------------------- | ------------------------ | ------------------- |
| Update Duration | 2.90 → 0.60，−79.3% CI | 4.35 → 0.95，−78.2% CI † | **reproduced**（†） |
| Scripting       | 5861 → 1861，−68.3% CI | 7923 → 2949，−62.8% CI † | **reproduced**（†） |
| Vue Runtime CPU | 1673 → 564，−66.3% U   | 4886 → 2394，−51.0% U †  | 同方向              |
| Application CPU | 526 → 0，−100.0% CI    | 2564 → 0，−100.0% CI †   | **reproduced**（†） |
| Rendering       | 7232 → 6142，−15.1% U  | 7227 → 7822，+8.2% U †   | 方向不一致          |
| Painting        | 9659 → 9494，−1.7% S   | 7997 → 8427，+5.4% U †   | —                   |

run2 的 SingleChild 兩邊（rc.11 T、rc.11 V）都在 slow window 內，絕對值偏高；但兩邊受到的影響方向相同，
相對差（−78% / −63%）與 run1 一致，因此仍列為 reproduced，標 †。

### AllChildren（兩次 run 皆 clean）

| 指標              | run1                     | run2                     | 跨 run         |
| ----------------- | ------------------------ | ------------------------ | -------------- |
| Update Duration   | 28.3 → 19.4，−31.4% CI   | 28.0 → 22.4，−20.1% U    | 同方向         |
| Scripting         | 30191 → 19868，−34.2% CI | 29776 → 22850，−23.3% U  | 同方向         |
| Vue Runtime CPU   | 15778 → 13693，−13.2% U  | 17978 → 14568，−19.0% CI | 同方向         |
| Application CPU   | 6999 → 1018，−85.5% CI   | 5980 → 1626，−72.8% CI   | **reproduced** |
| Recalculate Style | 2704 → 213，−92.1% CI    | 2319 → 282，−87.9% CI    | **reproduced** |
| Rendering         | 40553 → 35720，−11.9% CI | 39380 → 36808，−6.5% U   | 同方向         |
| Layout            | 28351 → 27326，−3.6% U   | 27464 → 28033，+2.1% U   | 方向不一致     |
| Painting          | 11686 → 10607，−9.2% CI  | 11693 → 11347，−3.0% S   | 同方向         |

AllChildren 的 Update Duration / Scripting 在 rc.9（原 Chrome 153 資料）兩次都是 CI（−27% / −32%、−30% / −35%）；
rc.11 一次 CI、一次 U。rc.9 的 Chrome 155 重跑同樣是一次 CI、一次 U（−20.3% U / −27.5% CI）。

### Mount Time（in-page，3 個 scope = 3 組樣本）

| 條件       | ParentOnly 組          | SingleChild 組            | AllChildren 組         |
| ---------- | ---------------------- | ------------------------- | ---------------------- |
| rc.11 run1 | 36.5 → 27.6，−24.4% CI | 36.4 → 29.6，−18.7% U     | 41.4 → 35.4，−14.4% CI |
| rc.11 run2 | 37.1 → 28.6，−22.9% CI | 142.9 → 119.2，−16.6% U † | 40.0 → 37.5，−6.2% U   |

6 組中 6 組 Vapor 較低（−6% 至 −24%），3 組 CI。

### 分類統計與跨 run 重現性（全部 cell）

| 比較                                           | run1 CI / CR | run2 CI / CR | reproduced | conflicting | † cell（run1 / run2） |
| ---------------------------------------------- | ------------ | ------------ | ---------: | ----------: | --------------------- |
| rc.11 Traditional → Vapor                      | 14 / 0       | 10 / 1       |      **9** |       **0** | 0 / 12                |
| rc.9 Traditional → Vapor（Chrome 155）         | 13 / 0       | 13 / 0       |         11 |           0 | 0 / 12                |
| rc.4 Traditional → Vapor（Chrome 155）         | 13 / 0       | 8 / 0        |          6 |           0 | 0 / 24                |
| rc.9 Traditional → Vapor（原 Chrome 153 資料） | 15 / 0       | 12 / 0       |         12 |           0 | 0 / 0                 |

唯一的 CR 是 rc.11 run2 ParentOnly Rendering（+22.6%），run1 為 +10.3% U；rc.9 報告中 ParentOnly Rendering 同樣
是 Vapor 較高（+16.9% U / +6.7% U）。

---

## Part 4 — Cost Structure（Scripting / Rendering / Painting 佔三者總和，run1 ‖ run2）

| 條件              | ParentOnly                         | SingleChild                          | AllChildren                         |
| ----------------- | ---------------------------------- | ------------------------------------ | ----------------------------------- |
| 3.5.40            | 18.7/33.8/47.5 ‖ 19.6/32.0/48.4    | 19.6/35.1/45.3 ‖ 23.2/33.1/43.8      | 38.0/47.3/14.7 ‖ †40.6/53.8/5.6     |
| rc.9 Traditional  | 21.4/33.3/45.2 ‖ 18.3/33.0/48.7    | 24.3/32.9/42.8 ‖ †29.9/28.8/41.3     | 34.3/50.6/15.1 ‖ 37.9/47.7/14.5     |
| rc.9 Vapor        | 10.1/35.9/54.0 ‖ 8.9/37.4/53.7     | 9.4/43.0/47.6 ‖ †16.9/40.0/43.1      | 29.1/53.7/17.2 ‖ 31.2/53.3/15.5     |
| rc.11 Traditional | 23.1/31.2/45.7 ‖ 17.9/33.6/48.5    | 25.8/31.8/42.5 ‖ †34.2/31.2/34.5     | 36.6/49.2/14.2 ‖ 36.8/48.7/14.5     |
| **rc.11 Vapor**   | **9.3/35.9/54.8 ‖ 10.5/38.8/50.7** | **10.6/35.1/54.3 ‖ †15.4/40.7/43.9** | **30.0/54.0/16.0 ‖ 32.2/51.8/16.0** |

Total main-thread（S+R+P，rc.11 Traditional → Vapor）：

| Scope       | run1                        | run2                         |
| ----------- | --------------------------- | ---------------------------- |
| ParentOnly  | 20,469 → 19,649µs（−4.0%）  | 16,001 → 17,004µs（+6.3%）   |
| SingleChild | 22,751 → 17,496µs（−23.1%） | †23,147 → 19,197µs（−17.1%） |
| AllChildren | 82,430 → 66,194µs（−19.7%） | 80,849 → 71,005µs（−12.2%）  |

與 rc.9 相同：ParentOnly / SingleChild 在 Vapor 下 Scripting 只佔約 9–11%（clean run），Browser 側（Rendering + Painting）
約 90%。ParentOnly 的 Scripting 省下約 1–3ms，被 Rendering / Painting 稀釋後 total main-thread 兩次差 −4% / +6%。

---

## Part 5 — Version Effect 與 Drift

### 5.1 rc.9 → rc.11（同 session，Chrome 155）

| 指標（中位數）        | rc.9 T → rc.11 T（run1 ‖ run2）                  | rc.9 V → rc.11 V（run1 ‖ run2）                  |
| --------------------- | ------------------------------------------------ | ------------------------------------------------ |
| ParentOnly Update     | 2.00 → 2.00，0.0% S ‖ 1.20 → 1.20，0.0% U        | 0.35 → 0.40，+14.3% U ‖ 0.35 → 0.40，+14.3% U    |
| ParentOnly Scripting  | 4598 → 4728，+2.8% S ‖ 2843 → 2860，+0.6% S      | 1696 → 1835，+8.2% U ‖ 1318 → 1790，+35.8% U     |
| SingleChild Update    | 2.85 → 2.90，+1.8% S ‖ †4.00 → 4.35，+8.7% U     | 0.55 → 0.60，+9.1% U ‖ †1.00 → 0.95，−5.0% U     |
| AllChildren Update    | 24.1 → 28.3，+17.4% U ‖ 30.9 → 28.0，−9.4% U     | 19.2 → 19.4，+1.0% S ‖ 22.5 → 22.4，−0.2% S      |
| AllChildren Scripting | 25692 → 30191，+17.5% U ‖ 32549 → 29776，−8.5% U | 19872 → 19868，−0.0% S ‖ 22741 → 22850，+0.5% S  |
| 分類（36 cells）      | 0 / 2 CR ‖ 0 / 1 CR；0 reproduced、2 conflicting | 1 CI / 1 CR ‖ 0 / 0；0 reproduced、1 conflicting |

- Traditional：3 個 CR 都在低信心 bucket 或 Mount Time（Application CPU ParentOnly 44 → 507µs、SingleChild †627 → 2564µs，
  Mount Time AllChildren +6.6%），另一次 run 皆非 Consistent。ParentOnly Scripting 兩次 Stable。
- Vapor：AllChildren 的 Update Duration 與 Scripting **兩次都是 Stable**（|Δ| < 3%）；ParentOnly Vapor 的 Update Duration
  兩次都是 0.35 → 0.40ms（+14% U），以 0.05ms 的顯示解析度來說只是一格。

### 5.2 Drift：rc.9 session（Chrome 153）→ 本 session（Chrome 155）

| 條件             | run1 CI / CR | run2 CI / CR | 說明                                             |
| ---------------- | ------------ | ------------ | ------------------------------------------------ |
| 3.5.40           | 0 / 0        | 0 / 10       | run2 的 10 個 CR 有 9 個在 † cell（AllChildren） |
| rc.9 Traditional | 0 / 0        | 0 / 3        | run2 的 3 個 CR 全部在 † cell（SingleChild）     |
| rc.9 Vapor       | 1 / 0        | 0 / 5        | run2 的 5 個 CR 有 4 個在 † cell；run1 1 個 CI   |

扣掉 slow window 之後，Chrome 153 → 155（加上電源模式不同、隔 17 天）只剩 3 個非重現的 Consistent cell（ParentOnly 的 Vue Runtime CPU ×2、Recalculate Style ×1）
（36 × 3 組中），沒有一致方向的 drift。

### 5.3 3.5.40 → 3.6 Traditional

run1（clean）：3.5.40 → rc.11 T 與 3.5.40 → rc.9 T 皆 **0 CI / 0 CR**。run2 的 AllChildren 3.5.40 在 slow window 內，
該 run 的版本訊號（例如 AllChildren Update Duration −63% CI）不可採用。Component Storm 的 hot path 沒有 `console.log`，
不受 console capture 偏差影響（rc.9 報告已確認）。

---

## Part 6 — Evidence Matrix

| Comparison                             | Result                                                                                                                                        | Evidence strength                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| rc.11 Traditional vs previous baseline | 對 rc.9 Traditional：0 reproduced、2 conflicting；ParentOnly Update / Scripting 兩次 Stable。對 3.5.40：run1 0 Consistent。**Not reproduced** | 對「無可重現差異」：中（2 run，run2 部分 cell 受 slow window 影響） |
| rc.11 Traditional vs rc.11 Vapor       | 9 reproduced、0 conflicting（clean cells：6 reproduced、0 conflicting）；與 rc.9 / rc.4 Chrome 155 重跑同構                                   | 強（ParentOnly / SingleChild）；AllChildren 中                      |
| Update — ParentOnly / SingleChild      | Update Duration −67% 至 −80%、Scripting −37% 至 −68%，兩次 CI（SingleChild run2 為 †）                                                        | 強                                                                  |
| Update — AllChildren                   | Update Duration −31% CI / −20% U；Scripting −34% CI / −23% U；Recalculate Style −92% / −88% CI                                                | Update Duration / Scripting：中（一次 CI）；Recalc：強（observed）  |
| Mount（in-page Mount Time）            | 6 組中 6 組 Vapor 較低（−6% 至 −24%），3 組 CI                                                                                                | 中：只有 wall-clock，無 trace 成本拆解                              |
| Vue Runtime CPU                        | ParentOnly −83% / −76% CI 重現；SingleChild −66% / −51% U；AllChildren −13% U / −19% CI                                                       | 方向：強；數值：低信心 bucket                                       |
| Scripting                              | ParentOnly / SingleChild 重現下降；Vapor 下 Scripting share 約 9–11%                                                                          | 強（cost-trace）                                                    |
| Browser Rendering                      | ParentOnly Rendering / Layout / Painting 兩次皆為 Vapor 較高（+10% 至 +23%，一次 CR）；AllChildren Recalculate Style 重現下降                 | Recalc 下降：強（observed）；ParentOnly 上升：弱（方向）            |

---

## Part 7 — 必答問題

### 1. rc.11 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 對 rc.9 Traditional（同 session）：0 個 cell 重現；ParentOnly 的 Update Duration（2.00 → 2.00、1.20 → 1.20ms）
與 Scripting 兩次 Stable。對 3.5.40：clean 的 run1 為 0 Consistent。

### 2. rc.11 Vapor 是否仍然降低 Framework / Scripting cost？

**是，與 rc.9 同構。** ParentOnly / SingleChild 的 Update Duration −67% 至 −80%、Scripting −37% 至 −68%，兩次 CI；
AllChildren 的 Update Duration / Scripting 兩次都下降，一次 CI。

### 3. Update 是否在較大範圍（AllChildren）下出現更明顯改善？

**否，與 rc.9 相同，範圍越小相對降幅越大**：ParentOnly / SingleChild −67% 至 −80%，AllChildren −20% 至 −31%。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

- ParentOnly / SingleChild：Vapor 下 Browser 側佔 S+R+P 約 **89–91%**（約 15–18ms，clean run），Painting 約 8–11ms。
  ParentOnly 的 Rendering / Layout / Painting 兩次都是 Vapor 略高（+10% 至 +23%），total main-thread −4% / +6%。
- AllChildren：Browser 側約 **68–70%**；Recalculate Style 從約 2.3–2.7ms 降到約 0.2–0.3ms，Layout / Painting 未一致下降。

### 5. rc.11 是否改變原本 rc.9 Vapor 的結論？

**沒有改變方向。** rc.11 Vapor 與 rc.9 Vapor（同 session）在 AllChildren 的 Update Duration / Scripting 兩次 Stable，
其他 cell 0 個重現。差異在強度：rc.9 原資料的 AllChildren Update Duration / Scripting 兩次 CI，本 session 的 rc.11 與
rc.9 重跑都只有一次 CI → AllChildren 的架構效果在本 session 的證據比 rc.9 報告弱，ParentOnly / SingleChild 不受影響。

### 6. 哪些結果可以歸因？

- **架構 → ParentOnly / SingleChild 的 Update Duration、Scripting、ParentOnly Vue Runtime CPU 下降**：2 次 run、3 個 RC
  （rc.4 / rc.9 / rc.11 同 session）同構。
- **rc.9 → rc.11 無可重現差異**（Traditional 與 Vapor）。

### 7. 哪些結果只能描述為 observed difference？

- Parent Render Count：Vapor 1 次 vs Traditional 2 次（與 rc.9 相同）。
- AllChildren Recalculate Style −88% 至 −92%（與 rc.9 相同，機制未確立）。
- ParentOnly 在 Vapor 下 Rendering / Layout / Painting 略高（兩次同方向，一次 CR）。
- run2 06:34:31–06:37:52 的機器層級 slow window（block wall-clock 2 倍以上）。

### 8. 哪些結果仍然無法解釋？

- Vapor 下 Parent `onUpdated` 觸發次數為何不同（沿用 rc.9）。
- AllChildren Recalculate Style 為何在 Vapor 下大幅下降，而 Layout / Painting 沒有（沿用 rc.9）。
- run2 slow window 的來源：runner 不記錄系統負載，無法確認是哪個背景程序。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** rc.9 → rc.11 Traditional / Vapor：No measurable improvement。Vapor（不同的
   Rendering Architecture）在 rc.11 仍可重現地降低局部更新（ParentOnly / SingleChild）的 Scripting 與 Update Duration。
2. **改善到什麼程度？** 局部更新：Update Duration −67% 至 −80%、Scripting −37% 至 −68%；全量更新（AllChildren）：
   −20% 至 −34%（一次 CI）。Total main-thread：−4% 至 −23%（受 Browser 側成本稀釋，ParentOnly 一次 +6%）。
3. **還需要工程改善嗎？** 是，與 rc.9 相同：局部更新時剩下約 90% 的 main-thread 成本是 Rendering / Painting，
   由 500 個 Child 的 DOM 規模與 CSS 決定，屬 Component Architecture / 虛擬化 / 減少重繪範圍等應用層決策。

---

## Limitations

- componentCount 只測 500；Mount 沒有 trace（沿用 `docs/decisions/component-storm-vapor-validation-scope.md`）。
- 2 次獨立 run；條件與 scope 執行順序固定、兩次 run 相同。
- run2 有機器層級 slow window；slow 的判定是 wall-clock 推論，不是直接的系統負載量測。
- Chrome 155、電源模式「最佳效能」與 rc.9 session 不同；跨 session 只看 drift 比較。
- Vue Runtime CPU / Application CPU 為低信心 bucket。

---

## Files generated

新增（主 repo，未 commit）：

- `results/cdp-trace/component-storm/COMPONENT_STORM_VAPOR_VALIDATION_REPORT_rc11.md`（本報告）
- `scripts/cdp-trace/run-component-storm-vapor-rc11.ts` — 由 `run-component-storm-vapor.ts` 複製，只改條件清單（7 條件、Chrome port 9381–9387）
- `scripts/cdp-trace/analyze-component-storm-vapor-rc11.ts` — 由 `analyze-component-storm-vapor.ts` 複製，只改 `COMPARISONS`（12 組，與 `analyze-day29-final-rc11.ts` 相同）與 `LABELS`
- `results/cdp-trace/validation/component-storm-vapor-rc11-run1-analysis.json`、`-run2-analysis.json`、`-run1-vs-run2.json`
- Raw（gitignored）：`results/cdp-trace/component-storm/vue-{7 條件}-run1|run2/update-500-{scope}/`（10 × 120 檔）；smoke：`vue-3.6.0-rc.11-*-smoke/`

未修改：rc.9 報告與 rc.9 原始資料、Scenario（7 個 worktree 的 `config.ts` 已還原為 `'AllChildren'`）、runner / 量測 pipeline、
主 repo 的 `package.json`（`vue: 3.5.40`）。

## Commands executed

```bash
# 環境（7 個 worktree，各自啟動 dev server；run 之間依 PID 重啟）
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5180> --strictPort

# Smoke（scratchpad script，非 repo 檔案）
node smoke-rc11.mts        # 三個 Scenario 的 rc.11 T / V → *-smoke
node smoke-attr.mts        # attribution bucket 檢查

# 量測（三個 Scenario 依序，同一 session）
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-component-storm-vapor-rc11.ts
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-component-storm-vapor-rc11.ts

# 分析
node scripts/cdp-trace/analyze-component-storm-vapor-rc11.ts -run1 > .../component-storm-vapor-rc11-run1-analysis.json
node scripts/cdp-trace/analyze-component-storm-vapor-rc11.ts -run2 > .../component-storm-vapor-rc11-run2-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../rc11-run1-analysis.json .../rc11-run2-analysis.json > .../component-storm-vapor-rc11-run1-vs-run2.json

# 等價檢查 / block-shift / slow window / 表格（scratchpad script）
node equiv.cjs <rc11-runN-analysis.json> <component-storm-vapor-runN-analysis.json>
node blockscan.cjs component-storm "Update Duration,Scripting" -rc11
node wall.cjs component-storm rc11
node gen.cjs component-storm tally|clean|cells|cost
```
