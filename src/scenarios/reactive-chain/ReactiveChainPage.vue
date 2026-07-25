<script setup lang="ts">
import { onMounted, onUnmounted, onUpdated } from 'vue'
import { createMetricsStore } from '@/benchmarks/reactive/metrics'
import { createReactiveChain } from '@/benchmarks/reactive/createReactiveChain'
import { log } from '@/benchmarks/reactive/logger'

// ------------------------------------------------
// Lab Parameters — 改這裡即可重新量測，不用改其他程式碼
// ------------------------------------------------
const DEPTH = 5
const UPDATE_INTERVAL = 500
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
      <dl>
        <dt>Dependency Depth</dt>
        <dd>{{ DEPTH }}</dd>
        <dt>Render Count</dt>
        <dd>{{ metrics.counters.renderCount }}</dd>
        <dt>Computed Execute Count</dt>
        <dd>{{ metrics.counters.computedExecuteCount }}</dd>
        <dt>Watch Trigger Count</dt>
        <dd>{{ metrics.counters.watchTriggerCount }}</dd>
        <dt>WatchEffect Trigger Count</dt>
        <dd>{{ metrics.counters.watchEffectTriggerCount }}</dd>
        <dt>Total Update Count</dt>
        <dd>{{ metrics.duration.totalUpdateCount }}</dd>
        <dt>Average Update Duration</dt>
        <dd>{{ metrics.duration.averageUpdateDuration.toFixed(3) }} ms</dd>
        <dt>Total Execution Time</dt>
        <dd>{{ metrics.duration.totalExecutionTime.toFixed(3) }} ms</dd>
      </dl>
    </section>

    <section>
      <h2>Final Value</h2>
      <p>{{ finalValue }}</p>
    </section>
  </article>
</template>

<style scoped>
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
}
</style>
