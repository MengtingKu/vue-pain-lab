# Composable Chaos — Vapor Validation：Vue 3.6.0-rc.11 Traditional vs Vapor

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。協定（10 measurement、update 每個 trace 20 次點擊、Day 24 的
Instrumentation Duration 定義）、runner 與分類器和 rc.9 報告（`COMPOSABLE_CHAOS_VAPOR_VALIDATION_REPORT.md`，
原封不動）相同；本次只換條件清單。

> **兩個前提，閱讀本報告前請先看：**
>
> 1. **沿用 rc.9 的更正**：computed getter 內有 `console.log`，在 CDP `Runtime.enable` 下 3.5.40 → 3.6 的版本差異被放大
>    （rc.9 報告 Part 4.1、Reactive Chain rc.9 報告 Part 4）。本次未重做診斷，3.5.40 相關比較不解讀為版本改善。
> 2. **本 session 兩次 run 都有整台機器變慢的時段**（run1 06:25–06:28、run2 06:40:52–06:45:35 UTC），
>    112 個 block 中 22 個落在其中，集中在 **Depth 5**（rc.11 兩邊都受影響）與 **Depth 10 的前幾個條件**（Part 2.3）。
>    表格中以 **†** 標示；結論以兩次 run 都不在 slow window 的 cell 為準。

---

## Part 0 — 基本資訊

| 項目                 | 值                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Freeze Point         | 2026-10-14，`vue@3.6.0-rc.11`（與 `DAY29_FINAL_VALIDATION_REPORT_rc11.md` 相同；rc.10 只記錄 Version Change）                         |
| Validation Date      | 2026-10-14，兩次獨立 run（run1 06:22–06:31 UTC、run2 06:38–06:48 UTC）                                                                |
| Vue Git Commit       | rc.11 `b55f3b92a185…` · rc.9 `5be279570a84…` · rc.4 `3bafec0d84a9…` · 3.5.40 `fa2885d8c487…`                                          |
| Node / Vite / plugin | v24.13.0 / 8.1.5 / 6.0.8（7 個 worktree 相同）                                                                                        |
| Browser              | Chrome 155.0.8059.41（runner log，所有 Chrome instance 相同；此 runner 的 meta 不記錄 browserVersion）；rc.9 session 為 153.0.8010.54 |
| Scenario Commit      | `d3991df`（7 個 worktree 的 `src/scenarios`、`src/benchmarks` 對 `d3991df` 皆 clean）                                                 |
| Scenario Parameters  | Depth = 1 / 5 / 10 / 20，Operation = build / update                                                                                   |
| Benchmark Parameters | 3 warm-up + 10 measurement × cost-trace / runtime-attribution-trace；update 每個 trace 內含 20 次點擊（與 rc.9 相同）                 |
| 電源                 | AC（`BatteryStatus=2`）；AC overlay `ded574b5…` = 最佳效能（rc.9 session 為「最佳電源效率」）                                         |
| CDP retry            | run1 0 次、run2 0 次                                                                                                                  |

---

## Part 1 — 條件與流程

7 個條件（oldest first），與 VDOM Stress / Component Storm rc.11 相同的 worktree 與 port：3.5.40（5178）、rc.4 T（5175）、
rc.4 V（5174）、rc.9 T（5176）、rc.9 V（5177）、**rc.11 T（5179）**、**rc.11 V（5180）**。rc.9 session 的 5 個條件因
Chrome 153 → 155 以 `-chrome155` 標籤重跑，原 rc.9 資料不覆蓋。

每次 run：對每個 Depth（1 → 5 → 10 → 20），7 個條件依序各跑 build 與 update。Smoke 確認 rc.11 Vapor 的
`ComposableChaosPage.vue` 編譯為 `defineVaporComponent`、Traditional 為 VDOM。三個 Scenario 在同一個 session 依序跑
（Component Storm → Composable Chaos → Reactive Chain），run1 與 run2 之間依 PID 重啟 7 個 dev server。

---

## Part 2 — Smoke Test、可比性與 session 品質

### 2.1 Smoke

rc.11 Traditional / Vapor 的 Depth 10（3 measurement，`*-smoke`），0 error、0 retry；Vue Runtime CPU、Application CPU
皆有樣本。

