# CLAUDE.md

## Project

vue-pain-lab

一個從「日常寫 Vue 的工程師」視角出發的實驗場，用來驗證新版 Vue 是否真正解決實際開發中遇到的痛點，而不是只看 release notes。

技術棧：Vue 3.5（Composition API）、TypeScript、Vite、Pinia、vue-router、ESLint + oxlint、Prettier

詳細理念請見 [PAIN_LAB_PRINCIPLES.md](./PAIN_LAB_PRINCIPLES.md)。

## 常用指令

- `npm run dev` — 啟動開發伺服器
- `npm run build` — type-check（vue-tsc）+ 打包（並行執行）
- `npm run preview` — 預覽打包結果
- `npm run lint` — 依序執行 oxlint 與 eslint（皆帶 --fix）
- `npm run format` — 用 Prettier 格式化 `src/`

目前專案尚未設定任何測試框架。

## AI Development Rules

1. 每個 pain scenario 都要能獨立執行、獨立閱讀，不依賴其他 scenario。
2. 新增 scenario 前先用 `.claude/skills/create-pain-scenario` 流程確認這是真實遇到的問題，而非為了寫而寫。
3. 驗證 Vue 版本差異時使用 `.claude/skills/validate-vue-update` 流程，並在 scenario 的 README 記錄 Question / Hypothesis / Observation / Next Step。
4. 不在沒有真實問題前先做效能優化或抽象化（見 PAIN_LAB_PRINCIPLES.md）。
5. 不引入框架化的抽象層；能用最簡單的寫法解決就不要包一層。
6. Composable 不直接操作 DOM；DOM 相關邏輯留在元件內。
7. `src/utils/` 內的工具函式不依賴 Vue（保持可獨立測試、可搬移）。
8. 審查效能相關改動時，站在「每天寫 Vue 的工程師」角度自問：這是不是真的值得升級／值得做？必要時使用 `.claude/agents/vue-user-reviewer`。
9. 重要但未寫進 code 的決策，記錄到 `docs/decisions/`，避免只存在對話紀錄裡。
10. Commit message 使用 `.claude/skills/git-commit` 流程產生（這個 skill 只放在本機、不進 git；repo 只追蹤 `create-pain-scenario` 與 `validate-vue-update` 兩個 skill）。
