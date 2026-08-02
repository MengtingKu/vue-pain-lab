import type { InjectionKey } from 'vue'

/**
 * Parent 提供給每個 Child 的回報管道：Child 在 onUpdated 時呼叫，
 * Parent 藉此統計「這次 triggerUpdate 實際造成幾個 Child re-render」（Updated Component Count）。
 */
export const REPORT_CHILD_RENDER_KEY: InjectionKey<(id: number) => void> = Symbol(
  'component-storm:report-child-render',
)
