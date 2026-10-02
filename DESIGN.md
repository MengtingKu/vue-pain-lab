---
name: Vue Pain Lab
description: 硬核暗黑診斷實驗室：用量測儀器的語言呈現 Vue runtime 成本
colors:
  lab-bg: "#0d0e12"
  lab-panel: "#12141a"
  lab-panel-sunken: "#0a0b0f"
  lab-hairline: "#232733"
  lab-hairline-strong: "#343a48"
  lab-text: "#fafafa"
  lab-text-silver: "#cbd5e1"
  lab-text-muted: "#a1a1aa"
  lab-signal: "#34d399"
  lab-signal-strong: "#10b981"
  lab-probe: "#22d3ee"
  lab-warn: "#fbbf24"
  lab-hot: "#fb923c"
  lab-tty-bg: "#05070b"
  lab-tty-rule: "#1f2937"
  lab-tty-text: "#06b6d4"
  lab-tty-dim: "#8b95a5"
typography:
  title:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, Consolas, monospace"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  readout-key:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tnum, zero"
  readout:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum, zero"
  label:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.08em"
  section:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.14em"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, Noto Sans TC, Microsoft JhengHei, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.7
rounded:
  none: "0"
  control: "2px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "2rem"
components:
  button-execute:
    backgroundColor: "{colors.lab-panel-sunken}"
    textColor: "{colors.lab-signal}"
    rounded: "{rounded.control}"
    padding: "0 1.5rem"
  button-execute-active:
    backgroundColor: "{colors.lab-signal-strong}"
    textColor: "{colors.lab-panel-sunken}"
  panel:
    backgroundColor: "{colors.lab-panel}"
    rounded: "{rounded.none}"
  panel-header:
    backgroundColor: "{colors.lab-panel-sunken}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1rem"
  tty-panel:
    backgroundColor: "{colors.lab-tty-bg}"
    textColor: "{colors.lab-tty-text}"
    rounded: "{rounded.none}"
    padding: "0.625rem 0.875rem"
  status-indicator:
    backgroundColor: "{colors.lab-panel-sunken}"
    textColor: "{colors.lab-text-muted}"
    rounded: "{rounded.none}"
    padding: "0.625rem 0.75rem"
---

# Design System: Vue Pain Lab

## Overview

**Creative North Star: "The Core Diagnostic Lab"**

介面是一台量測儀器，不是一張行銷頁。使用者是會開著 DevTools Performance 面板讀 Flame Chart 的資深工程師，他們要的是可信、可對帳的讀數。所有視覺語言都借自示波器、伺服器監控面板、終端機：深色機殼、髮絲線分隔、網格底紋、指示燈、等寬讀數。

氣氛是冷、精準、安靜。顏色只用在「有意義的訊號」上：綠色代表已建立／靜態／正常，琥珀代表運行中的更新成本。其他一切都是冷灰與銀白。裝飾性的東西（大漸層、圓潤卡片、柔和陰影、emoji）一律不用。

介面本身不能成為被量測成本的一部分（見 PRODUCT.md）。所以 benchmark 頁刻意靜態：唯一允許常駐的動畫是指示燈的 opacity 呼吸。Stage 頁（`/scenarios/*/stage`）不是 benchmark，可以有傳導光效、TTY 串流等表達「正在發生什麼」的動態，但動態仍只用來傳達狀態。

**Key Characteristics:**
- 深色但非死黑的冷調機殼（`#0d0e12`）。
- 數據與標籤全面等寬（JetBrains Mono，自架）；說明性散文用 sans，維持中文可讀性。
- 硬邊：面板 `0`，控制項 `2px`。
- 用 1px 髮絲線、12px 網格底紋、角落定位框線劃分區域，不用陰影堆疊。
- 雙相位色彩編碼：綠 = Initialization / 靜態，琥珀 = Runtime Update / 效能損耗。

## Colors

冷灰機殼加上兩個訊號色，訊號色的稀少就是重點。

### Primary
- **Matrix Signal Green** (`#34d399`)：首航建立、靜態數據、正常狀態燈、執行鍵文字。`#10b981`（Signal Strong）用於執行鍵邊框與按下時的填色。

