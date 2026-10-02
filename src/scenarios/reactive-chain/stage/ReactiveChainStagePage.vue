<script setup lang="ts">
/**
 * Reactive Chain 的互動探測視圖（Stage）。
 *
 * benchmark 頁（../ReactiveChainPage.vue）要搭配 DevTools 看 console.log；這頁把同一條鏈的
 * 觸發歷程直接畫在 TTY 面板上。鏈改用 createTracedChain（每個節點多一次 performance.now()
 * 與一次 push），畫面也多了 log 與動畫，所以這裡的數字不可與 benchmark 頁或 README 的數據比較。
 * benchmark 頁與 CDP runner 依賴的 DOM 都不在這個檔案裡。
 */
import {
  nextTick,
  onMounted,
  onUnmounted,
  onUpdated,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import { createTracedChain, type TraceEvent } from './createTracedChain'

// 與 ReactiveChainPage.vue 的 DEPTH 相同；benchmark 頁的常數刻意不抽出共用，避免動到 benchmark
const DEPTH = 100
// TTY 最多保留的行數（每次 update 約 DEPTH + 5 行）
const MAX_LINES = 1500
// EXECUTING 狀態與傳導光效至少維持的時間；實際 update 只要幾 ms，太短看不到
const EXECUTING_HOLD_MS = 700

const TOPOLOGY = ['ref', `computed ×${DEPTH}`, 'watch', 'watchEffect', 'render'] as const

type LineTone = 'sys' | 'dep' | 'rerun' | 'hook' | 'update' | 'done'

interface TtyLine {
  id: number
  time: string
  glyph: string
  tag: string
  text: string
  tone: LineTone
}

interface RunCounts {
  computed: number
  watch: number
  watchEffect: number
  render: number
}

// ---- TTY buffer：鏈執行中只寫入這個非 reactive 陣列，update 結束後才一次交給畫面 ----

let pending: TtyLine[] = []
let lineSeq = 0
let tracing = false
// 追蹤中的是不是 update（false = 首航依賴建立）：update 期間的 computed 計算標成 [RE-RUN]
let inUpdate = false
let counts: RunCounts = emptyCounts()

const lines = shallowRef<TtyLine[]>([])

function emptyCounts(): RunCounts {
  return { computed: 0, watch: 0, watchEffect: 0, render: 0 }
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** performance.now() → 牆上時間 HH:MM:SS.mmmµµµ */
function stamp(time: number): string {
  const epoch = performance.timeOrigin + time
  const date = new Date(epoch)
  const micros = Math.floor((epoch % 1) * 1000)
  return (
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}` +
    `.${pad(date.getMilliseconds(), 3)}${pad(micros, 3)}`
  )
}

function emit(tone: LineTone, glyph: string, tag: string, text: string, time = performance.now()) {
  pending.push({ id: lineSeq++, time: stamp(time), glyph, tag, text, tone })
}

function flush(): void {
  if (pending.length === 0) return
  lines.value = [...lines.value, ...pending].slice(-MAX_LINES)
  pending = []
}

function onTrace(event: TraceEvent): void {
  if (!tracing) return
  switch (event.kind) {
    case 'computed':
      counts.computed++
      if (inUpdate) {
        emit(
          'rerun',
          '└─',
          'RE-RUN',
          `DEP_${pad(event.step, 3)} computed${event.step} resolved ➔ ${event.value}`,
          event.time,
        )
      } else {
        emit(
          'dep',
          '└─',
          `DEP_${pad(event.step, 3)}`,
          `computed${event.step} resolved ➔ ${event.value}`,
          event.time,
        )
      }
      break
    case 'watch':
      counts.watch++
      emit('hook', '├─', 'WATCH', `watch callback fired ➔ ${event.value}`, event.time)
      break
    case 'watchEffect':
      counts.watchEffect++
      emit('hook', '├─', 'EFFECT', `watchEffect re-run ➔ ${event.value}`, event.time)
      break
  }
}

// ---- 建立鏈（首航依賴建立也記錄進 TTY）----

tracing = true
emit('sys', '➔', 'INIT', `Establishing dependency chain · depth=${DEPTH}`)
const chain = createTracedChain(DEPTH, onTrace)
const { finalValue } = chain
const initCounts = counts
emit(
  'done',
  '✔',
  'INIT',
  `Chain armed · ${initCounts.computed} computed · ${initCounts.watchEffect} watchEffect`,
)
tracing = false
flush()

// 只有追蹤中的 render 才記錄；flush log 本身造成的 render 不算
onUpdated(() => {
  if (!tracing) return
  counts.render++
  emit('hook', '└─', 'RENDER', 'component patched')
})

// ---- 觸發 ----

interface RunSummary {
  index: number
  duration: number
  counts: RunCounts
}

const executing = ref(false)
const pulseKey = ref(0)
const lastRun = shallowRef<RunSummary | null>(null)
const totalDuration = ref(0)
const runCount = ref(0)

let holdTimer: ReturnType<typeof setTimeout> | undefined

async function triggerUpdate(): Promise<void> {
  if (executing.value) return
  executing.value = true
  pulseKey.value++
  const holdUntil = performance.now() + EXECUTING_HOLD_MS

  // 先讓按鈕狀態與光效 render 完，這次 render 不算進追蹤
  await nextTick()

  const index = runCount.value + 1
  counts = emptyCounts()
  tracing = true
  inUpdate = true
  emit('update', '⚡', 'UPDATE', `#${pad(index, 3)} triggered by $ TRIGGER UPDATE`)

  const start = performance.now()
  emit('sys', '➔', 'SOURCE', `ref.value ${chain.source.value} → ${chain.source.value + 1}`, start)
  chain.source.value++
  await nextTick()
  const duration = performance.now() - start

  tracing = false
  inUpdate = false
  emit(
    'done',
    '✔',
    'SETTLED',
    `${duration.toFixed(3)} ms · ${counts.computed} computed · ${counts.watch} watch · ` +
      `${counts.watchEffect} effect · ${counts.render} render`,
  )
  flush()

  runCount.value = index
  totalDuration.value += duration
  lastRun.value = { index, duration, counts }

  const remaining = holdUntil - performance.now()
  if (remaining > 0) {
    await new Promise<void>((resolve) => {
      holdTimer = setTimeout(resolve, remaining)
    })
  }
  executing.value = false
}

function clearTty(): void {
  lines.value = []
}

// ---- TTY 自動捲到底（DOM 操作留在元件內）----

const ttyEl = useTemplateRef<HTMLElement>('tty')

onMounted(scrollTtyToEnd)

watch(lines, scrollTtyToEnd, { flush: 'post' })

function scrollTtyToEnd(): void {
  const el = ttyEl.value
  if (el) el.scrollTop = el.scrollHeight
}

onUnmounted(() => {
  if (holdTimer) clearTimeout(holdTimer)
  chain.dispose()
})
</script>

<template>
  <div class="chain-stage lab-theme">
    <header class="chain-stage__header">
      <div class="chain-stage__heading">
        <h1>Reactive Chain</h1>
        <span class="chain-stage__tag">STAGE VIEW</span>
      </div>
      <p class="chain-stage__note">
        互動探測版本：每個節點多了追蹤與 log 輸出，數字不與 benchmark 頁或 README 數據直接比較。
      </p>
    </header>

    <main class="chain-stage__main">
      <div class="chain-stage__console">
        <ol
          :key="pulseKey"
          class="topology"
          :class="{ 'is-propagating': pulseKey > 0 }"
          aria-label="Reactive dependency chain"
        >
          <li v-for="(node, i) in TOPOLOGY" :key="node" :style="{ '--i': i }">{{ node }}</li>
        </ol>

        <section class="control" aria-labelledby="stage-control">
          <h2 id="stage-control">Lab Parameters</h2>
          <div class="control__bar">
            <dl class="control__readout">
              <dt>DEPTH</dt>
              <dd>{{ DEPTH }}</dd>
            </dl>
            <button
              type="button"
              class="trigger"
              :class="{ 'is-executing': executing }"
              :disabled="executing"
              @click="triggerUpdate"
            >
              <template v-if="executing">[ EXECUTING... ]</template>
              <template v-else>Trigger Update</template>
            </button>
          </div>
        </section>

        <section class="phases" aria-labelledby="stage-metrics">
          <h2 id="stage-metrics">Runtime Metrics</h2>

          <div class="phase phase--init">
            <h3>1. Initialization Phase (首航依賴建立)</h3>
            <dl>
              <dt>Dependency Depth</dt>
              <dd>{{ DEPTH }}</dd>
              <dt>Computed Executed</dt>
              <dd class="phase__key">{{ initCounts.computed }}</dd>
              <dt>WatchEffect Runs</dt>
              <dd>{{ initCounts.watchEffect }}</dd>
            </dl>
            <!-- chain 最外層的輸出值，隨每次 update 變動，用來確認更新已抵達 computed[DEPTH] -->
            <p class="phase__foot">
              <span class="phase__foot-label">computed[DEPTH]</span>
              <span
                >FINAL_VAL: <b>{{ finalValue }}</b></span
              >
            </p>
          </div>

          <div class="phase phase--update">
            <h3>2. Runtime Update Phase (狀態變更更新效能)</h3>
            <dl>
              <dt>Last Update Duration</dt>
              <dd class="phase__key" :class="{ 'is-empty': !lastRun }">
                <template v-if="lastRun">
                  {{ lastRun.duration.toFixed(3) }} <span class="unit">ms</span>
                </template>
                <template v-else>—</template>
              </dd>
              <dt>Average Update Duration</dt>
              <dd>
                {{ runCount ? (totalDuration / runCount).toFixed(3) : '—' }}
                <span v-if="runCount" class="unit">ms</span>
              </dd>
              <dt>Total Update Count</dt>
              <dd>{{ runCount }}</dd>
              <dt>Computed / Watch / Effect / Render</dt>
              <dd class="phase__split">
                <template v-if="lastRun">
                  {{ lastRun.counts.computed }}<span class="unit">/</span>{{ lastRun.counts.watch
                  }}<span class="unit">/</span>{{ lastRun.counts.watchEffect
                  }}<span class="unit">/</span>{{ lastRun.counts.render }}
                </template>
                <template v-else>—</template>
              </dd>
            </dl>
          </div>
        </section>
      </div>

      <section class="tty" aria-labelledby="stage-tty">
        <div class="tty__bar">
          <h2 id="stage-tty">[SYS_KERNEL_DIAGNOSTIC_TTY]</h2>
          <span class="tty__count">{{ lines.length }} / {{ MAX_LINES }} lines</span>
          <button type="button" class="tty__clear" @click="clearTty">clear</button>
        </div>
        <!-- 每次 update 會一次湧入上百行，不做逐行朗讀；摘要由下方的 status 告知 -->
        <div ref="tty" class="tty__screen" role="log" aria-live="off" tabindex="0">
          <p
            v-for="line in lines"
            :key="line.id"
            class="tty__line"
            :class="`tty__line--${line.tone}`"
          >
            <span class="tty__time">[{{ line.time }}]</span>
            <span class="tty__glyph">{{ line.glyph }}</span>
            <span class="tty__tag">[{{ line.tag }}]</span>
            <span class="tty__text">{{ line.text }}</span>
          </p>
          <p class="tty__prompt"><span class="tty__cursor" aria-hidden="true" /></p>
        </div>
        <p class="visually-hidden" role="status">
          <template v-if="lastRun">
            Update {{ lastRun.index }} settled in {{ lastRun.duration.toFixed(3) }} ms
          </template>
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Hardcore Dark Lab 的 Stage 版本（規範見 DESIGN.md）。這頁不是 benchmark，可以有動畫。 */

.chain-stage {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* 桌面版剛好一個螢幕高，左右兩欄各自捲動，TTY 底部永遠在畫面內 */
  height: 100%;
  min-height: 36rem;
  padding: 1.5rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

/* ---- header ---- */

.chain-stage__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: baseline;
  gap: 0.5rem 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.chain-stage__heading {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.chain-stage__heading h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.chain-stage__tag {
  padding: 0.125rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--lab-signal) 40%, transparent);
  border-radius: 2px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--lab-signal);
}

.chain-stage__note {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

/* ---- 雙欄：左操控、右 TTY（約 43%）---- */

.chain-stage__main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 1.5rem;
}

.chain-stage__console {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  min-height: 0;
  padding-right: 0.75rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--lab-hairline-strong) transparent;
}

