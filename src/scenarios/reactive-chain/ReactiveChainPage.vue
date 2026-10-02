<script setup lang="ts">
import { onMounted, onUnmounted, onUpdated } from 'vue'
import { createMetricsStore } from '@/benchmarks/reactive/metrics'
import { createReactiveChain } from '@/benchmarks/reactive/createReactiveChain'
import { log } from '@/benchmarks/reactive/logger'

// ------------------------------------------------
// Lab Parameters — 改這裡即可重新量測，不用改其他程式碼
// ------------------------------------------------
const DEPTH = 100
const UPDATE_INTERVAL = 5
const AUTO_UPDATE = false
// ------------------------------------------------

// metrics 建立：要觀察哪些證據
const metrics = createMetricsStore([
  'computedExecuteCount',
  'watchTriggerCount',
  'watchEffectTriggerCount',
  'renderCount',
] as const)

// 實驗開始
const chain = createReactiveChain(DEPTH, metrics)
const { finalValue, triggerUpdate } = chain

// Vue Component 每更新一次就會執行 renderCount++，因此可以知道 Reactive 更新，有沒有真的造成畫面 Render
onUpdated(() => {
  metrics.increment('renderCount')
  log('component render')
})

let timer: ReturnType<typeof setInterval> | undefined

// 頁面載如後決定要持續還是單次更新
onMounted(() => {
  if (AUTO_UPDATE) {
    timer = setInterval(triggerUpdate, UPDATE_INTERVAL)
  }
})

// watchEffect 全部解除避免 Memory Leak
onUnmounted(() => {
  if (timer) clearInterval(timer)
  chain.dispose()
})
</script>

<template>
  <article class="chain-lab lab-theme">
    <header class="chain-lab__head">
      <h1>Reactive Chain Generator</h1>
      <p>
        Runtime Benchmark：驗證不同 Reactive Dependency Depth 對 Update Cost 的影響。搭配 Chrome
        DevTools Performance 面板觀察每一層的 console.log。
      </p>
    </header>

    <!-- 鏈路示意只用到常數 DEPTH，不會隨 update 變動，不增加每次 re-render 的 patch 成本 -->
    <ol class="topology" aria-label="Reactive dependency chain">
      <li>ref</li>
      <li class="topology__depth">computed ×{{ DEPTH }}</li>
      <li>watch</li>
      <li>watchEffect</li>
      <li>render</li>
    </ol>

    <section class="params">
      <h2>Lab Parameters</h2>
      <!-- CDP runner 的 readParams() 讀這個 dl 的 dt/dd 純文字，結構與文字不可改 -->
      <dl>
        <dt>DEPTH</dt>
        <dd>{{ DEPTH }}</dd>
        <dt>UPDATE_INTERVAL</dt>
        <dd>{{ UPDATE_INTERVAL }} <span class="unit">ms</span></dd>
        <dt>AUTO_UPDATE</dt>
        <dd class="params__flag" :class="{ 'params__flag--on': AUTO_UPDATE }">{{ AUTO_UPDATE }}</dd>
      </dl>
      <!-- 按鈕文字必須剛好是「Trigger Update」（runner 用文字找按鈕），提示符號由 CSS 產生 -->
      <button v-if="!AUTO_UPDATE" type="button" @click="triggerUpdate">Trigger Update</button>
      <p class="params__note">編譯期常數：改 ReactiveChainPage.vue 頂部後重新整理即可重新量測</p>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>

      <!-- CDP runner 依序讀兩個 .metric-group dl，並用 dt 文字找對應的 dd -->
      <div class="metric-group metric-group--init">
        <h3>1. Initialization Phase (首航依賴建立)</h3>
        <dl>
          <dt>Dependency Depth</dt>
          <dd>{{ DEPTH }}</dd>
          <dt>Computed Execute Count</dt>
          <dd class="metric-group__key">{{ metrics.counters.computedExecuteCount }}</dd>
          <dt>WatchEffect Trigger Count</dt>
          <dd>{{ metrics.counters.watchEffectTriggerCount }}</dd>
        </dl>
      </div>

      <div class="metric-group metric-group--update">
        <h3>2. Runtime Update Phase (狀態變更更新效能)</h3>
        <p
          v-if="metrics.duration.totalUpdateCount === 0"
          class="status status--standby"
          role="status"
        >
          <span class="status__lamp" aria-hidden="true" />
          <span class="status__code">STANDBY</span>
          <span class="status__text">
            尚未觸發動態更新。點擊 <strong>Trigger Update</strong> 即可開始紀錄更新時間與計數。
          </span>
        </p>
        <p v-else class="status status--live" role="status">
          <span class="status__lamp" aria-hidden="true" />
          <span class="status__code">LIVE</span>
          <span class="status__text">以下為所有已觸發更新的累計值與平均值。</span>
        </p>
        <dl>
          <dt>Total Update Count</dt>
          <dd>{{ metrics.duration.totalUpdateCount }}</dd>
          <dt>Average Update Duration</dt>
          <dd class="metric-group__key">
            {{ metrics.duration.averageUpdateDuration.toFixed(3) }} <span class="unit">ms</span>
          </dd>
          <dt>Total Execution Time</dt>
          <dd>{{ metrics.duration.totalExecutionTime.toFixed(3) }} <span class="unit">ms</span></dd>
          <dt>Watch Trigger Count</dt>
          <dd>{{ metrics.counters.watchTriggerCount }}</dd>
          <dt>Render Count</dt>
          <dd>{{ metrics.counters.renderCount }}</dd>
        </dl>
      </div>
    </section>

    <section class="output">
      <h2>Final Value</h2>
      <p>{{ finalValue }}</p>
    </section>
  </article>
