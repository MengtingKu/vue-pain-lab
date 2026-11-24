# Vue Pain Lab

**線上展示：<https://mengtingku.github.io/vue-pain-lab/#/>**

Vue Pain Lab 是一個從「每天寫 Vue 的工程師」視角出發的實驗場，用來回答一個簡單的問題：

> 新版本的 Vue（3.5 → 3.6 / Vapor），是否真的解決了我在實際專案中遇到的問題？

我不是 Vue 核心團隊的成員，只是一個每天在寫 Vue 的前端工程師。這個 repository 不只讀 release notes，而是把真實遇到的痛點重現成獨立的 scenario，實際換上新版本量測，看看到底改變了什麼。

## 為什麼要做這個專案

Release notes 告訴你「變快了」，但不會告訴你：

- 在**你的**使用情境下，成本落在哪裡？是 Vue runtime、瀏覽器 Layout，還是你自己的程式碼？
- 這次的差異是真的，還是量測雜訊（分頁可見性、電源模式、DevTools console capture）造成的？
- 值不值得為了這個改善去升級？

所以這裡的每個 scenario 都遵守同樣的規則：

- **不是 demo，也不是最佳實踐範例。** 每個 scenario 刻意不做優化，固定控制變因，讓 Vue 版本成為唯一的變數。
- **數字可信、可重現、可以和 CDP trace 對帳。** 以 CDP trace 與多次重複量測（median、IQR、獨立 replicate）作為證據，而不是單次跑出來的數字。
- **頁面上的數字一律是即時量測值**，不放任何虛構或示意數據。
- **沒有真實痛點就不做。** 不為了寫而寫，也不提前優化或抽象化。

完整理念請見 [`PAIN_LAB_PRINCIPLES.md`](./PAIN_LAB_PRINCIPLES.md)。

## 適合誰

- 在意前端效能、會去讀 Vue 原始碼、習慣開著 Chrome DevTools Performance 面板看 Flame Chart 的前端工程師。
- 想評估「升級到 Vue 3.6 / Vapor 值不值得」的團隊。
- VueConf 等場合的觀眾：各 scenario 都有專用的 Stage 頁，把量測結果可視化，適合投影 Demo。

## Scenarios

每個 scenario 都有兩種頁面：

- **Benchmark 頁**（`/scenarios/<name>`）：保持可量測，給 CDP runner 與 DevTools 使用，不加任何會干擾量測的視覺效果。
- **Stage 頁**（`/scenarios/<name>/stage`）：把同一件事的量測結果可視化，降低理解門檻。

