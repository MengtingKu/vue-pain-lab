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
