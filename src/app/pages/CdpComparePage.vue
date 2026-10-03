<script setup lang="ts">
/**
 * CDP 跨版本對比：選一份 analysis（一個 scenario 的一次驗證），再選 A / B 兩個版本，
 * 對比主要耗時指標的 median 與 IQR。數字全部來自 results/cdp-trace/validation，見 src/data/telemetry.ts。
 */
import { computed, ref, shallowRef, watch } from 'vue'
import {
  compareVersions,
  listDatasets,
  loadDataset,
  type Dataset,
  type Distribution,
  type Signal,
} from '@/data/telemetry'

const datasets = ref(listDatasets())
const datasetId = ref(datasets.value[0]?.id ?? '')
const dataset = shallowRef<Dataset | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)

const versionA = ref('')
const versionB = ref('')

watch(
  datasetId,
  async (id) => {
    loading.value = true
    loadError.value = null
    try {
      const loaded = await loadDataset(id)
      // 切換很快時，只採用最後一次選擇的結果
      if (id !== datasetId.value) return
      // 解析不出對比數據的檔案直接從選單拿掉，改選下一份
      if (!loaded) {
        dataset.value = null
        datasets.value = datasets.value.filter((d) => d.id !== id)
        datasetId.value = datasets.value[0]?.id ?? ''
        return
      }
      dataset.value = loaded
      // 預設帶入第一組原始 comparison，保證是同一批次
      const first = loaded?.comparisons[0]
      versionA.value = first?.a ?? ''
      versionB.value = first?.b ?? ''
    } catch (error) {
      if (id !== datasetId.value) return
      dataset.value = null
      loadError.value = `載入 ${id} 失敗：${String(error)}`
    } finally {
      if (id === datasetId.value) loading.value = false
    }
  },
  { immediate: true },
)

const sameVersion = computed(() => versionA.value !== '' && versionA.value === versionB.value)

const result = computed(() => {
  if (!dataset.value || !versionA.value || !versionB.value || sameVersion.value) return null
  return compareVersions(dataset.value, versionA.value, versionB.value)
})

const infoA = computed(() => dataset.value?.versions.find((v) => v.label === versionA.value))
const infoB = computed(() => dataset.value?.versions.find((v) => v.label === versionB.value))

const hasUnjudgedRows = computed(() => result.value?.rows.some((row) => row.signal === null))

function describeBatch(run: string | null, browsers: string[]): string {
  return `${run ?? 'baseline'} · ${browsers.join(', ') || 'Chrome 版本未記錄'}`
}

function ms(value: number): string {
  return value.toFixed(2)
}

function iqr(dist: Distribution): string {
  return `${ms(dist.p25)}–${ms(dist.p75)}`
}

// 和 analyze 腳本 classify() 的「No Meaningful Difference」門檻一致：|Δ| < 3% 視為持平
const FLAT_PCT = 3

type DeltaTone = 'faster' | 'slower' | 'flat'

interface DeltaView {
  tone: DeltaTone
  text: string
  label: string
}

/** 耗時指標：負值 = B 花的時間較少（變快），箭頭取代正負號 */
function delta(value: number): DeltaView {
  const text = `${Math.abs(value).toFixed(1)}%`
  if (Math.abs(value) < FLAT_PCT) {
    return {
      tone: 'flat',
      text: `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`,
      label: `持平 ${text}`,
    }
  }
  return value < 0
    ? { tone: 'faster', text, label: `耗時減少 ${text}` }
    : { tone: 'slower', text, label: `耗時增加 ${text}` }
}

const rows = computed(
  () =>
    result.value?.rows.map((row) => ({
      ...row,
      delta: row.deltaPct === null ? null : delta(row.deltaPct),
    })) ?? [],
)

const SIGNAL_TEXT: Record<Signal, string> = {
  'Consistent Improvement': 'B 較快',
  'Consistent Regression': 'B 較慢',
  'Stable / No Meaningful Difference': '無明顯差異',
  Unstable: '不穩定',
}

const SIGNAL_TONE: Record<Signal, string> = {
  'Consistent Improvement': 'is-better',
  'Consistent Regression': 'is-worse',
  'Stable / No Meaningful Difference': 'is-flat',
  Unstable: 'is-noisy',
}
</script>

