# Reactive Chain — Vapor Validation：Vue 3.6.0-rc.11 Traditional vs Vapor

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。方法、adapter、runner 與分類器和 rc.9 報告
（`REACTIVE_CHAIN_VAPOR_VALIDATION_REPORT.md`，原封不動）相同；本次只換條件清單。

> **沿用 rc.9 的更正：** 本 Scenario 的 computed getter 每次執行都會 `console.log`。在 CDP `Runtime.enable` 下，
> 3.5.40 看起來比 3.6 慢約 4–5 倍；關掉 `Runtime.enable` 後差異消失（rc.9 報告 Part 4 的診斷）。
> 本次沒有重做這個診斷，因此 Part 3.3 的 3.5.40 → 3.6 數字**同樣不能**解讀為一般使用下的版本改善。

---

## Part 0 — 基本資訊

| 項目                 | 值                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Freeze Point         | 2026-10-14，`vue@3.6.0-rc.11`（與 `DAY29_FINAL_VALIDATION_REPORT_rc11.md` 相同；rc.10 只記錄 Version Change，未量測） |
| Validation Date      | 2026-10-14，兩次獨立 run（run1 06:31–06:32 UTC、run2 06:48–06:49 UTC）                                                |
| Vue Git Commit       | rc.11 `b55f3b92a185…` · rc.9 `5be279570a84…` · rc.4 `3bafec0d84a9…` · 3.5.40 `fa2885d8c487…`                          |
| Node / Vite / plugin | v24.13.0 / 8.1.5 / 6.0.8（7 個 worktree 相同）                                                                        |
| Browser              | Chrome 155.0.8059.41（所有條件、兩次 run；rc.9 session 為 153.0.8010.54）                                             |
| Scenario Commit      | `d3991df`（7 個 worktree 的 `src/scenarios`、`src/benchmarks` 對 `d3991df` 皆 clean）                                 |
| Scenario Parameters  | `DEPTH=100`、`AUTO_UPDATE=false`（未修改）                                                                            |
| Benchmark Parameters | 3 warm-up + 10 measurement × cost-trace / runtime-attribution-trace；每個 trace 1 次 Trigger Update（與 rc.9 相同）   |
| 電源                 | AC（`BatteryStatus=2`）；AC overlay `ded574b5…` = 最佳效能（rc.9 session 為「最佳電源效率」）                         |
| CDP retry            | run1 0 次、run2 0 次                                                                                                  |

---

## Part 1 — 條件與流程

7 個條件，與 VDOM Stress rc.11 Final Validation 相同的 worktree 與順序（oldest first）。rc.9 session 的控制組
因 Chrome 153 → 155 而以 `-chrome155` 標籤重跑，原本的 rc.9 資料不覆蓋：

| 條件                  | Worktree                       | Port | 編譯結果（smoke 確認） |
| --------------------- | ------------------------------ | ---- | ---------------------- |
| 3.5.40（控制組）      | `vue-pain-lab-vue35-d29ctrl`   | 5178 | VDOM                   |
| rc.4 Traditional      | `vue-pain-lab-vue36rc4-trad`   | 5175 | VDOM                   |
| rc.4 Vapor            | `vue-pain-lab-vue36-vapor`     | 5174 | `defineVaporComponent` |
| rc.9 Traditional      | `vue-pain-lab-vue36rc9-trad`   | 5176 | VDOM                   |
| rc.9 Vapor            | `vue-pain-lab-vue36rc9-vapor`  | 5177 | `defineVaporComponent` |
| **rc.11 Traditional** | `vue-pain-lab-vue36rc11-trad`  | 5179 | VDOM                   |
| **rc.11 Vapor**       | `vue-pain-lab-vue36rc11-vapor` | 5180 | `defineVaporComponent` |

三個 Scenario 在同一個 session 依序跑（Component Storm → Composable Chaos → Reactive Chain），run1 與 run2 之間依 PID
重啟 7 個 dev server。Runner（`run-reactive-chain-matrix.ts`）、adapter、`attribution.ts` 未修改。

---

## Part 2 — Smoke Test、可比性與 session 品質

### 2.1 Smoke 與計數器

- rc.11 Traditional / Vapor 各 10 trial（`*-smoke`），0 error、0 retry。Vue Runtime CPU 有樣本
  （rc.11 Vapor 10 trial 中 9 個有樣本；rc.9 Vapor 的 smoke / run1 同樣有約一半 trial 為 0，成本太小，取樣不到）。
