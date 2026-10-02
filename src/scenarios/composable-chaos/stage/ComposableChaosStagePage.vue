<script setup lang="ts">
/**
 * Composable Chaos 的互動探測視圖（Stage）。
 *
 * chain 改用 createTracedComposableChain（結構與 benchmark 的 createComposableChain 相同，
 * 但每層 computed 執行時回報給 TTY，而不是 console.log），共用 createMetricsStore。
 * 另外多了操作引導、chain 方塊圖的傳導光效與即時診斷，每次 update 多了動畫與 DOM 重建，
 * 所以這裡的數字不可與 benchmark 頁或 README 的數據直接比較。
 * benchmark 頁與 CDP runner 依賴的 DOM 都不在這個檔案裡，可以放心調整這裡的呈現。
 */
import { computed, nextTick, onUnmounted, onUpdated, ref, shallowRef, useTemplateRef } from 'vue'
import { createMetricsStore } from '@/benchmarks/reactive/metrics'
import type {
  ComposableChain,
  ComposableChaosCounterName,
} from '@/benchmarks/composable/createComposableChain'
import {
  createTracedComposableChain,
  type ComposableTraceEvent,
} from './createTracedComposableChain'
import ChaosTty, { type TtyLine, type TtyTone } from './ChaosTty.vue'

// 與 benchmark 頁相同的可選層數
const DEPTH_OPTIONS = [1, 5, 10, 20] as const
type Depth = (typeof DEPTH_OPTIONS)[number]

const COUNTER_NAMES = [
  'composableInstanceCount',
  'computedCount',
  'watchCount',
  'watchEffectCount',
  'computedExecuteCount',
  'watchTriggerCount',
  'watchEffectTriggerCount',
  'renderCount',
] as const satisfies readonly ComposableChaosCounterName[]

// Stage 預設 Depth 10：Depth 1 沒有任何 computed，第一眼看不出鏈的效果
const selectedDepth = ref<Depth>(10)
const builtDepth = ref<Depth | null>(null)

const metrics = shallowRef(createMetricsStore<ComposableChaosCounterName>(COUNTER_NAMES))
const chain = shallowRef<ComposableChain | null>(null)
const buildDuration = ref<number | null>(null)

// build 完成當下的 computedExecuteCount（含建立 watch 時的首次計算），
// 之後的差值才是「update 造成的重算」
const executeBaseline = ref(0)

// 只有「已建立、且建立的 Depth 就是目前選的 Depth」才能注入
const ready = computed(() => chain.value !== null && builtDepth.value === selectedDepth.value)

// ---- TTY：chain 執行中只寫入非 reactive 的 pending，結束後才一次交給 ChaosTty ----

const tty = useTemplateRef<InstanceType<typeof ChaosTty>>('tty')

