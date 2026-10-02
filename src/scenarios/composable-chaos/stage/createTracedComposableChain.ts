import { computed, nextTick, ref, watch, watchEffect, type ComputedRef, type Ref } from 'vue'
import type { MetricsStore } from '@/benchmarks/reactive/metrics'
import {
  MAX_DEPTH,
  type ComposableChain,
  type ComposableChaosCounterName,
} from '@/benchmarks/composable/createComposableChain'

/**
 * Stage 頁專用的 Composable Chain：結構與 benchmarks/composable/createComposableChain 相同
 * （巢狀 useLayerN() 呼叫，L1 是 source ref，L2 以上各一個 computed，頂層掛一個 watch + watchEffect），
 * metrics 的 increment 也一樣；差別是不呼叫 console.log，改成呼叫 onTrace 回報「哪一層、算出什麼值」，
 * 給 TTY 面板顯示。benchmark 的 chain 結構若有改動，這裡要同步。
 *
 * onTrace 會在 computed / watch 執行的當下被呼叫，接收端只能寫入非 reactive 的 buffer。
 */
export type ComposableTraceEvent =
  | { kind: 'computed'; layer: number; value: number; time: number }
  | { kind: 'watch'; value: number; time: number }
  | { kind: 'watchEffect'; value: number; time: number }

type Metrics = MetricsStore<ComposableChaosCounterName>
type Trace = (event: ComposableTraceEvent) => void

interface LayerResult {
  source: Ref<number>
  value: Ref<number> | ComputedRef<number>
}

function useLayer1(metrics: Metrics): LayerResult {
  metrics.increment('composableInstanceCount')
  const value = ref(0)
  return { source: value, value }
}

function useLayerN(depth: number, metrics: Metrics, onTrace: Trace): LayerResult {
  if (depth <= 1) {
    return useLayer1(metrics)
  }

  metrics.increment('composableInstanceCount')
  const upstream = useLayerN(depth - 1, metrics, onTrace)

  metrics.increment('computedCount')
  const value = computed(() => {
    const next = upstream.value.value + 1
    metrics.increment('computedExecuteCount')
    onTrace({ kind: 'computed', layer: depth, value: next, time: performance.now() })
    return next
  })

  return { source: upstream.source, value }
}

export function createTracedComposableChain(
  depth: number,
  metrics: Metrics,
  onTrace: Trace,
): ComposableChain {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) {
    throw new Error(`createTracedComposableChain requires 1 <= depth <= ${MAX_DEPTH}`)
  }

  const { source, value: finalValue } = useLayerN(depth, metrics, onTrace)

  metrics.increment('watchCount')
  const stopWatch = watch(finalValue, (value) => {
    metrics.increment('watchTriggerCount')
    onTrace({ kind: 'watch', value, time: performance.now() })
  })

  metrics.increment('watchEffectCount')
  const stopWatchEffect = watchEffect(() => {
    const value = finalValue.value
    metrics.increment('watchEffectTriggerCount')
    onTrace({ kind: 'watchEffect', value, time: performance.now() })
  })

  async function triggerUpdate(): Promise<void> {
    const start = performance.now()
    source.value++
    await nextTick()
    metrics.recordUpdateDuration(performance.now() - start)
  }

  function dispose(): void {
    stopWatch()
    stopWatchEffect()
  }

  return { depth, source, finalValue, triggerUpdate, dispose }
}
