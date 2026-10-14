---
name: validate-vue-update
description: 執行 Vue Pain Lab Validation Protocol，使用固定 Scenario 與 Evidence Matrix 驗證 Vue Runtime 版本差異。也負責 D29 Final Validation 宣告新 RC Freeze Point：使用者說「驗證 rc.10」、「驗證最新的 RC」、「用 validate-vue-update 跑新版本」或 `/validate-vue-update 3.6.0-rc.10` 時使用。先回報 Validation Plan、確認後才量測，產出 analysis 與報告後接 load-data。
user-invocable: true
---

## 使用方式

- `/validate-vue-update 3.6.0-rc.10`、`/validate-vue-update rc.10`、`/validate-vue-update latest`，或口語「請用 validate-vue-update 驗證最新的 rc.10」：執行 D29 Final Validation（新的 RC Freeze Point）。版本怎麼解析見下方「版本代入規則」。
- 不帶版本、也不是要驗證新 RC：一般的 Scenario 版本驗證，依 Scenario Freeze Rule 與 Validation Flow 進行。

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

### 版本代入規則（每次執行都要做，不得沿用範例）

本節所有佔位符在執行時都必須代入**這次**的實際值。文中出現的 `rc.9`、`rc.10`、`run-day29-final-rc9.ts` 等只是範例或撰寫當時的狀態，**不得直接沿用**。

| 佔位符 | 意義 | 怎麼決定 |
| --- | --- | --- |
| `<ver>` | 本次驗證的 exact version，例如 `3.6.0-rc.10` | 由使用者輸入解析，見下方 |
| `<rc>` | `<ver>` 的短標籤，用於檔名與目錄，例如 `rc10` | 由 `<ver>` 推出 |
| `<prev>` | 前一個 Freeze Point 的 exact version | 從最新的 D29 報告動態判斷，見下方 |
| `<prev-rc>` | `<prev>` 的短標籤，例如 `rc9` | 由 `<prev>` 推出 |

**解析 `<ver>`：**

- 使用者給簡寫（`rc.10`、`rc10`）→ 補成 `3.6.0-rc.10`。給 `latest`、「最新的 RC」→ 用 `npm view vue dist-tags` 的 `rc` tag。
- 一律用 `npm view vue versions --json` 確認該 exact version 真的存在；不存在就停下來回報，不要猜最接近的版本。
- 不得使用 floating version（`^`、`~`、`rc`、`next`）。
- 解析出的 exact version、解析依據（使用者原話 → npm 查證結果）、npm 發布日期，寫進 Validation Plan 第一項給使用者確認。

**決定 `<prev>`：**

- 找出 `results/cdp-trace/vdom-stress/` 下最新的 `DAY29_FINAL_VALIDATION_REPORT_<rc>.md`（RC 編號最大者；都沒有時是 `DAY29_FINAL_VALIDATION_REPORT.md`）。它的 Part 0 寫了 Final Validation 版本，就是 `<prev>`。
- 同一份報告的「Commands executed」寫了 `<prev>` 實際用的 worktree、run 腳本、analyze 腳本；Phase 3、4 要複製的就是這些，不要假設檔名。
- `<ver>` 不比 `<prev>` 新（相同或更舊）時，停下來問使用者，不要重跑既有 Freeze Point。

**中間被跳過的 RC**（例如 `<prev>` = rc.9、`<ver>` = rc.11，中間有 rc.10）：依 Final Validation Freeze Rule 第 4、5 條**不量測**，只在 Validation Plan 與新報告 Part 0 加一列「Version Change（未量測）」，寫 exact version、npm 發布日期、tag commit（`git ls-remote https://github.com/vuejs/core refs/tags/v<x>`）。用 `npm view vue versions --json` 列出 `<prev>` 與 `<ver>` 之間的所有版本。

**前一份報告是最好的範本。** 它的 Part 2「實驗設計與環境控制」與文末「Commands executed」記錄了實際做法；新一輪以它為準，只替換版本。

### Phase 1：檢查並回報 Validation Plan（不改程式、不跑 benchmark）

先完整檢查，再回報，**等使用者確認後才進 Phase 2**：

