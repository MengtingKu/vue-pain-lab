# component-storm：Vapor 驗證只量 Update，並切換 updateScope

## 背景

Day 29 在 `vdom-stress` 上完成 Vue 3.6.0-rc.9 Traditional vs Vapor 的 Final Validation 後，要把同一套量測手法套到 `component-storm`。兩個 Scenario 的結構不同，無法一比一照搬：

- `vdom-stress` 的 Mount 是按鈕觸發（`cards` 從空陣列變成 N 張），CDP 可以在點擊前開始 trace。
- `component-storm` 的 500 個 Child 在 App 初始化時就掛載完成，頁面上還沒有任何按鈕可以點。既有的 `run-component-storm-matrix.ts`（Day 30）也明確把 Mount 排除在外。
- 既有 CDP runner 寫死只接受 `componentCount=500` / `updateScope='AllChildren'`，但 Vapor 最可能產生差異的正是 ParentOnly / SingleChild。

## 決定

1. **只量 Update，不 trace Mount。** Mount 只記錄頁面自己的 `Mount Time`（setup → onMounted 的 in-page wall-clock）。runner 本來每個 trial 就會用 `readMetrics()` 讀這個值，所以不需要新增量測協定。
2. **componentCount 固定 500，updateScope 跑 ParentOnly / SingleChild / AllChildren 三種。** `run-component-storm-matrix.ts` 的 `runVersionMatrix()` 新增 `updateScope` 參數，預設值仍是 `'AllChildren'`，Day 30 的呼叫方式與行為不變。

## 為什麼

- 要 trace Mount，必須在 `Page.navigate` 之前就開始 trace，完成判定也要換成別的機制。這是一套新的量測協定，就不再是「與 vdom-stress 相同的手法」，而且需要重新校準。這次的目標是用同一套手法做架構比較，所以選擇不擴大協定。
- `updateScope` 是這個 Scenario 本來就設計好的參數旋鈕：README 記載的 Baseline 和 rc.2 驗證都是切換 `config.ts` 的 `updateScope`，所以這不算修改 Scenario。runner 的 `readParams()` 檢查仍然保留，頁面實際的 config 與預期不符時會拒絕記錄。
- 不跑 componentCount 100 / 1000，因為它們沒有任何歷史 CDP 資料可以對照，時間成本卻是 3 倍。

## 取捨

- Component Storm 的 Mount 沒有 Scripting / Rendering / Vue Runtime CPU 的成本拆解，只有 in-page wall-clock；而且 `onMounted` 在 Vapor 與 Traditional 之間的觸發時機沒有另外驗證。
- 之後若有明確動機要看 Mount 成本結構，應該另外設計並校準一套 navigation-level 的 trace 協定，不要回頭改這個 runner 的既有流程。