### Secondary
- **Hazard Amber** (`#fbbf24`)：Runtime Update 相位、效能損耗讀數（Average Update Duration）、STANDBY 燈號。`#fb923c`（Hot）保留給更嚴重的警示。

### Tertiary
- **Probe Cyan** (`#22d3ee`)：探針、提示類 hover（例如資訊圖示）。不和綠色同時當主訊號。
- **TTY Cyan** (`#06b6d4`)：Stage 頁的「追蹤／傳導」色：TTY 文字、傳導光效、EXECUTING 狀態。它描述的是「訊號正在通過」，不是第三種結果狀態。

### Neutral
- **Chassis** (`#0d0e12`)：頁面背景。帶一點藍的近黑，不用 `#000`。
- **Panel** (`#12141a`)：儀表面板底色，疊 12px 網格線（`rgb(148 163 184 / 0.05)`）。
- **Sunken** (`#0a0b0f`)：面板標題列、狀態列、輸出暫存器等「嵌入式」區塊。
- **Hairline** (`#232733`) / **Hairline Strong** (`#343a48`)：分隔線、框線、拓撲連接線。
- **TTY Black** (`#05070b`) / **TTY Rule** (`#1f2937`) / **TTY Dim** (`#8b95a5`)：終端機面板底色、框線、時間戳與次要文字。
- **Text** (`#fafafa`)：主要讀數。**Silver** (`#cbd5e1`)：一般文字。**Muted** (`#a1a1aa`)：標籤、單位、說明。

### Named Rules
**The Two-Signal Rule.** 一個畫面只有兩種「結果」訊號色：綠與琥珀。Stage 頁另有 TTY Cyan 表示追蹤／傳導過程。其餘顏色只能是冷灰。
**The Derived Glow Rule.** 光暈、半透明框線一律用 `color-mix(in srgb, <token> N%, transparent)` 從 token 推導，不另寫 rgb 值。

## Typography

**Display / Data / Label Font:** JetBrains Mono Variable（`@fontsource-variable/jetbrains-mono` 自架），fallback 到 Cascadia Code、Consolas；中文字落到 Noto Sans TC / 微軟正黑體。
**Body Font:** Inter / Segoe UI，僅用於說明性散文。

**Character:** 等寬負責「儀器上印的字」與「螢幕上的讀數」，sans 負責人話。

### Hierarchy
- **Title**（800, 1.75rem, 1.2, -0.02em）：頁面標題。
- **Readout Key**（800, 2rem, tabular + slashed zero）：每個相位最重要的讀數，帶相位色與極淡光暈。
- **Readout**（700, 1.5rem, tabular + slashed zero）：一般讀數。單位（ms）縮成 0.5em、Muted 色。
- **Section**（700, 0.6875rem, 0.14em, uppercase）：區段標題，右側延伸一條髮絲線。
- **Label**（400, 0.6875rem, 0.08em, uppercase）：讀數標籤。
- **Body**（sans, 0.875rem, 1.7, ≤ 65ch）：說明文字。

### Named Rules
**The Readout Rule.** 會變動的數字一律 `tabular-nums slashed-zero` 且靠右對齊，讓連續更新時位數不會跳動。

## Layout

內容欄最寬 960px（`DefaultLayout`），區段之間 2rem，區段內 0.875–1rem。儀表以 CSS grid 排列：Lab Parameters 是一條橫向控制列（三格讀數 + 右側執行鍵），Runtime Metrics 是兩個等高相位面板並排。≤ 760px 時相位面板改為上下堆疊；≤ 640px 時參數改成逐列「左標籤、右讀數」，執行鍵滿寬、至少 48px 高。不允許水平捲動。

## Elevation & Depth

沒有陰影層級。深度靠三層色階表達：Chassis → Panel → Sunken，再加上髮絲線。唯一的「光」來自指示燈與主要讀數的 zero-offset glow，這是刻意的儀器燈號語言（brief 指定），不是投影。

### Named Rules
**The Lit-Only Glow Rule.** 光暈只給「真的在發光」的東西：指示燈、相位色的主要讀數、執行鍵 hover。面板與文字不加光暈。

## Shapes

硬邊。面板、狀態列、拓撲節點 `border-radius: 0`；按鈕等控制項 `2px`。面板左上角用相位色畫 10px 的 L 形定位框線，右下角用 Hairline Strong，像儀器面板的對位標記。指示燈是方形，不是圓點。

