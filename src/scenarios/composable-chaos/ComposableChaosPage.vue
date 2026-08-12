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

const metrics = shallowRef(createMetricsStore<ComposableChaosCounterName>(COUNTER_NAMES))
const chain = shallowRef<ComposableChain | null>(null)

const finalValue = computed(() => chain.value?.finalValue.value ?? null)

// Build（= 用巢狀 composable call 建立整條 chain）量測，跟下面的 triggerUpdate() 各自獨立：
// Build Duration 混合了「N 層 function call + reactive primitive 初始化 + 首次 render」，
// 不是單純的 Composable Abstraction Cost，見 README「What This Scenario Does NOT Measure」
const buildStartTime = ref<number | null>(null)
const buildEndTime = ref<number | null>(null)
const buildDuration = ref<number | null>(null)

async function buildChain(depth: number): Promise<void> {
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
  log(`chain built at depth ${depth}`)
}

async function triggerUpdate(): Promise<void> {
  await chain.value?.triggerUpdate()
}

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
  <article>
    <h1>Composable Chaos</h1>
    <p>
      Runtime Benchmark：驗證 Composable Abstraction Depth（巢狀 <code>useLayerN()</code>
      呼叫層數）增加時，是否伴隨額外的 Reactive Runtime Cost。DOM 結構與 Component
      數量全程固定，唯一變動的是 composable 呼叫的巢狀深度，以及隨之建立的 reactive unit 數量。
    </p>

    <section class="params">
      <h2>Lab Parameters</h2>
      <div class="params__options">
        <label v-for="option in DEPTH_OPTIONS" :key="option" class="params__option">
          <input v-model="selectedDepth" type="radio" name="composable-depth" :value="option" />
          {{ option }}
        </label>
      </div>
      <div class="params__actions">
        <button type="button" @click="buildChain(selectedDepth)">Build Chain</button>
        <button type="button" :disabled="!chain" @click="triggerUpdate">Trigger Update</button>
      </div>
      <p v-if="builtDepth !== null && builtDepth !== selectedDepth" class="hint-box">
        💡 目前畫面上的 chain 是用 Depth {{ builtDepth }} 建立的。選了新的 Depth
        {{ selectedDepth }} 後要點 <strong>Build Chain</strong> 才會真正重建。
      </p>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>

      <div class="metric-group">
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
          <dd>{{ buildDuration !== null ? `${buildDuration.toFixed(3)} ms` : '-' }}</dd>
        </dl>
      </div>

      <div class="metric-group">
        <h3>2. Update Phase（觸發既有 chain 的 Reactive 更新）</h3>
        <div v-if="metrics.duration.totalUpdateCount === 0" class="hint-box">
          💡 尚未觸發 Update。點擊 <strong>Trigger Update</strong> 按鈕即可開始紀錄。
        </div>
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
          <dd>{{ metrics.duration.averageUpdateDuration.toFixed(3) }} ms</dd>
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

    <section class="final-value-section">
      <h2>Final Value（最上層 Composable 計算結果）</h2>
      <p class="final-value-desc">
        代表整條 Composable Chain 最頂層（第 {{ builtDepth ?? selectedDepth }} 層）Composable
        產出的最終響應式數值。點擊 <strong>Trigger Update</strong> 時，底層 <code>source</code> ref
        變更並沿著 N 層 computed 鏈傳遞，可由此確認 Reactive 更新已正確抵達最外層。
      </p>
      <div class="final-value-card">
        <span class="final-value-card__label">Chain Final Output Value:</span>
        <span class="final-value-card__number">{{ finalValue ?? '-' }}</span>
      </div>
    </section>
  </article>
</template>

<style scoped>
.params__options {
  display: flex;
  gap: 1rem;
  margin: 0.5rem 0 1rem;
}

.params__option {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}

.params__actions {
  display: flex;
  gap: 0.5rem;
}

.metric-group {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.metric-group h3 {
  margin-top: 0;
  font-size: 1rem;
  color: #334155;
}

.hint-box {
  margin: 0.5rem 0;
  padding: 0.5rem 0.75rem;
  background-color: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-size: 0.875rem;
}

dl {
  display: grid;
  grid-template-columns: minmax(280px, max-content) 1fr;
  gap: 0.75rem 1.5rem;
  align-items: center;
  margin: 0.75rem 0 1rem;
}

dt {
  display: flex;
  flex-direction: column;
  color: #576b86;
  font-weight: 600;
  font-size: 0.925rem;
}

dt small {
  color: #64748b;
  font-size: 0.775rem;
  font-weight: normal;
  margin-top: 0.15rem;
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 1rem;
  color: #0f172a;
}

.final-value-section {
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.final-value-desc {
  margin: 0.5rem 0 1rem;
  color: #475569;
  font-size: 0.875rem;
  line-height: 1.5;
}

.final-value-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background-color: #ffffff;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
}

.final-value-card__label {
  color: #64748b;
  font-size: 0.875rem;
}

.final-value-card__number {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
</style>