let pending: TtyLine[] = []
let lineSeq = 0
// 'init' = 建立期的首次計算，'update' = 注入後的重算，null = 不記錄
let tracePhase: 'init' | 'update' | null = null

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** performance.now() → 牆上時間 HH:MM:SS.mmm */
function stamp(time: number): string {
  const date = new Date(performance.timeOrigin + time)
  return (
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}` +
    `.${pad(date.getMilliseconds(), 3)}`
  )
}

function emit(tone: TtyTone, tag: string, text: string, time = performance.now()): void {
  pending.push({ id: lineSeq++, time: stamp(time), tag, text, tone })
}

function flushTty(): void {
  const batch = pending
  pending = []
  void tty.value?.append(batch)
}

function onTrace(event: ComposableTraceEvent): void {
  if (!tracePhase) return
  switch (event.kind) {
    case 'computed':
      if (tracePhase === 'update') {
        emit(
          'rerun',
          'RE-RUN',
          `layer${event.layer} computed executed ➔ ${event.value}`,
          event.time,
        )
      } else {
        emit('init', 'INIT', `layer${event.layer} computed executed ➔ ${event.value}`, event.time)
      }
      break
    case 'watch':
      emit('hook', 'WATCH', `top-level watch fired ➔ ${event.value}`, event.time)
      break
    case 'watchEffect':
      emit('hook', 'EFFECT', `top-level watchEffect ran ➔ ${event.value}`, event.time)
      break
  }
}

// ---- 01：建立 chain ----

async function initializeChain(): Promise<void> {
  chain.value?.dispose()

  const depth = selectedDepth.value
  const nextMetrics = createMetricsStore<ComposableChaosCounterName>(COUNTER_NAMES)
  metrics.value = nextMetrics
  buildDuration.value = null

  emit('sys', 'BUILD', `useLayer${depth}() ⊃ … ⊃ useLayer1() · instantiating ${depth} layers`)
  tracePhase = 'init'
  const start = performance.now()
  chain.value = createTracedComposableChain(depth, nextMetrics, onTrace)
  builtDepth.value = depth
  await nextTick()
  const duration = performance.now() - start
  tracePhase = null

  buildDuration.value = duration
  executeBaseline.value = nextMetrics.counters.computedExecuteCount
  emit(
    'done',
    'COUPLED',
    `${nextMetrics.counters.computedCount} computed linked · ${duration.toFixed(3)} ms`,
  )
  flushTty()
}

// ---- 02：注入更新 ----

// 每次注入都換一個 key，讓方塊圖重建並重播傳導光效
const rippleKey = ref(0)

async function injectUpdate(): Promise<void> {
  if (!ready.value || !chain.value) return
  const current = chain.value
  const before = metrics.value.counters.computedExecuteCount

  emit(
    'update',
    `UPDATE #${pad(updateCount.value + 1, 3)}`,
    `source.value ${current.source.value} → ${current.source.value + 1}`,
  )
  tracePhase = 'update'
  rippleKey.value++
  const start = performance.now()
  await current.triggerUpdate()
  const duration = performance.now() - start
  tracePhase = null

  const reruns = metrics.value.counters.computedExecuteCount - before
  emit('done', 'SETTLED', `${reruns} re-runs · ${duration.toFixed(3)} ms`)
  flushTty()
}

onUpdated(() => {
  metrics.value.increment('renderCount')
})

onUnmounted(() => {
  chain.value?.dispose()
})

// ---- 診斷結論：全部由計數器即時算出，不寫死結論 ----

const updateCount = computed(() => metrics.value.duration.totalUpdateCount)

// counters 不是 reactive；靠 totalUpdateCount 變動觸發重算，此時本次 update 的重算已經計入。
// update 造成的 computed 重算累計（扣掉 build 時的首次計算）
const computedReruns = computed<number | null>(() => {
  // build 進行中（基準值還沒更新）時不顯示，避免拿上一條 chain 的基準相減
  if (builtDepth.value === null || buildDuration.value === null) return null
  void updateCount.value
  return metrics.value.counters.computedExecuteCount - executeBaseline.value
})

const executesPerUpdate = computed<number | null>(() => {
  const updates = updateCount.value
  if (updates === 0 || computedReruns.value === null) return null
  return computedReruns.value / updates
})

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
</script>

