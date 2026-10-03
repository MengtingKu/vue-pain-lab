---
name: validate-vue-update
description: 執行 Vue Pain Lab Validation Protocol，使用固定 Scenario 與 Evidence Matrix 驗證 Vue Runtime 版本差異。也負責 D29 Final Validation 宣告新 RC Freeze Point（例如 `/validate-vue-update 3.6.0-rc.10`）：先回報 Validation Plan、確認後才量測，產出 analysis 與報告後接 load-data。
user-invocable: true
---

## 使用方式

- `/validate-vue-update 3.6.0-rc.10`：以參數的 exact version 執行 D29 Final Validation（新的 RC Freeze Point），流程見下方「D29 Final Validation：宣告新的 RC Freeze Point」。
- 不帶參數：一般的 Scenario 版本驗證，依 Scenario Freeze Rule 與 Validation Flow 進行。

## Scenario Freeze Rule

目的：

確保 Vue Runtime Version 是唯一實驗變因。

Vue 3.5 / Vue 3.6 必須共用完全相同的 Scenario。

禁止：

- 修改 component structure
- 修改 reactive logic
- 修改 benchmark parameters
- 新增 optimization workaround
- 為 Vue 3.6 特別調整 code

Vue runtime version 是唯一允許變更的實驗變因。

---

## Final Validation Freeze Rule

D29 Final Validation 不追蹤每一個 Vue 3.6 Release Candidate。

目的：

確保 Final Validation 有明確的 Version Freeze Point，
避免 RC 持續發布造成重複 benchmark。

規則：

1. D09 / D14 / D19 / D25 的歷史 Validation Version 不得修改。
2. 歷史 Validation 仍使用原本固定的 Vue 3.6.0-rc.2。
3. D29 Final Validation 使用 Release Candidate Freeze Point 當天的最新 Vue 3.6 RC。
4. Freeze Point 之後的新 RC 不自動觸發重新 benchmark。只有使用者明確要求（例如 `/validate-vue-update 3.6.0-rc.10`）時，才宣告新的 Freeze Point 並重跑。
5. 新 RC 若在文章發布前出現，只記錄 Version Change，不直接覆蓋既有 Final Validation。宣告新 Freeze Point 時產出**新的**報告檔（`DAY29_FINAL_VALIDATION_REPORT_<rc>.md`，例如 `_rc10.md`），前一個 Freeze Point 的報告原封不動，在新報告 Part 0 引用。
6. 若新 RC 包含與本次驗證 Scenario / Vapor / Runtime Cost 直接相關的重大變更，才評估是否需要追加 validation。
7. Final Validation Report 必須記錄：
   - Validation Date
   - Vue Version
   - Vue Git Commit（如果可取得）
   - Node Version
   - Browser Version
   - Scenario Commit / Git Commit
   - Benchmark Parameters
   - Freeze Point

Version strategy：

Historical Validation:

Vue 3.6.0-rc.2

Final Validation:

Latest Vue 3.6 RC at the declared Freeze Point

Final Validation 不得使用 floating version。
必須固定 exact version，例如：

vue@3.6.0-rc.9

---

## D29 Final Validation：宣告新的 RC Freeze Point

以參數 `<ver>`（exact version，例如 `3.6.0-rc.10`）執行。以下 `<rc>` 指短標籤（例如 `rc10`），`<prev>` 指前一個 Freeze Point（目前是 `3.6.0-rc.9`，報告 `results/cdp-trace/DAY29_FINAL_VALIDATION_REPORT_rc9.md`）。

**前一份報告是最好的範本。** 它的 Part 2「實驗設計與環境控制」與文末「Commands executed」記錄了實際做法；新一輪以它為準，只替換版本。

### Phase 1：檢查並回報 Validation Plan（不改程式、不跑 benchmark）

先完整檢查，再回報，**等使用者確認後才進 Phase 2**：

