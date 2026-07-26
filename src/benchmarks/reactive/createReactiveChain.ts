import { ref, computed, watch, watchEffect, nextTick, type Ref, type ComputedRef } from 'vue'
import { log } from './logger'
import type { MetricsStore } from './metrics'

export type ReactiveChainCounterName =
  | 'computedExecuteCount'
  | 'watchTriggerCount'
  | 'watchEffectTriggerCount'
  | 'renderCount'

export interface ReactiveChain {
  source: Ref<number>
  computedChain: ComputedRef<number>[]
  finalValue: ComputedRef<number>
  triggerUpdate: () => Promise<void>
  dispose: () => void
}

/**
 * 建立 Reactive Chain Generator
 * source ref -> computed1 -> computed2 -> ... -> computedN -> watch + watchEffect
 * depth 必須 >= 1
 */
export function createReactiveChain(
  depth: number,
  metrics: MetricsStore<ReactiveChainCounterName>,
): ReactiveChain {
  // 起始點：一個 ref
  const source = ref(0)

  // 鏈條本體：一個 computed 陣列
  const computedChain: ComputedRef<number>[] = []

  // 目前循環的上一層是誰，再藉由 for 迴圈每跑一次就建立一個 computed
  let previous: Ref<number> | ComputedRef<number> = source
  for (let i = 1; i <= depth; i++) {
    const step = i
    const upstream = previous
    const current: ComputedRef<number> = computed(() => {
      const value = upstream.value + 1
      metrics.increment('computedExecuteCount')
      log(`computed${step} executed`)

      return value
    })
    computedChain.push(current)
    previous = current
  }

  // 最終結果：取最後一個 computed
  const finalValue = computedChain[computedChain.length - 1]
  if (!finalValue) {
    throw new Error('createReactiveChain requires depth >= 1')
  }

  // 監控點：watch + watchEffect
  const stopWatch = watch(finalValue, () => {
    metrics.increment('watchTriggerCount')
    log('watch triggered')
  })

  const stopWatchEffect = watchEffect(() => {
    void finalValue.value
    metrics.increment('watchEffectTriggerCount')
    log('watchEffect triggered')
  })

  // 整個實驗真正開始的地方，也就是第一張骨牌倒下等待 Vue 完成 Reactive → Scheduler → Render，最後透過 performance.now() 得到一次完整更新成本
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

  return { source, computedChain, finalValue, triggerUpdate, dispose }
}
