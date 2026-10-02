---
name: validate-vue-update
description: 執行 Vue Pain Lab Validation Protocol，使用固定 Scenario 與 Evidence Matrix 驗證 Vue Runtime 版本差異。
user-invocable: true
---

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
4. Freeze Point 之後的新 RC 不自動觸發重新 benchmark。
5. 新 RC 若在文章發布前出現，只記錄 Version Change，不直接覆蓋既有 Final Validation。
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