</template>

<style scoped>
/*
 * Hardcore Dark Lab（規範見 DESIGN.md）。這頁是 benchmark：
 * - 不動 CDP runner 依賴的 DOM：.params dl、兩個 .metric-group dl 的 dt 文字、「Trigger Update」按鈕文字。
 * - 唯一的常駐動畫是 STANDBY 燈號的 opacity 呼吸，只在第一次 update 之前出現，且只動 opacity（交給 compositor）。
 */
.chain-lab {
  display: grid;
  gap: 2rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

/* ---- 標題 ---- */

.chain-lab__head h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.chain-lab__head p {
  margin: 0.625rem 0 0;
  font-family: var(--lab-font-sans);
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

/* ---- 區段標題：標籤 + 延伸到右側的髮絲線 ---- */

.chain-lab h2 {
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

.chain-lab h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- 鏈路拓撲 ---- */

.topology {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.75rem;
  margin: -0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
  /* 換行後，行首節點的連接線會落在 ol 左緣外，直接裁掉 */
  overflow: clip;
}

.topology li {
  position: relative;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--lab-hairline-strong);
  background: var(--lab-panel-sunken);
  white-space: nowrap;
  color: var(--lab-text-muted);
}

/* 連接線 + 箭頭，畫在節點左側的 gap 裡 */
.topology li + li::before,
.topology li + li::after {
  content: '';
  position: absolute;
  top: 50%;
}

.topology li + li::before {
  right: calc(100% + 5px);
  width: calc(1.75rem - 9px);
  height: 1px;
  background: var(--lab-hairline-strong);
}

.topology li + li::after {
  right: calc(100% + 2px);
  translate: 0 -50%;
  border-block: 3.5px solid transparent;
  border-left: 5px solid var(--lab-hairline-strong);
}

.topology li.topology__depth {
  border-color: var(--lab-signal-edge);
  font-weight: 700;
  color: var(--lab-signal);
}

/* ---- Lab Parameters：唯讀儀表 + 執行鍵 ---- */

.params {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'title title'
    'readout trigger'
    'note note';
  column-gap: 1rem;
}

.params h2 {
  grid-area: title;
}

.params dl {
  grid-area: readout;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: auto auto;
  grid-auto-columns: minmax(0, 1fr);
  margin: 0;
  border: 1px solid var(--lab-hairline);
  background-color: var(--lab-panel);
  background-image:
    linear-gradient(to right, var(--lab-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--lab-grid-line) 1px, transparent 1px);
  background-size: 12px 12px;
}

.params dt,
.params dd {
  padding-inline: 1rem;
  border-left: 1px solid var(--lab-hairline);
}

.params dt:first-of-type,
.params dd:first-of-type {
  border-left: 0;
}

.params dt {
  padding-top: 0.75rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
  overflow-wrap: anywhere;
}

.params dd {
  margin: 0;
  padding-top: 0.25rem;
  padding-bottom: 0.75rem;
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-text);
}

/* AUTO_UPDATE：前方小燈，false 熄、true 亮 */
.params dd.params__flag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--lab-text-muted);
}

.params__flag::before {
  content: '';
  flex: none;
  width: 8px;
  height: 8px;
  border: 1px solid var(--lab-hairline-strong);
}

.params dd.params__flag--on {
  color: var(--lab-signal);
}

.params__flag--on::before {
  border-color: var(--lab-signal);
  background: var(--lab-signal);
  box-shadow: 0 0 8px color-mix(in srgb, var(--lab-signal) 70%, transparent);
}

.params button {
  grid-area: trigger;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 13rem;
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
    color 150ms var(--lab-ease-out),
    box-shadow 150ms var(--lab-ease-out);
}

.params button::before {
  content: '$';
  color: var(--lab-text-muted);
}

/* 游標方塊：只在 hover / focus 時出現與閃爍，平時不跑任何動畫 */
.params button::after {
  content: '';
  width: 0.55em;
  height: 1.1em;
  margin-left: -0.25rem;
  background: currentColor;
  opacity: 0;
}

.params button:hover {
  background: color-mix(in srgb, var(--lab-signal-strong) 16%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--lab-signal-strong) 18%, transparent);
}

