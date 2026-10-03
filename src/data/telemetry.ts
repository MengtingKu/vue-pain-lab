/**
 * CDP 跨版本對比的資料來源：直接讀 `results/cdp-trace/validation/*-analysis.json`
 * （scripts/cdp-trace/analyze-*.ts 的輸出），不另外維護一份數字。
 *
 * - 一個 analysis 檔 = 一個 dataset（一個 scenario 的一次驗證）。版本清單從檔內 comparisons 的
 *   a / b 標籤取出，之後新版本只要重跑 analyze 產出新檔，這裡與 UI 都不用改。
 * - 版本的 median / IQR 取自 cells 內的分布；signal 只在原始分析「真的比過這一對」時才有，
 *   這裡不自己重算判定。
 * - 不依賴 Vue；只依賴 Vite 的 import.meta.glob 做 lazy 載入（每個檔數百 KB，進頁面才抓）。
 */

export interface Distribution {
  n: number
  median: number
  p25: number
  p75: number
  min: number
  max: number
}

export type Signal =
  | 'Consistent Improvement'
  | 'Consistent Regression'
  | 'Stable / No Meaningful Difference'
  | 'Unstable'

interface RawCell {
  metric: string
  operation: string
  nodeCount: number
  a: Distribution
  b: Distribution
  signal: Signal
}

interface RawComparison {
  id: string
  a: string
  b: string
  cells: RawCell[]
}

interface RawAnalysis {
  generatedAt: string
  browserVersions?: Record<string, string[]>
  comparisons: RawComparison[]
}

export interface VersionInfo {
  label: string
  /** 標籤上的 `-runN`；沒有的是之前 Freeze Point 留下的 baseline */
  run: string | null
  browsers: string[]
  /** 同一次量測批次的判斷依據：run 標記 + Chrome 版本都相同 */
  batch: string
}

interface VersionCell {
  metric: string
  operation: string
  nodeCount: number
  dist: Distribution
}

export interface Dataset {
  id: string
  generatedAt: string
  versions: VersionInfo[]
  comparisons: RawComparison[]
  cellsByVersion: Map<string, VersionCell[]>
}

export interface CompareRow {
  metric: string
  operation: string
  nodeCount: number
  a: Distribution
  b: Distribution
  /** (B − A) / A；A 的中位數為 0 時無法計算 */
  deltaPct: number | null
  /** 原始分析沒比過這一對時為 null */
  signal: Signal | null
}

export interface CompareResult {
  sameRun: boolean
  rows: CompareRow[]
}

/*
 * 只收 `<scenario>-runN-analysis.json`：analyze 腳本現行的輸出命名。
 * - 舊格式的 matrix-analysis.json（3.5.40 vs 3.6.0-rc.2，頂層是陣列）沒有 -runN，自然不列入
 * - 檔名帶 INVALID 的是已知無效的量測（例如筆電用電池跑），明確排除
 * 兩者都在 glob 階段排除，不會被打包。
 */
