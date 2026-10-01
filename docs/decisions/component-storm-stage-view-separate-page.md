# component-storm：大會 Demo 另開 Stage 頁，benchmark 頁只換 CSS

## 背景

2026 VueConf 要用 Component Storm 做現場 Demo，需求是把內頁改成暗色雙欄 Dashboard：左側放 FPS 偵測器、參數控制台與指標螢幕，右側放 500 個 Child 的燈號矩陣，而且 Child 重新渲染時燈號要閃爍。

但 `/scenarios/component-storm` 同時是 benchmark：

- `scripts/cdp-trace/run-component-storm-*.ts` 依賴這頁的 DOM 結構：找文字剛好是 `Trigger Update` 的 `<button>`；從 `.metrics dl` 依 `dt` 文字讀取指標；用 `MutationObserver` 監看 `Total Update Count` 來判斷一次 update 是否完成。
- 每個 Child 的 template 就是被量測的對象。README 的 3.5.40 / 3.6 比較、Day 29–30 的 CDP 結果，以及 `VUE_CONF_EVIDENCE_PACK.md` 的數據，前提都是「不修改 Scenario 程式碼」。

## 決定

新增獨立的 `/scenarios/component-storm/stage`（`src/scenarios/component-storm/stage/`）。燈號矩陣、閃爍動畫與 FPS 偵測器只放在 Stage 頁。

benchmark 頁後來也改成同一套暗色 lab 風格，但限定在不影響 runner 與 Vue 量測對象的範圍內：

- **只改 CSS**：`ComponentStormChild.vue` 的 template 與 script 不動；`ComponentStormPage.vue` 的 template 只多了根元素的 `lab-theme` class。runner 依賴的 `.params dl`、`.metrics dl` 與「Trigger Update」按鈕文字都維持原樣。
- **UPDATE_SCOPE radio**：兩頁都加了 radio 可即時切換，初始值仍來自 `config.ts`（runner 透過改 `config.ts` 切換，不會去點 radio）。radio 刻意放在 `.params dl` 外面，`readParams()` 讀到的 `UPDATE_SCOPE` 仍是純文字。切換時呼叫 `metrics.resetUpdateMetrics()` 歸零，避免不同 Scope 的 update 混進同一個平均值。

- Stage 頁共用 `src/benchmarks/component-storm/` 的 `config`、`metrics`、`createChildren`、`keys`，以及相同的 `triggerUpdate` 流程。Child 換成 `StageChild.vue`：Props 與 derived 計算相同，呈現改為燈號矩陣，`onUpdated` 時用 Web Animations API 播放閃爍。
- Stage 頁不套 `DefaultLayout`，以便做全螢幕雙欄。
- Dashboard 的 Component Storm 卡片改連到 Stage 頁。Stage 頁 header 保留連回 benchmark 頁的連結，CDP runner 則一律直接用 URL 開啟 benchmark 頁，不經過 Dashboard。

## 為什麼

- 直接改 benchmark 頁會同時改變「被量測的東西」：每個 Child 多出 DOM 和動畫，Vue 的 patch 與瀏覽器的 style / paint 成本都會增加。這樣台上看到的數字會和 Evidence Pack 的數據對不起來，大會前就得把所有 Component Storm 驗證重跑一次。
- 只換 CSS 雖然不會弄壞 runner，但 CDP 的 Rendering / Recalculate Style 拆解還是會和舊報告不可比，而且做不出燈號閃爍這個 Demo 重點。
- 分開之後，Demo 頁可以自由調整視覺，不必擔心 benchmark 的可比性。

## 取捨

- **benchmark 頁的 CSS 換了，這之後的 CDP Rendering / Recalculate Style / Paint 拆解不能和之前的報告直接比較。** Vue scripting 的部分（Child template、Props、computed、update 流程）沒有變。Parent template 多了 3 個 radio input，每次 Parent re-render 會多 patch 這幾個節點與 `v-model` directive，量級遠小於 500 個 Child，但嚴格來說 Parent 的 render 內容不同了。之後的版本比較應該在同一個 commit 之後重跑 baseline，不要拿改版前的數字相減。

- Stage 頁有一份 `triggerUpdate` / provide 流程跟 benchmark 頁重複。沒有抽成共用 composable：benchmark 頁要維持「不修改 Scenario 程式碼」，抽出去就得改它（也呼應 CLAUDE.md「不引入框架化的抽象層」）。之後如果 benchmark 流程改了，要記得同步 Stage 頁。
- Stage 頁的數字（Mount Time、Average Update Duration）含閃爍與較多 DOM 的成本，又有 `FpsCounter` 的 `requestAnimationFrame` 迴圈在跑，**不能**拿來跟 benchmark 頁或 README 的數據比較。頁面上有一行說明標註這點；台上引用數據時應以 Evidence Pack 為準。
- 用 claude-in-chrome 自動化操作時，分頁是 `document.visibilityState === 'hidden'`，`requestAnimationFrame` 會被節流，FPS 會顯示接近 0。要在實際可見的螢幕上看，或用 `npm run build && npm run preview` 彩排。
