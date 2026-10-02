<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, shallowRef } from 'vue'
import { createMetricsStore } from '@/benchmarks/reactive/metrics'
import { log } from '@/benchmarks/reactive/logger'
import {
  createComposableChain,
  type ComposableChain,
  type ComposableChaosCounterName,
} from '@/benchmarks/composable/createComposableChain'

// ------------------------------------------------
// Lab Parameters — Composable Abstraction Depth 的可選層數
// ------------------------------------------------
const DEPTH_OPTIONS = [1, 5, 10, 20] as const
// ------------------------------------------------

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

// 目前選擇的 Depth。刻意不用 watch 自動 rebuild：改變 Depth 只是換選項，
// 要點擊「Build Chain」才會真正用新 depth 重建 composable chain
const selectedDepth = ref<(typeof DEPTH_OPTIONS)[number]>(DEPTH_OPTIONS[0])

// 目前畫面上這條 chain 實際是用哪個 depth 建的，用來跟 selectedDepth 對照
const builtDepth = ref<number | null>(null)

// 使用者是否親自按過 Build Chain（mount 時的自動 build 不算），用來解鎖 Trigger Update
const instantiated = ref(false)

const metrics = shallowRef(createMetricsStore<ComposableChaosCounterName>(COUNTER_NAMES))
const chain = shallowRef<ComposableChain | null>(null)

const finalValue = computed(() => chain.value?.finalValue.value ?? null)

// Build（= 用巢狀 composable call 建立整條 chain）量測，跟下面的 triggerUpdate() 各自獨立：
// Build Duration 混合了「N 層 function call + reactive primitive 初始化 + 首次 render」，
// 不是單純的 Composable Abstraction Cost，見 README「What This Scenario Does NOT Measure」
const buildStartTime = ref<number | null>(null)
const buildEndTime = ref<number | null>(null)
const buildDuration = ref<number | null>(null)

async function buildChain(depth: number, byUser = false): Promise<void> {
  chain.value?.dispose()

  // 每次 build 都是新的一輪實驗，metrics 重新建立，避免不同 depth 的數字混在一起
  const nextMetrics = createMetricsStore<ComposableChaosCounterName>(COUNTER_NAMES)
  metrics.value = nextMetrics

  buildStartTime.value = performance.now()
  buildEndTime.value = null
  buildDuration.value = null

  chain.value = createComposableChain(depth, nextMetrics)
  builtDepth.value = depth

  // 等 Vue 把新的 finalValue 實際 render 完成後才算 build 結束
  await nextTick()
  buildEndTime.value = performance.now()
  buildDuration.value = buildEndTime.value - buildStartTime.value
  // 跟 buildDuration 同一個同步區塊寫入，併進同一次 render：不會多算一次 renderCount，
  // 也不會被算進上面的 Build Duration
  if (byUser) instantiated.value = true
  log(`chain built at depth ${depth}`)
}

async function triggerUpdate(): Promise<void> {
  await chain.value?.triggerUpdate()
}

// ------------------------------------------------
// 兩階段操作的 UI 鎖定（只影響按鈕狀態與提示，不影響 chain 與量測流程）
// mount 時仍會自動 build 一次（CDP runner 依賴 Build Duration 從數值變回 '-' 的轉換），
// 但要使用者親自按過 01（instantiated）、且選的 Depth 等於已建立的 Depth，02 才解鎖
// ------------------------------------------------
const lockReason = computed<'uninstantiated' | 'depth-mismatch' | null>(() => {
  if (!chain.value || !instantiated.value) return 'uninstantiated'
  if (builtDepth.value !== selectedDepth.value) return 'depth-mismatch'
  return null
})

const reactorStatus = computed<'standby' | 'ready' | 'live'>(() => {
  if (lockReason.value) return 'standby'
  return metrics.value.duration.totalUpdateCount === 0 ? 'ready' : 'live'
})

// Component 每更新一次就 renderCount++，用來確認 chain 的 reactive 更新有沒有真的造成畫面 render
onUpdated(() => {
  metrics.value.increment('renderCount')
})

onMounted(() => {
  void buildChain(selectedDepth.value)
})

onUnmounted(() => {
  chain.value?.dispose()
})
</script>

