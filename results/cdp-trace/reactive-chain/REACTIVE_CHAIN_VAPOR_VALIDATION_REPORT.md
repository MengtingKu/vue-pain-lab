# Reactive Chain — Vapor Validation：Vue 3.6.0-rc.9 Traditional vs Vapor

**先測量，後解讀。** 本報告只描述 observed / reproduced / stable / attributable，
不給 overall score、rating 或「最佳」。條件、worktree 與分析方法與
`DAY29_FINAL_VALIDATION_REPORT_rc9.md`、Component Storm、Composable Chaos 的 Vapor 驗證相同。

> **本報告最重要的發現不是 Vapor，而是量測條件本身：** 本 Scenario 的 computed getter 每次執行都會
> `console.log`。在 CDP `Runtime.enable`（本 Lab 所有 CDP pipeline 的共同條件）下，Vue 3.5.40 看起來比 3.6
> 慢約 4–5 倍；關掉 `Runtime.enable` 後，差異消失（Part 4）。這個發現也影響 Composable Chaos 的版本結論，
> 已在該報告中更正。

---

## Part 0 — 基本資訊

| 項目                 | 值                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Freeze Point         | 2026-09-27，`vue@3.6.0-rc.9`                                                                         |
| Validation Date      | 2026-09-27，兩次獨立 run（run1 / run2）                                                              |
| Node / Vite / plugin | v24.13.0 / 8.1.5 / 6.0.8                                                                             |
| Browser              | Chrome 153.0.8010.54（所有條件、兩次 run）                                                           |
| Scenario Commit      | `d3991df`（5 個 worktree 的 `src/scenarios/reactive-chain`、`src/benchmarks/reactive` 與 HEAD 相同） |
| Scenario Parameters  | `DEPTH=100`、`AUTO_UPDATE=false`（`ReactiveChainPage.vue` 內的常數，未修改）                         |
| Benchmark Parameters | 3 warm-up + 10 measurement × cost-trace / runtime-attribution-trace；每個 trace 1 次 Trigger Update  |
| 電源                 | AC（runner pre-flight 檢查）                                                                         |
| CDP retry            | run1 0 次、run2 0 次                                                                                 |

---

## Part 1 — 新建的 CDP pipeline

本 Scenario 過去只有 in-page 量測（claude-in-chrome，DEPTH=100，3 trials × 100 updates），沒有 CDP pipeline。
本次新增：