- 兩次 run、7 個條件的頁面計數器與 rc.9 相同：Traditional `Computed Execute Count 200 / WatchEffect 2`，
  Vapor `100 / 1`（rc.9 報告 Part 2 已說明：Vapor 下 Initialization 計數器不刷新，工作量相同）。
  Update Phase 計數器（Total Update / Watch Trigger / Render Count = 1）全部一致。

### 2.2 方法論等價檢查

新分析腳本對 rc.9 原始資料（Chrome 153）重算的 `arch-rc9-original`，與既有 `reactive-chain-vapor-run1/run2-analysis.json`
的 `arch-rc9` **11 / 11 cells 逐項相同**（兩個 run 皆是）→ 新舊結果可以並列。

### 2.3 Session 品質：slow window 檢查

同一個 session 的 Component Storm 與 Composable Chaos 出現**整台機器變慢的時段**（block 的 wall-clock 時間變成
1.5–3 倍，見那兩份報告的 Part 2）。本 Scenario 用相同方法檢查：14 個 block 中 **0 個**落在 slow window。

但 run1 → run2 的 block-shift 掃描（Update Duration 與 Scripting 中位數同時變動 ≥ ×1.6）有 2 個 block：

| Block                     | run1 → run2 Update Duration | Scripting |
| ------------------------- | --------------------------- | --------- |
| rc.11 Traditional         | 5.90 → 3.40 ms（×0.58）     | ×0.58     |
| 3.5.40（console capture） | 17.1 → 30.9 ms（×1.80）     | ×1.79     |

rc.11 Traditional run1 的 block 所有指標同時偏高（Rendering 3311 vs 1521µs、Painting 1272 vs 755µs），
但 wall-clock 正常。**Observed difference, mechanism not established.** rc.9 session 的同一掃描為 0 個 block。

---

## Part 3 — 結果（DEPTH=100 Update，run1 ‖ run2）

Update Duration 單位 ms（in-page）；其餘單位 µs（trace）。中位數。CI = Consistent Improvement、CR = Consistent
Regression、U = Unstable、S = Stable。

### 3.1 Architecture：rc.11 Traditional → rc.11 Vapor

| 指標            | run1                  | run2                  | 跨 run    |
| --------------- | --------------------- | --------------------- | --------- |
| Update Duration | 5.90 → 3.60，−39.0% U | 3.40 → 3.30，−2.9% S  | direction |
| Scripting       | 8268 → 5034，−39.1% U | 4796 → 5183，+8.1% U  | —         |
| Rendering       | 3311 → 1901，−42.6% U | 1521 → 1406，−7.5% U  | direction |
| Painting        | 1272 → 835，−34.4% U  | 755 → 609，−19.4% U   | direction |
| Vue Runtime CPU | 1979 → 257，−87.0% CI | 934 → 227，−75.7% U   | direction |
| Application CPU | 5507 → 4647，−15.6% U | 4362 → 3729，−14.5% U | direction |

run1 的大幅差距主要來自 rc.11 Traditional 那個偏高的 block（Part 2.3）；run2 兩者的 Update Duration 幾乎相同。

同 session 的其他架構比較：

| 比較                                           | reproduced | conflicting | Vue Runtime CPU（run1 ‖ run2） | Update Duration（run1 ‖ run2） |
| ---------------------------------------------- | ---------: | ----------: | ------------------------------ | ------------------------------ |
| rc.11 Traditional → Vapor                      |      **0** |           0 | −87.0% CI ‖ −75.7% U           | −39.0% U ‖ −2.9% S             |
| rc.9 Traditional → Vapor（Chrome 155）         |      **0** |           0 | −69.3% U ‖ −72.6% U            | +24.1% U ‖ −5.1% U             |
| rc.4 Traditional → Vapor（Chrome 155）         |          1 |           0 | −58.9% CI ‖ −100.0% CI         | —                              |
| rc.9 Traditional → Vapor（原 Chrome 153 資料） |          1 |           0 | −90.8% CI ‖ −59.0% CI          | −19.5% U ‖ −6.5% U             |

Vue Runtime CPU 在 4 組架構比較、8 次量測中**全部下降**（−59% 至 −100%），其中 5 次達 CI（rc.9 Chrome 155 重跑 0 次）。Update Duration /
Scripting 沒有任何一次達 CI。

### 3.2 Version：rc.9 → rc.11（同 session，Chrome 155）

