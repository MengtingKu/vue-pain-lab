# vdom-stress：Card 不加圖片

## 背景

`vdom-stress` scenario 的 Card 內容目前只有 `id` / `title` 純文字。曾經考慮過要不要加一張圖片，讓每張 Card 更接近「真實 UI」，藉此拉長 render time、讓量測數字更明顯。

## 決定

不加圖片。Card 維持 `id` + `title` 純文字。

## 為什麼

1. **`<img>` 的成本量不到現有的 `renderDuration` 裡。** 目前的量測方式是改 `cards.value` → `await nextTick()` → 讀 `performance.now()`。`nextTick` resolve 的時機是 Vue 完成同步 DOM patch/commit，不會等圖片真的下載、decode 完——圖片的 network + decode 是瀏覽器另外排程的非同步工作。加了圖片，`renderDuration` 很可能量不太出差異，但畫面上會「感覺」變慢（圖片跳出來、layout shift），造成數字跟觀感對不起來，量測不可信。

2. **圖片牽涉的是跟 Vue Runtime 無關的變因。** Scenario Purpose 是「驗證 Vue Runtime 的成本」，圖片的 network（快取狀態、connection、CDN）跟 decode（CPU/GPU、圖片格式）都跟 Vue 完全無關。混進去會讓「同一組 render count 兩次測出差很多」的原因說不清楚：到底是 Vue 版本差異，還是這次剛好有沒有 cache。這違反 scenario README 裡「Not Included」想排除非 Vue 變因的用意。

3. **「Card 結構複雜度」是另一個變因，不該混進「Render Count」裡。** 如果之後真的有「Card 結構複雜度影響 render cost」的具體研究動機，比較乾淨的做法是比照 `component-storm` 的 `updateScope`，另外加一個獨立可切換的變因（例如 `cardComplexity`），並且只用同步、不牽涉 network 的元素去增加複雜度（例如多幾層 nested 元素、多幾個文字欄位），這樣才會真的反映在 `renderDuration` 上。一次改兩個變因（數量 + 複雜度），之後看到數字變化會分不清是哪個造成的。

## 取捨

現在的 baseline 比較「不真實」（真實產品的 Card 通常會有圖片），換來的是量測乾淨、可歸因於 Vue Runtime。呼應 PAIN_LAB_PRINCIPLES「不在沒有真實問題前先做效能優化或抽象化」——目前沒有具體的「Card 複雜度影響 render cost」這個真實痛點，先不加。之後若有明確動機，應該用獨立變因或新 scenario 處理，而不是回頭改這裡的 baseline。
