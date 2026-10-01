<script setup lang="ts">
import { onMounted, onUnmounted, onUpdated, provide, reactive, ref, nextTick } from 'vue'
import {
  componentStormConfig,
  UPDATE_SCOPE_OPTIONS,
  type UpdateScope,
} from '@/benchmarks/component-storm/config'
import { createComponentStormMetrics } from '@/benchmarks/component-storm/metrics'
import { createChildren } from '@/benchmarks/component-storm/createChildren'
import { REPORT_CHILD_RENDER_KEY } from '@/benchmarks/component-storm/keys'
import ComponentStormChild from './ComponentStormChild.vue'

const { componentCount, autoUpdate, updateInterval } = componentStormConfig

// 初始值來自 config.ts（CDP runner 靠改 config.ts 切換），畫面上的 radio 可即時切換
const updateScope = ref<UpdateScope>(componentStormConfig.updateScope)

// metrics 建立：要觀察哪些證據
const metrics = createComponentStormMetrics()

// 1. Mount 時間精確量測：量測從 Setup 階段開始記錄起始時間，並在 onMounted（所有 500 個 Child 都已完成 DOM 掛載）時計算出總 Mount Time
const mountStart = performance.now()

// 建立 500 個 Child 的初始狀態，結構完全一致（僅 id/label 不同），儲存在 reactive 陣列中
const children = reactive(createChildren(componentCount))

// ParentOnly 更新的目標：只變動 Parent 自身狀態，不碰任何 Child Props
const parentTick = ref(0)

// 2. 提供 Provide/Inject 回報管道：每次 triggerUpdate 都重新統計「這次實際造成幾個 Child re-render」
let updatedIdsThisCycle = new Set<number>()

function reportChildRender(id: number): void {
  updatedIdsThisCycle.add(id)
  metrics.increment('childRenderCount')
}
provide(REPORT_CHILD_RENDER_KEY, reportChildRender)

