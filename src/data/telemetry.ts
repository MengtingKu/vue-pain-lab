/**
 * CDP 跨版本對比的資料來源：直接讀 `results/cdp-trace/validation/*-analysis.json`
 * （scripts/cdp-trace/analyze-*.ts 的輸出），不另外維護一份數字。
 *
 * - 一個 dataset = 同一個 scenario、同一個 Run N 的所有 analysis 檔（例如 day29-final-rc9-run2 與
 *   day29-final-rc11-run2 合成「VDOM Stress Test - Run 2」）。版本清單是這些檔內 comparisons 的
 *   a / b 標籤聯集，之後新版本只要重跑 analyze 產出新檔，就會出現在 A / B 選單，這裡與 UI 都不用改。
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
  /** 選單顯示用的短名稱，例如「3.6.0-rc.11 · Vapor」（批次資訊放在分組標題） */
  name: string
}

/** 選單分組：一組 = 一個量測批次 */
export interface VersionGroup {
  batch: string
  /** 例如「Chrome 155 · run2」 */
  title: string
  versions: VersionInfo[]
}

interface VersionCell {
  metric: string
  operation: string
  nodeCount: number
  dist: Distribution
}

export interface Dataset {
  id: string
  /** 預設帶入的 A / B：最新一份檔案的第一組原始 comparison（保證同一批次） */
  defaultPair: { a: string; b: string } | null
  /** 合併進來的 analysis 檔（檔名去掉 -analysis.json） */
  sources: string[]
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
 * 名稱只寫場景，不寫版本或對比關係：一個 dataset 內有多個版本，比哪兩個由頁面上的 A / B 選單決定。
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

/**
 * 檔案 → dataset：同場景、同 Run N 的檔案合成一個 dataset（id 例如 `vdom-stress-run2`）。
 * 不認得的場景以整個前綴當場景，不會和別的檔案誤合併。
 */
function datasetOf(fileId: string): DatasetOption {
  const match = /^(.*)-run(\d+)$/.exec(fileId)
  if (!match) return { id: fileId, title: fileId }
  const [, prefix = fileId, run] = match
  const scenario = SCENARIOS.find((s) =>
    s.keywords.some((k) => prefix === k || prefix.startsWith(`${k}-`)),
  )
  return {
    id: `${scenario?.keywords[0] ?? prefix}-run${run}`,
    title: `${scenario?.title ?? humanize(prefix)} - Run ${run}`,
  }
}

/** dataset id → 檔案 id（依檔名排序，數字部分照數值比：rc9 在 rc11 前） */
const filesByDataset = new Map<string, string[]>()
for (const fileId of Object.keys(loaders).sort((a, b) =>
  a.localeCompare(b, 'en', { numeric: true }),
)) {
  const { id } = datasetOf(fileId)
  filesByDataset.set(id, [...(filesByDataset.get(id) ?? []), fileId])
}

export function listDatasets(): DatasetOption[] {
  return [...filesByDataset.values()]
    .map((files) => datasetOf(files[0]!))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
}

function isAnalysis(raw: unknown): raw is RawAnalysis {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { comparisons?: unknown }).comparisons)
  )
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?(?:-(traditional|vapor))?/

/** `3.6.0-rc.4-vapor-chrome153-run2` → `3.6.0-rc.4 · Vapor`；格式不認得就原樣顯示 */
function versionName(label: string): string {
  const match = VERSION_PATTERN.exec(label)
  if (!match) return label
  const [, major, minor, patch, rc, mode] = match
  const version = `${major}.${minor}.${patch}${rc ? `-rc.${rc}` : ''}`
  return mode ? `${version} · ${mode[0]!.toUpperCase()}${mode.slice(1)}` : version
}