.chain-stage h2 {
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

.chain-stage__console h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- 鏈路拓撲 + 傳導光效 ---- */

.topology {
  /* 傳導屬於運行期更新：用琥珀，與 Composable Chaos 的 ripple 一致 */
  --pulse: var(--lab-warn);

  position: relative;
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.75rem;
  margin: 0;
  /* 留出光暈空間，再用 overflow: clip 裁掉換行時懸空的連接線與掃描線 */
  padding: 0.5rem 0;
  overflow: clip;
  list-style: none;
  font-size: 0.75rem;
}

.topology li {
  position: relative;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--lab-hairline-strong);
  background: var(--lab-panel-sunken);
  white-space: nowrap;
  color: var(--lab-text-muted);
}

.topology li:nth-child(2) {
  border-color: var(--lab-signal-edge);
  font-weight: 700;
  color: var(--lab-signal);
}

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

/* 節點依序點亮：每個節點延遲 --i × 110ms，從傳導色退回原色 */
.topology.is-propagating li {
  animation: node-hit 520ms var(--lab-ease-out) calc(var(--i) * 110ms);
}

.topology.is-propagating li + li::before {
  animation: wire-hit 520ms var(--lab-ease-out) calc(var(--i) * 110ms - 60ms);
}

.topology.is-propagating li + li::after {
  animation: arrow-hit 520ms var(--lab-ease-out) calc(var(--i) * 110ms - 60ms);
}

