<script setup lang="ts">
import { onMounted, onUnmounted, onUpdated, provide, reactive, ref, nextTick } from 'vue'
import { componentStormConfig } from '@/benchmarks/component-storm/config'
import { createComponentStormMetrics } from '@/benchmarks/component-storm/metrics'
import { createChildren } from '@/benchmarks/component-storm/createChildren'
import { REPORT_CHILD_RENDER_KEY } from '@/benchmarks/component-storm/keys'
import ComponentStormChild from './ComponentStormChild.vue'

const { componentCount, updateScope, autoUpdate, updateInterval } = componentStormConfig

// metrics 建立：要觀察哪些證據
const metrics = createComponentStormMetrics()

// Mount 量測從 setup 開始算起，結束點在 onMounted（此時所有 Child 都已完成首次 mount）
const mountStart = performance.now()

// COMPONENT_COUNT 個 Child 的初始狀態，結構完全一致
const children = reactive(createChildren(componentCount))

// ParentOnly 更新的目標：只變動 Parent 自身狀態，不碰任何 Child Props
const parentTick = ref(0)

// 每次 triggerUpdate 都重新統計「這次實際造成幾個 Child re-render」
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

// 依 UPDATE_SCOPE 更動不同範圍的狀態，其餘流程（量測開始 → 等待 flush → 量測結束）完全固定
async function triggerUpdate(): Promise<void> {
  updatedIdsThisCycle = new Set<number>()
  const start = performance.now()

  switch (updateScope) {
    case 'ParentOnly':
      parentTick.value++
      break
    case 'SingleChild': {
      const target = children[0]
      if (target) target.value++
      break
    }
    case 'AllChildren':
      for (const child of children) child.value++
      break
  }

  await nextTick()
  metrics.recordUpdateDuration(performance.now() - start)
  metrics.setUpdatedComponentCount(updatedIdsThisCycle.size)
}
</script>

<template>
  <article>
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
.params dl,
.metrics dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0.5rem 0 1rem;
}

.params dt,
.metrics dt {
  color: #64748b;
}

.params dd,
.metrics dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.metrics {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.children__desc {
  font-size: 0.8rem;
  color: #64748b;
  margin: -0.25rem 0 0.75rem;
  line-height: 1.4;
}

.children__header {
  display: grid;
  grid-template-columns: 100px 120px 1fr;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background-color: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
}

.header__col {
  display: inline-flex;
  align-items: center;
}

.info-icon {
  display: inline-block;
  margin-left: 0.25rem;
  color: #94a3b8;
  cursor: help;
  font-size: 0.75rem;
  font-weight: normal;
}

.info-icon:hover {
  color: #0284c7;
}

.children__list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 480px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 0 0 6px 6px;
}
</style>
