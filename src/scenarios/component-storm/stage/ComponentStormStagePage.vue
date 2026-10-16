<script setup lang="ts">
/**
 * Component Storm 的大會 Demo 視圖。
 *
 * 目的：讓操作者看得懂「Component 數量（COMPONENT_COUNT）與 Update Scope 對 Runtime Cost 的影響」——
 * COMPONENT_COUNT 與 UPDATE_SCOPE 都能在台上切換，每次 update 用一句話說明動到了誰、誰重新 render，
 * 並把 9 種組合的中位耗時、各 COUNT 的 Mount Time / DOM Nodes / JS Heap 放進表格比較。
 *
 * 跟 benchmark 頁（../ComponentStormPage.vue）共用 createChildren 與 REPORT_CHILD_RENDER_KEY，
 * 但 Child 換成視覺化版本（StageChild：燈號矩陣 + 重繪閃爍），DOM 也比較多，
 * 所以這裡的數字只能在本頁內互相比較，不可與 benchmark 頁或 README 的數據直接比較。
 * benchmark 頁與 CDP runner 依賴的 DOM 結構與 config.ts 都不在這個檔案裡，可以放心調整這裡的呈現。
 */
import {
  computed,
  nextTick,
  onMounted,
  onUpdated,
  provide,
  reactive,
  ref,
  shallowRef,
  useTemplateRef,
} from 'vue'
import {
  componentStormConfig,
  UPDATE_SCOPE_OPTIONS,
  type UpdateScope,
} from '@/benchmarks/component-storm/config'
import { createChildren, type ChildState } from '@/benchmarks/component-storm/createChildren'
import { REPORT_CHILD_RENDER_KEY } from '@/benchmarks/component-storm/keys'
import FpsCounter from '@/components/FpsCounter.vue'
import StageChild from './StageChild.vue'

// 與 README Benchmark Matrix 的 Variable A 相同；初始值來自 config.ts
const COUNT_OPTIONS = [100, 500, 1000] as const
// 「×N」一次連續觸發的次數：單次只有幾 ms，取多次中位數才可信
const BATCH_SIZE = 10
// 單次 Update 超過一個 frame（16.7ms）就標成警告橘：這次 update 會讓畫面掉一格
const FRAME_BUDGET_MS = 1000 / 60

const SCOPE_INFO: Record<UpdateScope, { what: string; expect: string }> = {
  ParentOnly: {
    what: '只改 Parent 自己的 parentTick，所有 Child 的 props 都不變',
    expect: '0 個 Child re-render',
  },
  SingleChild: {
    what: '只改 child-0 的 value',
    expect: '1 個 Child re-render',
  },
  AllChildren: {
    what: '所有 Child 的 value 都 +1（Worst Case）',
    expect: 'N 個 Child 全部 re-render',
  },
}

function expectedRenders(scope: UpdateScope, count: number): number {
  if (scope === 'ParentOnly') return 0
  if (scope === 'SingleChild') return 1
  return count
}

// ---- Component Tree ----

const count = ref<number>(componentStormConfig.componentCount)
const updateScope = ref<UpdateScope>(componentStormConfig.updateScope)
// 先掛空陣列，onMounted 後才 mount Child：初次掛載與切換 COUNT 用同一套量測方式
const children = shallowRef<ChildState[]>([])
const parentTick = ref(0)

const gridEl = useTemplateRef<HTMLElement>('grid')

// ---- 追蹤：量測區間內才記錄；這些變數會在 onUpdated 內被改，所以不是 reactive ----

let tracing = false
let parentRenders = 0
let renderedIds = new Set<number>()

provide(REPORT_CHILD_RENDER_KEY, (id: number) => {
  if (tracing) renderedIds.add(id)
})

onUpdated(() => {
  if (tracing) parentRenders++
})

// ---- Mount：切換 COMPONENT_COUNT 時整批卸載再重新掛載 ----

interface MountSample {
  duration: number
  domNodes: number
  heapMB: number | null
}

interface MountSummary extends MountSample {
  count: number
}

const busy = ref(false)
const executingProgress = shallowRef<{ current: number; total: number } | null>(null)
const lastMount = shallowRef<MountSummary | null>(null)
const mountResults = shallowRef<Record<number, MountSample[]>>({})

/** Chrome 專屬、非標準的 performance.memory；讀數有量化且含尚未回收的垃圾，只能當粗略參考 */
function readHeapMB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory ? memory.usedJSHeapSize / 1024 / 1024 : null
}

async function mountChildren(nextCount: number): Promise<void> {
  busy.value = true
  // 先卸載舊的 Child，卸載成本不算進 Mount Time
  children.value = []
  await nextTick()

  const start = performance.now()
  children.value = reactive(createChildren(nextCount))
  count.value = nextCount
  await nextTick()
  const end = performance.now()

  performance.measure(`component-storm mount count=${nextCount}`, { start, end })
  const sample: MountSample = {
    duration: end - start,
    domNodes: gridEl.value?.getElementsByTagName('*').length ?? 0,
    heapMB: readHeapMB(),
  }
  mountResults.value = {
    ...mountResults.value,
    [nextCount]: [...(mountResults.value[nextCount] ?? []), sample],
  }
  lastMount.value = { count: nextCount, ...sample }
  lastRun.value = null
  busy.value = false
}

