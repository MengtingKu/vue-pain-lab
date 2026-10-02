<script setup lang="ts">
import { nextTick, ref } from 'vue'

interface Card {
  id: number
  title: string
}

const RENDER_COUNT_OPTIONS = [100, 500, 1000, 5000] as const

// 目前選擇的 Render 數量，預設 100
const selectedCount = ref<number>(RENDER_COUNT_OPTIONS[0])

// Render 出來的 Card 陣列，Trigger Render 前為空陣列
const cards = ref<Card[]>([])

// Raw Rendering 量測：只記錄 start / end / duration，不做任何額外運算
const renderStartTime = ref<number | null>(null)
const renderEndTime = ref<number | null>(null)
const renderDuration = ref<number | null>(null)

// Mount / Update 分類：純觀察用途，判斷依據是「觸發當下 cards 是否為空」
// 在 renderStartTime 記錄之前判斷，不影響量測本身
const renderType = ref<'mount' | 'update' | null>(null)

async function triggerRender(): Promise<void> {
  renderType.value = cards.value.length === 0 ? 'mount' : 'update'
  renderStartTime.value = performance.now()
  renderEndTime.value = null
  renderDuration.value = null

  const next: Card[] = []
  for (let i = 1; i <= selectedCount.value; i++) {
    next.push({ id: i, title: `Card #${i}` })
  }
  cards.value = next

  // 等待 Vue 把這次的 Card 陣列實際 Render 到 DOM 後，再量測結束時間
  await nextTick()
  renderEndTime.value = performance.now()
  renderDuration.value = renderEndTime.value - renderStartTime.value
}
</script>

<template>
  <article class="vdom-lab lab-theme">
    <header class="vdom-lab__head">
      <h1>VDOM Stress Test</h1>
      <p>
        Raw Rendering Benchmark：選擇 Render 數量並觸發 Render，觀察大量 UI Node 一次性掛載時的 Vue
        Runtime 成本。不做任何 Rendering 最佳化。
      </p>
    </header>

    <section class="params">
      <h2>Lab Parameters</h2>
      <!-- CDP runner 用 input[name="render-count"][value=N] 選數量，name / value 不可改 -->
      <fieldset class="params__mass">
        <legend>RENDER_COUNT</legend>
        <div class="params__options">
          <label v-for="option in RENDER_COUNT_OPTIONS" :key="option" class="params__option">
            <input v-model="selectedCount" type="radio" name="render-count" :value="option" />
            {{ option }}
          </label>
        </div>
      </fieldset>
      <!-- runner 用文字找按鈕：文字必須剛好是「Trigger Render」，提示符號由 CSS 產生 -->
      <button type="button" @click="triggerRender">Trigger Render</button>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>
      <!-- runner 讀 .metrics 內所有 dt/dd：dd 必須剛好是 '-' 或「X ms」，不可有前後空白，不要讓 Prettier 換行 -->
      <dl>
        <dt>Current Render Count</dt>
        <dd>{{ cards.length }}</dd>
        <dt>renderType</dt>
        <dd>{{ renderType ?? '-' }}</dd>
        <dt>renderStartTime</dt>
        <!-- prettier-ignore -->
        <dd>{{ renderStartTime !== null ? `${renderStartTime.toFixed(3)} ms` : '-' }}</dd>
        <dt>renderEndTime</dt>
        <!-- prettier-ignore -->
        <dd>{{ renderEndTime !== null ? `${renderEndTime.toFixed(3)} ms` : '-' }}</dd>
        <dt>renderDuration</dt>
        <!-- prettier-ignore -->
        <dd class="metrics__key">{{ renderDuration !== null ? `${renderDuration.toFixed(3)} ms` : '-' }}</dd>
      </dl>
    </section>

    <section class="cards">
      <h2>Rendered Cards（{{ cards.length }}）</h2>
      <ul class="cards__list">
        <li v-for="card in cards" :key="card.id" class="cards__item">
          <span class="cards__id">#{{ card.id }}</span>
          <span class="cards__title">{{ card.title }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
/*
 * Hardcore Dark Lab（規範見 DESIGN.md）。這頁是 benchmark：
 * - 不動 CDP runner 依賴的 DOM：radio 的 name / value、「Trigger Render」按鈕文字、.metrics 內的 dt / dd 文字。
 * - Rendered Cards 是被量測的對象：.cards__list / .cards__item 的盒模型（grid、gap、max-height、overflow、
 *   padding、border 寬度）與字型都維持原樣，只換顏色。README 的 Layout / Paint 結論依賴這組 CSS。
 */
.vdom-lab {
  display: grid;
  gap: 2rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

.vdom-lab__head h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.vdom-lab__head p {
  max-width: 65ch;
  margin: 0.625rem 0 0;
  font-family: var(--lab-font-sans);
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

.vdom-lab h2 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 0.875rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.vdom-lab h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- Lab Parameters：數量切換矩陣 + 執行鍵 ---- */

.params {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'title title'
    'mass trigger';
  align-items: end;
  column-gap: 1rem;
}

.params h2 {
  grid-area: title;
}

.params__mass {
  grid-area: mass;
  margin: 0;
  padding: 0;
  border: 0;
}

.params__mass legend {
  padding: 0 0 0.5rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.params__options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* 原生 radio 疊在格子上（opacity 0）負責鍵盤與螢幕閱讀器，外觀由 label 呈現 */
.params__option {
  position: relative;
  padding: 0.75rem 0;
  border: 1px solid var(--lab-hairline-strong);
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--lab-text-muted);
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-out),
    color 150ms var(--lab-ease-out);
}

.params__option + .params__option {
  border-left: 0;
}

.params__option:hover {
  color: var(--lab-text);
  background: color-mix(in srgb, var(--lab-hairline-strong) 40%, transparent);
}

.params__option:has(input:checked) {
  color: var(--lab-signal);
  background: color-mix(in srgb, var(--lab-signal) 12%, transparent);
  box-shadow: inset 0 -2px 0 var(--lab-signal);
}

.params__option:has(input:focus-visible) {
  outline: 1px solid var(--lab-signal);
  outline-offset: -1px;
}

.params__option input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.params button {
  grid-area: trigger;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 3.125rem;
  padding: 0 1.5rem;
  border: 1px solid var(--lab-signal-strong);
  border-radius: 2px;
  background: color-mix(in srgb, var(--lab-signal-strong) 8%, transparent);
  color: var(--lab-signal);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-out),
    box-shadow 150ms var(--lab-ease-out);
}

.params button::before {
  content: '$';
  color: var(--lab-text-muted);
}

.params button:hover {
  background: color-mix(in srgb, var(--lab-signal-strong) 16%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--lab-signal-strong) 18%, transparent);
}