.params button:hover::after,
.params button:focus-visible::after {
  opacity: 1;
  animation: caret 1s steps(1) infinite;
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

.params__note {
  grid-area: note;
  margin: 0.625rem 0 0;
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
  color: var(--lab-text-muted);
}

/* ---- Runtime Metrics：雙相位監控面板 ---- */

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.metrics h2 {
  grid-column: 1 / -1;
  margin-bottom: 0;
}

.metric-group {
  --phase: var(--lab-signal);
  --phase-edge: color-mix(in srgb, var(--phase) 35%, transparent);
  --phase-glow: color-mix(in srgb, var(--phase) 60%, transparent);

  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--lab-hairline);
  border-top-color: var(--phase-edge);
  background-color: var(--lab-panel);
  background-image:
    linear-gradient(to right, var(--lab-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--lab-grid-line) 1px, transparent 1px);
  background-size: 12px 12px;
}

.metric-group--update {
  --phase: var(--lab-warn);
}

/* 面板角落的定位框線 */
.metric-group::before,
.metric-group::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  pointer-events: none;
}

.metric-group::before {
  top: -1px;
  left: -1px;
  border-top: 1px solid var(--phase);
  border-left: 1px solid var(--phase);
}

.metric-group::after {
  right: -1px;
  bottom: -1px;
  border-right: 1px solid var(--lab-hairline-strong);
  border-bottom: 1px solid var(--lab-hairline-strong);
}

.metric-group h3 {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.4;
  color: var(--phase);
}

.metric-group h3::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  /* 標題換行時燈號對齊第一行 */
  margin-top: calc((1.4em - 6px) / 2);
  background: var(--phase);
  box-shadow: 0 0 6px var(--phase-glow);
}

.metric-group dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end; /* dt、dd 底部對齊，分隔線才會在同一條水平線上 */
  margin: 0;
  padding: 0.25rem 1rem 0.5rem;
}

.metric-group dt,
.metric-group dd {
  padding-block: 0.75rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.metric-group dt:last-of-type,
.metric-group dd:last-of-type {
  border-bottom: 0;
}

.metric-group dt {
  padding-right: 1rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.metric-group dd {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums slashed-zero;
  text-align: right;
  white-space: nowrap;
  color: var(--lab-text);
}

.metric-group dd.metric-group__key {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--phase);
  text-shadow: 0 0 18px color-mix(in srgb, var(--phase) 30%, transparent);
}

.unit {
  margin-left: 0.125em;
  font-size: 0.5em;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
  text-shadow: none;
}

/* ---- 診斷狀態燈 ---- */

.status {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 0.625rem;
  margin: 0.875rem 1rem 0;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.75rem;
  line-height: 1.6;
}

.status__lamp {
  align-self: center;
  width: 8px;
  height: 8px;
  background: var(--lamp);
  box-shadow: 0 0 8px color-mix(in srgb, var(--lamp) 70%, transparent);
}

.status__code {
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--lamp);
}

.status__text {
  font-family: var(--lab-font-sans);
  color: var(--lab-text-muted);
}

.status__text strong {
  font-family: var(--lab-font-mono);
  font-weight: 700;
  color: var(--lab-text-silver);
}

.status--standby {
  --lamp: var(--lab-warn);
}

.status--standby .status__lamp {
  animation: lamp-breathe 1.6s ease-in-out infinite;
}

.status--live {
  --lamp: var(--lab-signal);
}

/* ---- Final Value：輸出暫存器 ---- */

.output p {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin: 0;
  padding: 0.875rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-signal);
}

.output p::before {
  content: 'computed[DEPTH] =';
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

@keyframes lamp-breathe {
  50% {
    opacity: 0.2;
  }
}

@keyframes caret {
  50% {
    opacity: 0;
  }
}

/* ---- 窄螢幕 ---- */

@media (max-width: 760px) {
  .metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .params {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'title'
      'readout'
      'trigger'
      'note';
  }

  /* dt/dd 改成逐列：左標籤、右讀數 */
  .params dl {
    grid-auto-flow: row;
    grid-template-rows: none;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }

  .params dt,
  .params dd {
    padding-block: 0.625rem;
    border-left: 0;
    border-bottom: 1px solid var(--lab-hairline);
  }

  .params dt:last-of-type,
  .params dd:last-of-type {
    border-bottom: 0;
  }

  .params dd {
    font-size: 1.125rem;
    text-align: right;
  }

  .params dd.params__flag {
    justify-content: flex-end;
  }

  .params button {
    justify-content: center;
    min-width: 0;
    min-height: 3rem;
    margin-top: 0.75rem;
  }

  .metric-group dd {
    font-size: 1.25rem;
  }

  .metric-group dd.metric-group__key {
    font-size: 1.625rem;
  }

  .status {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .status__text {
    grid-column: 1 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status--standby .status__lamp,
  .params button:hover::after,
  .params button:focus-visible::after {
    animation: none;
  }

  .params button {
    transition: none;
  }
}
</style>