### 2.2 方法論等價檢查

新分析腳本對 rc.9 原始資料（Chrome 153）重算的 `arch-rc9-original`，與既有 `composable-chaos-vapor-run1/run2-analysis.json`
的 `arch-rc9` **88 / 88 cells 逐項相同**（兩個 run）。

### 2.3 Slow window

每個 block（條件 × operation × Depth）的 wall-clock 時間（到下一個 block 開始為止），與同一 cell 跨兩次 run 的中位數比較，
≥ 1.5 倍標為 slow。量測值是毫秒級，不可能讓 block 多出 10 秒以上；變長代表整台機器在那段時間變慢。

| Run  | 時段（UTC）         | Slow block（wall-clock 為中位數的 1.5–3.0 倍）                                                              |
| ---- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| run1 | 06:25:26 – 06:27:54 | build-5：rc.11 T、rc.11 V；update-5：rc.11 V；build/update-10：3.5.40、rc.4 T                               |
| run2 | 06:40:52 – 06:45:35 | update-5：rc.9 T；build/update-5：rc.9 V、rc.11 T、rc.11 V；build/update-10：3.5.40、rc.4 T、rc.4 V、rc.9 T |

rc.9 session 用同一檢查：80 個 block **0 個** slow。slow block 的量測值同時偏高，例如 run2 rc.9 Traditional update-10
Scripting 76,112µs（run1 31,527µs）、Instrumentation Duration 2.75ms（run1 1.06ms）。

另有兩個 block 全部指標同時偏高、但 wall-clock 正常（未標 †）：**rc.11 Traditional run1 update-20**（Scripting 44,818 vs
run2 35,134µs，Rendering 7,002 vs 5,406µs）與 rc.4 Vapor run2 update-5（block-shift ×0.55，偏低）。
**Observed difference, mechanism not established.**

只用兩次 run 都不在 slow window 的 cell 重新統計：

| 比較                             | clean cells | run1 CI / CR | run2 CI / CR | reproduced | conflicting |
| -------------------------------- | ----------: | ------------ | ------------ | ---------: | ----------: |
| rc.11 Traditional → Vapor        |     66 / 88 | 6 / 0        | 8 / 1        |      **4** |           2 |
| rc.9 Traditional → Vapor（C155） |     44 / 88 | 3 / 2        | 6 / 0        |          3 |           1 |
| rc.4 Traditional → Vapor（C155） |     66 / 88 | 8 / 0        | 10 / 0       |          3 |           0 |
| rc.9 T → rc.11 T                 |     44 / 88 | 0 / 8        | 0 / 0        |      **0** |           0 |
| rc.9 V → rc.11 V                 |     66 / 88 | 0 / 6        | 10 / 1       |      **1** |           5 |

---

## Part 3 — Architecture：rc.11 Traditional → rc.11 Vapor（run1 ‖ run2）

Instrumentation Duration 單位 ms（build = Build Duration；update = 20 次點擊的 Average Update Duration）；其餘單位 µs。中位數。

### 3.1 Update

| 指標                     | Depth 1                                      | Depth 5（†）                                    | Depth 10                                    | Depth 20                                      |
| ------------------------ | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Instrumentation Duration | −11.5% U ‖ −54.2% CI                         | +98.7% CR† ‖ −13.2% U†（conflicting）           | −17.3% U ‖ −22.2% U                         | −13.5% U ‖ −19.3% U                           |
| Scripting                | −0.8% S ‖ −50.3% CI                          | +80.2% CR† ‖ −21.0% CI†（conflicting）          | −20.0% CI ‖ −23.8% U                        | −13.1% U ‖ −16.5% U                           |
| **Vue Runtime CPU**      | 4600 → 1234 −73.2% CI ‖ 2424 → 585 −75.9% CI | 7752 → 3958 −48.9% CI† ‖ 8718 → 4006 −54.0% CI† | 2868 → 824 −71.3% CI ‖ 4572 → 902 −80.3% CI | 8785 → 3132 −64.4% CI ‖ 6893 → 3046 −55.8% CI |
| Application CPU          | +62.3% U ‖ −35.5% U                          | −8.4% U† ‖ +9.9% U†                             | +28.5% U ‖ −6.0% U                          | +17.8% U ‖ −41.6% U                           |