1. D29 `vdom-stress` Scenario 的位置、Scenario code、Node Count / benchmark parameters、warmup / trial count。
2. Chrome / CDP pipeline（`scripts/cdp-trace/`）、profile isolation、Traditional / Vapor 的啟用方式。
3. `<prev>` 的 worktree、run / analyze 腳本、raw 結果目錄與報告位置。
4. `<ver>` 是否存在於 npm（`npm view vue@<ver> version`）、它的 Vue Git commit、是否仍匯出 `vaporInteropPlugin`。
5. **電源：** 必須插電（`Win32_Battery.BatteryStatus=2`），並記錄 Windows 電源模式的實際生效值。電池量測會產生 2–5 倍的假回歸，rc.9 的第一次 matrix 就因此作廢。

Validation Plan 至少回報：預計建立的 worktree 與 port、如何安全切換到 `<ver>`、預計執行的 command、預計產生的結果目錄與檔案、**如何避免覆蓋 `<prev>` 與更早的結果**。目錄結構若會混淆，提出建議即可，不自行搬移或刪除既有資料。

### Phase 2：環境（每個版本一個 worktree，主 repo 不切版本）

- 在 `<prev>` 使用的 Scenario commit 上為 `<ver>` Traditional / Vapor 各建一個 worktree（`git worktree add ../vue-pain-lab-vue36<rc>-trad <commit> --detach`；vapor 同理）。主 repo 維持 Vue 3.5.40，不做 `npm install vue@…`。
- 從 `<prev>` 的 worktree 複製 `package.json` / `package-lock.json`，再 `npm install vue@<ver> --save-exact`（只改 `vue` 一個套件）。transitive 依賴若有變動（例如 rc.9 帶進 postcss 8.5.28），在報告揭露。
- Vapor worktree 套用與 `<prev>` **逐行相同**的 patch（`vite.config.ts` 的 `features.vapor: true`、`src/main.ts` 的 `app.use(vaporInteropPlugin)`）。
- 每個 worktree 用自己的 port 啟動 dev server（`--strictPort`）。停止 dev server 依 Process Management Rule，只終止指定 PID。

Freeze 檢查（實際驗證，寫進報告，不是假設）：

- 每個 worktree 對 Scenario commit 做 `git diff --quiet -- src/scenarios src/benchmarks`，全部 clean。
- 編譯結果：Vapor server 送出的 `VDomStressPage.vue` 含 `defineVaporComponent`，Traditional 含 `createElementBlock`。
- Vite pre-bundle chunk 名稱仍符合 `attribution.ts` 的 `bucketForUrl()`；不符就停下來回報，不要改 attribution 去遷就。
- 量測 pipeline（`chrome.ts` / `tracer.ts` / `sync.ts` / `scenario.ts` / `parser.ts` / `stats.ts` / `evidence.ts`）未修改。

### Phase 3：量測

- 由 `<prev>` 的 run 腳本（目前是 `scripts/cdp-trace/run-day29-final-rc9.ts`）複製出 `run-day29-final-<rc>.ts`，**只改版本標籤、worktree 與 port**。改動先給使用者看 diff。
- Matrix 包含 `<ver>` Traditional / Vapor，加上同 session 的控制組（3.5.40、`<prev>` Traditional / Vapor），每個 N 交錯執行；N、Mount / Update、warm-up / trial 數照舊。
- **兩次獨立的 AC 量測**，結果目錄以 `-runN` 後綴區分（`RUN_SUFFIX=-runN`）。後綴接續既有編號，不得重用已存在的目錄。兩次之間重啟 dev server。
- 作廢的量測（電池、中途中斷等）保留，analysis 檔名帶 `INVALID`。

### Phase 4：分析