1. D29 `vdom-stress` Scenario 的位置、Scenario code、Node Count / benchmark parameters、warmup / trial count。
2. Chrome / CDP pipeline（`scripts/cdp-trace/`）、profile isolation、Traditional / Vapor 的啟用方式。
3. `<prev>` 的 run / analyze 腳本、raw 結果目錄與報告位置；run 腳本裡**每個條件**的 worktree 仍存在、`package.json` 的 `vue` 版本正確、對 Scenario commit clean，port 沒有被占用（`netstat -ano | grep -E ':51[0-9]{2} .*LISTENING'`）。
4. `<ver>` 是否存在於 npm（`npm view vue@<ver> version`）、它的 Vue Git commit、是否仍匯出 `vaporInteropPlugin`。
5. **電源：** 必須插電（`Win32_Battery.BatteryStatus=2`），並記錄 Windows 電源模式的實際生效值。電池量測會產生 2–5 倍的假回歸，rc.9 的第一次 matrix 就因此作廢。
   - `powercfg /getactivescheme` 只看得到基礎方案（常是「平衡」），實際生效的是 overlay；`Win32_PowerPlan`（WMI `root/cimv2/power`）在這台機器沒有權限。改讀 registry：`MSYS_NO_PATHCONV=1 reg query "HKLM\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes" | grep ActiveOverlayAc`。`ded574b5-45a0-4f42-8737-46345c09c238` = 最佳效能、`961cc777-2547-4f9d-8174-7d86181b8a7a` = 最佳電源效率。
6. **Chrome 版本：** `chrome.ts` 用的是 `%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe`（使用者層級，會自動更新）。查 `(Get-Item "$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe").VersionInfo.ProductVersion`，與 `<prev>` 報告 Part 0 的 Browser 比對。**主版本不同時**，所有控制組都要在新 Chrome 下重跑，label 加 `-chrome<major>`（rc.9 時是 `-chrome153`、rc.11 時是 `-chrome155`），不得拿新版本對舊 session 的數字比版本效應。
7. **預估時間：** 一次 run 約每個條件 1.5 分鐘（rc.11 時 7 個條件約 10–12 分鐘），條件數會隨 Freeze Point 增加。

Validation Plan 至少回報：預計建立的 worktree 與 port、Matrix 條件清單、如何安全切換到 `<ver>`、預計執行的 command、預計產生的結果目錄與檔案、**如何避免覆蓋 `<prev>` 與更早的結果**、中間被跳過的 RC。目錄結構若會混淆，提出建議即可，不自行搬移或刪除既有資料。

### Phase 2：環境（每個版本一個 worktree，主 repo 不切版本）

- 在 `<prev>` 使用的 Scenario commit 上為 `<ver>` Traditional / Vapor 各建一個 worktree（`git worktree add ../vue-pain-lab-vue36<rc>-trad <commit> --detach`；vapor 同理）。主 repo 維持 Vue 3.5.40，不做 `npm install vue@…`。
- 從 `<prev>` 的 worktree 複製 `package.json` / `package-lock.json`，再 `npm install vue@<ver> --save-exact`（只改 `vue` 一個套件）。transitive 依賴若有變動（例如 rc.9 帶進 postcss 8.5.28），在報告揭露。
- Vapor worktree 套用與 `<prev>` **逐行相同**的 patch（`vite.config.ts` 的 `features.vapor: true`、`src/main.ts` 的 `app.use(vaporInteropPlugin)`）。
- 每個 worktree 用自己的 port 啟動 dev server（`--strictPort`）。停止 dev server 依 Process Management Rule，只終止指定 PID。

Freeze 檢查（實際驗證，寫進報告，不是假設）：

- 每個 worktree 對 Scenario commit 做 `git diff --quiet -- src/scenarios src/benchmarks`，全部 clean。
- 編譯結果：Vapor server 送出的 `VDomStressPage.vue` 含 `defineVaporComponent`，Traditional 含 `createElementBlock`。
  檢查方式：`curl -s http://localhost:<port>/src/scenarios/vdom-stress/VDomStressPage.vue | grep -c defineVaporComponent`（Traditional 改 grep `createElementBlock`）。每次 run 重啟 dev server 後都再查一次。
- Vite pre-bundle chunk 名稱仍符合 `attribution.ts` 的 `bucketForUrl()`；不符就停下來回報，不要改 attribution 去遷就。
  檢查方式：`curl -s http://localhost:<port>/node_modules/.vite/deps/vue.js | grep -oE 'vue\.runtime\.esm-bundler-[^"?]+'`，必須有輸出。
