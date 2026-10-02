# 全站導覽列：LabNavbar + StageLayout

## 背景

原本只有 DefaultLayout（Dashboard 與 benchmark 頁）有一個簡單的 `LabHeader`；各 Stage 頁不套 DefaultLayout，各自在頁首放「← Pain Scenarios / Benchmark 原始頁」連結。兩邊的導覽方式與視覺不一致，在 scenario 之間、benchmark 與 Stage 之間切換也要先回 Dashboard。

## 決定

- `LabHeader` 換成 `LabNavbar`（`src/components/LabNavbar.vue`）：左側標題與狀態燈、中央 `[ 01_CHAIN ] [ 02_CHAOS ] [ 03_VDOM ]`、右側 `[ 🛰️ TELEMETRY_BENCHMARK ] / [ 🔬 LIVE_STAGE_VIEW ]`。切換 scenario 時沿用目前的檢視模式。
- 新增 `StageLayout`（`src/app/layouts/StageLayout.vue`）：導覽列 + 吃滿剩餘高度的內容區。三個 Stage 頁改成 `/scenarios` 底下的子路由；內頁原本的 `100vh` 改成 `100%`，自帶的導覽連結移除。
- `lab-theme.css` 的 token 選擇器多了 `.lab-tokens`：導覽列在沒有 `lab-theme` 的白底頁（Home Loading 等）也能自成一條暗色列，而不是把整頁切成暗色。`body` 的預設 8px margin 全站移除（lab-theme 頁原本就是 0）。
- 導覽列全部用連結，不用 `<button>`；狀態燈只在 Stage 頁呼吸。

## 為什麼

- 讓 Stage 頁與 benchmark 頁之間的切換變成一次點擊，而且不會失去「我在哪個 scenario」的脈絡。
- CDP runner 用 `button` 的文字找 Trigger 按鈕（`Trigger Update` / `Build Chain` / `Trigger Render`），導覽列如果用 `<button>` 有撞名或干擾的風險；benchmark 頁上也不放常駐動畫。

## 取捨

- **benchmark 頁的 DOM 與 Layout 變了：** 導覽列比原本的 header 多了十幾個節點與不同的樣式，雖然不在被量測的元件裡，但同一頁的 Layout / Paint 成本嚴格來說不同。之後的版本比較要在這個 commit 之後重跑 baseline。
- **Component Storm 的 Stage 頁沒有導覽列：** 它是 VueConf 投影用的全螢幕視圖，這次不改用 StageLayout。
- 只有在寬 > 1000px 且高 ≥ 640px 時，VDOM Stress / Reactive Chain Stage 頁才會鎖在一個螢幕內；導覽列約 56px 高，已計入這兩頁的版面。窄螢幕下導覽列會堆疊成兩到三列。
- 右側兩顆按鈕的 emoji（🛰️ 🔬）照需求保留，實際外觀依作業系統的 emoji 字型而定。

## 後續：移除中央 scenario 選單

- 中央的 `[ 01_CHAIN ] [ 02_CHAOS ] [ 03_VDOM ]` 拿掉了：只列三個 scenario 會讓人疑惑其他 scenario 去哪了，在 Dashboard 上也讓版面不對稱。切換 scenario 回到 Dashboard 卡片；導覽列改為左右二分。
- 右側檢視切換改成依「是否同時有 benchmark 與 Stage」決定是否渲染，Component Storm 也納入（它的 Stage 頁仍是不套 StageLayout 的大會投影視圖，所以從 Stage 回 benchmark 要用該頁自己的連結）。