<template>
  <article class="chaos-lab lab-theme">
    <header class="chaos-lab__head">
      <h1>Composable Chaos</h1>
      <p>
        Runtime Benchmark：驗證 Composable Abstraction Depth（巢狀 <code>useLayerN()</code>
        呼叫層數）增加時，是否伴隨額外的 Reactive Runtime Cost。DOM 結構與 Component
        數量全程固定，唯一變動的是 composable 呼叫的巢狀深度，以及隨之建立的 reactive unit 數量。
      </p>
    </header>

    <section class="params">
      <h2>Lab Parameters</h2>
      <div class="sequence">
        <div class="step step--build">
          <h3>PHASE 01 // ABSTRACTION LAYER SETUP</h3>
          <!-- CDP runner 用 input[name="composable-depth"][value=N] 選 Depth，name / value 不可改 -->
          <fieldset class="depth">
            <legend>COMPOSABLE_DEPTH</legend>
            <div class="depth__options">
              <label v-for="option in DEPTH_OPTIONS" :key="option" class="depth__option">
                <input
                  v-model="selectedDepth"
                  type="radio"
                  name="composable-depth"
                  :value="option"
                />
                {{ option }}
              </label>
            </div>
          </fieldset>
          <div class="step__slot">
            <!-- runner 用按鈕文字找按鈕：DOM 文字維持「Build Chain」，畫面上的 01 標籤由 CSS 產生 -->
            <button
              type="button"
              class="step__action step__action--build"
              @click="buildChain(selectedDepth, true)"
            >
              <span class="step__legacy">Build Chain</span>
            </button>
          </div>
        </div>

        <div
          class="step step--update"
          :class="{ 'is-locked': lockReason, 'is-armed': reactorStatus === 'ready' }"
        >
          <h3>PHASE 02 // RUNTIME INTENSITY INJECTION</h3>
          <p id="update-step-note" class="step__note">
            <template v-if="lockReason === 'uninstantiated'">
              先執行 <strong>01</strong> 建立 Composable Chain，02 才會解鎖。
            </template>
            <template v-else-if="lockReason === 'depth-mismatch'">
              目前畫面上的 chain 是用 Depth {{ builtDepth }} 建立的。選了新的 Depth
              {{ selectedDepth }} 後要重新執行 <strong>01</strong> 才會真正重建。
            </template>
            <template v-else>Chain 已就緒：每按一次注入一次 source 變更，可連續觸發。</template>
          </p>
          <div class="step__slot">
            <span v-if="lockReason" class="step__lock" aria-hidden="true">
              [ LOCKED: REQUIRES INSTANTIATION ]
            </span>
            <!-- DOM 文字維持「Trigger Update」，畫面上的 02 標籤由 CSS 產生 -->
            <button
              type="button"
              class="step__action step__action--update"
              :disabled="lockReason !== null"
              aria-describedby="update-step-note"
              @click="triggerUpdate"
            >
              <span class="step__legacy">Trigger Update</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>

      <!-- CDP runner 依序讀兩個 .metric-group，用 dt 的第一個文字節點找 dd，結構與標籤文字不可改 -->
      <div class="metric-group metric-group--build">
        <h3>1. Build Phase（建立 Composable Chain，混合初始 Reactive 建立與首次 Render）</h3>
        <dl>
          <dt>
            Built Depth
            <small>當前實驗鏈的抽象深度（useLayerN 巢狀呼叫層數）</small>
          </dt>
          <dd>{{ builtDepth ?? '-' }}</dd>
          <dt>
            Composable Instance Count
            <small>累積呼叫的 Composable 函式總次數（等於 Depth N）</small>
          </dt>
          <dd>{{ metrics.counters.composableInstanceCount }}</dd>
          <dt>
            Computed Count
            <small>實驗鏈中建立的 computed 響應式單元總數（N-1 個）</small>
          </dt>
          <dd>{{ metrics.counters.computedCount }}</dd>
          <dt>
            Watch Count
            <small>實驗鏈中建立的 watch 監聽器總數（固定 1 個，掛在頂層）</small>
          </dt>
          <dd>{{ metrics.counters.watchCount }}</dd>
          <dt>
            WatchEffect Count
            <small>實驗鏈中建立的 watchEffect 監聽器總數（固定 1 個，掛在頂層）</small>
          </dt>
          <dd>{{ metrics.counters.watchEffectCount }}</dd>
          <dt>
            Build Duration
            <small>建立整條 Composable Chain 與首次 DOM Render 的總耗時</small>
          </dt>
          <!-- runner 依賴這格先變回 '-' 再寫入數值來判斷 build 完成，格式不可改 -->
          <dd class="metric-group__key">
            {{ buildDuration !== null ? `${buildDuration.toFixed(3)} ms` : '-' }}
          </dd>
        </dl>
      </div>

      <div class="metric-group metric-group--update">
        <h3>2. Update Phase（觸發既有 chain 的 Reactive 更新）</h3>
        <p class="reactor" :class="`reactor--${reactorStatus}`" role="status">
          <span class="reactor__lamp" aria-hidden="true" />
          <template v-if="reactorStatus === 'standby'">
            [ REACTOR STATUS: STANDBY - AWAITING BURST INJECTION ]
          </template>
          <template v-else-if="reactorStatus === 'ready'">
            [ READY: CHAIN COUPLING COMPLETE ]
          </template>
          <template v-else>[ LIVE: INJECTION METRICS ACCUMULATING ]</template>
        </p>
        <dl>
          <dt>
            Total Update Count
            <small>點擊 Trigger Update 觸發狀態變更的累積總次數</small>
          </dt>
          <dd>{{ metrics.duration.totalUpdateCount }}</dd>
          <dt>
            Average Update Duration
            <small>每次更新從 source 變更到 nextTick 完成的平均耗時</small>
          </dt>
          <!-- textContent 必須維持「0.000 ms」（無前後空白），不要讓 Prettier 換行 -->
          <!-- prettier-ignore -->
          <dd class="metric-group__key">{{ metrics.duration.averageUpdateDuration.toFixed(3) }} ms</dd>
          <dt>
            Computed Execute Count
            <small>每次更新觸發時，整條鏈中 computed 重新計算的累積次數</small>
          </dt>
          <dd>{{ metrics.counters.computedExecuteCount }}</dd>
          <dt>
            Watch Trigger Count
            <small>底層更新引發最外層 watch 被觸發執行的累積次數</small>
          </dt>
          <dd>{{ metrics.counters.watchTriggerCount }}</dd>
          <dt>
            WatchEffect Trigger Count
            <small>底層更新引發最外層 watchEffect 被觸發執行的累積次數</small>
          </dt>
          <dd>{{ metrics.counters.watchEffectTriggerCount }}</dd>
          <dt>
            Render Count
            <small>響應式更新引發 Vue Component 畫面重新渲染的累積次數</small>
          </dt>
          <dd>{{ metrics.counters.renderCount }}</dd>
        </dl>
      </div>
    </section>

    <section class="output">
      <h2>[ SYS_CORE_OUTPUT_STABILITY ]</h2>
      <div class="output__bar">
        <span class="output__label">Chain Final Output Value</span>
        <span class="output__value">{{ finalValue ?? '-' }}</span>
      </div>
      <p class="output__desc">
        整條 Composable Chain 最頂層（第 {{ builtDepth ?? selectedDepth }} 層）Composable
        產出的最終響應式數值。執行 02 時，底層 <code>source</code> ref 變更並沿著 N 層 computed
        鏈傳遞，可由此確認 Reactive 更新已正確抵達最外層。
      </p>
    </section>
  </article>