// Parent Component 每更新一次就會執行一次，藉此知道 Parent 自己有沒有重新 Render
onUpdated(() => {
  metrics.increment('parentRenderCount')
})

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  metrics.recordMountTime(performance.now() - mountStart)

  if (autoUpdate) {
    timer = setInterval(triggerUpdate, updateInterval)
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// 3. Update Scope 控制與更新時間計算：依 UPDATE_SCOPE 更動不同範圍的狀態，其餘流程（量測開始 → 等待 flush → 量測結束）完全固定
async function triggerUpdate(): Promise<void> {
  updatedIdsThisCycle = new Set<number>()
  const start = performance.now()

  switch (updateScope.value) {
    case 'ParentOnly':
      // 只改 Parent 自身的 parentTick，完全不碰 Child Props
      parentTick.value++
      break
    case 'SingleChild': {
      // 只改第 0 個 Child 的 value
      const target = children[0]
      if (target) target.value++
      break
    }
    case 'AllChildren':
      // 迴圈更新所有 500 個 Child 的 value
      for (const child of children) child.value++
      break
  }

  await nextTick() // 等待 Vue 將 Reactive 變動 Flush 到 DOM 視覺完成
  metrics.recordUpdateDuration(performance.now() - start)
  metrics.setUpdatedComponentCount(updatedIdsThisCycle.size)
}
</script>

<template>
  <article class="storm-bench lab-theme">
    <h1>Component Storm</h1>
    <p>
      Runtime Benchmark：驗證 Component 數量（COMPONENT_COUNT）與 Update Scope 對 Runtime Cost
      的影響。搭配 Chrome DevTools Performance 面板觀察 Flame Chart 與 Memory。
    </p>

    <section class="params">
      <h2>Lab Parameters</h2>
      <dl>
        <dt>COMPONENT_COUNT</dt>
        <dd>{{ componentCount }}</dd>
        <dt>UPDATE_SCOPE</dt>
        <dd>{{ updateScope }}</dd>
        <dt>UPDATE_INTERVAL</dt>
        <dd>{{ updateInterval }} ms</dd>
        <dt>AUTO_UPDATE</dt>
        <dd>{{ autoUpdate }}</dd>
      </dl>
      <!-- radio 刻意放在 .params dl 外面：CDP runner 的 readParams() 只讀 dl 內的 dt/dd -->
      <fieldset class="params__options">
        <legend>UPDATE_SCOPE（切換時 Update 相關 metrics 會歸零）</legend>
        <label v-for="scope in UPDATE_SCOPE_OPTIONS" :key="scope" class="params__option">
          <input
            v-model="updateScope"
            type="radio"
            name="update-scope"
            :value="scope"
            @change="metrics.resetUpdateMetrics()"
          />
          {{ scope }}
        </label>
      </fieldset>
      <button v-if="!autoUpdate" type="button" @click="triggerUpdate">Trigger Update</button>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>
      <dl>
        <dt>Mount Time</dt>
        <dd>{{ metrics.duration.mountTime.toFixed(3) }} ms</dd>
        <dt>Total Update Count</dt>
        <dd>{{ metrics.duration.totalUpdateCount }}</dd>
        <dt>Average Update Duration</dt>
        <dd>{{ metrics.duration.averageUpdateDuration.toFixed(3) }} ms</dd>
        <dt>Updated Component Count（上一次 update）</dt>
        <dd>{{ metrics.duration.lastUpdatedComponentCount }}</dd>
        <dt>Parent Render Count</dt>
        <dd>{{ metrics.counters.parentRenderCount }}</dd>
        <dt>Child Render Count（累計）</dt>
        <dd>{{ metrics.counters.childRenderCount }}</dd>
        <dt>Parent Tick（ParentOnly 用）</dt>
        <dd>{{ parentTick }}</dd>
      </dl>
    </section>

    <section class="children">
      <h2>Children Benchmark Tree（{{ componentCount }} 個結構一致控制變因元件）</h2>
      <p class="children__desc">
        所有 Child 元件的 Template、Props 與 computed
        計算邏輯完全相同（個體渲染成本固定），用以消除非關變因、驗證當前 UPDATE_SCOPE 下的狀態隔離與
        Runtime 成本。
      </p>
      <div class="children__header">
        <span>Component ID</span>
        <span class="header__col">
          Prop Value
          <span class="info-icon" title="由 Parent 傳入 Child 的原始 Prop 狀態 (value)">ⓘ</span>
        </span>
        <span class="header__col">
          Derived State (×1 ~ ×5)
          <span
            class="info-icon"
            title="Child 內部根據 value 透過 computed 算出的 5 個衍生狀態 (value × 1..5)，用以模擬真實 UI 的渲染負擔"
            >ⓘ</span
          >
        </span>
      </div>
      <ul class="children__list">
        <ComponentStormChild
          v-for="child in children"
          :id="child.id"
          :key="child.id"
          :value="child.value"
          :label="child.label"
        />
      </ul>
    </section>
  </article>
</template>

<style scoped>
/*
 * 暗色實驗室風格，與 stage/ComponentStormStagePage.vue 同一套 lab token。
 * 這頁是 benchmark：只改 CSS，不動 CDP runner 依賴的 DOM（.params dl、.metrics dl、
 * 「Trigger Update」按鈕文字）與 ComponentStormChild 的 template。
 */
.storm-bench {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 1.5rem;
}

.storm-bench > h1,
.storm-bench > p,
.children {
  grid-column: 1 / -1;
}

.storm-bench > h1 {
  margin: 0;
  font-family: var(--lab-font-mono);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.storm-bench > p {
  margin: -0.75rem 0 0;
  max-width: 44rem;
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

/* 兩張卡片撐滿同一列的高度；按鈕用 margin-top: auto 推到 Lab Parameters 底部 */
.params,
.metrics {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  padding: 1.25rem;
  border: 1px solid #27272a;
  border-radius: 8px;
}

.params h2,
.metrics h2,
.children h2 {
  margin: 0 0 1rem;
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

/* ---- Lab Parameters：儀器操縱盤 ---- */

.params {
  background-color: rgb(24 24 27 / 0.4);
  background-image:
    linear-gradient(to right, rgb(63 63 70 / 0.18) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(63 63 70 / 0.18) 1px, transparent 1px);
  background-size: 16px 16px;
}

/* dt/dd 是兄弟節點：直向排成兩欄，每欄 2 組 dt + dd */
.params dl {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(4, auto);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 1.5rem;
  margin: 0;
}

.params dt {
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.params dd {
  margin: 0 0 0.75rem;
  font-family: var(--lab-font-mono);
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--lab-signal);
  overflow-wrap: anywhere;
}

.params__options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  /* 下緣留間距：卡片不比 Metrics 高時，按鈕跟 radio 之間仍有呼吸空間 */
  margin: 0.5rem 0 1.25rem;
  padding: 0;
  border: 0;
}

.params__options legend {
  margin-bottom: 0.5rem;
  padding: 0;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.params__option {
  position: relative;
  padding: 0.5rem 0.25rem;
  border: 1px solid #3f3f46;
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  color: var(--lab-text-muted);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.params__option + .params__option {
  border-left: 0;
}

.params__option:first-of-type {
  border-radius: 4px 0 0 4px;
}

.params__option:last-of-type {
  border-radius: 0 4px 4px 0;
}

.params__option:hover {
  color: var(--lab-text);
  background: rgb(63 63 70 / 0.3);
}

.params__option:has(input:checked) {
  color: var(--lab-signal);
  background: rgb(16 185 129 / 0.12);
  box-shadow: inset 0 -2px 0 var(--lab-signal);
}

.params__option:has(input:focus-visible) {
  outline: 2px solid var(--lab-signal);
  outline-offset: -2px;
}

/* 原生 radio 保留在 DOM 中負責鍵盤與螢幕閱讀器，外觀由 label 呈現 */
.params__option input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.params button {
  display: block;
  width: 100%;
  margin-top: auto;
  padding: 0.75rem 1.5rem;
  border: 0;
  border-radius: 4px;
  background: var(--lab-signal-strong);
  color: #09090b;
  font-family: var(--lab-font-mono);
  font-size: 0.9375rem;
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

.params button:hover {
  background: var(--lab-signal);
  box-shadow: 0 0 24px rgb(16 185 129 / 0.45);
}

.params button:active {
  transform: scale(0.97);
}

.params button:focus-visible {
  outline: 2px solid var(--lab-signal);
  outline-offset: 3px;
}

/* ---- Runtime Metrics：終端機診斷面板 ---- */

.metrics {
  background: #000;
}

.metrics dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  margin: 0;
  font-family: var(--lab-font-mono);
}

.metrics dt,
.metrics dd {
  padding: 0.5rem 0;
  border-bottom: 1px dotted #27272a;
}

.metrics dt {
  align-self: baseline;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.metrics dd {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  color: #f4f4f5;
}

/* 前三個 dd（Mount Time / Total Update Count / Average Update Duration）放大成主要讀數 */
.metrics dd:nth-of-type(-n + 3) {
  font-size: 1.375rem;
  color: var(--lab-signal);
}

.metrics dt:last-of-type,
.metrics dd:last-of-type {
  border-bottom: 0;
}

/* ---- Children Benchmark Tree：矩陣監控面板 ---- */

.children h2 {
  margin-bottom: 0.5rem;
}

.children__desc {
  margin: 0 0 1rem;
  max-width: 44rem;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

.children__header {
  display: grid;
  grid-template-columns: 100px 120px 1fr;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #27272a;
  border-bottom: 1px dashed rgb(39 39 42 / 0.8);
  border-radius: 6px 6px 0 0;
  background: rgb(24 24 27 / 0.6);
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.header__col {
  display: inline-flex;
  align-items: center;
}

.info-icon {
  display: inline-block;
  margin-left: 0.25rem;
  font-size: 0.75rem;
  font-weight: normal;
  color: #71717a;
  cursor: help;
}

.info-icon:hover {
  color: var(--lab-probe);
}

.children__list {
  max-height: min(60vh, 560px);
  margin: 0;
  padding: 0;
  overflow-y: auto;
  border: 1px solid #27272a;
  border-top: 0;
  border-radius: 0 0 6px 6px;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: #3f3f46 transparent;
}

@media (max-width: 760px) {
  .storm-bench {
    grid-template-columns: minmax(0, 1fr);
  }

  .params__options {
    grid-template-columns: minmax(0, 1fr);
  }

  .params__option + .params__option {
    border-left: 1px solid #3f3f46;
    border-top: 0;
  }

  .params__option:first-of-type,
  .params__option:last-of-type {
    border-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .params button,
  .params__option {
    transition: none;
  }

  .params button:active {
    transform: none;
  }
}
</style>