<template>
  <section class="compare lab-theme">
    <header class="compare__header">
      <h1 class="compare__title">CDP 跨版本對比</h1>
      <p class="compare__subtitle">
        數字直接讀自 <code>results/cdp-trace/validation/*-analysis.json</code>。每格是 10 次量測的
        median，下方小字是 IQR（p25–p75），單位 ms。
      </p>
    </header>

    <p v-if="datasets.length === 0" class="compare__notice">
      找不到任何 analysis 檔。先用 <code>scripts/cdp-trace/analyze-*.ts</code> 產出結果再回來。
    </p>

    <template v-else>
      <div class="compare__controls">
        <label class="compare__field compare__field--dataset">
          <span class="compare__label">Dataset</span>
          <select v-model="datasetId" class="compare__select">
            <option v-for="d in datasets" :key="d.id" :value="d.id">{{ d.title }}</option>
          </select>
        </label>
        <label class="compare__field">
          <span class="compare__label">版本 A（基準）</span>
          <select v-model="versionA" class="compare__select" :disabled="!dataset">
            <option v-for="v in dataset?.versions" :key="v.label" :value="v.label">
              {{ v.label }}
            </option>
          </select>
          <span v-if="infoA" class="compare__batch">{{
            describeBatch(infoA.run, infoA.browsers)
          }}</span>
        </label>
        <label class="compare__field">
          <span class="compare__label">版本 B</span>
          <select v-model="versionB" class="compare__select" :disabled="!dataset">
            <option v-for="v in dataset?.versions" :key="v.label" :value="v.label">
              {{ v.label }}
            </option>
          </select>
          <span v-if="infoB" class="compare__batch">{{
            describeBatch(infoB.run, infoB.browsers)
          }}</span>
        </label>
      </div>

      <p v-if="loading" class="compare__notice">載入中…</p>
      <p v-else-if="loadError" class="compare__notice compare__notice--warn">{{ loadError }}</p>
      <p v-else-if="sameVersion" class="compare__notice">
        A 與 B 是同一個版本，換一個版本才有對比。
      </p>

      <template v-else-if="result">
        <p v-if="!result.sameRun" class="compare__notice compare__notice--warn" role="alert">
          當前對比屬於不同量測批次（Run），數據可能存在環境雜訊，僅供參考。
        </p>

        <p v-if="result.rows.length === 0" class="compare__notice">
          這兩個版本在這份 dataset 裡沒有共同的耗時指標可以對比。
        </p>

        <div v-else class="compare__table-wrap">
          <table class="compare__table">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Operation</th>
                <th scope="col" class="is-num">N</th>
                <th scope="col" class="is-num">A median / IQR</th>
                <th scope="col" class="is-num">B median / IQR</th>
                <th scope="col" class="is-num">Δ</th>
                <th scope="col">Signal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="`${row.metric}|${row.operation}|${row.nodeCount}`">
                <td>{{ row.metric }}</td>
                <td>{{ row.operation }}</td>
                <td class="is-num">{{ row.nodeCount }}</td>
                <td v-for="(dist, i) in [row.a, row.b]" :key="i" class="is-num">
                  <span class="compare__median">{{ ms(dist.median) }}</span>
                  <span class="compare__iqr">{{ iqr(dist) }}</span>
                </td>
                <td class="is-num">
                  <span v-if="!row.delta" class="compare__delta is-none">—</span>
                  <span
                    v-else
                    class="compare__delta"
                    :class="`is-${row.delta.tone}`"
                    :aria-label="row.delta.label"
                  >
                    <svg
                      v-if="row.delta.tone !== 'flat'"
                      class="compare__arrow"
                      viewBox="0 0 10 10"
                      aria-hidden="true"
                    >
                      <path d="M5 1.5v7M2 5.5l3 3 3-3" />
                    </svg>
                    <span aria-hidden="true">{{ row.delta.text }}</span>
                  </span>
                </td>
                <td>
                  <span v-if="row.signal" class="compare__badge" :class="SIGNAL_TONE[row.signal]">
                    {{ SIGNAL_TEXT[row.signal] }}
                  </span>
                  <span v-else class="compare__badge-none">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="hasUnjudgedRows" class="compare__footnote">
          Signal 為「—」：原始分析沒有直接比較過這一對版本，只列出數字、不給判定。
        </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.compare__header {
  margin-bottom: 2rem;
}

.compare__title {
  margin: 0;
  font-size: clamp(1.75rem, 5vw, 2.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.compare__subtitle {
  margin: 0.75rem 0 0;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

code {
  font-family: var(--lab-font-mono);
  font-size: 0.875em;
  color: var(--lab-text-silver);
}

.compare__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

/* Dataset 獨佔一列（場景名稱可能較長）；A / B 並排在下方 */
.compare__field--dataset {
  grid-column: 1 / -1;
}

