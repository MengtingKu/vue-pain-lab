import { reactive } from 'vue'

export interface ComponentStormCounters {
  parentRenderCount: number
  childRenderCount: number
}

export interface ComponentStormDuration {
  mountTime: number
  totalUpdateCount: number
  totalExecutionTime: number
  averageUpdateDuration: number
  lastUpdatedComponentCount: number
}

/**
 * Component Storm 的效能指標儀表板量測儀器。
 * - counters 刻意不是 reactive：它們在 onUpdated 內被 increment，
 *   若同時是 reactive 又被 template 讀取，會造成同一輪 render 觸發自己的遞迴更新
 *   （原因同 src/benchmarks/reactive/metrics.ts 的 counters）。
 * - duration（Mount 時間、平均更新毫秒）是 reactive，因為畫面需要即時顯示 Mount Time / Update Duration / Updated Component Count。
 */
export function createComponentStormMetrics() {
  const counters: ComponentStormCounters = {
    parentRenderCount: 0,
    childRenderCount: 0,
  }

  const duration = reactive<ComponentStormDuration>({
    mountTime: 0,
    totalUpdateCount: 0,
    totalExecutionTime: 0,
    averageUpdateDuration: 0,
    lastUpdatedComponentCount: 0,
  })

  function increment(name: keyof ComponentStormCounters): void {
    counters[name]++
  }

  function recordMountTime(durationMs: number): void {
    duration.mountTime = durationMs
  }

  function recordUpdateDuration(durationMs: number): void {
    duration.totalUpdateCount++
    duration.totalExecutionTime += durationMs
    duration.averageUpdateDuration = duration.totalExecutionTime / duration.totalUpdateCount
  }

  function setUpdatedComponentCount(count: number): void {
    duration.lastUpdatedComponentCount = count
  }

  return {
    counters,
    duration,
    increment,
    recordMountTime,
    recordUpdateDuration,
    setUpdatedComponentCount,
  }
}

export type ComponentStormMetrics = ReturnType<typeof createComponentStormMetrics>