<template>
  <div class="chaos-stage lab-theme">
    <header class="chaos-stage__header">
      <div class="chaos-stage__heading">
        <h1>Composable Chaos</h1>
        <span class="chaos-stage__tag">STAGE VIEW</span>
      </div>
      <nav class="chaos-stage__nav" aria-label="Composable Chaos">
        <RouterLink to="/">← Pain Scenarios</RouterLink>
        <RouterLink to="/scenarios/composable-chaos">Benchmark 原始頁</RouterLink>
      </nav>
      <p class="chaos-stage__note">
        互動探測版本：多了引導、傳導光效與即時診斷，數字不與 benchmark 頁或 README 數據直接比較。
      </p>
    </header>

    <main class="chaos-stage__main">
      <div class="chaos-stage__console">
        <!-- ---- 操作引導 ---- -->
        <section class="guide" :class="ready ? 'guide--ready' : 'guide--awaiting'">
          <h2 class="visually-hidden">Process Guide</h2>
          <span class="guide__label">[ SYS_PROCESS_GUIDE ]</span>
          <p class="guide__body" role="status">
            <span class="guide__lamp" aria-hidden="true" />
            <span class="guide__code">{{ ready ? '[STEP_01_READY]' : '[AWAITING_STEP_01]' }}</span>
            <span class="guide__arrow" aria-hidden="true">➔</span>
            <span class="guide__text">
              <template v-if="ready">
                依賴鏈結建立完畢！請密集點擊 <strong>[02]</strong>
                注入狀態，觀察多層巢狀引發的底層更新成本。
              </template>
              <template v-else>
                請先點擊 <strong>[01]</strong> 建立該深度的 Composable 巢狀依賴鏈結。
              </template>
            </span>
          </p>
        </section>

        <!-- ---- 兩階段控制 ---- -->
        <section aria-labelledby="stage-params">
          <h2 id="stage-params">Lab Parameters</h2>
          <div class="sequence">
            <div class="step step--build">
              <h3>PHASE 01 // ABSTRACTION LAYER SETUP</h3>
              <fieldset class="depth">
                <legend>COMPOSABLE_DEPTH</legend>
                <div class="depth__options">
                  <label v-for="option in DEPTH_OPTIONS" :key="option" class="depth__option">
                    <input
                      v-model="selectedDepth"
                      type="radio"
                      name="stage-composable-depth"
                      :value="option"
                    />
                    {{ option }}
                  </label>
                </div>
              </fieldset>
              <div class="step__slot">
                <button type="button" class="step__action" @click="initializeChain">
                  [ 01 // INITIALIZE LAYER CHAIN ]
                </button>
              </div>
            </div>

            <div class="step step--update" :class="{ 'is-locked': !ready }">
              <h3>PHASE 02 // RUNTIME INTENSITY INJECTION</h3>
              <p id="stage-update-note" class="step__note">
                <template v-if="!chain">先執行 <strong>01</strong>，02 才會解鎖。</template>
                <template v-else-if="!ready">
                  已建立的是 Depth {{ builtDepth }}，目前選的是 Depth {{ selectedDepth }}：重新執行
                  <strong>01</strong> 才會解鎖。
                </template>
                <template v-else>每按一次，底層 source ref 變更一次，可連續觸發。</template>
              </p>
              <div class="step__slot">
                <span v-if="!ready" class="step__lock" aria-hidden="true">
                  [ LOCKED: REQUIRES INSTANTIATION ]
                </span>
                <button
                  type="button"
                  class="step__action"
                  :disabled="!ready"
                  aria-describedby="stage-update-note"
                  @click="injectUpdate"
                >
                  [ 02 // INJECT STATE UPDATE ]
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ---- Chain 方塊圖 ---- -->
        <section class="detector" :class="{ 'is-live': ready }" aria-labelledby="stage-detector">
          <h2 id="stage-detector">[ COMPOSABLE_CHAIN_DETECTOR ]</h2>
          <div class="detector__frame">
            <p class="detector__caption">
              <span>useLayer{{ selectedDepth }}() ⊃ … ⊃ useLayer1()</span>
              <span>{{ ready ? 'COUPLED' : 'NOT INSTANTIATED' }}</span>
            </p>
            <ol
              :key="rippleKey"
              class="detector__grid"
              :class="{ 'is-rippling': rippleKey > 0 && ready }"
              :style="{ '--n': selectedDepth }"
              :aria-label="`${selectedDepth} 層 composable，由 useLayer1 傳到 useLayer${selectedDepth}`"
            >
              <li
                v-for="layer in selectedDepth"
                :key="layer"
                class="detector__cell"
                :style="{ '--i': layer - 1 }"
              >
                <span class="detector__index">L{{ layer }}</span>
                <span class="detector__kind">{{ layer === 1 ? 'ref' : 'cmp' }}</span>
              </li>
            </ol>
            <p class="detector__legend">
              <span>source → 最外層</span>
              <span>L1 = source ref · L2+ = computed</span>
            </p>
          </div>

          <!-- 建立期（Build）結構數據：像硬體偵測軟體的底部狀態列 -->
          <div class="telemetry">
            <span class="telemetry__title">[ LINK_STRUCTURE_TELEMETRY ]</span>
            <dl class="telemetry__items">
              <div>
                <dt>COMPOSABLES</dt>
                <dd>{{ builtDepth !== null ? metrics.counters.composableInstanceCount : '-' }}</dd>
              </div>
              <div>
                <dt>COMPUTED_NODES</dt>
                <dd>{{ builtDepth !== null ? metrics.counters.computedCount : '-' }}</dd>
              </div>
              <div>
                <dt>WATCH / EFFECT</dt>
                <dd>
                  <template v-if="builtDepth !== null">
                    {{ metrics.counters.watchCount }} / {{ metrics.counters.watchEffectCount }}
                  </template>
                  <template v-else>-</template>
                </dd>
              </div>
              <div>
                <dt>BUILD_DURATION</dt>
                <dd class="telemetry__key">
                  <template v-if="buildDuration !== null">
                    {{ buildDuration.toFixed(3) }} <span class="unit">ms</span>
                  </template>
                  <template v-else>-</template>
                </dd>
              </div>
              <div>
                <dt>FINAL_VAL</dt>
                <dd>{{ chain ? chain.finalValue.value : '-' }}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <!-- ---- 核心診斷結論：結論 → 終端機證實 → 數據背書 ---- -->
      <section class="verdict" aria-labelledby="stage-verdict">
        <h2 id="stage-verdict">[ CORE_DIAGNOSTIC_VERDICT ]</h2>

        <!-- 第一層：結論大字 + 一句白話 -->
        <div class="verdict__lead" role="status">
          <p
            class="verdict__headline"
            :class="{ 'is-pending': updateCount === 0 || computedReruns === null }"
          >
            <template v-if="updateCount === 0 || computedReruns === null">
              [ RUNTIME COST: AWAITING INJECTION ]
            </template>
            <template v-else-if="builtDepth === 1">[ RUNTIME COST: ×0 RE-RUNS ]</template>
            <template v-else>[ CHAOS DETECTED: ×{{ computedReruns }} RE-RUNS ]</template>
          </p>
          <p
            class="verdict__lede"
            :class="{ 'is-pending': updateCount === 0 || executesPerUpdate === null }"
          >
            <template v-if="builtDepth === null">
              請執行 <strong>01</strong> 建立 chain，再用 <strong>02</strong> 注入狀態。
            </template>
            <template v-else-if="updateCount === 0 || executesPerUpdate === null">
              Chain 已就緒（Depth {{ builtDepth }}，{{ metrics.counters.computedCount }} 個
              computed）：用 <strong>02</strong> 注入狀態。
            </template>
            <template v-else-if="builtDepth === 1">
              診斷：Depth 1 只有 source ref，沒有 computed 可以重算。
            </template>
            <template v-else>
              診斷：Composable 巢狀讓每次 source 變更都逐層重算
              <strong>{{ formatCount(executesPerUpdate) }}</strong> 個 computed —
              層數越深、重算越多，成本隨層數線性增加。
            </template>
          </p>
        </div>

        <!-- 第二層：終端機證實（log 只寫進 ChaosTty，不觸發本元件 re-render） -->
        <ChaosTty ref="tty" />

        <!-- 第三層：數據背書 -->
        <p class="verdict__status">
          <span class="verdict__bracket">[</span>
          <span
            >TOTAL_UPDATES: <b>{{ updateCount }}</b></span
          >
          <span class="verdict__sep">|</span>
          <span
            >AVG_LATENCY: <b>{{ metrics.duration.averageUpdateDuration.toFixed(3) }} ms</b></span
          >
          <span class="verdict__sep">|</span>
          <span
            >RENDER_COUNT: <b>{{ metrics.counters.renderCount }}</b></span
          >
          <span class="verdict__bracket">]</span>
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Hardcore Dark Lab 的 Stage 版本（規範見 DESIGN.md）。這頁不是 benchmark，可以有動畫。 */

.chaos-stage {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 1.5rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

.chaos-stage strong {
  font-family: var(--lab-font-mono);
  font-weight: 700;
  color: var(--lab-text);
}

/* ---- header ---- */

.chaos-stage__header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 0.5rem 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.chaos-stage__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
}

.chaos-stage__heading h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.chaos-stage__tag {
  padding: 0.125rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--lab-signal) 40%, transparent);
  border-radius: 2px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  white-space: nowrap;
  color: var(--lab-signal);
}

