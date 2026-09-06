# vue36-vapor worktree：手動驗證忽略內嵌 Vue DevTools 面板的錯誤

## 背景

2026-08-21（Day 29 之後）手動開啟 `vue-pain-lab-vue36-vapor` worktree
（Vue 3.6.0-rc.4 + `features.vapor: true`）的 dev server，在畫面上打開內嵌
的 `vite-plugin-vue-devtools` 面板（Alt+Shift+D）後，Console 持續出現（間隔
約 1～3 分鐘一次，非使用者操作觸發）：

- `[Unhandled rejection] TypeError: Cannot read properties of undefined (reading '_')`
- `[console.error] TypeError: Cannot read properties of undefined (reading 'el')`

同時面板本身的 Components 元件樹只顯示 `<Root>`，底下沒有任何子元件。

但直接在頁面上點擊「Trigger Render」按鈕，畫面顯示的 render count / render
duration 數字都正常變化，且操作期間 Console 沒有新增任何錯誤——代表 Vapor
應用程式本身運作正常，問題只出在 DevTools 面板。

## 決定

之後任何人手動驗證 `vue36-vapor`（或未來其他 Vapor worktree）時：

- 判斷 Vapor 是否正常運作，以「實際操作頁面 ＋ 頁面顯示的數字」為準。
- 內嵌 Vue DevTools 面板（Alt+Shift+D／`/__devtools__/`）目前**不可信**：
  它會在自己閒置輪詢時噴錯，元件樹也只畫得到 `<Root>`，這不代表 Vapor 或
  scenario 本身有問題。
- 不要把上述兩個 TypeError 誤判為「Vapor interop 沒裝好」。真正代表 interop
  沒裝好的訊號是 `app.mount()` 直接拋出的
  `Vapor component found in vdom tree but vapor-in-vdom interop was not installed`
  ——那是完全不同的錯誤訊息。

## 為什麼

`vite-plugin-vue-devtools`（本 repo 固定 `^8.1.2`）在畫元件樹、或做
hover-highlight 時，程式碼假設每個元件實例都有 VDOM 元件才有的 `.el` 之類
欄位；Vapor 元件不是走 VNode，這些欄位不存在，外掛內部讀取時就直接
TypeError。這是外掛本身尚未跟上 Vapor 的相容性問題，跟 Vue Runtime 或這個
repo 的 scenario 程式碼無關。

## 取捨

沒有去修這個外掛的相容性問題（不在本 repo 可控範圍內，也不影響任何已
commit 的量測結果——`DAY29_FINAL_VALIDATION_REPORT.md` 的自動化資料是用
無頭瀏覽器擷取，沒有開這個面板，所以沒踩到這個坑）。純粹記錄下來，避免以
後手動驗證時把「面板噴錯」誤判成「Vapor 壞了」而浪費時間排查。
