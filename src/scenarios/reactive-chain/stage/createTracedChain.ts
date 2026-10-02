import { computed, ref, watch, watchEffect, type ComputedRef, type Ref } from 'vue'

/**
 * Stage 頁專用的 Reactive Chain：結構與 benchmarks/reactive/createReactiveChain 相同
 * （source ref → computed1 → … → computedN → watch + watchEffect），
 * 差別是每個節點執行時呼叫 onTrace 回報「誰、在什麼時間、算出什麼值」，給 TTY 面板顯示。
 *
 * onTrace 會在 computed / watch 執行的當下被呼叫，接收端只能寫入非 reactive 的 buffer；
 * 若在這裡直接改 template 會讀到的 reactive 狀態，會在同一輪 flush 內觸發自己再次 render。
 */
export type TraceEvent =
  | { kind: 'computed'; step: number; value: number; time: number }
  | { kind: 'watch'; value: number; time: number }
  | { kind: 'watchEffect'; value: number; time: number }

export interface TracedChain {
  source: Ref<number>
  finalValue: ComputedRef<number>
  dispose: () => void
}

export function createTracedChain(
  depth: number,
  onTrace: (event: TraceEvent) => void,
): TracedChain {
  const source = ref(0)

  const computedChain: ComputedRef<number>[] = []
  for (let step = 1; step <= depth; step++) {
    const upstream: Ref<number> | ComputedRef<number> = computedChain[step - 2] ?? source
    computedChain.push(
      computed(() => {
        const value = upstream.value + 1
        onTrace({ kind: 'computed', step, value, time: performance.now() })
        return value
      }),
    )
  }

  const last = computedChain[computedChain.length - 1]
  if (!last) {
    throw new Error('createTracedChain requires depth >= 1')
  }

  const stopWatch = watch(last, (value) => {
    onTrace({ kind: 'watch', value, time: performance.now() })
  })

  const stopWatchEffect = watchEffect(() => {
    const value = last.value
    onTrace({ kind: 'watchEffect', value, time: performance.now() })
  })

  function dispose(): void {
    stopWatch()
    stopWatchEffect()
  }

  return { source, finalValue: last, dispose }
}