| 指標            | rc.9 → rc.11 Traditional        | rc.9 → rc.11 Vapor            |
| --------------- | ------------------------------- | ----------------------------- |
| Update Duration | +35.6% U ‖ −13.9% U（方向相反） | −33.3% U ‖ −12.0% U（同方向） |
| Scripting       | +37.5% U ‖ −13.3% U（方向相反） | −32.7% U ‖ −10.1% U（同方向） |
| Vue Runtime CPU | −2.0% S ‖ +15.5% U              | −58.6% U ‖ +2.3% U            |
| 分類            | 0 CI / 0 CR、0 reproduced       | 0 CI / 0 CR、0 reproduced     |

11 個 cell 兩邊都沒有任何 Consistent 訊號。Vapor 兩次同方向（rc.11 較低），但都是 Unstable，且 run1 的 rc.9 Vapor
block 也偏高（5.40 vs run2 3.75 ms）。

### 3.3 Version：3.5.40 → 3.6 Traditional（CDP console capture 條件下）

| 比較                       | Update Duration                               | Scripting             | Application CPU       | 跨 run                      |
| -------------------------- | --------------------------------------------- | --------------------- | --------------------- | --------------------------- |
| 3.5.40 → rc.11 Traditional | 17.1 → 5.90 −65.6% CI ‖ 30.9 → 3.40 −89.0% CI | −55.0% CI ‖ −85.4% CI | −78.0% CI ‖ −87.4% CI | 3 reproduced、6 conflicting |
| 3.5.40 → rc.9 Traditional  | 17.1 → 4.35 −74.6% CI ‖ 30.9 → 3.95 −87.2% CI | −67.2% CI ‖ −83.2% CI | −73.1% CI ‖ −89.7% CI | 3 reproduced、1 conflicting |

與 rc.9 相同的 3 個 cell 重現，差異同樣全部落在 Application CPU（computed getter + `logger.ts`）。6 個 conflicting
都是 Browser / Vue Runtime / V8 指標，來自兩個 run 之間 3.5.40 自己差了 ×1.8（Part 2.3）。依 rc.9 的診斷，
**這不是 DevTools 關閉時的版本差異**。

### 3.4 Drift：rc.9 session（Chrome 153）→ 本 session（Chrome 155）

| 條件             | run1 CI / CR | run2 CI / CR | Update Duration（run1 ‖ run2）              |
| ---------------- | ------------ | ------------ | ------------------------------------------- |
| 3.5.40           | 0 / 0        | 0 / 0        | 23.8 → 17.1 −27.8% U ‖ 25.0 → 30.9 +23.4% U |
| rc.9 Traditional | 0 / 0        | 0 / 0        | 5.65 → 4.35 −23.0% U ‖ 5.40 → 3.95 −26.9% U |
| rc.9 Vapor       | 0 / 0        | 0 / 0        | 4.55 → 5.40 +18.7% U ‖ 5.05 → 3.75 −25.7% U |

Chrome 153 → 155（加上電源模式不同、隔 17 天）沒有造成任何 Consistent 的變化。

### 3.5 Cost Structure（S / R / P 佔三者總和，run1 ‖ run2）

| 條件              | S / R / P %                     | Total S+R+P       |
| ----------------- | ------------------------------- | ----------------- |
| 3.5.40            | 87.6/8.4/4.0 ‖ 90.4/6.1/3.5     | 20,951 ‖ 36,356µs |
| rc.9 Traditional  | 67.5/21.8/10.8 ‖ 67.6/21.7/10.7 | 8,916 ‖ 8,178µs   |
| rc.9 Vapor        | 62.0/24.9/13.0 ‖ 73.3/17.6/9.1  | 12,053 ‖ 7,864µs  |
| rc.11 Traditional | 64.3/25.8/9.9 ‖ 67.8/21.5/10.7  | 12,850 ‖ 7,072µs  |
| rc.11 Vapor       | 64.8/24.5/10.7 ‖ 72.0/19.5/8.5  | 7,770 ‖ 7,197µs   |

成本主體仍是 Scripting（62–73%，3.6 各條件），與 rc.9 相同。

---

## Part 4 — Evidence Matrix