function setCount(nextCount: number): void {
  if (busy.value || nextCount === count.value) return
  void mountChildren(nextCount)
}

onMounted(() => mountChildren(count.value))

// ---- Update ----

interface RunSummary {
  index: number
  count: number
  scope: UpdateScope
  from: number
  duration: number
  parentRenders: number
  childRenders: number
}

const lastRun = shallowRef<RunSummary | null>(null)
const runCount = ref(0)
// key = `${count}:${scope}`
const updateResults = shallowRef<Record<string, number[]>>({})

async function runOnce(): Promise<void> {
  // 先讓前一輪的畫面更新（結果表、說明文字）render 完，這次 render 不算進量測
  await nextTick()

  const index = runCount.value + 1
  const currentCount = count.value
  const scope = updateScope.value
  const list = children.value
  const from = scope === 'ParentOnly' ? parentTick.value : (list[0]?.value ?? 0)

  parentRenders = 0
  renderedIds = new Set<number>()
  tracing = true
  const start = performance.now()

  switch (scope) {
    case 'ParentOnly':
      parentTick.value++
      break
    case 'SingleChild': {
      const target = list[0]
      if (target) target.value++
      break
    }
    case 'AllChildren':
      for (const child of list) child.value++
      break
  }

  await nextTick()
  const end = performance.now()
  tracing = false

  // Performance 面板的 Timings 軌道會出現這段區間，方便在 Flame Chart 裡找到這次 update
  performance.measure(`component-storm count=${currentCount} ${scope} #${index}`, { start, end })

  const duration = end - start
  const key = `${currentCount}:${scope}`
  updateResults.value = {
    ...updateResults.value,
    [key]: [...(updateResults.value[key] ?? []), duration],
  }
  runCount.value = index
  lastRun.value = {
    index,
    count: currentCount,
    scope,
    from,
    duration,
    parentRenders,
    childRenders: renderedIds.size,
  }
}

async function triggerUpdate(times: number): Promise<void> {
  if (busy.value) return
  busy.value = true
  for (let i = 0; i < times; i++) {
    executingProgress.value = times > 1 ? { current: i + 1, total: times } : null
    await runOnce()
  }
  executingProgress.value = null
  busy.value = false
}

// ---- 比較表 ----

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function updateCell(cellCount: number, scope: UpdateScope) {
  const durations = updateResults.value[`${cellCount}:${scope}`]
  if (!durations?.length) return null
  return { median: median(durations), runs: durations.length }
}

const mountRows = computed(() =>
  COUNT_OPTIONS.map((rowCount) => {
    const samples = mountResults.value[rowCount]
    const latest = samples?.at(-1)
    if (!samples || !latest) return { count: rowCount, data: null }
    return {
      count: rowCount,
      data: {
        median: median(samples.map((sample) => sample.duration)),
        runs: samples.length,
        domNodes: latest.domNodes,
        heapMB: latest.heapMB,
      },
    }
  }),
)

interface MatrixDiagnosis {
  kind: 'isolation' | 'traversal'
  count: number
  ratio: string
  singleMs: string
  allMs: string
  note: string
}

const matrixDiagnosis = computed<MatrixDiagnosis | null>(() => {
  // 優先 1：在同一個 COUNT 下對比 AllChildren vs SingleChild (驗證精準更新隔離效益)
  for (const c of COUNT_OPTIONS) {
    const single = updateCell(c, 'SingleChild')
    const all = updateCell(c, 'AllChildren')
    if (single && all && single.runs >= 2 && all.runs >= 2) {
      const ratioNum = all.median / Math.max(single.median, 0.01)
      return {
        kind: 'isolation',
        count: c,
        ratio: ratioNum.toFixed(1),
        singleMs: single.median.toFixed(2),
        allMs: all.median.toFixed(2),
        note: `在 ${c} 個 Child 下，AllChildren 耗時是 SingleChild 的 ${ratioNum.toFixed(1)} 倍。證明 Vue 依靠 props 比對精準略過未變更 Child，節省巨額 re-render 成本。`,
      }
    }
  }

  // 優先 2：在 SingleChild 或 ParentOnly 下對比 100 vs 1000 (驗證 Parent 比對底噪)
  const lowCount = updateCell(100, 'SingleChild')
  const highCount = updateCell(1000, 'SingleChild')
  if (lowCount && highCount && lowCount.runs >= 2 && highCount.runs >= 2) {
    const diff = (highCount.median - lowCount.median).toFixed(2)
    return {
      kind: 'traversal',
      count: 1000,
      ratio: (highCount.median / Math.max(lowCount.median, 0.01)).toFixed(1),
      singleMs: lowCount.median.toFixed(2),
      allMs: highCount.median.toFixed(2),
      note: `SingleChild 在 COUNT 100 ➔ 1000 耗時仍上升 ${diff} ms。因 Parent 仍須進行 patchKeyedChildren 遍歷 1000 個 vnode 比對 props。`,
    }
  }

  return null
})

function clearResults(): void {
  updateResults.value = {}
  mountResults.value = {}
  lastRun.value = null
  runCount.value = 0
}

// ---- 操作引導：依目前進度標出該做哪一步 ----