.chaos-stage__nav {
  display: flex;
  gap: 1.25rem;
  font-size: 0.75rem;
}

.chaos-stage__nav a {
  color: var(--lab-text-muted);
  text-decoration: none;
}

.chaos-stage__nav a:hover {
  color: var(--lab-text);
}

.chaos-stage__nav a:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 3px;
}

.chaos-stage__note {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

/* ---- 版面：左操控與 chain 結構、右診斷 ---- */

.chaos-stage__main {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  /* 左右兩欄等高：左欄由 chain 方塊圖吸收多出的高度，兩欄底邊對齊 */
  align-items: stretch;
  gap: 2rem 1.5rem;
}

.chaos-stage__console {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.detector,
.detector__frame {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.chaos-stage h2 {
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

.chaos-stage h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- [ SYS_PROCESS_GUIDE ] ---- */

.guide {
  --tone: var(--lab-warn);

  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--tone) 30%, var(--lab-hairline));
  background: var(--lab-panel-sunken);
}

.guide--awaiting {
  --tone: color-mix(in srgb, var(--lab-warn) 80%, var(--lab-text-muted));
}

.guide--ready {
  --tone: var(--lab-signal);
}

.guide__label {
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  border-right: 1px solid color-mix(in srgb, var(--tone) 30%, var(--lab-hairline));
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--lab-text-muted);
  white-space: nowrap;
}

.guide__body {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 0.5rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.6;
}

.guide__lamp {
  align-self: center;
  width: 7px;
  height: 7px;
  background: var(--tone);
  box-shadow: 0 0 8px color-mix(in srgb, var(--tone) 70%, transparent);
  animation: breathe 1.6s ease-in-out infinite;
}

.guide__code {
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--tone);
}

