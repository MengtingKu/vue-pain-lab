export interface ChildState {
  id: number
  value: number
  label: string
}

/**
 * 建立 COMPONENT_COUNT 個 Child 的初始狀態。
 * 所有 Child 的結構完全一致，差異只在 id / label，避免任何 Child 有特殊邏輯。
 */
export function createChildren(count: number): ChildState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    value: 0,
    label: `child-${index}`,
  }))
}
