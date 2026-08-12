import { ref, computed, watch, watchEffect, nextTick, type Ref, type ComputedRef } from 'vue'
import { log } from '@/benchmarks/reactive/logger'
import type { MetricsStore } from '@/benchmarks/reactive/metrics'

export type ComposableChaosCounterName =
  // 建立階段（structural）：這一輪 chain 建立時，實際建立了幾個 instance / primitive。
  // 這幾個數字只在 build 當下 increment，不會因為之後 triggerUpdate 而變動。
  | 'composableInstanceCount'
  | 'computedCount'
  | 'watchCount'
  | 'watchEffectCount'
  // 執行階段（execution）：reactive primitive 實際「跑了幾次」，跟 reactive-chain 的
  // computedExecuteCount / watchTriggerCount / watchEffectTriggerCount 是同一種指標，
  // 用來跟 reactive-chain（迴圈建立、非 composable 呼叫）比較 Reactive Runtime Cost。
  | 'computedExecuteCount'
  | 'watchTriggerCount'
  | 'watchEffectTriggerCount'
  // component 自己重新 render 了幾次，用來確認「Reactive 更新」有沒有真的造成畫面 re-render
  | 'renderCount'

export const MAX_DEPTH = 20

interface LayerResult {
  /** 整條 chain 最底層的 ref，只在 useLayer1 建立一次，一路往上傳遞，不會被複製 */
  source: Ref<number>
  /** 這一層自己的值：layer 1 是 source 本身，layer 2 以上是 computed */
  value: Ref<number> | ComputedRef<number>
}

/**
 * 最底層 composable：建立整條 chain 唯一的 ref（reactive 起點）。
 * 呼叫這個函式本身就是一次 composable instance（一次真正的 function call），
 * 因此連 depth = 1 都會讓 composableInstanceCount 是 1，而不是 0。
 */
function useLayer1(metrics: MetricsStore<ComposableChaosCounterName>): LayerResult {
  metrics.increment('composableInstanceCount')
  const value = ref(0)
  return { source: value, value }
}

/**
 * useLayerN() 呼叫 useLayer(N-1)()，一路遞迴到 useLayer1()。
 * 每一層恰好建立 1 個 reactive unit：
 *   layer 1 → 1 個 ref
 *   layer 2 以上 → 1 個 computed（以上一層的值 + 1 為值）
 * 所以 depth 層 chain 會有 depth 個 reactive unit，跟研究假設一致：
 * Composable Depth 本身只是「呼叫了幾層 function」，不直接等於 Reactive Runtime Cost，
 * 但這一版刻意讓兩者以 1:1 對應建立起來，是為了跟 reactive-chain（同樣 depth、
 * 但用 for 迴圈而非巢狀 composable 呼叫建出相同的 computed chain）做對照：
 * 如果兩份 scenario 在相同 depth 下的 Update Duration / computedExecuteCount 相近，
 * 代表「多包了 N 層 composable function call」本身不是主要成本；
 * 如果 composable-chaos 明顯比 reactive-chain 慢，才有證據指向 Composable Abstraction 本身的額外成本
 * （例如多出來的 call stack frame、closure 建立）。
 */
function useLayerN(depth: number, metrics: MetricsStore<ComposableChaosCounterName>): LayerResult {
  if (depth <= 1) {
    return useLayer1(metrics)
  }

  metrics.increment('composableInstanceCount')
  const upstream = useLayerN(depth - 1, metrics)

  metrics.increment('computedCount')
  const value = computed(() => {
    const next = upstream.value.value + 1
    metrics.increment('computedExecuteCount')
    log(`layer${depth} computed executed`)
    return next
  })

  return { source: upstream.source, value }
}

export interface ComposableChain {
  depth: number
  /** chain 最底層的 ref，triggerUpdate() 只會動這一個值 */
  source: Ref<number>
  /** chain 最上層（第 depth 層）的值，depth === 1 時跟 source 是同一個 ref */
  finalValue: Ref<number> | ComputedRef<number>
  triggerUpdate: () => Promise<void>
  dispose: () => void
}

/**
 * 建立一條 depth 層的 composable chain，並在最上層（跟 depth 無關，固定只加一次）
 * 掛上 1 個 watch + 1 個 watchEffect。
 *
 * watch / watchEffect 刻意不隨 depth 增加而增加：這個 scenario 要驗證的是
 * 「composable 疊越深，watcher 是不是也會跟著變多」——答案在這個實作裡是否定的，
 * 因為 watcher 只掛在最外層一次，不是每層 useLayerN 各自掛一個。
 */
export function createComposableChain(
  depth: number,
  metrics: MetricsStore<ComposableChaosCounterName>,
): ComposableChain {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) {
    throw new Error(`createComposableChain requires 1 <= depth <= ${MAX_DEPTH}`)
  }

  const { source, value: finalValue } = useLayerN(depth, metrics)

  metrics.increment('watchCount')
  const stopWatch = watch(finalValue, () => {
    metrics.increment('watchTriggerCount')
    log('watch triggered')
  })

  metrics.increment('watchEffectCount')
  const stopWatchEffect = watchEffect(() => {
    void finalValue.value
    metrics.increment('watchEffectTriggerCount')
    log('watchEffect triggered')
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