.guide__arrow {
  color: var(--lab-text-muted);
}

.guide__text {
  font-family: var(--lab-font-sans);
  color: var(--lab-text-silver);
}

.guide--ready .guide__text strong {
  color: var(--lab-warn);
}

/* ---- 兩階段控制 ---- */

.sequence {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2.5rem;
}

.step {
  --phase: var(--lab-signal);

  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--lab-hairline);
  border-top-color: color-mix(in srgb, var(--phase) 40%, transparent);
  background: var(--lab-panel);
}

.step--update {
  --phase: var(--lab-warn);
}

.step--update.is-locked {
  --phase: var(--lab-lock);
}

.step--update::before {
  content: '';
  position: absolute;
  top: 1.25rem;
  right: calc(100% + 0.75rem);
  width: 1rem;
  height: 1px;
  background: var(--lab-hairline-strong);
}

.step--update::after {
  content: '';
  position: absolute;
  top: calc(1.25rem - 3px);
  right: calc(100% + 0.5rem);
  border-block: 3.5px solid transparent;
  border-left: 5px solid var(--lab-hairline-strong);
}

.step h3 {
  margin: 0;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--phase);
}

.step--update.is-locked h3 {
  color: var(--lab-text-muted);
}

.depth {
  margin: 0;
  padding: 0 1rem;
  border: 0;
}