- **Vue Runtime CPU 在 4 個 Depth 都重現下降**（−49% 至 −80%），與 rc.9 報告的「Update 4 個 Depth」相同。
  Depth 5 兩次都在 slow window，但兩邊（rc.11 T / V）同時受影響，相對差兩次一致，因此仍列為 reproduced，標 †。
- 實際時間（Instrumentation Duration）Depth 1 / 10 / 20 六次量測全部是 Vapor 較低（−11% 至 −54%），只有 1 次 CI。
- Depth 5 的 Instrumentation Duration / Scripting 兩次方向相反，兩次都在 slow window（run1 只有 rc.11 Vapor 在其中）。

### 3.2 Build

| 指標                     | Depth 1                                       | Depth 5（†）         | Depth 10            | Depth 20            |
| ------------------------ | --------------------------------------------- | -------------------- | ------------------- | ------------------- |
| Instrumentation Duration | 0.95 → 0.50 −47.4% CI ‖ 0.75 → 0.45 −40.0% CI | −6.9% U† ‖ −27.3% U† | +31.8% U ‖ −13.0% U | −29.6% U ‖ −20.4% U |
| Scripting                | −31.3% U ‖ −30.7% U                           | +7.4% U† ‖ −23.5% U† | +34.2% U ‖ −25.4% U | −25.9% U ‖ −17.5% U |

Build Depth 1 的 Instrumentation Duration 兩次 CI（−47% / −40%）。rc.9 報告的 Build 為「只有淺 Depth」，與此一致。

### 3.3 其他架構比較（同 session，Chrome 155）

| 比較                                           | 全部 cell：run1 CI / CR ‖ run2 | reproduced | conflicting | Update Vue Runtime CPU 重現的 Depth |
| ---------------------------------------------- | ------------------------------ | ---------: | ----------: | ----------------------------------- |
| rc.11 Traditional → Vapor                      | 7 / 7 ‖ 16 / 1                 |          5 |          12 | 1、5†、10、20                       |
| rc.9 Traditional → Vapor（Chrome 155）         | 7 / 2 ‖ 17 / 7                 |          6 |           6 | 1、5†、10†（20 為一次 CI）          |
| rc.4 Traditional → Vapor（Chrome 155）         | 19 / 0 ‖ 15 / 0                |          8 |           1 | —                                   |
| rc.9 Traditional → Vapor（原 Chrome 153 資料） | 9 / 0 ‖ 13 / 0                 |          6 |           1 | （見 rc.9 報告）                    |

rc.11 的 12 個 conflicting 中 10 個在 Depth 5（†），另 2 個是 V8/native CPU（Depth 10 / 20，方向相反）。

---

## Part 4 — Version Effect

### 4.1 rc.9 → rc.11（同 session，Chrome 155）

| 比較             | 全部 cell：run1 CI / CR ‖ run2 | clean：run1 CI / CR ‖ run2 | reproduced（clean） | conflicting（clean） |
| ---------------- | ------------------------------ | -------------------------- | ------------------: | -------------------: |
| rc.9 T → rc.11 T | 1 / 8 ‖ 12 / 9                 | 0 / 8 ‖ 0 / 0              |               **0** |                    0 |
| rc.9 V → rc.11 V | 0 / 19 ‖ 12 / 2                | 0 / 6 ‖ 10 / 1             |               **1** |                    5 |

- **Traditional**：clean cell 中 run1 的 8 個 CR 全部是 **Depth 20 update**（Instrumentation +48.8%、Scripting +49.1%、
  Rendering +75.4%、Layout +77.2% …），就是 Part 2.3 那個全部指標同時偏高的 rc.11 Traditional run1 block；run2 同一 cell
  全部為 Unstable（+4% 至 +19%）。不列為版本差異。
