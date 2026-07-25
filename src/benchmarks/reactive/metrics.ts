import { reactive } from 'vue'

export interface DurationStats {
  totalUpdateCount: number
  totalExecutionTime: number
  averageUpdateDuration: number
}

/**
 * 建立 metrics store，Lab 的量測儀器，不是 Reactive，也不是 Component 專門負責「收集證據」
 * - counters 刻意不是 reactive。它們會在 computed / watch / watchEffect /
 *   onUpdated 執行過程中被 increment，如果同時是 reactive 又被 template 讀取，
 *   會變成同一輪 render 觸發自己的無限遞迴（Vue 會丟出 Maximum recursive updates exceeded）。
 *   template 仍會顯示最新數值，因為每次 triggerUpdate 都會透過 finalValue / duration 觸發真正的 re-render。
 * - duration 是一個 reactive object，代表的是單次 update 的各項指標。
 *
 * @param counterNames - counter 名稱
 * @returns metrics store
 */
export function createMetricsStore<TCounterName extends string>(
  counterNames: readonly TCounterName[],
) {
  // counters 刻意不是 reactive。它們會在 computed / watch / watchEffect / onUpdated 執行過程中被 increment，
  // 如果同時是 reactive 又被 template 讀取，會變成同一輪 render 觸發自己的無限遞迴 computed++ → template → render → computed++ → render
  // （Vue 會丟出 Maximum recursive updates exceeded）
  // 因此 counter 故意只是普通 Object => { computedExecuteCount: 5, renderCount: 0, watchEffectTriggerCount: 1, watchTriggerCount: 0 }
  const counters = Object.fromEntries(counterNames.map((name) => [name, 0])) as Record<
    TCounterName,
    number
  >

  // duration 因為畫面需要即時更新，所以必須 reactive
  const duration = reactive<DurationStats>({
    totalUpdateCount: 0,
    totalExecutionTime: 0,
    averageUpdateDuration: 0,
  })

  function increment(name: TCounterName): void {
    counters[name]++
  }
  // 負責統計總次數、總時間、平均時間，所以 Reactive Chain 不用知道怎麼算平均，交給 recordUpdateDuration()
  function recordUpdateDuration(durationMs: number): void {
    duration.totalUpdateCount++
    duration.totalExecutionTime += durationMs
    duration.averageUpdateDuration = duration.totalExecutionTime / duration.totalUpdateCount
  }

  return { counters, duration, increment, recordUpdateDuration }
}

export type MetricsStore<TCounterName extends string = string> = ReturnType<
  typeof createMetricsStore<TCounterName>
>
