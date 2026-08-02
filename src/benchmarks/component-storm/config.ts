/**
 * 實驗參數集中管理處。
 * 包含 componentCount（100 / 500 / 1000）、updateScope（ParentOnly | SingleChild | AllChildren）、autoUpdate 與更新間隔。
後續進行 Vue 3.5 / 3.6 版本效能比對時，只需調整此檔案，無需動到任何頁面或元件程式碼。
 */
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