.compare__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.compare__label {
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.compare__select {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--lab-hairline-strong);
  border-radius: 2px;
  background: var(--lab-panel);
  font-family: var(--lab-font-mono);
  font-size: 0.8125rem;
  color: var(--lab-text);
}

.compare__select:focus-visible {
  outline: 2px solid var(--lab-signal);
  outline-offset: 2px;
}

.compare__batch {
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  color: var(--lab-text-muted);
}

.compare__notice {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--lab-hairline);
  border-radius: 2px;
  background: var(--lab-panel);
  color: var(--lab-text-silver);
}

.compare__notice--warn {
  border-color: var(--lab-warn);
  background: color-mix(in srgb, var(--lab-warn) 12%, transparent);
  font-weight: 600;
  color: var(--lab-warn);
}

.compare__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--lab-hairline);
}

.compare__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--lab-font-mono);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums slashed-zero;
}

.compare__table th,
.compare__table td {
  padding: 1rem;
  border-bottom: 1px solid var(--lab-hairline);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

.compare__table th {
  padding-block: 0.625rem;
  background: var(--lab-panel);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--lab-text-muted);
}

.compare__table td {
  color: var(--lab-text-silver);
  transition: background-color 120ms var(--lab-ease-hard);
}

/* 無陰影層級（DESIGN.md）：hover 只把整列從 Chassis 提亮到 Panel，左緣再亮一條 1px 髮絲 */
.compare__table tbody tr:hover td {
  background: var(--lab-panel);
}

.compare__table tbody tr:hover td:first-child {
  box-shadow: inset 1px 0 0 var(--lab-hairline-strong);
}

.compare__table tbody tr:last-child td {
  border-bottom: 0;
}

.compare__table .is-num {
  text-align: right;
}

/* 標題的 letter-spacing 會在最後一個字後面多留 0.06em，右對齊時字面會比下方數字往左縮；用 padding 抵掉 */
.compare__table th.is-num {
  padding-right: calc(1rem - 0.06em);
}

/* ---- median 為主讀數，IQR 降一級換行在下方 ---- */

.compare__median {
  display: block;
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--lab-text);
}

.compare__iqr {
  display: block;
  margin-top: 0.3125rem;
  font-size: 0.6875rem;
  line-height: 1;
  color: var(--lab-text-muted);
}

/* ---- Δ：耗時減少 = 綠、增加 = Hot、|Δ| < 3% 持平 = 冷灰 ---- */

.compare__delta {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.compare__delta.is-faster {
  color: var(--lab-signal-strong);
}

.compare__delta.is-slower {
  color: var(--lab-hot);
}

.compare__delta.is-flat,
.compare__delta.is-none {
  font-weight: 400;
  color: var(--lab-text-muted);
}

.compare__arrow {
  width: 0.625rem;
  height: 0.625rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: square;
}

.is-slower .compare__arrow {
  transform: rotate(180deg);
}

/* ---- Signal 膠囊：底色與框線都從語意 token 推導 ---- */

.compare__badge {
  --tone: var(--lab-text-muted);

  display: inline-block;
  padding: 0.25rem 0.625rem;
  border: 1px solid color-mix(in srgb, var(--tone) 32%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 12%, transparent);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: var(--tone);
}

.compare__badge.is-better {
  --tone: var(--lab-signal);
}

.compare__badge.is-worse {
  --tone: var(--lab-hot);
}

.compare__badge.is-flat {
  --tone: var(--lab-text-silver);
}

/* Unstable 不是結論：虛線框、無底色，和三種定論區分開 */
.compare__badge.is-noisy {
  border-style: dashed;
  background: transparent;
}

.compare__badge-none {
  color: var(--lab-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .compare__table td {
    transition: none;
  }
}

.compare__footnote {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

@media (max-width: 720px) {
  .compare__controls {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 手機寬度：最長的場景名稱與版本標籤（約 37 字元）在 13px 會被原生 select 截斷 */
@media (max-width: 480px) {
  .compare__select {
    padding-inline: 0.5rem;
    font-size: 0.6875rem;
  }
}
</style>