| Comparison                             | Result                                                                                                    | Evidence strength                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| rc.11 Traditional vs previous baseline | 對 rc.9 Traditional：0 CI / 0 CR、方向兩次相反。**Not reproduced**                                        | 對「無可重現差異」：中（單一 cell、run1 有偏高 block） |
| rc.11 Traditional vs rc.11 Vapor       | 0 reproduced；Vue Runtime CPU −87% CI / −76% U；Update Duration −39% U / −3% S                            | Vue Runtime CPU：方向中；整體時間：無證據              |
| Mount                                  | 不適用（本 Scenario 初始化無法 trace）                                                                    | —                                                      |
| Update（DEPTH=100）                    | 7 個條件之間沒有任何 Traditional ↔ 3.6 版本、架構組合在兩次 run 都達 CI 的時間差異（3.5.40 除外，見下列） | 無證據                                                 |
| 3.6 Traditional vs 3.5.40（CDP 條件）  | Update Duration −66% 至 −89%，與 rc.9 相同地重現；依 rc.9 診斷，來自 console capture                      | 觀察本身：強；作為版本改善：無證據                     |
| Vue Runtime CPU                        | 4 組架構比較 × 2 run 全部下降（−59% 至 −100%），5 次 CI                                                   | 方向：中；數值：低信心 bucket                          |
| Scripting                              | 架構、rc.9 → rc.11 皆無 Consistent 訊號                                                                   | 無證據                                                 |
| Browser Rendering                      | 3.6 各條件 R+P 約 27–38%；無任何重現的差異                                                                | 無證據                                                 |

---

## Part 5 — 必答問題

### 1. rc.11 Traditional 是否出現可重現的 Framework-level improvement？

**否。** 相對 rc.9 Traditional（同 session）：11 個 cell 兩次 run 皆無 Consistent 訊號，Update Duration 方向兩次相反。
相對 3.5.40 的大幅差異沿用 rc.9 的結論：依賴 CDP console capture，不能當作一般使用下的改善。

### 2. rc.11 Vapor 是否仍然降低 Framework / Scripting cost？

Vue Runtime CPU：兩次都下降（−87% CI、−76% U），與 rc.9 的方向相同。Scripting 與 Update Duration：沒有證據。

### 3. Update 是否在較大 Node Count 下出現更明顯改善？

不適用：本 Scenario 只有 DEPTH=100 一格。

### 4. Browser Rendering / Layout / Painting 還剩多少成本？

3.6 各條件 Rendering + Painting 佔 S+R+P 約 27–38%（約 2–4ms），沒有任何比較出現重現的差異。

### 5. rc.11 是否改變原本 rc.9 Vapor 的結論？

**沒有改變方向，但 rc.9 唯一重現的訊號（Vue Runtime CPU）在 rc.11 只有一次 CI、rc.9 的 Chrome 155 重跑 0 次 CI。**
rc.9 的結論「只有 Vue Runtime CPU 下降、整體時間無證據」仍然成立，強度不比 rc.9 高。

### 6. 哪些結果可以歸因？

- Vapor → Vue Runtime CPU 下降：方向在 4 組架構比較 × 2 run 一致，可歸因到架構（方向）。
- rc.9 → rc.11 Traditional 無可重現差異。

### 7. 哪些結果只能描述為 observed difference？

- rc.11 Traditional run1 block 全部指標偏高（×1.7），wall-clock 正常。
- 3.5.40 在兩個 run 之間差 ×1.8（console capture 條件下的 3.5.40 本來就變異大）。
- 3.5.40 → 3.6 在 CDP 條件下約 −66% 至 −89%（機制見 rc.9 報告 Part 4，未重做診斷）。

### 8. 哪些結果仍然無法解釋？

- rc.11 Traditional run1 的偏高 block 來源。
- 為何 3.5.40 在 console capture 下慢 4–5 倍（rc.9 已列為 mechanism not established）。

---

## Part 6 — 四個 Scenario 的整理（rc.11 Freeze Point）

| 項目                       | vdom-stress（3 run）                          | Component Storm（2 run）                | Composable Chaos（2 run）           | Reactive Chain（2 run） |
| -------------------------- | --------------------------------------------- | --------------------------------------- | ----------------------------------- | ----------------------- |
| rc.9 → rc.11 Traditional   | 無可重現差異                                  | 無可重現差異                            | 無可重現差異                        | 無可重現差異            |
| rc.9 → rc.11 Vapor         | —（rc.11 報告未列為主要比較）                 | 無可重現差異（AllChildren 兩次 Stable） | 無法判定（slow window 重疊）        | 無可重現差異            |
| Vapor 降低 Vue Runtime CPU | Mount N=1000/5000（3/3）                      | ParentOnly 重現；其餘同方向             | Update 4 個 Depth 皆重現            | 方向一致，1 次 CI       |
| Vapor 降低實際時間         | Mount Scripting N≥500、Render Duration N=5000 | ParentOnly / SingleChild 重現           | Build Depth 1 重現                  | 否                      |
| Session 品質               | 168 block 中 2 個偏移                         | 42 block 中 9 個 slow（run2）           | 112 block 中 22 個 slow（兩個 run） | 0 個 slow；2 個偏移     |