/** 排序鍵：版本由舊到新（正式版排在同號 RC 之後），同版本 Traditional 在 Vapor 前 */
function versionSortKey(label: string): number[] {
  const match = VERSION_PATTERN.exec(label)
  if (!match) return [Infinity]
  const [, major, minor, patch, rc, mode] = match
  return [
    Number(major),
    Number(minor),
    Number(patch),
    rc === undefined ? Infinity : Number(rc),
    mode === 'vapor' ? 1 : 0,
  ]
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Chrome 主版本號：優先用 browserVersions，沒記錄時退回標籤上的 `-chromeNNN` */
function chromeMajor(version: VersionInfo): number | null {
  const fromBrowser = /Chrome\/(\d+)/.exec(version.browsers[0] ?? '')?.[1]
  const fromLabel = /-chrome(\d+)/.exec(version.label)?.[1]
  const major = fromBrowser ?? fromLabel
  return major === undefined ? null : Number(major)
}

/**
 * 把版本依量測批次分組，給 A / B 選單用 <optgroup>：新的 Chrome 在前、baseline 在後，
 * 同組內版本由舊到新。批次判斷沿用 VersionInfo.batch，與「跨批次」警告一致。
 * 主版本相同但完整 Chrome 版本不同的批次（例如 8 月的 151.0.7922.76 / .138）標題改寫完整版本，避免同名。
 */
export function groupVersions(versions: VersionInfo[]): VersionGroup[] {
  const groups = new Map<
    string,
    {
      batch: string
      chrome: number | null
      run: string | null
      browser: string
      versions: VersionInfo[]
    }
  >()
  for (const version of versions) {
    let group = groups.get(version.batch)
    if (!group) {
      group = {
        batch: version.batch,
        chrome: chromeMajor(version),
        run: version.run,
        browser: version.browsers[0]?.replace('/', ' ') ?? '',
        versions: [],
      }
      groups.set(version.batch, group)
    }
    group.versions.push(version)
  }

  const shortTitle = (g: { chrome: number | null; run: string | null }) =>
    `${g.chrome === null ? 'Chrome 未記錄' : `Chrome ${g.chrome}`} · ${g.run ?? 'baseline'}`
  const titleCount = new Map<string, number>()
  for (const g of groups.values())
    titleCount.set(shortTitle(g), (titleCount.get(shortTitle(g)) ?? 0) + 1)

  return [...groups.values()]
    .sort(
      (a, b) =>
        (b.chrome ?? -1) - (a.chrome ?? -1) ||
        Number(a.run === null) - Number(b.run === null) ||
        (a.run ?? '').localeCompare(b.run ?? '', 'en', { numeric: true }) ||
        b.browser.localeCompare(a.browser, 'en', { numeric: true }),
    )
    .map((g) => ({
      batch: g.batch,
      title:
        (titleCount.get(shortTitle(g)) ?? 0) > 1 && g.browser
          ? `${g.browser} · ${g.run ?? 'baseline'}`
          : shortTitle(g),
      versions: [...g.versions].sort((a, b) =>
        compareKeys(versionSortKey(a.label), versionSortKey(b.label)),
      ),
    }))
}

/**
 * 載入 dataset 內的所有檔案並合併。同一個版本標籤出現在多個檔案時（例如新 Freeze Point 的分析檔
 * 也帶著前一個 Freeze Point 的原始資料作為方法論等價檢查），分布相同，只取第一次出現。
 * 格式不符的檔案略過；全部都不符或沒有任何 comparison 時回傳 null（頁面會把它從選單移除）。
 */
export async function loadDataset(id: string): Promise<Dataset | null> {
  const files = filesByDataset.get(id)
  if (!files) return null

  const sources: string[] = []
  const comparisons: RawComparison[] = []
  const versions = new Map<string, VersionInfo>()
  const cellsByVersion = new Map<string, VersionCell[]>()
  const seen = new Set<string>()
  let generatedAt = ''
  let defaultPair: Dataset['defaultPair'] = null

  for (const fileId of files) {
    const raw = await loaders[fileId]?.()
    if (!isAnalysis(raw) || raw.comparisons.length === 0) continue
    sources.push(fileId)
    comparisons.push(...raw.comparisons)
    // 預設比較取最新產生的那份（最新的 Freeze Point）。不靠檔名排序：
    // rc.9 的 component-storm-vapor-run1 沒有 RC 標記，會排在 component-storm-vapor-rc11-run1 之後
    if (raw.generatedAt >= generatedAt) {
      generatedAt = raw.generatedAt
      defaultPair = { a: raw.comparisons[0]!.a, b: raw.comparisons[0]!.b }
    }

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
            name: versionName(label),
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
  }

  if (comparisons.length === 0) return null

  return {
    id,
    defaultPair,
    sources,
    generatedAt,
    versions: [...versions.values()],
    comparisons,
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