const loaders = Object.fromEntries(
  Object.entries(
    import.meta.glob<unknown>(
      ['/results/cdp-trace/validation/*-run*-analysis.json', '!**/*INVALID*'],
      { import: 'default' },
    ),
  )
    .map(
      ([path, load]) => [path.replace(/^.*\//, '').replace(/-analysis\.json$/, ''), load] as const,
    )
    .filter(([id]) => /-run\d+$/.test(id)),
)

/**
 * 場景關鍵字 → 場景名稱，以檔名開頭比對，不綁版本號：
 * component-storm-vapor-run1、component-storm-rc10-run1 都是 Component Storm Test。
 * VDOM Stress 的 analyze 腳本沿用 Day 29 的檔名（day29-final-rc9-…），所以多一個 day29-final 別名。
 * 名稱只寫場景，不寫版本或對比關係：一份檔案內有多個版本，比哪兩個由頁面上的 A / B 選單決定。
 */
const SCENARIOS: ReadonlyArray<{ keywords: readonly string[]; title: string }> = [
  { keywords: ['vdom-stress', 'day29-final'], title: 'VDOM Stress Test' },
  { keywords: ['component-storm'], title: 'Component Storm Test' },
  { keywords: ['composable-chaos'], title: 'Composable Chaos Test' },
  { keywords: ['reactive-chain'], title: 'Reactive Chain Test' },
]

export interface DatasetOption {
  id: string
  /** 「場景名稱 - Run N」 */
  title: string
}

/** 不認得的場景：kebab-case 前綴轉成 Title Case 顯示，選單不會漏掉新檔 */
function humanize(prefix: string): string {
  return prefix.replace(
    /(^|-)([a-z])/g,
    (_, dash: string, ch: string) => (dash ? ' ' : '') + ch.toUpperCase(),
  )
}

function datasetTitle(id: string): string {
  const match = /^(.*)-run(\d+)$/.exec(id)
  if (!match) return id
  const [, prefix = id, run] = match
  const scenario = SCENARIOS.find((s) =>
    s.keywords.some((k) => prefix === k || prefix.startsWith(`${k}-`)),
  )
  return `${scenario?.title ?? humanize(prefix)} - Run ${run}`
}

export function listDatasets(): DatasetOption[] {
  return Object.keys(loaders)
    .map((id) => ({ id, title: datasetTitle(id) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
}

function isAnalysis(raw: unknown): raw is RawAnalysis {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { comparisons?: unknown }).comparisons)
  )
}

/** 格式不符或沒有任何 comparison 時回傳 null（頁面會把它從選單移除） */
export async function loadDataset(id: string): Promise<Dataset | null> {
  const load = loaders[id]
  if (!load) return null
  const raw = await load()
  if (!isAnalysis(raw) || raw.comparisons.length === 0) return null

  const versions = new Map<string, VersionInfo>()
  const cellsByVersion = new Map<string, VersionCell[]>()
  const seen = new Set<string>()

  for (const comparison of raw.comparisons) {
    for (const side of ['a', 'b'] as const) {
      const label = comparison[side]
      if (!versions.has(label)) {
        const run = /-(run\d+)$/.exec(label)?.[1] ?? null
        const browsers = raw.browserVersions?.[label] ?? []
        versions.set(label, {
          label,
          run,
          browsers,
          batch: `${run ?? 'baseline'}|${browsers.join(',')}`,
        })
        cellsByVersion.set(label, [])
      }
      // 同一個版本出現在多組 comparison 時分布相同，只取第一次
      for (const cell of comparison.cells) {
        const key = `${label}|${cell.metric}|${cell.operation}|${cell.nodeCount}`
        if (seen.has(key)) continue
        seen.add(key)
        cellsByVersion.get(label)?.push({
          metric: cell.metric,
          operation: cell.operation,
          nodeCount: cell.nodeCount,
          dist: cell[side],
        })
      }
    }
  }

  return {
    id,
    generatedAt: raw.generatedAt,
    versions: [...versions.values()],
    comparisons: raw.comparisons,
    cellsByVersion,
  }
}

/** 頁面上要對比的主指標：各 scenario 自己量的耗時（Render / Update / Instrumentation Duration、Mount Time），不含 trace 的 CPU 分類 */
function isDurationMetric(metric: string): boolean {
  return metric.endsWith('Duration') || metric === 'Mount Time'
}

/** 原始分析裡 signal 的方向是「B 相對 A」；反過來選時 Improvement / Regression 要對調 */
function findSignal(
  dataset: Dataset,
  a: string,
  b: string,
  cell: Pick<VersionCell, 'metric' | 'operation' | 'nodeCount'>,
): Signal | null {
  for (const comparison of dataset.comparisons) {
    const forward = comparison.a === a && comparison.b === b
    const reverse = comparison.a === b && comparison.b === a
    if (!forward && !reverse) continue
    const match = comparison.cells.find(
      (c) =>
        c.metric === cell.metric &&
        c.operation === cell.operation &&
        c.nodeCount === cell.nodeCount,
    )
    if (!match) return null
    if (forward) return match.signal
    if (match.signal === 'Consistent Improvement') return 'Consistent Regression'
    if (match.signal === 'Consistent Regression') return 'Consistent Improvement'
    return match.signal
  }
  return null
}

export function compareVersions(dataset: Dataset, a: string, b: string): CompareResult {
  const versionA = dataset.versions.find((v) => v.label === a)
  const versionB = dataset.versions.find((v) => v.label === b)
  const cellsB = dataset.cellsByVersion.get(b) ?? []

  const rows: CompareRow[] = []
  for (const cellA of dataset.cellsByVersion.get(a) ?? []) {
    if (!isDurationMetric(cellA.metric)) continue
    const cellB = cellsB.find(
      (c) =>
        c.metric === cellA.metric &&
        c.operation === cellA.operation &&
        c.nodeCount === cellA.nodeCount,
    )
    if (!cellB) continue
    rows.push({
      metric: cellA.metric,
      operation: cellA.operation,
      nodeCount: cellA.nodeCount,
      a: cellA.dist,
      b: cellB.dist,
      deltaPct:
        cellA.dist.median === 0
          ? null
          : ((cellB.dist.median - cellA.dist.median) / cellA.dist.median) * 100,
      signal: findSignal(dataset, a, b, cellA),
    })
  }

  return {
    sameRun: versionA !== undefined && versionA.batch === versionB?.batch,
    rows,
  }
}