## Components

### Buttons（執行鍵）
- **Shape:** 2px 圓角、1px Signal Strong 框線。
- **Default:** Signal Green 文字、8% 綠色底、`$` 提示符號（CSS `::before`，不進 textContent）。
- **Hover / Focus:** 底色加深到 16%、微弱綠光；出現閃爍的方塊游標（只在 hover / focus 時動畫）。Focus 有 1px 綠色 outline、offset 3px。
- **Active:** 瞬間填滿 Signal Strong、文字反白為 Sunken。

### Panels（相位儀表）
- **Background:** Panel + 12px 網格線。
- **Header:** Sunken 底，相位色文字與 6px 方形燈號。上框線用相位色 35%。
- **Rows:** `dt` 左（Label）、`dd` 右（Readout），底部對齊，以 1px 實線髮絲分隔。

### Status Indicator（診斷狀態燈）
- **Style:** Sunken 底、髮絲框、8px 方形燈號 + 代碼（STANDBY / LIVE）+ sans 說明。
- **States:** STANDBY 琥珀燈 1.6s opacity 呼吸；LIVE 綠燈常亮。`prefers-reduced-motion` 時停止呼吸。

### Topology Strip（鏈路拓撲）
- 以 `<ol>` 呈現資料流節點（如 `ref → computed ×N → watch → watchEffect → render`），節點是 Sunken 底的硬邊框，關鍵節點用綠色框線。連接線與箭頭由 CSS 繪製，換行時行首的連接線被 `overflow: clip` 裁掉。

### Propagation Pulse（傳導光效，Stage 頁）
- 觸發時拓撲節點依序點亮（每節點延遲 110ms，從 TTY Cyan 退回原色），連接線與箭頭同步閃一下，再加一道 96px 掃描線由左到右穿過整條鏈（640ms）。
- `prefers-reduced-motion`：不跑掃描線與節點動畫，整條鏈短暫泛起 10% 傳導色後淡出。

### Execute Button — Executing（Stage 頁）
- 觸發後停用、文字改為 `[ EXECUTING... ]`，改用 TTY Cyan，外框以 opacity 呼吸（700ms）。至少維持 700ms，讓幾 ms 的 update 也看得到回饋。

### Diagnostic TTY（Stage 頁）
- **Style:** TTY Black 底、1px TTY Rule 框、硬邊。標題列 `[SYS_KERNEL_DIAGNOSTIC_TTY]` + 行數 + CLEAR。
- **Lines:** 11px 等寬、行高 1.65。格式 `[HH:MM:SS.mmmµµµ] <glyph> [TAG] message`：時間戳與 glyph 用 TTY Dim；DEP 行用 `└─`、hook 行用 `├─`；UPDATE 行琥珀、SETTLED / INIT 完成行綠色，其餘 TTY Cyan。
- **Behavior:** 每次 update 結束後整批寫入並自動捲到底；最多保留 1500 行。捲軸 4px、TTY Rule 色。`role="log"` 但 `aria-live="off"`，摘要另由 `role="status"` 朗讀。

### Readout Bar（唯讀參數）
- 編譯期常數用唯讀讀數格呈現，不做成假的 input。布林值前方加 8px 方形燈：false 為空心、true 為綠色實心。

## Do's and Don'ts

### Do:
- **Do** 保留 benchmark runner 依賴的 DOM 結構與文字（`.params dl`、`.metric-group dl` 的 `dt` 文字、按鈕文字），裝飾一律走 CSS 偽元素。
- **Do** 讓數字成為畫面上最大、最亮的東西。
- **Do** 從 `lab-theme.css` 的 token 推導所有顏色。
- **Do** 為所有動畫提供 `prefers-reduced-motion` 版本。

### Don't:
- **Don't** 使用圓潤卡片、大型漸層、玻璃模糊、emoji 圖示等「AI 廉價感」元素。
- **Don't** 在 benchmark 頁加入常駐的 main-thread 動畫，或會隨每次 update 而 patch 的裝飾 DOM。
- **Don't** 用 `#000` 當背景，也不要第三種訊號色。
- **Don't** 把唯讀的編譯期常數做成看起來可以編輯的輸入框。