- 量測 pipeline（`chrome.ts` / `tracer.ts` / `sync.ts` / `scenario.ts` / `parser.ts` / `stats.ts` / `evidence.ts`）未修改：`git diff --stat <prev 報告的 Repo HEAD> -- scripts/cdp-trace/<上述檔案> scripts/cdp-trace/attribution.ts scripts/cdp-trace/run-validation-matrix.ts`，有差異就逐一說明是否影響 vdom-stress。
- 2026-10-03 VDOM Stress raw trace 搬到 `results/cdp-trace/vdom-stress/vue-*`（只改路徑）的揭露**已在 rc.11 報告完成**，之後的報告不需重複。

### Phase 3：量測

- 由 `<prev>` 的 run 腳本（`scripts/cdp-trace/run-day29-final-<prev-rc>.ts`，以 `<prev>` 報告的 Commands executed 為準）複製出 `run-day29-final-<rc>.ts`，**只改版本標籤、worktree 與 port**。改動先給使用者看 diff。
- Matrix **保留 `<prev>` run 腳本的全部條件，再新增 `<ver>` Traditional / Vapor**（使用者要求：原本的資料都要能在同一 session 對照）。例：rc.9 的 5 個條件（3.5.40、rc.4 T/V、rc.9 T/V）＋ rc.11 T/V = 7 個。既有條件沿用原本的 worktree 與 port，新條件用下一個沒被占用的 port（dev server 從 5174 起、Chrome debug port 從 9351 起）。每個 N 交錯執行，順序為版本由舊到新；N、Mount / Update、warm-up / trial 數照舊。
- run 腳本的預設 `RUN_SUFFIX` 設成第一個要跑的編號（與 `<prev>` 對齊，見下一點），註解寫清楚兩次的指令。
- **兩次獨立的 AC 量測**，結果目錄以 `-runN` 後綴區分（`RUN_SUFFIX=-runN`）。**後綴沿用 `<prev>` 兩次有效 run 的編號**（rc.9 為 `-run2` / `-run3`，則 `<ver>` 也用 `-run2` / `-run3`）：`/compare` 依「場景 + Run N」把各 Freeze Point 的 analysis 檔合成同一個 dataset，編號一致才能在同一個 Run 下用 A / B 選單比較不同版本。label 本身帶新版本或新 Chrome 標記（例如 `-chrome155`），目錄不會與既有的重名；執行前仍確認目標目錄不存在（run 腳本會拒絕覆蓋）。作廢的 run 不佔用這兩個編號。兩次之間重啟 dev server。
- **不要事後改名 raw 目錄。** rc.11 第一次用了 `-run1` / `-run2`，想改成 `-run2` / `-run3` 時，搬移量測證據被 auto mode 拒絕，而且 `meta.json` 內的 `vueVersion` 也會和目錄名不一致。編號錯了就**追加一次新的 run** 補上缺的編號（rc.11 追加 `-run3`），既有目錄保留為額外的重複，在報告說明。
- **使用者要求再確認再現性時**，用同一 script 追加一次獨立 run（下一個沒用過的編號）。量測前重新確認電源、Chrome 版本、worktree clean、編譯結果，並重啟所有 dev server。
- 量測期間不要做其他吃 CPU 的事（分析、build、lint 等到量測結束再跑）；run 腳本用背景執行，等完成通知。
- 每次 run 結束後確認：每個條件 320 個檔、`[retry]` 的分布（`awk '/^### /{h=$0} /\[retry\]/{print h}' <log> | sort | uniq -c`，應集中在小 N Update，且不限於新版本）。全部 run 結束後依 Process Management Rule 以 PID 停掉所有 dev server，worktree 保留。
- 作廢的量測（電池、中途中斷等）保留，analysis 檔名帶 `INVALID`。

### Phase 4：分析