| 檔案                                             | 內容                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/cdp-trace/reactive-chain-scenario.ts`   | Adapter：DOM 形狀（Trigger Update 按鈕、兩個 `.metric-group dl`、`.params dl`）。完成判定看 reactive 整數 Total Update Count，不受 0.1ms 文字碰撞影響                                    |
| `scripts/cdp-trace/run-reactive-chain-matrix.ts` | Runner：協定與 `run-component-storm-matrix.ts` 的 `runVersionMatrix()` 相同（navigate → ready → 確認 DEPTH=100 → 2 frames → trace → 1 次點擊 → 2 frames → save）                         |
| `scripts/cdp-trace/attribution.ts`               | **修改（additive）**：`APPLICATION_URL_FRAGMENTS` 加入 `ReactiveChainPage.vue`、`createReactiveChain.ts`，否則 computed getter 的樣本會落入 V8/native。不影響其他 Scenario（URL 不重疊） |

與 vdom-stress 相同：1 次點擊 / trace、共用 `chrome.ts` / `tracer.ts` / `sync.ts` / `evidence.ts` / `stats.ts`。

本 Scenario 的限制：

- 只有一格（DEPTH=100 × Update）：DEPTH 是 `.vue` 內的常數，改它等於改 Scenario。
- 初始化（chain 在 component setup 建立）無法 trace，頁面也沒有初始化時間指標。
- 沒有歷史 CDP 資料，因此沒有 drift 比較；歷史 in-page 數據（48ms）是不同量測方法，不直接比較。

---

## Part 2 — Smoke Test 與可比性

- 5 個條件的 Page 編譯結果正確（Vapor 為 `defineVaporComponent`）。
- 20 次 update 後：Final Value 皆為 120；每次 update 的 `console.log` 次數皆為 104
  （100 computed + watch + watchEffect + render），5 個條件完全相同 → **實際執行的工作量相同**。0 個 console error。
- **Vapor 下 Initialization Phase 的兩個計數器不刷新**：Computed Execute Count 停在 100、WatchEffect Trigger Count
  停在 1（Traditional 正確顯示 2100 / 21）。`console.log` 次數證明 Vapor 下 computed 確實執行了 2100 次，只是畫面
  沒有更新（這兩個計數器刻意不是 reactive，原本依賴整個 template 重新 render 才會刷新）。
  → 這兩個「畫面顯示值」在 Vapor 下不可比。Update Phase 計數器（Total Update Count / Watch Trigger / Render Count）正常。
- Attribution：Traditional 與 Vapor 的 CPU profile 皆出現 `createReactiveChain.ts`、`logger.ts`，歸入 Application CPU。

---

## Part 3 — 結果（DEPTH=100 Update，run1 ‖ run2）

Update Duration 單位 ms（in-page）；其餘單位 µs（trace）。中位數。

### 3.1 Architecture：rc.9 Traditional → rc.9 Vapor

| 指標            | run1                   | run2                  | 跨 run         |
| --------------- | ---------------------- | --------------------- | -------------- |
| Update Duration | 5.65 → 4.55，−19.5% U  | 5.40 → 5.05，−6.5% U  | direction      |
| Scripting       | 7946 → 6583，−17.2% U  | 8047 → 6914，−14.1% U | direction      |
| Rendering       | 3195 → 2216，−30.6% U  | 2588 → 2091，−19.2% U | direction      |
| Vue Runtime CPU | 1398 → 129，−90.8% CI  | 1422 → 583，−59.0% CI | **reproduced** |
| Application CPU | 5963 → 2855，−52.1% CI | 5563 → 4204，−24.4% U | direction      |

rc.4 Traditional → rc.4 Vapor：**0 reproduced**；Update Duration、Scripting 兩次都是 Vapor 較**慢**
（+8% 至 +13%，Unstable）；Vue Runtime CPU 兩次下降但皆 Unstable（−32% / −72%）。

### 3.2 Version（同 session，Runtime.enable 開啟）

| 比較                      | Update Duration                                       | Scripting             | Application CPU       | 跨 run                       |
| ------------------------- | ----------------------------------------------------- | --------------------- | --------------------- | ---------------------------- |
| 3.5.40 → rc.9 Traditional | 23.75 → 5.65 ms −76.2% CI ‖ 25.00 → 5.40 ms −78.4% CI | −68.6% CI ‖ −70.5% CI | −83.3% CI ‖ −84.2% CI | **3 reproduced**（皆 10/10） |
| 3.5.40 → rc.4 Traditional | −78.5% CI ‖ −82.4% CI                                 | −73.4% CI ‖ −76.3% CI | −84.7% CI ‖ −84.9% CI | **3 reproduced**（皆 10/10） |
| rc.4 → rc.9 Traditional   | +10.8% U ‖ +22.7% U                                   | +18.0% U ‖ +24.7% U   | —                     | 0 reproduced                 |
| rc.4 Vapor → rc.9 Vapor   | —                                                     | —                     | −38.3% CI ‖ +17.5% U  | 0 reproduced、1 conflicting  |

Vue Runtime CPU 在 3.5.40 → 3.6 的比較中**沒有**顯著差異（−9% 至 −45%，皆 Unstable）；差異全部落在 Application CPU
（`createReactiveChain.ts` 的 computed getter 與 `logger.ts`）。

### 3.3 Cost Structure（S / R / P 佔三者總和）

| 條件             | run1                     | run2                     |
| ---------------- | ------------------------ | ------------------------ |
| 3.5.40           | 89.4/6.8/3.7（28.3ms）   | 86.8/9.0/4.2（31.4ms）   |
| rc.4 Traditional | 70.6/19.5/9.9（9.5ms）   | 68.5/20.8/10.7（9.4ms）  |
| rc.4 Vapor       | 64.6/23.1/12.3（11.7ms） | 68.8/21.0/10.2（10.1ms） |
| rc.9 Traditional | 62.8/25.2/12.0（12.7ms） | 67.5/21.7/10.7（11.9ms） |
| rc.9 Vapor       | 66.9/22.5/10.5（9.8ms）  | 68.7/20.8/10.5（10.1ms） |

---

## Part 4 — 診斷：版本差異來自 CDP console capture

**假說**：computed getter 內每次 `console.log`，在 CDP `Runtime.enable` 下都會被序列化並擷取 stack trace。
若 3.5.40 與 3.6 在評估 100 層 computed 時的呼叫堆疊深度不同，這個「只有開著 DevTools / CDP 才存在」的成本
就會放大成版本差異。

**方法**（診斷用 script，不屬於正式 pipeline）：同一個 dev server，每個條件開 5 個全新的 headless Chrome 頁面，
各點 20 次 Trigger Update，讀頁面自己的 Average Update Duration；只切換是否送出 `Runtime.enable`。

| Reactive Chain（median of 5 pages）         | 3.5.40       | rc.9 Traditional | rc.9 Vapor |
| ------------------------------------------- | ------------ | ---------------- | ---------- |
| `Runtime.enable` 開啟（正式 pipeline 條件） | **17.05 ms** | 3.60 ms          | 3.63 ms    |
| `Runtime.enable` 關閉                       | **0.97 ms**  | 1.11 ms          | 1.28 ms    |

各頁數值：開啟時 3.5.40 為 15.38–19.16ms、rc.9 T 為 3.50–4.22ms；關閉時 3.5.40 為 0.88–1.18ms、rc.9 T 為 1.02–1.23ms、rc.9 V 為 1.01–1.38ms。

**結果**：關掉 `Runtime.enable` 後，3.5.40 不再比 3.6 慢（0.97 vs 1.11ms）。Part 3.2 的約 80% 版本差異
**幾乎全部來自 console.log × CDP console capture 的交互作用**，不是 DevTools 關閉時的使用者會感受到的差異。

**這個交互作用本身是可重現的觀察**：只要 DevTools / CDP 有開 Runtime domain（例如開著 DevTools Console），
這種「computed 裡有 console.log 的深層鏈」在 3.5.40 上確實慢很多。但為什麼 3.5.40 在這個條件下慢那麼多
（堆疊深度、stack trace 擷取成本的差異）：**mechanism not established**，本 Lab 沒有直接量測 stack 深度。

**影響範圍**：

- vdom-stress、Component Storm：hot path 沒有 `console.log`（已 grep 確認）→ 結論不受影響。
- **Composable Chaos**：computed getter 同樣呼叫 `log()` → 版本差異同樣被放大，已在
  `composable-chaos/COMPOSABLE_CHAOS_VAPOR_VALIDATION_REPORT.md` 更正（該報告開頭的更正說明與 Part 4.1）。
  相同診斷方法（Build Depth 20 後 20 次 update，每個條件 5 頁）：

  | Composable Chaos Depth 20 Update（median of 5 pages） | 3.5.40   | rc.4 Traditional | rc.9 Traditional |
  | ----------------------------------------------------- | -------- | ---------------- | ---------------- |
  | `Runtime.enable` 開啟                                 | 2.205 ms | 1.215 ms（−45%） | 1.130 ms（−49%） |
  | `Runtime.enable` 關閉                                 | 0.735 ms | 0.585 ms（−20%） | 0.615 ms（−16%） |

  關閉時各頁數值範圍重疊（3.5.40 0.380–0.790ms、rc.4 T 0.500–0.755ms、rc.9 T 0.550–1.360ms），
  無法確認仍有版本差異。Day 24 的 Depth 20 update Scripting −25.6% 同樣是在 CDP 條件下量得。

- Vapor vs Traditional 的比較：兩者的 `console.log` 次數相同，但 console 成本同樣稀釋了 render 部分；
  診斷中關閉 `Runtime.enable` 時，rc.9 Vapor（1.28ms）並未比 Traditional（1.11ms）快。

---

## Part 5 — Evidence Matrix

| Comparison                                          | Result                                                                                      | Evidence strength                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| rc.9 Traditional vs rc.4 Traditional                | 0 reproduced。**Not reproduced**                                                            | 對「無可重現差異」：中（單一 cell）                                   |
| 3.6 Traditional vs 3.5.40（CDP 條件）               | Update Duration −76% 至 −82%，10/10、兩次 run、兩個 RC 重現                                 | 觀察本身：強                                                          |
| 3.6 Traditional vs 3.5.40（無 CDP console capture） | 差異消失（0.97 vs 1.11ms，診斷 5 頁）                                                       | 中（診斷，非正式 pipeline）→ 上一列**不能**解讀為一般使用下的版本改善 |
| rc.9 Traditional vs rc.9 Vapor                      | 只有 Vue Runtime CPU 重現（−59% / −91%）；Update Duration / Scripting 只有方向一致、未達 CI | Vue Runtime CPU：方向中；整體時間：無證據                             |
| rc.4 Traditional vs rc.4 Vapor                      | 0 reproduced；整體時間兩次都是 Vapor 略慢（Unstable）                                       | 無證據                                                                |
| Browser Rendering                                   | 佔約 29–37%（3.6）；無任何重現的差異                                                        | 無證據                                                                |

---

## Part 6 — 必答問題

### 1. rc.9 Traditional 是否出現可重現的 Framework-level improvement？

相對 rc.4：否。相對 3.5.40：在 CDP 條件下有約 80% 的可重現差異，但這個差異**依賴 CDP console capture**，
關閉後消失，因此**不能**當作一般使用下的 Framework-level improvement。

### 2. rc.9 Vapor 是否降低 Framework / Scripting cost？

Vue Runtime CPU：方向一致下降、跨 run 重現（rc.9）。Scripting 與整體時間：只有方向一致、未達 CI；rc.4 甚至略慢。
本 Scenario 的成本主體是 100 層 computed 與 104 次 `console.log`，兩種架構共用，Vapor 能省的 render 部分很小。

### 3. 哪些結果可以歸因？

- **版本差異可歸因到「CDP console capture 條件下的 Vue 版本」**，而不是一般條件下的 Vue 版本（Part 4）。
- rc.9 Vapor 的 Vue Runtime CPU 下降可歸因到架構（方向）。

### 4. 哪些結果只能描述為 observed difference？

- Vapor 下 Initialization Phase 計數器不刷新（顯示問題，工作量相同）。
- 為何 3.5.40 在 console capture 下慢 4–5 倍（mechanism not established）。

---

## Part 7 — 四個 Scenario 的最終整理（rc.9 Freeze Point）

四個 Scenario 使用相同的 5 個條件（3.5.40、rc.4 Traditional / Vapor、rc.9 Traditional / Vapor）、同一批 worktree、
同一台機器（AC 供電、Chrome 153），各做 2 次獨立 run，只把兩次 run 都成立的結果列為「重現」。

| 項目                       | vdom-stress                 | Component Storm               | Composable Chaos                                               | Reactive Chain                                 |
| -------------------------- | --------------------------- | ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Vapor 降低 Vue Runtime CPU | 是（Mount 4 個 N）          | 是（Update 3 種 updateScope） | 是（Update 4 個 Depth）                                        | rc.9 是；rc.4 未重現                           |
| Vapor 降低實際時間         | 只有 Mount N=5000           | 是（Update 3 種 updateScope） | 只有淺 Depth（Depth 1）                                        | 否                                             |
| rc.4 → rc.9 Traditional    | 無可重現差異                | 無可重現差異                  | 無可重現差異                                                   | 無可重現差異                                   |
| 3.5.40 → 3.6 Traditional   | 無可重現差異                | 無可重現差異                  | CDP 條件下 Depth 10 / 20 下降；關閉 console capture 後無法確認 | CDP 條件下約 −80%；關閉 console capture 後消失 |
| hot path 有 `console.log`  | 否                          | 否                            | 是                                                             | 是                                             |
| 成本主體                   | Browser Rendering（Layout） | Browser Rendering + Painting  | Scripting（73–85%）                                            | Scripting（63–89%）                            |

**整體結論**：

1. **一般使用下（DevTools 關閉），四個 Scenario 都沒有找到可確認的 Vue 3.6 Traditional 版本改善**。
   rc.4 → rc.9 在四個 Scenario 都沒有可重現差異；3.5.40 → 3.6 只在 hot path 有 `console.log`、且開啟 CDP
   console capture 的兩個 Scenario 出現，關閉後消失或無法確認。
2. **Vapor 的效果是真實、可重現的**：四個 Scenario 的 Vue Runtime CPU 都下降（Reactive Chain 只有 rc.9 重現）。
   但是否轉換成使用者感受得到的時間改善，取決於成本主體：局部更新元件（Component Storm）最明顯；
   成本主體是 Browser Layout（vdom-stress）或 reactive 計算本身（Composable Chaos 深層、Reactive Chain）時效果很小。
3. **量測方法的教訓**：hot path 有 `console.log` 的 Scenario，CDP 量到的版本差異必須再用「關閉 `Runtime.enable`」的
   in-page 量測確認，否則會把 DevTools console 的成本誤判成 Vue 版本改善。

來源：`../DAY29_FINAL_VALIDATION_REPORT_rc9.md`、`../component-storm/COMPONENT_STORM_VAPOR_VALIDATION_REPORT.md`、
`../composable-chaos/COMPOSABLE_CHAOS_VAPOR_VALIDATION_REPORT.md`、本報告。

---

## Final Conclusion

1. **Vue Runtime 改善了什麼？** 在 DevTools 關閉的條件下，DEPTH=100 的 reactive chain 在 3.5.40、rc.4、rc.9、Vapor
   之間**沒有找到可重現的時間差異**。Vapor 只在 Vue Runtime CPU bucket 有方向性下降。
2. **改善到什麼程度？** No measurable improvement（一般條件）。CDP / DevTools console 開啟時，3.6 相對 3.5.40 快約
   4–5 倍——這是開發時（開著 DevTools）才會遇到的情境。
3. **還需要工程改善嗎？** 是，而且與 Vue 版本無關：**不要在 computed getter 這類熱路徑裡寫 `console.log`**。
   開著 DevTools 時，它的成本可以遠超過 reactive 計算本身，而且會嚴重扭曲效能量測。

---

## Limitations

- 只有 DEPTH=100 × Update 一格；初始化未量測。
- Part 4 診斷每個條件只有 5 頁，未經正式 pipeline 與分類器，且只量 in-page 時間（沒有 trace 拆解）。
- 正式 pipeline 需要 `Runtime.enable`（完成判定用 `Runtime.bindingCalled`），因此無法在正式 pipeline 內關閉 console capture。
- 2 次獨立 run；條件順序固定。
- Vue Runtime CPU / Application CPU 為低信心 bucket。

---

## Files generated

新增／修改（主 repo，未 commit）：

- `results/cdp-trace/reactive-chain/REACTIVE_CHAIN_VAPOR_VALIDATION_REPORT.md`（本報告）
- `scripts/cdp-trace/reactive-chain-scenario.ts`（新 adapter）
- `scripts/cdp-trace/run-reactive-chain-matrix.ts`（新 runner）
- `scripts/cdp-trace/run-reactive-chain-vapor.ts`（orchestration）
- `scripts/cdp-trace/analyze-reactive-chain-vapor.ts`
- `scripts/cdp-trace/attribution.ts`（**修改**：additive，加入 2 個 reactive-chain URL）
- `results/cdp-trace/validation/reactive-chain-vapor-run1-analysis.json`、`-run2-analysis.json`、`-run1-vs-run2.json`
- Raw（gitignored）：`results/cdp-trace/reactive-chain/vue-{5 條件}-run1|run2/`（10 × 40 檔）；smoke：`vue-3.6.0-rc.9-*-smoke/`

未修改：Scenario（`src/scenarios/reactive-chain/*`、`src/benchmarks/reactive/*`）、其他 adapter / runner、主 repo 的 `package.json`。

## Commands executed

```bash
(each worktree) node node_modules/vite/bin/vite.js --port <5174..5178> --strictPort

# Smoke / 診斷（scratchpad script，非 repo 檔案）
node rc-smoke.mts             # 5 條件 × 20 次 update：計數器、console.log 次數、error
node rcx-attr-smoke.mts       # 新 runner 的 rc.9 T / V smoke → attribution URL
node rc-console-diag.mts      # Runtime.enable 開 / 關 × 3 條件 × 5 頁
node cc-console-diag.mts      # Composable Chaos Depth 20，同上

# 量測
RUN_SUFFIX=-run1 node scripts/cdp-trace/run-reactive-chain-vapor.ts
RUN_SUFFIX=-run2 node scripts/cdp-trace/run-reactive-chain-vapor.ts

# 分析
node scripts/cdp-trace/analyze-reactive-chain-vapor.ts -run1 > .../reactive-chain-vapor-run1-analysis.json
node scripts/cdp-trace/analyze-reactive-chain-vapor.ts -run2 > .../reactive-chain-vapor-run2-analysis.json
node scripts/cdp-trace/compare-day29-runs.ts .../run1-analysis.json .../run2-analysis.json > .../reactive-chain-vapor-run1-vs-run2.json
```