</template>

<style scoped>
/*
 * Hardcore Dark Lab（規範見 DESIGN.md）。這頁是 benchmark：
 * - 不動 CDP runner 依賴的 DOM：depth radio 的 name / value、「Build Chain」「Trigger Update」按鈕文字、
 *   兩個 .metric-group 內 dt 的第一個文字節點、Build Duration 的 '-' → 數值轉換。
 * - 常駐動畫只有 READY 狀態（build 後、第一次 update 前）的燈號與 02 光暈，都只動 opacity。
 */
.chaos-lab {
  display: grid;
  gap: 2rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

.chaos-lab code {
  font-family: var(--lab-font-mono);
  font-size: 0.9em;
  color: var(--lab-text-silver);
}

/* ---- 標題 ---- */

.chaos-lab__head h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.chaos-lab__head p {
  margin: 0.625rem 0 0;
  font-family: var(--lab-font-sans);
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

/* ---- 區段標題：標籤 + 延伸到右側的髮絲線 ---- */

.chaos-lab h2 {
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

.chaos-lab h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- 兩階段順序面板 ---- */

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

/* 01 → 02 的順序箭頭，畫在兩個面板中間的 gap 裡 */
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

/* Depth 切換矩陣：原生 radio 保留在 DOM 負責鍵盤與螢幕閱讀器，外觀由 label 呈現 */
.depth {
  margin: 0;
  padding: 1rem 1rem 0;
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

.step__note strong {
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

.step__slot {
  position: relative;
  margin-top: auto;
  padding: 1.25rem 1rem 1rem;
}

/* 按鈕：DOM 文字是 runner 用的舊名稱（視覺隱藏），畫面上的標籤由 ::before 產生 */
.step__action {
  position: relative;
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
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-out),
    box-shadow 150ms var(--lab-ease-out);
}

.step__action::before {
  text-wrap: balance;
}

.step__action--build::before {
  content: '[ 01 // INITIALIZE LAYER CHAIN ]';
}

.step__action--update::before {
  content: '[ 02 // INJECT STATE UPDATE ]';
}

.step__legacy {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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

/* 02 鎖定：暗紅框、文字壓暗、不可點 */
.step__action:disabled {
  border-color: var(--lab-lock);
  background: transparent;
  color: var(--lab-text-muted);
  cursor: not-allowed;
}

/* 鎖定標籤騎在按鈕上框線上 */
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

/* 02 剛解鎖（READY）：霓虹橘光暈呼吸，引導點擊；第一次 update 後停止 */
.step--update.is-armed .step__action::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  box-shadow:
    0 0 0 1px var(--lab-warn),
    0 0 22px color-mix(in srgb, var(--lab-warn) 45%, transparent);
  pointer-events: none;
  animation: armed-glow 1.4s ease-in-out infinite;
}

@keyframes armed-glow {
  50% {
    opacity: 0.15;
  }
}

/* ---- Runtime Metrics ---- */

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

  position: relative;
  border: 1px solid var(--lab-hairline);
  border-top-color: color-mix(in srgb, var(--phase) 40%, transparent);
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
  margin: 0;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.5;
  color: var(--phase);
}

/* dt、dd 等高（stretch），分隔線才會在同一條水平線上 */
.metric-group dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
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
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-right: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--lab-text-silver);
}

.metric-group dt small {
  font-family: var(--lab-font-sans);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--lab-text-muted);
}