- **Vapor**：clean 的 run1 有 6 個 CR（多數在 Depth 1 update），run2 有 10 個 CI（Depth 1 / 10 update 為主），方向互相矛盾。
  唯一 reproduced 的是 Application CPU build-1（0 → 404 / 0 → 110µs）：rc.9 Vapor 這格在兩次 run 都是 0 個樣本，
  rc.11 出現少量樣本，屬低信心 bucket 的取樣門檻，不解讀為版本差異。

### 4.2 3.5.40 → 3.6 Traditional（CDP console capture 條件下）

3.5.40 的 Depth 10 兩次 run 都在 slow window 內，3.5.40 → rc.11 T 的 88 cell 中只有 44 個 clean
（clean：1 reproduced、3 conflicting）。加上 console capture 偏差（前提 1），本次不解讀 3.5.40 相關的版本差異。

### 4.3 Drift：rc.9 session（Chrome 153）→ 本 session（Chrome 155）

| 條件             | 全部 cell：run1 CI / CR ‖ run2 | clean：run1 CI / CR ‖ run2 | clean 中兩次都 CR 的 cell                                                |
| ---------------- | ------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| 3.5.40           | 4 / 18 ‖ 1 / 12                | 0 / 7 ‖ 1 / 0              | 無                                                                       |
| rc.9 Traditional | 0 / 7 ‖ 0 / 21                 | 0 / 1 ‖ 0 / 1              | 無                                                                       |
| rc.9 Vapor       | 3 / 13 ‖ 1 / 16                | 0 / 5 ‖ 1 / 5              | Application CPU update-10 / 20、V8/native CPU update-20（+35% 至 +164%） |

rc.9 Vapor 在本 session 的 Depth 10 / 20 update，Application CPU 與 V8/native CPU 兩次都高於 rc.9 session，
Instrumentation Duration 與 Scripting 同方向但只有一次 CR（update-10 +22.6% U / +52.0% CR）。可能來源包括 Chrome 153 → 155、
電源模式、隔 17 天的機器狀態，無法區分：**Observed difference, mechanism not established.** rc.9 Traditional 沒有對應變化。

---

## Part 5 — Cost Structure（Update，S / R / P 佔三者總和，run1 ‖ run2）

| 條件              | Depth 1                       | Depth 5                           | Depth 10                       | Depth 20                      |
| ----------------- | ----------------------------- | --------------------------------- | ------------------------------ | ----------------------------- |
| rc.9 Traditional  | 78.9/14.4/6.7 ‖ 79.6/13.6/6.8 | 83.7/10.9/5.4 ‖ †79.3/13.6/7.1    | 83.1/11.7/5.2 ‖ †70.9/19.7/9.4 | 82.9/11.0/6.1 ‖ 81.4/12.7/5.9 |
| rc.9 Vapor        | 74.9/15.6/9.5 ‖ 72.2/18.0/9.7 | 76.8/14.9/8.3 ‖ †68.1/21.5/10.4   | 79.7/12.8/7.5 ‖ 80.4/13.0/6.6  | 83.8/10.7/5.5 ‖ 78.9/13.8/7.3 |
| rc.11 Traditional | 77.1/15.3/7.6 ‖ 79.5/13.2/7.3 | 79.3/14.1/6.6 ‖ †71.5/19.4/9.1    | 80.6/12.9/6.5 ‖ 85.7/9.3/5.0   | 81.4/12.7/5.8 ‖ 81.3/12.5/6.2 |
| **rc.11 Vapor**   | 75.8/16.0/8.2 ‖ 73.2/17.0/9.7 | †67.2/22.6/10.2 ‖ †67.9/21.3/10.8 | 80.1/12.9/7.0 ‖ 79.8/13.0/7.2  | 79.7/13.3/7.0 ‖ 79.4/13.5/7.1 |

成本主體仍是 Scripting（clean cell 72–86%），與 rc.9 相同。Vapor 降低的 Vue Runtime CPU（Depth 20 約 4–6ms）
相對於 Depth 20 update 約 37–55ms 的 S+R+P 總和很小，這解釋了為何 Vue Runtime CPU 重現下降、實際時間卻多數未達 CI。

---

## Part 6 — Evidence Matrix