/* 掃描線：一道由左到右穿過整條鏈的光帶 */
.topology.is-propagating::after {
  content: '';
  position: absolute;
  inset-block: 0;
  left: 0;
  width: 96px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--pulse) 28%, transparent) 70%,
    color-mix(in srgb, var(--pulse) 60%, transparent) 96%,
    transparent
  );
  pointer-events: none;
  translate: -96px 0;
  animation: scanline 640ms var(--lab-ease-out) forwards;
}

@keyframes node-hit {
  0% {
    border-color: var(--pulse);
    color: var(--lab-text);
    background: color-mix(in srgb, var(--pulse) 18%, var(--lab-panel-sunken));
    box-shadow: 0 0 14px color-mix(in srgb, var(--pulse) 45%, transparent);
  }
}

@keyframes wire-hit {
  0% {
    background: var(--pulse);
    box-shadow: 0 0 6px var(--pulse);
  }
}

@keyframes arrow-hit {
  0% {
    border-left-color: var(--pulse);
  }
}

@keyframes scanline {
  to {
    translate: 100cqw 0;
  }
}

/* ---- 控制列 ---- */

.control__bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 1rem;
}

.control__readout {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel);
}

.control__readout dt {
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.control__readout dd {
  margin: 0.25rem 0 0;
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-text);
}

.trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  min-height: 3.5rem;
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

.trigger:not(.is-executing)::before {
  content: '$';
  color: var(--lab-text-muted);
}

.trigger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lab-signal-strong) 16%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--lab-signal-strong) 18%, transparent);
}

.trigger:active:not(:disabled) {
  background: var(--lab-signal-strong);
  color: var(--lab-panel-sunken);
  transition-duration: 0ms;
}

.trigger:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 3px;
}

/* EXECUTING：停用、改用傳導色，外框以 opacity 呼吸 */
.trigger.is-executing {
  border-color: color-mix(in srgb, var(--lab-warn) 35%, transparent);
  background: color-mix(in srgb, var(--lab-warn) 6%, transparent);
  color: var(--lab-warn);
  cursor: progress;
}

.trigger.is-executing::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid var(--lab-warn);
  border-radius: inherit;
  box-shadow: 0 0 12px color-mix(in srgb, var(--lab-warn) 35%, transparent);
  animation: frame-breathe 700ms ease-in-out infinite;
}

@keyframes frame-breathe {
  50% {
    opacity: 0.15;
  }
}

/* ---- Runtime Metrics ---- */

/* 吸收左欄多出的高度：兩個相位面板拉長，左欄底邊與右側 TTY 底邊對齊 */
.phases {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: auto 1fr;
  gap: 1rem;
}

