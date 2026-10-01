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

  // 切換 UPDATE_SCOPE 時歸零，避免不同 Scope 的 update 混進同一個平均值。
  // Mount Time 只在掛載時發生一次，不歸零。
  function resetUpdateMetrics(): void {
    counters.parentRenderCount = 0
    counters.childRenderCount = 0
    duration.totalUpdateCount = 0
    duration.totalExecutionTime = 0
    duration.averageUpdateDuration = 0
    duration.lastUpdatedComponentCount = 0
  }

  return {
    counters,
    duration,
    increment,
    recordMountTime,
    recordUpdateDuration,
    setUpdatedComponentCount,
    resetUpdateMetrics,
  }
}

export type ComponentStormMetrics = ReturnType<typeof createComponentStormMetrics>
