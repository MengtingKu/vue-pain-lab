import type { InjectionKey } from 'vue'

/**
 * 定義 REPORT_CHILD_RENDER_KEY (InjectionKey)。
 * Parent 提供給每個 Child 的回報管道：Parent 透過 provide 提供給 Child，
 * Child 在 onUpdated 時主動回報自己的 id，讓 Parent 能精準統計「這次 Update 實際上造成幾個 Child 重新渲染」。
 */
export const REPORT_CHILD_RENDER_KEY: InjectionKey<(id: number) => void> = Symbol(
  'component-storm:report-child-render',
)