- 由 `<prev>` 的 analyze 腳本（`analyze-day29-final-<prev-rc>.ts`，以 `<prev>` 報告的 Commands executed 為準）複製出 `analyze-day29-final-<rc>.ts`，**只改 `HISTORICAL_LABELS`、`COMPARISONS` 與對應的 `COST_STRUCTURE_LABELS`**（後者只是要列 cost structure 的 label 清單，必須跟著換成新 session 的 label）；`classify()` 門檻、paired-trial 定義、metrics 清單不動。要比哪幾組是實驗設計，先給使用者看 diff。
  - `HISTORICAL_LABELS` = `<prev>` 報告「重複 1」實際的 label（含它的 `-runN`，例如 rc.11 時是 `3.6.0-rc.9-traditional-run2`、`3.6.0-rc.9-vapor-run2`、`3.5.40-chrome153-run2`），這些不會被加上本次的後綴。
  - `COMPARISONS` 至少包含：`arch-<rc>`（`<ver>` T → V）、`arch-<prev-rc>-original`（`<prev>` 原始資料的 T → V，用來做等價檢查）、每個控制組版本在新 Chrome 下的 T → V、`version-trad-<prev-rc>-<rc>` / `version-vapor-<prev-rc>-<rc>`、`version-3540-<rc>trad`，以及 `drift-*`（`<prev>` 原始 label → 新 Chrome label）。
- **方法論等價檢查：** 用新腳本跑任一個 run 後，`arch-<prev-rc>-original` 的每個 cell 必須與 `day29-final-<prev-rc>-<該 run>-analysis.json` 裡 `<prev>` 的架構比較**逐項相同**（`JSON.stringify` 比對 80 個 cell 與 signalCounts），`<prev>` T/V 的 costStructures 也要相同；不同就停下來，不能並列新舊結果。
- 產出 `results/cdp-trace/validation/day29-final-<rc>-runN-analysis.json`，再用 `compare-day29-runs.ts` 兩兩產出重現性比較（`…-runA-vs-runB.json`）。
- **三次以上 run 時**另外統計每個 cell 在幾次 run 中同方向 Consistent（`3/3`、`2/3`、同時出現 CI 與 CR 記為 `±`），報告以這個為主，兩兩比較為輔。
- **區塊偏移掃描（每次都做）：** 一個區塊 = 一個條件、一個 N、一個 operation 的 10 個 trial（同一個 Chrome instance）。逐一比較每個區塊的 Render Duration 中位數（讀 `cost-trace.meta.json` 的 `renderDurationMs`）與「同條件各次 run 中位數的中位數」，偏離 ×1.6 以上就列出，連同 10 個 trial 的值。rc.11 時 168 個區塊中只有 2 個偏移，且都在 rc.11 N=100 Update——單一區塊偏移會讓整列 Browser 指標同時變成 CR / CI，必須先找出來，才不會把它當成版本或架構效應。
- 某個訊號只在部分 run 出現時，同時看 runtime-attribution-trace 的同一格（例如 Vue Runtime CPU 的絕對值），寫成 `observed, partially reproduced (k/n), mechanism not established`，並估算「隨機落在這幾個區塊」的機率。要釐清就提議針對性追加量測（例如只跑該 N、更多 Chrome instance），由使用者決定，不自行擴大 protocol。

### Phase 5：報告 `DAY29_FINAL_VALIDATION_REPORT_<rc>.md`

章節沿用 `<prev>` 報告（Part 0 Freeze Point 宣告 → Part 8 必答問題 → Final Conclusion / Limitations / Files generated / Commands executed），並清楚區分 Historical Validation（3.5.40 → 3.6.0-rc.2，不重跑、不修改）與本次 Final Validation。`DAY29_FINAL_VALIDATION_REPORT_rc11.md` 是第一份三次 run 的報告，可當範本（Part 9 為區塊偏移分析）。

- **表格數字用腳本從 analysis JSON 產生**，不要手抄；寫完後抽查幾個 cell 與 JSON 是否一致（signal 標記、正負號）。
- **追加 run 之後要整份改寫**：Part 0（Validation Date、Browser）、Part 2（Matrix、retry 分布）、Part 3–8 的表格與結論、Final Conclusion、Limitations、Files、Commands 都要反映所有 run，不要只在文末附加一節。
- Part 0 列出中間被跳過的 RC（「Version Change（未量測）」）。

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

執行 `load-data` skill，把 Phase 4 的 analysis 檔放上 `/compare` 對比頁並跑 build 校驗。追加 run 之後也要再跑一次（使用者會要求「跑完後再跑 load-data」）。

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
