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
  <article>
    <h1>Reactive Chain Generator</h1>
    <p>
      Runtime Benchmark：驗證不同 Reactive Dependency Depth 對 Update Cost 的影響。搭配 Chrome
      DevTools Performance 面板觀察每一層的 console.log。
    </p>

    <section class="params">
      <h2>Lab Parameters</h2>
      <dl>
        <dt>DEPTH</dt>
        <dd>{{ DEPTH }}</dd>
        <dt>UPDATE_INTERVAL</dt>
        <dd>{{ UPDATE_INTERVAL }} ms</dd>
        <dt>AUTO_UPDATE</dt>
        <dd>{{ AUTO_UPDATE }}</dd>
      </dl>
      <button v-if="!AUTO_UPDATE" type="button" @click="triggerUpdate">Trigger Update</button>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>

      <div class="metric-group">
        <h3>1. Initialization Phase (首航依賴建立)</h3>
        <dl>
          <dt>Dependency Depth</dt>
          <dd>{{ DEPTH }}</dd>
          <dt>Computed Execute Count</dt>
          <dd>{{ metrics.counters.computedExecuteCount }}</dd>
          <dt>WatchEffect Trigger Count</dt>
          <dd>{{ metrics.counters.watchEffectTriggerCount }}</dd>
        </dl>
      </div>

      <div class="metric-group">
        <h3>2. Runtime Update Phase (狀態變更更新效能)</h3>
        <div v-if="metrics.duration.totalUpdateCount === 0" class="hint-box">
          💡 尚未觸發動態更新。點擊 <strong>Trigger Update</strong> 按鈕即可開始紀錄更新時間與計數。
        </div>
        <dl>
          <dt>Total Update Count</dt>
          <dd>{{ metrics.duration.totalUpdateCount }}</dd>
          <dt>Average Update Duration</dt>
          <dd>{{ metrics.duration.averageUpdateDuration.toFixed(3) }} ms</dd>
          <dt>Total Execution Time</dt>
          <dd>{{ metrics.duration.totalExecutionTime.toFixed(3) }} ms</dd>
          <dt>Watch Trigger Count</dt>
          <dd>{{ metrics.counters.watchTriggerCount }}</dd>
          <dt>Render Count</dt>
          <dd>{{ metrics.counters.renderCount }}</dd>
        </dl>
      </div>
    </section>

    <section>
      <h2>Final Value</h2>
      <p>{{ finalValue }}</p>
    </section>
  </article>
</template>

<style scoped>
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
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0.5rem 0 1rem;
}

dt {
  color: #64748b;
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