| Scenario | 在問什麼 | Benchmark 頁 | Stage 頁 |
| --- | --- | --- | --- |
| **Reactive Chain** | `ref → computed₁ … computedₙ → watch → watchEffect → render`，依賴鏈越深，每次 update 的成本怎麼變化？ | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/reactive-chain) | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/reactive-chain/stage) |
| **Composable Chaos** | Composable 巢狀封裝層數（Depth 1 / 5 / 10 / 20）增加，會不會帶來額外的 reactive runtime cost？ | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/composable-chaos) | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/composable-chaos/stage) |
| **Component Storm** | 一個 Parent 掛大量 Child 時，Mount 成本與不同 update 範圍（ParentOnly / SingleChild / AllChildren）的成本差多少？ | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/component-storm) | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/component-storm/stage) |
| **VDOM Stress Test** | 一次性 Render 100 / 500 / 1000 / 5000 張 card 時，瓶頸在 Vue patch 還是之後的瀏覽器 Layout？ | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/vdom-stress) | [開啟](https://mengtingku.github.io/vue-pain-lab/#/scenarios/vdom-stress/stage) |

另外還有：

- **[CDP 跨版本對比頁](https://mengtingku.github.io/vue-pain-lab/#/compare)**（`/compare`）：直接讀取 `results/cdp-trace/validation/*-analysis.json`，每格是 10 次量測的 median 與 IQR，用來比較不同 Vue 版本的量測結果。
- **Home Loading Slow**、**Huge Table**、**Long Running SPA**：尚在規劃中的 scenario。

每個 scenario 的研究問題、假設、量測結果與限制，都記錄在各自的 `src/scenarios/<name>/README.md`。跨 scenario 的量測證據整理在 [`VUE_CONF_EVIDENCE_PACK.md`](./VUE_CONF_EVIDENCE_PACK.md)。

## 如何使用

### 線上瀏覽

直接打開 <https://mengtingku.github.io/vue-pain-lab/#/>，從首頁的 scenario 卡片進入。建議搭配 Chrome DevTools Performance 面板，邊操作邊錄製，對照頁面上的即時指標。

> 線上版是 production build，數字會和本機 dev server 不同；分頁是否在前景、筆電是否接電源都會明顯影響結果。要比較版本差異，請以本機多次量測為準，不要只看單次結果。

### 在本機執行

需求：Node.js `^22.18.0` 或 `>=24.12.0`。

```bash
git clone https://github.com/MengtingKu/vue-pain-lab.git
cd vue-pain-lab
npm install
npm run dev       # 啟動開發伺服器
```

其他常用指令：

```bash
npm run build     # type-check（vue-tsc）+ 打包
npm run preview   # 預覽打包結果
npm run lint      # oxlint + eslint（皆帶 --fix）
npm run format    # Prettier 格式化 src/
```

目前尚未設定測試框架，scenario 的驗證方式是實際量測與觀察，而非自動化測試。

### 一個 scenario 的典型操作

以 Reactive Chain 為例：

1. 打開 Benchmark 頁，確認頁面上顯示的 Lab Parameters（例如 `DEPTH`）。這些是 scenario 檔頂部的編譯期常數，要改參數請改原始碼。
2. 開啟 DevTools Performance 面板開始錄製，點擊 `Trigger Update`。
3. 讀取頁面上的 Initialization Phase / Runtime Update Phase 指標，再對照 Flame Chart 判斷成本落在哪裡。
4. 打開 Stage 頁，看同一件事的可視化版本。

### 量測 Vue 版本差異

`scripts/cdp-trace/` 內的 runner 會透過 Chrome DevTools Protocol 自動開頁、點擊、讀值並錄製 trace，結果輸出到 `results/cdp-trace/`，再由 `analyze-*.ts` 產出 analysis JSON 給 `/compare` 頁使用。量測方法論見 [`scripts/cdp-trace/TRACE_EVIDENCE_SCHEMA.md`](./scripts/cdp-trace/TRACE_EVIDENCE_SCHEMA.md) 與 [`TRACE_ACCOUNTING.md`](./scripts/cdp-trace/TRACE_ACCOUNTING.md)。

完整的驗證流程（包含環境檢查、多次重複量測、判讀雜訊）定義在 [`.claude/skills/validate-vue-update`](./.claude/skills/validate-vue-update/SKILL.md)；把結果放上 `/compare` 頁的流程在 [`.claude/skills/load-data`](./.claude/skills/load-data/SKILL.md)。

## 專案結構

```
src/
  app/                         # 全站 layout、首頁 dashboard、/compare 對比頁、router
  scenarios/<scenario-name>/   # 每個資料夾對應一個真實痛點，各自有 README 與 Stage 頁
  benchmarks/                  # benchmark 用的測試工具（保留位置）
  utils/                       # 不依賴 Vue 的工具函式
scripts/cdp-trace/             # CDP 自動量測 runner 與分析腳本
results/cdp-trace/             # 量測原始結果與 analysis JSON
docs/
  decisions/                   # 記錄「為什麼」，不是「做了什麼」
  guides/                      # 操作型文件
```

技術棧：Vue 3.5（Composition API）、TypeScript、Vite、Pinia、vue-router、ESLint + oxlint、Prettier。

## 參與貢獻

歡迎提出你在實際專案中遇到的 Vue 痛點。新增 scenario 前請先確認：

- 這是**真實遇到**的問題，而不是為了寫而寫。
- Scenario 能獨立執行、獨立閱讀，不依賴其他 scenario。
- 不引入框架化的抽象層，不在沒有真實問題前先做優化。
- 在 scenario 的 README 記錄 Question / Hypothesis / Observation / Next Step，而不是只留下結論。

新增流程可參考 [`.claude/skills/create-pain-scenario`](./.claude/skills/create-pain-scenario/SKILL.md)。給 AI 協作用的背景資訊請見 [`CLAUDE.md`](./CLAUDE.md)，產品與介面原則見 [`PRODUCT.md`](./PRODUCT.md)。