.phases h2 {
  grid-column: 1 / -1;
  margin-bottom: 0;
}

.phase {
  --phase: var(--lab-signal);

  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--lab-hairline);
  border-top-color: color-mix(in srgb, var(--phase) 35%, transparent);
  background-color: var(--lab-panel);
  background-image:
    linear-gradient(to right, var(--lab-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--lab-grid-line) 1px, transparent 1px);
  background-size: 12px 12px;
}

.phase--update {
  --phase: var(--lab-warn);
}

.phase::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  width: 10px;
  height: 10px;
  border-top: 1px solid var(--phase);
  border-left: 1px solid var(--phase);
  pointer-events: none;
}

.phase h3 {
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

.phase h3::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: calc((1.4em - 6px) / 2);
  background: var(--phase);
  box-shadow: 0 0 6px color-mix(in srgb, var(--phase) 60%, transparent);
}

.phase dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  margin: 0;
  padding: 0.25rem 1rem 0.5rem;
}

.phase dt,
.phase dd {
  padding-block: 0.625rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.phase dt:last-of-type,
.phase dd:last-of-type {
  border-bottom: 0;
}

.phase dt {
  padding-right: 1rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.phase dd {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums slashed-zero;
  text-align: right;
  white-space: nowrap;
  color: var(--lab-text);
}

.phase dd.phase__key {
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--phase);
  text-shadow: 0 0 18px color-mix(in srgb, var(--phase) 30%, transparent);
}

/* 尚未有讀數時的 —：不用相位色，避免看起來像一個數值 */
.phase dd.is-empty {
  color: var(--lab-text-muted);
  text-shadow: none;
}

.phase dd.phase__split {
  font-size: 1rem;
}

.unit {
  margin-inline: 0.2em;
  font-size: 0.5em;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
  text-shadow: none;
}

.phase__key .unit {
  margin-right: 0;
}

.phase__foot {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: auto 0 0;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-signal-strong);
}

.phase__foot-label {
  color: var(--lab-text-muted);
}

.phase__foot b {
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-signal);
}

/* ---- TTY ---- */

.tty {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--lab-tty-rule);
  background: var(--lab-tty-bg);
}

.tty__bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--lab-tty-rule);
}

.tty__bar h2 {
  flex: 1;
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: none;
  color: var(--lab-text-silver);
}

.tty__count {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--lab-tty-dim);
}

.tty__clear {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--lab-tty-rule);
  border-radius: 2px;
  background: transparent;
  color: var(--lab-tty-dim);
  font: inherit;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tty__clear:hover {
  border-color: var(--lab-tty-dim);
  color: var(--lab-text);
}