- 由 `<prev>` 的 analyze 腳本（目前是 `analyze-day29-final-rc9.ts`）複製出 `analyze-day29-final-<rc>.ts`，**只改 `HISTORICAL_LABELS` 與 `COMPARISONS`**；`classify()` 門檻、paired-trial 定義、metrics 清單不動。要比哪幾組是實驗設計，先給使用者看 diff。
- **方法論等價檢查：** 用新腳本重算 `<prev>` 的原始資料，數字必須與 `<prev>` 報告逐項一致，才能拿新舊結果並列。
- 產出 `results/cdp-trace/validation/day29-final-<rc>-runN-analysis.json`，再用 `compare-day29-runs.ts` 產出兩次 run 的重現性比較（`…-runA-vs-runB.json`）。

### Phase 5：報告 `DAY29_FINAL_VALIDATION_REPORT_<rc>.md`

章節沿用 `<prev>` 報告（Part 0 Freeze Point 宣告 → Part 8 必答問題 → Final Conclusion / Limitations / Files generated / Commands executed），並清楚區分 Historical Validation（3.5.40 → 3.6.0-rc.2，不重跑、不修改）與本次 Final Validation。

- **Evidence：** Application timing（Mount / Update × N=100/500/1000/5000）、Chrome Performance cost（Scripting / Rendering / Layout / Painting / Recalculate Style）、Runtime Attribution（Vue Runtime CPU / Application CPU，沿用相同 methodology，不因結果不好看而換方法）、Cost Structure（Update N=5000 的 Traditional vs Vapor：Scripting 絕對值與佔比、Rendering、Painting、Total main-thread cost）。
- **兩種比較：** Version effect（`<prev>` → `<ver>`，Traditional）與 Architecture effect（Traditional → Vapor，`<ver>`）。
- **Evidence Matrix** 欄位：`Comparison | Result | Evidence strength`，列：`<ver>` Traditional vs previous baseline、`<ver>` Traditional vs `<ver>` Vapor、Mount、Update、N=5000 Update、Vue Runtime CPU、Scripting、Browser Rendering。
- **不給 overall score、rating 或「最佳」。** 只描述 observed、reproduced / not reproduced、stable / unstable、attributable / not attributable、evidence strength。
- 結果與 `<prev>` 不同時，先逐項排除：Scenario、benchmark parameters、Browser、CDP pipeline、warmup / trial、statistical spread、Runtime Attribution 是否足夠。無法歸因就寫 `Observed difference, mechanism not established`，不猜原因。
- **必答問題：**
  1. `<ver>` Traditional 是否出現可重現的 Framework-level improvement？
  2. `<ver>` Vapor 是否仍然降低 Framework / Scripting cost？
  3. Update 是否在較大 Node Count 下出現更明顯改善？
  4. Browser Rendering / Layout / Painting 還剩多少成本？
  5. `<ver>` 是否改變原本 `<prev>` Vapor 的結論？
  6. 哪些結果可以歸因？
  7. 哪些結果只能描述為 observed difference？
  8. 哪些結果仍然無法解釋？

### Phase 6：放上對比頁

執行 `load-data` skill，把 Phase 4 的 analysis 檔放上 `/compare` 對比頁並跑 build 校驗。

---

## Validation Flow

```
Current Scenario
        ↓
Create Baseline Snapshot
        ↓
Vue 3.5 Baseline
        ↓
Record Evidence
        ↓
Vue 3.6 Validation
        ↓
Record Evidence
        ↓
Compare Evidence
        ↓
Restore Vue 3.5 Baseline
        ↓
Verify Environment
        ↓
Next Scenario
```

---

## Environment Rule

比較時保持以下條件一致：

- Scenario code
- Vite version
- TypeScript version
- Node.js version
- Browser version
- Benchmark parameters

只允許修改：

- Vue Runtime Version

例如：

Baseline：

```bash
npm install vue@3.5.x
```

Validation：

```bash
npm install vue@3.6.x
```

D29 Final Validation 改用「每個版本一個 git worktree」隔離版本（見上方 Phase 2），主 repo 全程維持 Baseline，不需要做 Environment Restore 的版本還原，但仍要確認 `git status`。

---

## Process Management Rule