**整體結論**：rc.11 在四個 Scenario 都**沒有**出現可重現的 Traditional 版本改善；Vapor 的方向與 rc.9 相同，
沒有被 rc.11 改變。Component Storm / Composable Chaos 的這一輪 session 有機器層級的 slow window，
可用的 clean cell 較少（各報告 Part 2）。

來源：`../vdom-stress/DAY29_FINAL_VALIDATION_REPORT_rc11.md`、`../component-storm/COMPONENT_STORM_VAPOR_VALIDATION_REPORT_rc11.md`、
`../composable-chaos/COMPOSABLE_CHAOS_VAPOR_VALIDATION_REPORT_rc11.md`、本報告。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** rc.9 → rc.11 Traditional / Vapor：No measurable improvement。Vapor 只在 Vue Runtime
   CPU bucket 有方向性下降，與 rc.9 相同。
2. **改善到什麼程度？** No measurable improvement（Update Duration / Scripting）。
3. **還需要工程改善嗎？** 是，與 rc.9 相同：不要在 computed getter 等熱路徑寫 `console.log`。

---

## Limitations

- 只有 DEPTH=100 × Update 一格；初始化未量測。
- 2 次獨立 run；條件順序固定、兩次 run 相同。
- 沒有重做 `Runtime.enable` 開／關的診斷（沿用 rc.9 報告 Part 4）。
- Chrome 155、電源模式「最佳效能」與 rc.9 session（Chrome 153、「最佳電源效率」）不同；跨 session 只看 drift 比較。
- Vue Runtime CPU / Application CPU 為低信心 bucket。

---

## Files generated

新增（主 repo，未 commit）：

- `results/cdp-trace/reactive-chain/REACTIVE_CHAIN_VAPOR_VALIDATION_REPORT_rc11.md`（本報告）
- `scripts/cdp-trace/run-reactive-chain-vapor-rc11.ts` — 由 `run-reactive-chain-vapor.ts` 複製，只改條件清單（7 條件、Chrome port 9421–9427）
- `scripts/cdp-trace/analyze-reactive-chain-vapor-rc11.ts` — 由 `analyze-reactive-chain-vapor.ts` 複製，只改 `COMPARISONS`（12 組，與 `analyze-day29-final-rc11.ts` 相同）、`LABELS` 與 browserVersions 的標籤來源
- `results/cdp-trace/validation/reactive-chain-vapor-rc11-run1-analysis.json`、`-run2-analysis.json`、`-run1-vs-run2.json`
- Raw（gitignored）：`results/cdp-trace/reactive-chain/vue-{7 條件}-run1|run2/`（10 × 40 檔）；smoke：`vue-3.6.0-rc.11-*-smoke/`

未修改：rc.9 報告與 rc.9 原始資料、Scenario、runner / adapter / `attribution.ts` / 量測 pipeline、主 repo 的 `package.json`（`vue: 3.5.40`）。

## Commands executed

```bash
# 環境（7 個 worktree，各自啟動 dev server；run 之間依 PID 重啟）
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5180> --strictPort

# Smoke（scratchpad script，非 repo 檔案）
node smoke-rc11.mts        # 三個 Scenario 的 rc.11 T / V → *-smoke
node smoke-attr.mts        # attribution bucket 檢查

# 量測（三個 Scenario 依序，同一 session）
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-reactive-chain-vapor-rc11.ts
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-reactive-chain-vapor-rc11.ts

# 分析
node scripts/cdp-trace/analyze-reactive-chain-vapor-rc11.ts -run1 > .../reactive-chain-vapor-rc11-run1-analysis.json
node scripts/cdp-trace/analyze-reactive-chain-vapor-rc11.ts -run2 > .../reactive-chain-vapor-rc11-run2-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../rc11-run1-analysis.json .../rc11-run2-analysis.json > .../reactive-chain-vapor-rc11-run1-vs-run2.json

# 等價檢查 / block-shift / slow window（scratchpad script）
node equiv.cjs <rc11-runN-analysis.json> <reactive-chain-vapor-runN-analysis.json>
node blockscan.cjs reactive-chain "Update Duration,Scripting" -rc11
node wall.cjs reactive-chain rc11
```
