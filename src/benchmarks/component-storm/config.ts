export type UpdateScope = 'ParentOnly' | 'SingleChild' | 'AllChildren'

export interface ComponentStormConfig {
  componentCount: number
  updateScope: UpdateScope
  autoUpdate: boolean
  updateInterval: number
}

// ------------------------------------------------
// Lab Parameters — 改這裡即可重新量測，不用改其他程式碼
// ------------------------------------------------
export const componentStormConfig: ComponentStormConfig = {
  componentCount: 500,
  updateScope: 'AllChildren',
  autoUpdate: false,
  updateInterval: 1000,
}