Validation 過程中禁止使用：

```powershell
taskkill /IM node.exe
taskkill /IM node.exe /F
```

或任何會終止所有 Node process 的指令。

原因：

Vue Pain Lab 可能同時執行：

- Vite dev server
- Playwright
- MCP Server
- Claude Code tooling
- 其他 Node.js Process

Restart dev server 時必須：

1. 找出目前 Scenario 使用的 Port。
2. 找出對應的 PID。
3. 確認該 PID 為目前 Scenario 的 dev server。
4. 只終止指定 PID。
5. 重新啟動 dev server。

例如：

取得 PID：

```powershell
netstat -ano | findstr :5173
```

確認 Process：

```powershell
tasklist | findstr <PID>
```

停止指定 Process：

```powershell
taskkill /PID <PID> /T
```

---

## Environment Restore

Validation 完成後：

恢復 Baseline Vue Version。

例如：

```bash
npm install vue@3.5.x
```

確認：

```bash
npm list vue
```

應與 Baseline Version 一致。

另外確認：

- package.json
- package-lock.json / pnpm-lock.yaml
- node_modules

確認 Git 狀態：

```bash
git status
```

允許修改：

- package.json
- package-lock.json / pnpm-lock.yaml
- Validation Log
- README Observation / Validation Result

確認沒有意外修改：

- Scenario source code
- Benchmark infrastructure
- Runtime logic

避免不同 Scenario 之間產生版本污染。

---

## Required Evidence

每個 Scenario 必須包含：

### Common Metrics

所有 Scenario:

- JS Execution Time
- Flame Chart Observation
- Memory Behavior
- Developer Experience

### Scenario Specific Metrics

依照 Scenario 定義：

例如：

Reactive Chain:

- Computed Execute Count
- Watch Trigger Count
- Dependency Depth

Component Storm:

- Component Render Count
- Update Frequency

---

## Research Documentation

每次 Validation 必須填寫：

### Baseline Snapshot

記錄：

- Vue Version
- Node.js Version
- Browser
- Scenario Parameters
- Git Commit（可選）

### Hypothesis

驗證前預測：

Vue 3.6 是否可能改善此 Pain Point。

### Observation

實際觀察：

包含：

- Metrics
- Flame Chart
- Unexpected Behavior

### Conclusion

是否支持 Hypothesis。

---

## Vapor 驗證附註：DevTools 面板已知限制

手動用瀏覽器驗證啟用 `features.vapor: true` 的 worktree 時：

- 內嵌 Vue DevTools 面板（`vite-plugin-vue-devtools`，Alt+Shift+D／
  `/__devtools__/`）目前不完整支援 Vapor —— Components 元件樹只畫得到
  `<Root>`，且面板閒置輪詢時會固定噴出
  `TypeError: Cannot read properties of undefined (reading 'el'/'_')`，
  跟 Vapor 或 scenario 本身無關。
- 判斷 Vapor 是否正常運作，以「實際操作頁面（例如點擊 Trigger）＋頁面顯示
  的數字」為準，不要用這個面板的錯誤或元件樹當依據。
- 真正代表 interop 沒裝好的錯誤是 `app.mount()` 拋出的
  `Vapor component found in vdom tree but vapor-in-vdom interop was not installed`，
  跟上述面板噴的 TypeError 是不同的錯誤。
- 詳見 [`docs/decisions/vapor-worktree-devtools-panel-unreliable.md`](../../../docs/decisions/vapor-worktree-devtools-panel-unreliable.md)。

---

## Final Conclusion Template

每個 Scenario 最後回答三個問題：

### 1. Vue Runtime 改善了什麼？

例如：

> Reactive update cost 降低。

### 2. 改善到什麼程度？

例如：

- Significant improvement
- Moderate improvement
- Minor improvement
- No measurable improvement

### 3. 還需要工程改善嗎？

Vue 無法解決的部分：

- Component Architecture
- State Design
- AI Coding Rules