const measuredScopesAtCount = computed(
  () => UPDATE_SCOPE_OPTIONS.filter((scope) => updateCell(count.value, scope)).length,
)
const measuredCounts = computed(
  () =>
    COUNT_OPTIONS.filter((rowCount) =>
      UPDATE_SCOPE_OPTIONS.some((scope) => updateCell(rowCount, scope)),
    ).length,
)

const currentStep = computed<3 | 4 | 5>(() => {
  if (!updateCell(count.value, updateScope.value)) return 3
  if (measuredScopesAtCount.value < 2 || measuredCounts.value < 2) return 4
  return 5
})

function stepState(step: number): 'done' | 'current' | 'todo' {
  if (step < currentStep.value) return 'done'
  if (step === currentStep.value) return 'current'
  return 'todo'
}

const runCheckOk = computed(
  () =>
    !!lastRun.value &&
    lastRun.value.childRenders === expectedRenders(lastRun.value.scope, lastRun.value.count),
)
</script>

<template>
  <div class="storm-stage lab-theme">
    <header class="storm-stage__header">
      <div class="storm-stage__heading">
        <h1 class="storm-stage__title">Component Storm</h1>
        <span class="storm-stage__tag">STAGE VIEW</span>
      </div>
      <p class="storm-stage__question">
        <span class="storm-stage__question-tag">QUESTION</span>
        一個 Parent 底下掛了大量 Child（表格列、卡片牆）。Child 越多，Mount 和 Update 會貴多少？
        只動一個 Child 跟動全部，成本差多少？Parent 自己更新時，會不會連累所有 Child 重新 render？
      </p>
      <p class="storm-stage__note">
        視覺化 Demo 版本：每個 Child 多了燈號與重繪閃爍，數字只在本頁內互相比較，不與 benchmark 頁或
        README 數據直接比較。
      </p>
    </header>

    <main class="storm-stage__main">
      <!-- 左欄：引導、操控、結果 -->
      <div class="storm-stage__console">
        <!-- ---- 操作引導：做什麼、為什麼 ---- -->
        <section aria-labelledby="stage-guide">
          <h2 id="stage-guide" class="section-title">How To Run</h2>
          <ol class="guide">
            <li class="is-done">
              <span class="guide__no">01</span>
              <div>
                <p class="guide__do">
                  選 <strong>COMPONENT_COUNT</strong>：Parent 底下掛幾個 Child。切換時整批卸載再重新
                  mount，順便量 Mount Time。
                </p>
                <p class="guide__why">
                  <b>WHY</b> 驗證 Component 數量增加時，Mount / Update / 記憶體成本怎麼成長。
                </p>
              </div>
            </li>
            <li class="is-done">
              <span class="guide__no">02</span>
              <div>
                <p class="guide__do">
                  選 <strong>UPDATE_SCOPE</strong>：這次 update 要動到誰（Parent 自己、1 個
                  Child、或全部 Child）。
                </p>
                <p class="guide__why">
                  <b>WHY</b> 掛著的 Child 數量一樣，但「真的需要 re-render 的 Child
                  數」不同，成本也會不同。
                </p>
              </div>
            </li>
            <li :class="`is-${stepState(3)}`">
              <span class="guide__no">03</span>
              <div>
                <p class="guide__do">
                  按 <strong>Trigger Update</strong>（建議按 <strong>×{{ BATCH_SIZE }}</strong
                  >），右側亮起的卡片就是這次真的 re-render 的 Child。
                </p>
                <p class="guide__why">
                  <b>WHY</b> 單次 update 受 GC 與排程雜訊影響大，同一組合多跑幾次、取中位數才可信。
                </p>
              </div>
            </li>
            <li :class="`is-${stepState(4)}`">
              <span class="guide__no">04</span>
              <div>
                <p class="guide__do">
                  換其他 SCOPE 與 COUNT，填滿 <strong>Update Cost Matrix</strong>。
                </p>
                <p class="guide__why"><b>WHY</b> 橫向對比 Scope 影響、縱向對比元件數量底噪。</p>
              </div>
            </li>
            <li :class="`is-${stepState(5)}`">
              <span class="guide__no">05</span>
              <div>
                <p class="guide__do">
                  檢視下方 <strong>Update Cost Matrix</strong> 的對比診斷與 16.7ms 掉幀警戒。
                </p>
                <p class="guide__why">
                  <b>VERDICT</b> 驗證精準更新的隔離效能，確認超大元件樹時的 props 比對瓶頸。
                </p>
              </div>
            </li>
          </ol>
        </section>

        <FpsCounter />

        <!-- ---- 操控 ---- -->
        <section class="control" aria-labelledby="stage-params">
          <h2 id="stage-params" class="section-title">Lab Parameters</h2>

          <div class="control__row" role="group" aria-labelledby="count-label">
            <span id="count-label" class="control__label">
              COMPONENT_COUNT <small>Child 數量</small>
            </span>
            <div class="picker">
              <button
                v-for="option in COUNT_OPTIONS"
                :key="option"
                type="button"
                :aria-pressed="option === count"
                :disabled="busy"
                @click="setCount(option)"
              >
                {{ option }}
              </button>
            </div>
          </div>
          <p class="control__status" role="status">
            <template v-if="lastMount">
              已 mount <b>{{ lastMount.count }}</b> 個 Child：<b
                >{{ lastMount.duration.toFixed(1) }} ms</b
              >
              · {{ lastMount.domNodes.toLocaleString() }} DOM nodes<template
                v-if="lastMount.heapMB !== null"
              >
                · JS Heap {{ lastMount.heapMB.toFixed(1) }} MB</template
              >
            </template>
            <template v-else>Mounting…</template>
          </p>

          <fieldset class="scope">
            <legend class="control__label">UPDATE_SCOPE <small>這次 update 動到誰</small></legend>
            <label v-for="scope in UPDATE_SCOPE_OPTIONS" :key="scope" class="scope__option">
              <input
                v-model="updateScope"
                class="scope__input"
                type="radio"
                name="stage-update-scope"
                :value="scope"
                :disabled="busy"
              />
              <span class="scope__name">{{ scope }}</span>
              <span class="scope__what">{{ SCOPE_INFO[scope].what }}</span>
              <span class="scope__expect">預期：{{ SCOPE_INFO[scope].expect }}</span>
            </label>
          </fieldset>

          <div class="control__run">
            <button type="button" class="trigger" :disabled="busy" @click="triggerUpdate(1)">
              <template v-if="busy && executingProgress">
                [ EXECUTING {{ executingProgress.current }}/{{ executingProgress.total }}... ]
              </template>
              <template v-else-if="busy">[ EXECUTING... ]</template>
              <template v-else>Trigger Update</template>
            </button>
            <button
              type="button"
              class="trigger trigger--batch"
              :disabled="busy"
              aria-describedby="batch-hint"
              @click="triggerUpdate(BATCH_SIZE)"
            >
              ×{{ BATCH_SIZE }}
            </button>
            <p id="batch-hint" class="control__hint">
              <b>Trigger Update</b> 觸發 1 次，適合搭配 DevTools 錄製單次 update；
              <b>×{{ BATCH_SIZE }}</b> 連續觸發
              {{ BATCH_SIZE }} 次，每次各記一筆，累積樣本給比較表取中位數。
            </p>
          </div>
        </section>

        <!-- ---- 這次得到什麼 ---- -->
        <section class="result" aria-labelledby="stage-result">
          <h2 id="stage-result" class="section-title">Last Update · 這次發生了什麼</h2>

          <p v-if="!lastRun" class="result__empty">
            按 <strong>Trigger Update</strong> 後，這裡會說明這次改了什麼、Parent 與幾個 Child 重新
            render、花了多久。
          </p>
          <template v-else>
            <p class="result__story">
              <span class="result__index">#{{ lastRun.index }}</span>
              <template v-if="lastRun.scope === 'ParentOnly'">
                只改了 Parent 的 parentTick（<b>{{ lastRun.from }} → {{ lastRun.from + 1 }}</b
                >），所有 Child 的 props 都沒變。
              </template>
              <template v-else-if="lastRun.scope === 'SingleChild'">
                只改了 child-0 的 value（<b>{{ lastRun.from }} → {{ lastRun.from + 1 }}</b
                >）。
              </template>
              <template v-else>
                所有 {{ lastRun.count }} 個 Child 的 value 都 +1（<b
                  >{{ lastRun.from }} → {{ lastRun.from + 1 }}</b
                >）。
              </template>
              Parent re-render <b>{{ lastRun.parentRenders }}</b> 次，Child re-render
              <b>{{ lastRun.childRenders }} / {{ lastRun.count }}</b> 個，整次 update 花了
              <b>{{ lastRun.duration.toFixed(3) }} ms</b>。
            </p>
            <dl class="result__grid">
              <div>
                <dt>Update Duration</dt>
                <dd class="result__key" :class="{ 'is-hot': lastRun.duration > FRAME_BUDGET_MS }">
                  {{ lastRun.duration.toFixed(3) }}<span class="unit">ms</span>
                </dd>
              </div>
              <div>
                <dt>Child Re-rendered</dt>
                <dd>
                  {{ lastRun.childRenders }}<span class="unit">/ {{ lastRun.count }}</span>
                </dd>
              </div>
              <div>
                <dt>Parent Re-rendered</dt>
                <dd>{{ lastRun.parentRenders }}</dd>
              </div>
            </dl>
            <p class="result__check" :class="runCheckOk ? 'is-ok' : 'is-off'">
              <template v-if="runCheckOk">
                ✔ 只有 props 真的有變的 Child 重新 render。Parent 的 template 把每個 child.value 當
                props 傳下去，所以 Parent 每次都會 re-render；Vue 再逐一比對 Child 的
                props，沒變的就跳過。
              </template>
              <template v-else>
                ✖ 實際 {{ lastRun.childRenders }} 個 Child re-render，預期
                {{ expectedRenders(lastRun.scope, lastRun.count) }} 個。
              </template>
              <span v-if="lastRun.duration > FRAME_BUDGET_MS" class="result__flag">
                超過 1 frame（16.7 ms），這次 update 會讓畫面掉幀
              </span>
            </p>
          </template>
          <p class="result__tick">
            <span>Parent Tick</span>
            <b>{{ parentTick }}</b>
          </p>
        </section>

        <!-- ---- Update Cost Matrix ---- -->
        <section class="compare" aria-labelledby="stage-matrix-table">
          <h2 id="stage-matrix-table" class="section-title">Update Cost Matrix · 中位耗時</h2>
          <table class="compare__table">
            <thead>
              <tr>
                <th scope="col">COUNT</th>
                <th v-for="scope in UPDATE_SCOPE_OPTIONS" :key="scope" scope="col">{{ scope }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rowCount in COUNT_OPTIONS" :key="rowCount">
                <th scope="row" :class="{ 'is-current': rowCount === count }">{{ rowCount }}</th>
                <td
                  v-for="scope in UPDATE_SCOPE_OPTIONS"
                  :key="scope"
                  :class="{
                    'is-current': rowCount === count && scope === updateScope,
                    'is-hot': (updateCell(rowCount, scope)?.median ?? 0) > FRAME_BUDGET_MS,
                  }"
                >
                  <template v-if="updateCell(rowCount, scope)">
                    {{ updateCell(rowCount, scope)!.median.toFixed(2) }}<span class="unit">ms</span>
                    <span
                      class="compare__runs"
                      :class="{ 'is-thin': updateCell(rowCount, scope)!.runs < 5 }"
                      >n={{ updateCell(rowCount, scope)!.runs }}</span
                    >
                  </template>
                  <span v-else class="compare__empty">—</span>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 class="section-title">Mount &amp; Memory</h2>
          <table class="compare__table">
            <thead>
              <tr>
                <th scope="col">COUNT</th>
                <th scope="col">Mount</th>
                <th scope="col">DOM Nodes</th>
                <th scope="col">JS Heap</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in mountRows" :key="row.count">
                <th scope="row" :class="{ 'is-current': row.count === count }">{{ row.count }}</th>
                <template v-if="row.data">
                  <td :class="{ 'is-hot': row.data.median > FRAME_BUDGET_MS }">
                    {{ row.data.median.toFixed(1) }}<span class="unit">ms</span>
                    <span class="compare__runs" :class="{ 'is-thin': row.data.runs < 3 }"
                      >n={{ row.data.runs }}</span
                    >
                  </td>
                  <td>{{ row.data.domNodes.toLocaleString() }}</td>
                  <td>
                    <template v-if="row.data.heapMB !== null">
                      {{ row.data.heapMB.toFixed(1) }}<span class="unit">MB</span>
                    </template>
                    <span v-else class="compare__empty">N/A</span>
                  </td>
                </template>
                <td v-else colspan="3">
                  <span class="compare__empty">切換到這個 COUNT 後才會量測</span>
                </td>
              </tr>
            </tbody>
          </table>

          <div
            v-if="matrixDiagnosis"
            class="compare__verdict"
            :class="matrixDiagnosis.kind === 'isolation' ? 'is-isolation' : 'is-traversal'"
          >
            <span class="compare__verdict-tag">
              {{
                matrixDiagnosis.kind === 'isolation'
                  ? `ISOLATION RATIO ${matrixDiagnosis.ratio}×`
                  : 'TREE TRAVERSAL OVERHEAD'
              }}
            </span>
            <p>
              {{ matrixDiagnosis.note }}
            </p>
          </div>

          <div class="compare__read">
            <p><b>怎麼讀</b></p>
            <ul>
              <li>
                <b>橫向（同一個 COUNT）</b>：ParentOnly、SingleChild 應該遠小於
                AllChildren——成本取決於「真的 re-render 的 Child 數」，不是掛了多少 Child。
              </li>
              <li>
                <b>縱向（同一個 Scope）</b>：AllChildren 大致隨 COUNT 線性成長。ParentOnly /
                SingleChild 也會慢慢變大，因為 Parent re-render 時仍要走過 N 個 Child 的 vnode 比對
                props，只是不進 Child 的 render。
              </li>
              <li>
                橘色 = 超過 16.7 ms（一個 frame），使用者會感覺到卡頓。n 少於 5
                的格子雜訊大（灰字）。
              </li>
              <li>
                Mount 與 DOM Nodes 應隨 COUNT 等比例成長。JS Heap 是 Chrome
                的粗略讀數（含尚未回收的垃圾），精確的記憶體請用下方 DevTools Memory 的方法。
              </li>
            </ul>
          </div>

          <button type="button" class="compare__clear" :disabled="busy" @click="clearResults">
            clear results
          </button>
        </section>

        <!-- ---- DevTools 對照 ---- -->
        <details class="devtools">
          <summary>搭配 Chrome DevTools 觀察 Flame Chart</summary>
          <ol>
            <li>選好 COMPONENT_COUNT 與 UPDATE_SCOPE。</li>
            <li>F12 開啟 DevTools → <b>Performance</b> 面板 → 按 ● Record。</li>
            <li>回到這頁按一次 <b>Trigger Update</b>，再按 Stop。</li>
            <li>
              在 <b>Timings</b> 軌道找
              <code>component-storm count={{ count }} {{ updateScope }} #N</code>，這一段就是一次
              update 的範圍，下方 Main 軌道就是它的 Flame Chart：
              <ul>
                <li>
                  <b>AllChildren</b>：Parent 的 render 底下會排著 N 段 Child 的
                  <code>componentUpdateFn</code> / render，COUNT 越大越寬。
                </li>
                <li>
                  <b>ParentOnly / SingleChild</b>：只看到 Parent 的 render 與
                  <code>patchKeyedChildren</code> 走過 N 個 Child，大部分停在
                  <code>shouldUpdateComponent</code>，不進 Child 的 render。
                </li>
              </ul>
            </li>
            <li>
              切換 COMPONENT_COUNT 時也會留下
              <code>component-storm mount count=N</code> 區段，可以看 Mount 的 Flame Chart。
            </li>
          </ol>
          <p>函式名稱以 dev server 為準；production build 會被壓縮成短名稱。</p>
        </details>

        <details class="devtools">
          <summary>搭配 Chrome DevTools 觀察 Memory</summary>
          <ol>
            <li>
              <b>Performance</b> 面板勾選 <b>Memory</b> 再錄製，下方會出現 JS Heap / Nodes /
              Listeners 曲線。
            </li>
            <li>
              錄製中依序切換 COMPONENT_COUNT 100 → 1000 → 100：Nodes 與 JS Heap 會階梯式上升；切回
              100 時 Nodes 應該立刻下降，JS Heap 要等 GC 才會降（可按面板上的垃圾桶圖示手動 GC）。
            </li>
            <li>
              確認沒有 memory leak：<b>Memory</b> 面板 → Heap snapshot 拍一張 → 切到 1000 再切回 100
              → 手動 GC → 再拍一張，用 <b>Comparison</b> 比較，並在篩選框輸入
              <code>Detached</code>，確認被卸載的 Child DOM 沒有殘留。
            </li>
          </ol>
        </details>
      </div>

      <!-- 右欄：矩陣監控面板 -->
      <section class="storm-stage__matrix" aria-labelledby="stage-matrix">
        <div class="matrix__bar">
          <h2 id="stage-matrix" class="section-title section-title--bare">
            Children Matrix <span class="matrix__count">{{ children.length }}</span>
            <span v-if="lastRun" class="matrix__ratio-tag">
              RE-RENDERED {{ lastRun.childRenders }}/{{ lastRun.count }} ({{
                ((lastRun.childRenders / lastRun.count) * 100).toFixed(1)
              }}%)
            </span>
          </h2>
          <p class="matrix__legend">
            <span class="matrix__legend-item">
              <span class="matrix__swatch" aria-hidden="true" />idle
            </span>
            <span class="matrix__legend-item">
              <span class="matrix__swatch matrix__swatch--lit" aria-hidden="true" />這次 re-render
            </span>
            <span class="matrix__legend-item">燈號 = Derived ×1~×5</span>
          </p>
        </div>
        <p class="matrix__hint">
          亮起的卡片就是這次真的重新 render 的 Child：ParentOnly 應該一張都不亮，SingleChild 只亮
          child-0。
        </p>
        <ul ref="grid" class="matrix__grid">
          <StageChild
            v-for="child in children"
            :id="child.id"
            :key="child.id"
            :value="child.value"
            :label="child.label"
          />
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.storm-stage {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 1.5rem;
  color: var(--lab-text-silver);
}