.depth legend {
  padding: 1rem 0 0.5rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.depth__options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.depth__option {
  position: relative;
  padding: 0.625rem 0;
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

.depth__option + .depth__option {
  border-left: 0;
}

.depth__option:hover {
  color: var(--lab-text);
  background: color-mix(in srgb, var(--lab-hairline-strong) 40%, transparent);
}

.depth__option:has(input:checked) {
  color: var(--lab-signal);
  background: color-mix(in srgb, var(--lab-signal) 12%, transparent);
  box-shadow: inset 0 -2px 0 var(--lab-signal);
}

.depth__option:has(input:focus-visible) {
  outline: 1px solid var(--lab-signal);
  outline-offset: -1px;
}

.depth__option input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.step__note {
  flex: 1;
  margin: 0;
  padding: 1rem 1rem 0;
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

.step__slot {
  position: relative;
  margin-top: auto;
  padding: 1.25rem 1rem 1rem;
}

.step__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 3.25rem;
  padding: 0 1rem;
  border: 1px solid var(--phase);
  border-radius: 2px;
  background: color-mix(in srgb, var(--phase) 8%, transparent);
  color: var(--phase);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-wrap: balance;
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-out),
    box-shadow 150ms var(--lab-ease-out);
}

.step__action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--phase) 16%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--phase) 20%, transparent);
}

.step__action:active:not(:disabled) {
  background: var(--phase);
  color: var(--lab-panel-sunken);
  transition-duration: 0ms;
}

.step__action:focus-visible {
  outline: 1px solid var(--phase);
  outline-offset: 3px;
}

.step__action:disabled {
  border-color: var(--lab-lock);
  background: transparent;
  color: var(--lab-text-muted);
  cursor: not-allowed;
}

.step__lock {
  position: absolute;
  top: calc(1.25rem - 0.5em);
  left: 1.75rem;
  z-index: 1;
  padding-inline: 0.375rem;
  background: var(--lab-panel);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  color: var(--lab-lock-text);
}

/* ---- [ COMPOSABLE_CHAIN_DETECTOR ] ---- */

.detector__frame {
  border: 1px solid var(--lab-hairline);
  background-color: var(--lab-panel);
  background-image:
    linear-gradient(to right, var(--lab-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--lab-grid-line) 1px, transparent 1px);
  background-size: 12px 12px;
}

.detector__caption,
.detector__legend {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: 0;
  padding: 0.625rem 1rem;
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.detector__caption {
  border-bottom: 1px solid var(--lab-hairline);
}

.detector.is-live .detector__caption span:last-child {
  color: var(--lab-signal);
}

.detector__legend {
  border-top: 1px solid var(--lab-hairline);
}

.detector__grid {
  flex: 1;
  align-content: start;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.25rem, 1fr));
  gap: 4px;
  margin: 0;
  padding: 1rem;
  list-style: none;
}

.detector__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  aspect-ratio: 1;
  border: 1px dashed var(--lab-hairline-strong);
  background: var(--lab-panel-sunken);
  color: var(--lab-text-muted);
}

.detector.is-live .detector__cell {
  border-style: solid;
  border-color: color-mix(in srgb, var(--lab-signal) 45%, var(--lab-hairline));
  color: var(--lab-text-silver);
}

.detector__index {
  font-size: 0.75rem;
  font-weight: 700;
}

.detector__kind {
  font-size: 0.5625rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

/* 傳導光效：從 L1（source）到 L{n} 依序閃過霓虹橘，整波約 360ms */
.detector__grid.is-rippling .detector__cell {
  animation: ripple 460ms var(--lab-ease-out) calc(var(--i) / var(--n) * 360ms);
}

@keyframes ripple {
  0% {
    border-color: var(--lab-warn);
    background: color-mix(in srgb, var(--lab-warn) 28%, var(--lab-panel-sunken));
    color: var(--lab-text);
    box-shadow: 0 0 16px color-mix(in srgb, var(--lab-warn) 55%, transparent);
  }
}

/* ---- [ CORE_DIAGNOSTIC_VERDICT ] ---- */

.verdict {
  position: relative;
  padding: 1.25rem 1.25rem 1.5rem;
  border: 1px solid color-mix(in srgb, var(--lab-warn) 35%, var(--lab-hairline));
  background: var(--lab-panel-sunken);
}

.verdict::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  width: 14px;
  height: 14px;
  border-top: 1px solid var(--lab-warn);
  border-left: 1px solid var(--lab-warn);
}