| Comparison                             | Result                                                                                                                  | Evidence strength                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| rc.11 Traditional vs previous baseline | 對 rc.9 Traditional：clean cell 0 reproduced、0 conflicting；run1 的 8 個 CR 全部來自單一偏高 block。**Not reproduced** | 對「無可重現差異」：弱至中（clean cell 只有一半）      |
| rc.11 Traditional vs rc.11 Vapor       | Update Vue Runtime CPU 4 個 Depth 皆重現（−49% 至 −80%）；Build Depth 1 Instrumentation −47% / −40% CI                  | Vue Runtime CPU：方向強、數值低信心；Build Depth 1：中 |
| Mount（Build）                         | 只有 Depth 1 重現；Depth 10 / 20 兩次方向不一致或皆 U                                                                   | Depth 1：中；其餘：無證據                              |
| Update                                 | Instrumentation Duration Depth 1 / 10 / 20 六次全部 Vapor 較低（−11% 至 −54%），1 次 CI；Depth 5 受 slow window 影響    | 方向：中；幅度：無證據                                 |
| N=20 Update（最深 Depth）              | Vue Runtime CPU −64% / −56% CI；Instrumentation −14% / −19% U；Scripting −13% / −17% U                                  | Vue Runtime CPU：中；整體時間：弱（方向）              |
| Vue Runtime CPU                        | Update 4 個 Depth × 2 run 全部 CI（Depth 5 為 †）                                                                       | 方向：強；數值：低信心 bucket                          |
| Scripting                              | Update Depth 1 / 10 各一次 CI，其餘 U；Scripting share 72–86%                                                           | 弱（方向）                                             |
| Browser Rendering                      | Rendering + Painting 佔 S+R+P 約 14–28%；無重現差異（Recalculate Style Depth 1 / 10 各一次 CI）                         | 無證據                                                 |

---

## Part 7 — 必答問題

### 1. rc.11 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 對 rc.9 Traditional：clean cell 中 0 個重現、0 個 conflicting；run1 的 8 個 CR（rc.11 較慢）全部來自 Depth 20 update
的單一偏高 block，run2 未重現。

### 2. rc.11 Vapor 是否仍然降低 Framework / Scripting cost？

**Vue Runtime CPU：是，Update 4 個 Depth 都重現**（−49% 至 −80%）。Scripting 與實際時間：方向一致（Vapor 較低），
但只有 Depth 1 / 10 各一次 CI；Build 只有 Depth 1 的 Instrumentation Duration 重現。

### 3. Depth 越深，Vapor 越有效嗎？

**否，與 rc.9 相同。** Vue Runtime CPU 的相對降幅不隨 Depth 增加（Depth 1 −73% / −76%、Depth 20 −64% / −56%），
實際時間在深 Depth 只有 −13% 至 −19%（U）。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

Update 的 Rendering + Painting 佔 S+R+P 約 14–28%（clean cell），成本主體是 Scripting（computed 計算與 `console.log`），
Vapor 不改變這個結構。

### 5. rc.11 是否改變原本 rc.9 Vapor 的結論？

**沒有改變。** rc.9 的結論「Vapor 降低 Update Vue Runtime CPU（4 個 Depth）、實際時間只在淺 Depth 改善」在 rc.11 同樣成立。
rc.9 Vapor → rc.11 Vapor 的直接比較方向互相矛盾（clean：run1 6 CR、run2 10 CI），無法判定有無版本差異。

### 6. 哪些結果可以歸因？

- 架構 → Update Vue Runtime CPU 下降：2 次 run、3 個 RC 同構（rc.4 / rc.9 / rc.11），可歸因到架構（方向）。
- 架構 → Build Depth 1 時間下降：rc.11 兩次 CI。

### 7. 哪些結果只能描述為 observed difference？

- rc.11 Traditional run1 Depth 20 update 全部指標偏高（+45% 至 +77%），wall-clock 正常。
- rc.9 Vapor 在本 session 的 Depth 10 / 20 update Application CPU / V8/native CPU 高於 rc.9 session（drift）。
- 兩次 run 的機器層級 slow window（block wall-clock 1.5–3 倍）。

### 8. 哪些結果仍然無法解釋？