.storm-stage strong,
.storm-stage b {
  font-weight: 700;
  color: var(--lab-text);
}

.storm-stage code {
  font-family: var(--lab-font-mono);
  font-size: 0.9em;
  color: var(--lab-signal);
}

/* ---- header ---- */

.storm-stage__header {
  display: grid;
  gap: 0.625rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.storm-stage__heading {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.storm-stage__title {
  margin: 0;
  font-family: var(--lab-font-mono);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--lab-text);
}

.storm-stage__tag {
  padding: 0.125rem 0.5rem;
  border: 1px solid rgb(52 211 153 / 0.35);
  border-radius: 2px;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--lab-signal);
}

.storm-stage__question {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
}

.storm-stage__question-tag {
  margin-right: 0.5rem;
  padding: 0.0625rem 0.375rem;
  border: 1px solid color-mix(in srgb, var(--lab-warn) 45%, transparent);
  font-family: var(--lab-font-mono);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  vertical-align: 0.15em;
  color: var(--lab-warn);
}

.storm-stage__note {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

/* ---- two columns ---- */

.storm-stage__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}

.storm-stage__console {
  /* 讓欄內 position: absolute 的元素（原生 radio）以捲動欄為定位基準，不撐出頁面底部空白 */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

/* 左欄可捲動時，面板維持原本高度，不被 flex 壓扁 */
.storm-stage__console > * {
  flex-shrink: 0;
}

@media (min-width: 1024px) {
  .storm-stage {
    height: 100%;
    overflow: hidden;
  }

  .storm-stage__main {
    flex: 1;
    min-height: 0;
    /* 與 VDOM Stress Stage 相同的左右比例（左控制、右渲染狀況） */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  }

  .storm-stage__console,
  .matrix__grid {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--lab-hairline-strong) transparent;
  }

  .storm-stage__console {
    min-height: 0;
    padding-right: 0.75rem;
  }

  .storm-stage__matrix {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .matrix__grid {
    flex: 1;
    min-height: 0;
    padding-right: 0.5rem;
  }
}

/* ---- 區段標題：標籤 + 延伸到右側的髮絲線 ---- */

.section-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 0.875rem;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

.section-title--bare::after {
  content: none;
}

/* ---- 操作引導 ---- */

.guide {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guide li {
  --tone: var(--lab-hairline-strong);

  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.875rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--lab-hairline);
  border-left: 2px solid var(--tone);
  background: var(--lab-panel-sunken);
  transition:
    border-color 200ms var(--lab-ease-out),
    opacity 200ms var(--lab-ease-out);
}

.guide li.is-current {
  --tone: var(--lab-warn);

  border-color: color-mix(in srgb, var(--lab-warn) 35%, var(--lab-hairline));
  border-left-color: var(--tone);
}

.guide li.is-done {
  --tone: var(--lab-signal-strong);
}

.guide li.is-todo {
  opacity: 0.6;
}

.guide__no {
  font-family: var(--lab-font-mono);
  font-size: 0.875rem;
  font-weight: 800;
  color: var(--tone);
}

.guide__do,
.guide__why {
  margin: 0;
  line-height: 1.6;
}

.guide__do {
  font-size: 0.8125rem;
}

.guide__why {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.guide__why b {
  margin-right: 0.375rem;
  font-family: var(--lab-font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.1em;
  color: var(--tone);
}

/* ---- 操控 ---- */

.control {
  display: grid;
  gap: 0.875rem;
}

.control .section-title {
  margin-bottom: 0;
}

.control__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem 1rem;
}

.control__label {
  padding: 0;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.control__label small {
  font-family: var(--lab-font-sans);
  font-size: 0.6875rem;
  font-weight: 400;
  letter-spacing: 0;
}

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.picker button {
  min-width: 4rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lab-hairline-strong);
  border-radius: 2px;
  background: var(--lab-panel-sunken);
  color: var(--lab-text-silver);
  font-family: var(--lab-font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 150ms var(--lab-ease-out),
    background-color 150ms var(--lab-ease-out);
}

.picker button:hover:not(:disabled) {
  border-color: var(--lab-signal-edge);
}

.picker button[aria-pressed='true'] {
  border-color: var(--lab-signal-strong);
  background: color-mix(in srgb, var(--lab-signal-strong) 14%, transparent);
  color: var(--lab-signal);
}

.picker button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.picker button:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 2px;
}

.control__status {
  margin: -0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.control__status b {
  font-family: var(--lab-font-mono);
  color: var(--lab-signal);
}

/* UPDATE_SCOPE：原生 radio 保留在 DOM 中負責鍵盤與螢幕閱讀器，外觀由 label 呈現 */
.scope {
  display: grid;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.scope legend {
  margin-bottom: 0.5rem;
}

.scope__option {
  position: relative;
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr);
  gap: 0.125rem 0.875rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lab-hairline-strong);
  border-radius: 2px;
  background: var(--lab-panel-sunken);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.scope__option:hover {
  border-color: var(--lab-signal-edge);
}

.scope__option:has(.scope__input:checked) {
  border-color: var(--lab-signal-strong);
  background: color-mix(in srgb, var(--lab-signal-strong) 10%, transparent);
  box-shadow: inset 2px 0 0 var(--lab-signal);
}

.scope__option:has(.scope__input:focus-visible) {
  outline: 1px solid var(--lab-signal);
  outline-offset: 2px;
}

.scope__option:has(.scope__input:disabled) {
  cursor: not-allowed;
  opacity: 0.6;
}

.scope__input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.scope__name {
  grid-row: span 2;
  align-self: center;
  font-family: var(--lab-font-mono);
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--lab-text-muted);
}

.scope__option:has(.scope__input:checked) .scope__name {
  color: var(--lab-signal);
}

.scope__what {
  font-size: 0.8125rem;
  line-height: 1.5;
}

.scope__expect {
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.control__run {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
}

.trigger {
  min-height: 3.25rem;
  padding: 0 1.5rem;
  border: 0;
  border-radius: 4px;
  background: var(--lab-signal-strong);
  color: #09090b;
  font-family: var(--lab-font-mono);
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: 0 0 15px rgb(16 185 129 / 0.3);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease,
    transform 100ms ease;
}

.trigger--batch {
  border: 1px solid var(--lab-signal-strong);
  background: color-mix(in srgb, var(--lab-signal-strong) 8%, transparent);
  color: var(--lab-signal);
  box-shadow: none;
}

.trigger:hover:not(:disabled) {
  background: var(--lab-signal);
  color: #09090b;
  box-shadow: 0 0 24px rgb(16 185 129 / 0.45);
}

.trigger:active:not(:disabled) {
  transform: scale(0.97);
}

.trigger:disabled {
  cursor: progress;
  opacity: 0.5;
}

.trigger:focus-visible {
  outline: 2px solid var(--lab-signal);
  outline-offset: 3px;
}

/* 兩顆按鈕的差別說明：跨兩欄放在按鈕下方 */
.control__hint {
  grid-column: 1 / -1;
  margin: -0.25rem 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

.control__hint b {
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

/* ---- Last Update ---- */

.result {
  display: grid;
  gap: 0.75rem;
}

.result .section-title {
  margin-bottom: 0;
}

.result__empty,
.result__story {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

.result__story {
  border-left: 2px solid var(--lab-warn);
  color: var(--lab-text-silver);
}

.result__story b {
  font-family: var(--lab-font-mono);
  color: var(--lab-warn);
}

.result__index {
  margin-right: 0.5rem;
  font-family: var(--lab-font-mono);
  font-weight: 700;
  color: var(--lab-text-muted);
}

.result__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
}

.result__grid > div {
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel);
}

.result__grid dt {
  font-family: var(--lab-font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.result__grid dd {
  margin: 0.375rem 0 0;
  font-family: var(--lab-font-mono);
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--lab-text);
}

.result__grid dd.result__key {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--lab-signal);
}

.result__grid dd.is-hot {
  color: var(--lab-hot);
}

.result__check {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.6;
}

.result__check.is-ok {
  color: var(--lab-signal);
}

.result__check.is-off {
  color: var(--lab-hot);
}

.result__flag {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0 0.375rem;
  border: 1px solid color-mix(in srgb, var(--lab-hot) 45%, transparent);
  color: var(--lab-hot);
}

/* Parent 的 template 讀 parentTick：ParentOnly 時就是靠它讓 Parent re-render */
.result__tick {
  display: flex;
  justify-content: space-between;
  margin: 0;
  padding: 0.5rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.result__tick b {
  font-variant-numeric: tabular-nums;
  color: var(--lab-signal);
}

.unit {
  margin-left: 0.2em;
  font-size: 0.65em;
  font-weight: 500;
  color: var(--lab-text-muted);
}

/* ---- 比較表 ---- */

.compare {
  display: grid;
  gap: 0.75rem;
}

.compare .section-title {
  margin: 0.5rem 0 0;
}

.compare .section-title:first-child {
  margin-top: 0;
}

.compare__table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel);
  font-family: var(--lab-font-mono);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.compare__table th,
.compare__table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--lab-hairline);
  text-align: right;
  white-space: nowrap;
}

.compare__table thead th {
  background: var(--lab-panel-sunken);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.compare__table tbody th {
  text-align: left;
  font-weight: 700;
  color: var(--lab-text);
}

.compare__table tbody th.is-current {
  color: var(--lab-signal);
}

.compare__table td {
  color: var(--lab-text);
}

.compare__table td.is-current {
  background: color-mix(in srgb, var(--lab-signal-strong) 12%, transparent);
  box-shadow: inset 0 0 0 1px var(--lab-signal-edge);
}

.compare__table td.is-hot {
  color: var(--lab-hot);
}

.compare__runs {
  display: block;
  font-size: 0.625rem;
  color: var(--lab-text-silver);
}

.compare__runs.is-thin,
.compare__empty {
  color: var(--lab-text-muted);
}

.compare__empty {
  font-family: var(--lab-font-sans);
  font-size: 0.75rem;
}

.compare__verdict {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  line-height: 1.6;
}

.compare__verdict.is-isolation {
  border-left: 2px solid var(--lab-signal);
}

.compare__verdict.is-traversal {
  border-left: 2px solid var(--lab-warn);
}

.compare__verdict-tag {
  align-self: flex-start;
  padding: 0.0625rem 0.375rem;
  border: 1px solid currentColor;
  border-radius: 2px;
  font-family: var(--lab-font-mono);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.compare__verdict.is-isolation .compare__verdict-tag {
  color: var(--lab-signal);
}

.compare__verdict.is-traversal .compare__verdict-tag {
  color: var(--lab-warn);
}

.compare__verdict p {
  margin: 0;
  color: var(--lab-text-silver);
}

.compare__read {
  font-size: 0.75rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

.compare__read p {
  margin: 0;
}

.compare__read ul {
  margin: 0.25rem 0 0;
  padding-left: 1.125rem;
}

.compare__clear {
  justify-self: start;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--lab-hairline-strong);
  border-radius: 2px;
  background: transparent;
  color: var(--lab-text-muted);
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.compare__clear:hover:not(:disabled) {
  color: var(--lab-text);
}

/* ---- DevTools 對照 ---- */

.devtools {
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.8125rem;
  line-height: 1.7;
}

.devtools + .devtools {
  margin-top: -1rem;
}

.devtools summary {
  padding: 0.625rem 1rem;
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--lab-probe);
  cursor: pointer;
}

.devtools summary:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: -1px;
}

.devtools ol {
  margin: 0 0 1rem;
  padding: 0 1rem 0 2.25rem;
}

.devtools ul {
  margin: 0.25rem 0 0;
  padding-left: 1.125rem;
}

.devtools li + li {
  margin-top: 0.375rem;
}

.devtools p {
  margin: -0.25rem 1rem 1rem;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

/* ---- matrix ---- */

.matrix__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}

.matrix__bar .section-title {
  margin: 0;
}

.matrix__count {
  color: var(--lab-signal);
  font-variant-numeric: tabular-nums;
}

.matrix__ratio-tag {
  margin-left: 0.75rem;
  padding: 0.0625rem 0.375rem;
  border: 1px solid color-mix(in srgb, var(--lab-signal) 40%, transparent);
  border-radius: 2px;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--lab-signal);
}

.matrix__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  color: var(--lab-text-muted);
}

.matrix__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.matrix__swatch {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: #3f3f46;
}

.matrix__swatch--lit {
  background: var(--lab-signal);
  box-shadow: 0 0 6px rgb(52 211 153 / 0.9);
}

.matrix__hint {
  margin: 0.5rem 0 0.75rem;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.matrix__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  align-content: start;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (max-width: 640px) {
  .storm-stage {
    padding: 1rem;
  }

  .scope__option {
    grid-template-columns: minmax(0, 1fr);
  }

  .scope__name {
    grid-row: auto;
  }

  .result__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .compare__table th,
  .compare__table td {
    padding-inline: 0.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trigger,
  .guide li,
  .picker button,
  .scope__option {
    transition: none;
  }

  .trigger:active:not(:disabled) {
    transform: none;
  }
}
</style>