.params button:active {
  background: var(--lab-signal-strong);
  color: var(--lab-panel-sunken);
  transition-duration: 0ms;
}

.params button:active::before {
  color: inherit;
}

.params button:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 3px;
}

/* ---- Runtime Metrics：單欄讀數面板 ---- */

.metrics dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  margin: 0;
  padding: 0.25rem 1rem 0.5rem;
  border: 1px solid var(--lab-hairline);
  border-top-color: color-mix(in srgb, var(--lab-warn) 35%, var(--lab-hairline));
  background-color: var(--lab-panel);
  background-image:
    linear-gradient(to right, var(--lab-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--lab-grid-line) 1px, transparent 1px);
  background-size: 12px 12px;
}

.metrics dt,
.metrics dd {
  padding-block: 0.625rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.metrics dt:last-of-type,
.metrics dd:last-of-type {
  border-bottom: 0;
}

.metrics dt {
  padding-right: 1rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.metrics dd {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  text-align: right;
  white-space: nowrap;
  color: var(--lab-text);
}

.metrics dd.metrics__key {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--lab-warn);
  text-shadow: 0 0 18px color-mix(in srgb, var(--lab-warn) 30%, transparent);
}

/* ---- Rendered Cards：只換顏色，盒模型與字型維持原樣 ---- */

.cards__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem;
  max-height: 480px;
  overflow-y: auto;
  /* 捲軸寬度會改變 card 的可用寬度：維持瀏覽器預設捲軸，只換顏色 */
  scrollbar-color: var(--lab-hairline-strong) transparent;
}

/* 字型刻意沿用瀏覽器預設（改版前的狀態）：換字型會改變文字排版，進而改變被量測的 Layout 成本 */
.cards__item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lab-hairline);
  border-radius: 6px;
  background: var(--lab-panel);
  font-family: initial;
  color: var(--lab-text-silver);
}

.cards__id {
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.cards__title {
  font-weight: 600;
  color: var(--lab-text);
}

@media (max-width: 640px) {
  .params {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'title'
      'mass'
      'trigger';
    row-gap: 0.75rem;
  }

  .params button {
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .params__option,
  .params button {
    transition: none;
  }
}
</style>