- rc.9 Vapor → rc.11 Vapor 在 clean cell 的方向互相矛盾（run1 rc.11 較慢、run2 rc.11 較快）。
- slow window 與偏高 block 的來源：runner 不記錄系統負載。
- 3.5.40 在 console capture 下為何較慢（沿用 rc.9，mechanism not established）。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** rc.9 → rc.11 Traditional：No measurable improvement。Vapor 在 rc.11 仍降低 Update 的
   Vue Runtime CPU（4 個 Depth），與 rc.9 相同。
2. **改善到什麼程度？** Vue Runtime CPU −49% 至 −80%；實際時間：Build Depth 1 −40% 至 −47%，其餘 Depth
   Minor（方向一致、未重現）。
3. **還需要工程改善嗎？** 是，與 rc.9 相同：成本主體是 composable 鏈本身的 Scripting（72–86%），以及 computed 內的
   `console.log`。Vapor 只能省下 render 部分；減少 composable 層數與移除熱路徑的 log 是應用層決策。

---

## Limitations

- 2 次獨立 run，兩次都有 slow window；Depth 5 的 rc.11 兩邊在兩次 run 都受影響，Depth 5 的結論只能看相對差。
- slow 的判定是 wall-clock 推論，不是直接的系統負載量測。
- 沒有重做 `Runtime.enable` 開／關的診斷（沿用 rc.9 報告 Part 4.1）。
- Chrome 155、電源模式「最佳效能」與 rc.9 session 不同；跨 session 只看 drift 比較。
- Vue Runtime CPU / Application CPU 為低信心 bucket。

---

## Files generated

新增（主 repo，未 commit）：

- `results/cdp-trace/composable-chaos/COMPOSABLE_CHAOS_VAPOR_VALIDATION_REPORT_rc11.md`（本報告）
- `scripts/cdp-trace/run-composable-chaos-vapor-rc11.ts` — 由 `run-composable-chaos-vapor.ts` 複製，只改條件清單（7 條件、Chrome port 9401–9407）
- `scripts/cdp-trace/analyze-composable-chaos-vapor-rc11.ts` — 由 `analyze-composable-chaos-vapor.ts` 複製，只改 `COMPARISONS`（12 組，與 `analyze-day29-final-rc11.ts` 相同）與 `LABELS`
- `results/cdp-trace/validation/composable-chaos-vapor-rc11-run1-analysis.json`、`-run2-analysis.json`、`-run1-vs-run2.json`
- Raw（gitignored）：`results/cdp-trace/composable-chaos/vue-{7 條件}-run1|run2/{build|update}-depth-{1,5,10,20}/`（10 × 320 檔）；smoke：`vue-3.6.0-rc.11-*-smoke/`

未修改：rc.9 報告與 rc.9 原始資料、Scenario、runner / 量測 pipeline、主 repo 的 `package.json`（`vue: 3.5.40`）。

## Commands executed

```bash
# 環境（7 個 worktree，各自啟動 dev server；run 之間依 PID 重啟）
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5180> --strictPort

# Smoke（scratchpad script，非 repo 檔案）
node smoke-rc11.mts        # 三個 Scenario 的 rc.11 T / V → *-smoke（本 Scenario：Depth 10、3 measurement）
node smoke-attr.mts        # attribution bucket 檢查

# 量測（三個 Scenario 依序，同一 session）
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-composable-chaos-vapor-rc11.ts
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-composable-chaos-vapor-rc11.ts

# 分析
node scripts/cdp-trace/analyze-composable-chaos-vapor-rc11.ts -run1 > .../composable-chaos-vapor-rc11-run1-analysis.json
node scripts/cdp-trace/analyze-composable-chaos-vapor-rc11.ts -run2 > .../composable-chaos-vapor-rc11-run2-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../rc11-run1-analysis.json .../rc11-run2-analysis.json > .../composable-chaos-vapor-rc11-run1-vs-run2.json

# 等價檢查 / block-shift / slow window / 表格（scratchpad script）
node equiv.cjs <rc11-runN-analysis.json> <composable-chaos-vapor-runN-analysis.json>
node blockscan.cjs composable-chaos "Instrumentation Duration,Scripting" -rc11
node wall.cjs composable-chaos rc11
node gen.cjs composable-chaos tally|clean|cleanlist|cells|cost
```