.tty__clear:focus-visible,
.tty__screen:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: -1px;
}

.tty__screen {
  flex: 1;
  min-height: 0;
  padding: 0.625rem 0.875rem 0.875rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--lab-tty-rule) transparent;
  font-size: 11px;
  line-height: 1.65;
  color: var(--lab-text-silver);
}

.tty__screen::-webkit-scrollbar {
  width: 4px;
}

.tty__screen::-webkit-scrollbar-thumb {
  background: var(--lab-tty-rule);
}

.tty__line {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  column-gap: 0.75ch;
  margin: 0;
  white-space: pre;
}

.tty__time {
  color: var(--lab-tty-dim);
  font-variant-numeric: tabular-nums;
}

.tty__glyph {
  width: 2ch;
  color: var(--lab-tty-dim);
}

.tty__tag {
  min-width: 9ch;
  font-weight: 700;
}

.tty__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/*
 * 行的語意色（時間戳與 └─ 等符號一律保持冷灰，見上方 .tty__time / .tty__glyph）：
 * - dep：首航建立時的 computed 節點計算 → 綠
 * - rerun：update 期間的 computed 重算 → 標籤琥珀 [RE-RUN]、內容銀灰（與 Composable Chaos 相同）
 * - hook：watch / watchEffect / render 這些鏈結終點的副作用 → 琥珀
 * - update：觸發 → 琥珀；done：INIT / SETTLED 總結 → 綠；sys：其餘 → 銀灰
 */
.tty__line--dep {
  color: var(--lab-signal-strong);
}

.tty__line--dep .tty__tag {
  font-weight: 500;
  color: var(--lab-signal);
}

.tty__line--rerun .tty__tag {
  color: var(--lab-warn);
}

.tty__line--hook,
.tty__line--update {
  color: var(--lab-warn);
}

.tty__line--update {
  margin-top: 0.75rem;
}

.tty__line--done {
  color: var(--lab-signal);
}

.tty__prompt {
  margin: 0.25rem 0 0;
}

.tty__cursor {
  display: inline-block;
  width: 0.6em;
  height: 1.1em;
  vertical-align: text-bottom;
  background: var(--lab-signal);
  animation: caret 1s steps(1) infinite;
}

@keyframes caret {
  50% {
    opacity: 0;
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ---- 窄螢幕：TTY 移到下方 ---- */

@media (max-width: 1080px) {
  .chain-stage {
    height: auto;
    min-height: 100%;
  }

  .chain-stage__main {
    grid-template-columns: minmax(0, 1fr);
  }

  .chain-stage__console {
    padding-right: 0;
    overflow: visible;
  }

  .tty {
    height: 70vh;
  }
}

@media (max-width: 640px) {
  .chain-stage {
    padding: 1rem;
  }

  .chain-stage__header {
    grid-template-columns: minmax(0, 1fr);
  }

  .control__bar,
  .phases {
    grid-template-columns: minmax(0, 1fr);
  }

  .tty__bar {
    flex-wrap: wrap;
  }

  /* 窄螢幕放不下整行 log：改成水平捲動，不截斷內容 */
  .tty__screen {
    overflow-x: auto;
  }

  .tty__text {
    overflow: visible;
  }
}

@media (prefers-reduced-motion: reduce) {
  .topology.is-propagating li,
  .topology.is-propagating li + li::before,
  .topology.is-propagating li + li::after,
  .trigger.is-executing::after,
  .tty__cursor {
    animation: none;
  }

  /* 不跑掃描線，改成整條鏈短暫泛起傳導色後淡出 */
  .topology.is-propagating::after {
    translate: 0;
    width: 100%;
    background: color-mix(in srgb, var(--pulse) 10%, transparent);
    animation: tint-fade 640ms ease-out forwards;
  }

  @keyframes tint-fade {
    to {
      opacity: 0;
    }
  }

  .trigger {
    transition: none;
  }
}
</style>
