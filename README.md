# Vue Pain Lab

Vue Pain Lab 是一個從「Vue 開發者」視角出發的實驗場。

我不是 Vue 核心團隊的成員。

我只是一個每天在寫 Vue 的前端工程師。

這個專案只為了回答一個簡單的問題：

> 新版本的 Vue，是否真的解決了我在實際專案中遇到的問題？

這個 repository 裡的每一個 scenario，都來自真實的開發經驗。

我們不只是讀 release notes，而是實際重現問題、試試新版本，看看到底改變了什麼。

## 運作方式

1. 從實際專案經驗中，找出一個真實遇到的痛點。
2. 把它重現成一個小而獨立的 scenario——不引入框架，不加入無關的抽象層。
3. 在目前的 Vue 版本上記錄一個 baseline。
4. 換上新版本的 Vue，觀察實際上改變了什麼。
5. 把過程寫下來：Question / Hypothesis / Observation / Next Step，而不是只留下結論。

完整理念請見 [`PAIN_LAB_PRINCIPLES.md`](./PAIN_LAB_PRINCIPLES.md)。

## 專案結構

```
src/
  scenarios/<scenario-name>/   # 每個資料夾對應一個真實痛點，各自有自己的 README
  benchmarks/                  # benchmark 用的測試工具（保留位置）
  stores/                      # Pinia store，依 scenario 需求才新增
  utils/                       # 不依賴 Vue 的工具函式
docs/
  decisions/                   # 記錄「為什麼」，不是「做了什麼」
  guides/                      # 操作型文件（如何新增 scenario、如何跑檢查）
```

目前在驗證什麼，以 `src/scenarios/` 為準——請看各 scenario 自己的 `README.md` 了解進度。

## 開始使用

```bash
npm install
npm run dev       # 啟動開發伺服器
npm run build     # type-check + 打包
npm run lint      # oxlint + eslint
npm run format    # prettier（僅 src/）
```

目前尚未設定測試框架，scenario 的驗證方式是實際觀察，而非自動化測試。

## 新增 scenario

不要為了新增而新增——每個 scenario 都應該來自你在真實專案中遇到的問題。

新增時可使用 `create-pain-scenario` skill（`.claude/skills/create-pain-scenario`），比較 Vue 版本差異時使用 `validate-vue-update` skill（`.claude/skills/validate-vue-update`）。

更多給 AI 協作用的背景資訊請見 [`CLAUDE.md`](./CLAUDE.md)。
