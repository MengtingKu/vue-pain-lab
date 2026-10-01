# Impeccable：只裝 instructions，不裝 engine / hooks / live mode

## 背景

想用 [Impeccable](https://github.com/pbakaus/impeccable)（設計類 Skill）讓 AI 幫忙把 UI 做漂亮。官方安裝方式（`npx impeccable install` 或 Claude Code plugin）除了 Skill 文件之外，還會一併裝上執行檔、hooks 與 live mode。安裝前先在 scratchpad clone 原始碼（tag `skill-v4.3.1`，commit `cd12f86`）做人工檢查。

## 決定

只把 `plugin/skills/impeccable` 的 `SKILL.md` 與 `reference/*.md` 複製進 `.claude/skills/impeccable/`（project scope），並刪掉在這種安裝方式下用不到的 reference：

- 依賴 engine / live mode：`live.md`、`live-setup.md`、`hooks.md`、`doctor.md`、`visualize.md`
- 依賴未安裝的 subagents：`degraded/*.md`
- Native 平台：`ios.md`、`android.md`、`adapt.native.md`、`audit.native.md`
- 已廢棄的別名：`craft.md`

不裝 `scripts/`、`agents/`、`hooks/`，不跑 `npx impeccable`，不做 global install。`SKILL.md` 本身維持與 upstream 一字不差，方便之後升級時 diff。

版本鎖定方式是手動複製檔案：不透過套件管理或安裝程式，所以不會自動更新。來源、commit 與每個檔案的 sha256 記在 `.claude/skills/impeccable/PINNED.txt`。

這份 skill 只保存在本機，不進 git（`.gitignore` 只追蹤 `create-pain-scenario` 與 `validate-vue-update` 兩個 skill）。在其他機器上需要時，依本文件的流程重新取得：clone `https://github.com/pbakaus/impeccable`，checkout tag `skill-v4.3.1`（commit `cd12f86`），只複製 `plugin/skills/impeccable/` 的 `SKILL.md` 與 `reference/`，刪掉下面列出的檔案。

## 為什麼

檢查發現 Skill 文件本身沒問題（沒有要求讀 `.env`、credentials、SSH key，也沒有要求把資料往外送），風險都在文件以外的部分：

1. **Engine binary。** `SKILL.md` 要求每個 session 先跑 `scripts/impeccable context`。launcher 會從 GitHub Releases 下載預先編譯的 Rust binary 到 `~/.impeccable/`（專案外），然後執行它。下載時有 sha256 驗證，而且驗證失敗就拒絕執行；但 `.sha256` 跟 binary 放在同一個 release，只能證明檔案完整，不能證明來源，tag 也沒有 GPG 簽章。這個 binary 能 spawn `sh` / `cmd.exe`、`git`、`node`、`claude --print`。
2. **Hooks。** 官方安裝會寫入 `PostToolUse (Edit|Write)` 與 `Stop` hook，等於每次編輯、每個 turn 結束都會自動執行上述 binary，不是手動呼叫 Skill 時才跑。本專案已經有自己的 PostToolUse hooks，疊上去也會影響量測相關的工作流程。
3. **外部連線。** `context` 會 GET `impeccable.style/api/version`，`concept-seed` 會 GET `impeccable.style/api/roll`，這兩個都沒有帶專案內容。但 `generate-image` 在有 `OPENAI_API_KEY` 時，會把頁面截圖上傳到 `api.openai.com`；`font-match` 也會連 `fonts.googleapis.com`。
4. **Live mode。** 套用文案修改時，會用 shell 以使用者權限執行 `package.json` 的 `scripts["impeccable:manual-edit-validate"]`，等於讓專案自己定義的指令被自動執行。本專案的 `package.json` 目前沒有這個 script。

`SKILL.md` 本身有寫 launcher 無法使用時的 fallback：直接讀 PRODUCT.md / DESIGN.md 繼續做。所以拿掉 `scripts/` 之後，設計 instructions 仍然完整可用。

## 取捨

- 需要 binary 的功能都不能用：`detect` 掃描、`/impeccable hooks`、`live`、`pin`、`generate-image`、`concept-seed` 等。這些對「讓 AI 幫忙把 UI 做漂亮」來說不是必要的。
- `SKILL.md` 的 command table 仍連到已刪除的 reference，有些 reference 之間也互相連到被刪除的檔案（例如 `new-work.md` → `visualize.md`）。觸發到這些 command 時，agent 找不到檔案，只能用自己的判斷處理，不會因此執行任何東西。
- Impeccable 提示「有新版，跑 `npx impeccable update`」時**不要照做**：那會用官方流程重裝，把 hooks 加回來。要升級時，重複這次的流程：checkout 新 tag、檢查 diff（特別是 hooks、scripts、外部連線、`manual-edit-validate`）、只複製 `SKILL.md` + `reference/`、刪掉上面列出的檔案、重新產生 `PINNED.txt`。
- `.claude/settings.json` 的 `permissions.deny` 已加上 `Bash(npx impeccable *)`、`Bash(npx impeccable@*)`、`Bash(npx -y impeccable *)`，從權限層擋住 agent 自行執行官方安裝或更新。