.verdict__headline {
  margin: 0;
  font-size: clamp(1.5rem, 2.6vw, 2.25rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: balance;
  color: var(--lab-warn);
  text-shadow: 0 0 24px color-mix(in srgb, var(--lab-warn) 35%, transparent);
}

/* 尚未有讀數：縮小、去光暈，避免看起來像一個結論 */
.verdict__headline.is-pending {
  font-size: 1.25rem;
  color: color-mix(in srgb, var(--lab-warn) 55%, var(--lab-text-muted));
  text-shadow: none;
}

.verdict__lead {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.verdict__lede {
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--lab-text-silver);
}

/* 尚未有結論時，提示句用暗黃色 */
.verdict__lede.is-pending {
  color: color-mix(in srgb, var(--lab-warn) 75%, var(--lab-text-muted));
}

.verdict__lede strong {
  color: var(--lab-warn);
}

/* 第三層：一行 TTY 狀態列 */
.verdict__status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75ch;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lab-tty-rule);
  border-top: 0;
  background: var(--lab-tty-bg);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.verdict__status b {
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-warn);
}

.verdict__bracket,
.verdict__sep {
  color: var(--lab-hairline-strong);
}

/* ---- [ LINK_STRUCTURE_TELEMETRY ]：建立期數據狀態列（綠）---- */

.telemetry {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.375rem 1rem;
  margin-top: -1px;
  padding: 0.5rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
}

.telemetry__title {
  color: var(--lab-text-muted);
}

.telemetry__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 0;
  margin: 0;
}

.telemetry__items div {
  display: flex;
  align-items: baseline;
  gap: 0.5ch;
}

/* 項目之間的灰色 | 分隔 */
.telemetry__items div + div::before {
  content: '|';
  margin-inline: 1ch;
  color: var(--lab-hairline-strong);
}

/* 建立期：標籤 #10b981、數值 #34d399，同一個綠色家族 */
.telemetry__items dt {
  color: var(--lab-signal-strong);
}

.telemetry__items dt::after {
  content: ':';
}

.telemetry__items dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-signal);
}

.telemetry__items dd.telemetry__key {
  text-shadow: 0 0 10px color-mix(in srgb, var(--lab-signal) 40%, transparent);
}

.unit {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--lab-text-muted);
  text-shadow: none;
}

@keyframes breathe {
  50% {
    opacity: 0.2;
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

/* ---- 窄螢幕 ---- */

@media (max-width: 1100px) {
  .chaos-stage__main {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .chaos-stage {
    padding: 1rem;
  }

  .chaos-stage__header {
    grid-template-columns: minmax(0, 1fr);
  }

  .guide {
    grid-template-columns: minmax(0, 1fr);
  }

  .guide__label {
    padding: 0.375rem 0.75rem;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--tone) 30%, var(--lab-hairline));
  }

  .guide__body {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .guide__arrow {
    display: none;
  }

  .guide__text {
    grid-column: 1 / -1;
  }

  .sequence {
    grid-template-columns: minmax(0, 1fr);
  }

  .sequence {
    gap: 2rem;
  }

  .step--update::before {
    top: auto;
    right: auto;
    bottom: calc(100% + 0.625rem);
    left: 50%;
    width: 1px;
    height: 0.875rem;
  }

  .step--update::after {
    top: auto;
    right: auto;
    bottom: calc(100% + 0.375rem);
    left: calc(50% - 3px);
    border-inline: 3.5px solid transparent;
    border-block: 0;
    border-top: 5px solid var(--lab-hairline-strong);
  }

  .step__action {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }

  .detector__caption,
  .detector__legend {
    flex-direction: column;
    gap: 0.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .guide__lamp {
    animation: none;
  }

  /* 不跑逐格傳導，改成整排同時淡淡亮一下 */
  .detector__grid.is-rippling .detector__cell {
    animation: ripple-still 460ms ease-out;
  }

  .depth__option,
  .step__action {
    transition: none;
  }
}

@keyframes ripple-still {
  0% {
    border-color: var(--lab-warn);
  }
}
</style>