.metric-group dd {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  white-space: nowrap;
  color: var(--lab-text);
}

.metric-group dd.metric-group__key {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--phase);
  text-shadow: 0 0 18px color-mix(in srgb, var(--phase) 30%, transparent);
}

/* ---- Reactor 狀態條 ---- */

.reactor {
  --lamp: var(--lab-text-muted);

  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 0.875rem 1rem 0;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.5;
  color: var(--lab-text-muted);
}

.reactor__lamp {
  flex: none;
  width: 8px;
  height: 8px;
  border: 1px solid var(--lamp);
}

.reactor--ready {
  --lamp: var(--lab-warn);

  border-color: color-mix(in srgb, var(--lab-warn) 35%, transparent);
  color: var(--lab-warn);
}

.reactor--ready .reactor__lamp,
.reactor--live .reactor__lamp {
  background: var(--lamp);
  box-shadow: 0 0 8px color-mix(in srgb, var(--lamp) 70%, transparent);
}

.reactor--ready .reactor__lamp {
  animation: armed-glow 1.4s ease-in-out infinite;
}

.reactor--live {
  --lamp: var(--lab-warn);

  color: var(--lab-text-silver);
}

/* ---- [ SYS_CORE_OUTPUT_STABILITY ]：底部輸出驗證列 ---- */

.output h2 {
  margin-bottom: 0.5rem;
  text-transform: none;
}

.output__bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
}

.output__label {
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  color: var(--lab-text-muted);
}

.output__value {
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-signal);
}

.output__desc {
  margin: 0.5rem 0 0;
  font-family: var(--lab-font-sans);
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

/* ---- 窄螢幕 ---- */

@media (max-width: 860px) {
  .metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .sequence {
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }

  /* 上下堆疊時箭頭改成朝下，畫在兩個面板之間 */
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

  .metric-group dd {
    font-size: 1.125rem;
  }

  .step__action {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }

  .metric-group dd.metric-group__key {
    font-size: 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step--update.is-armed .step__action::after,
  .reactor--ready .reactor__lamp {
    animation: none;
  }

  .depth__option,
  .step__action {
    transition: none;
  }
}
</style>
