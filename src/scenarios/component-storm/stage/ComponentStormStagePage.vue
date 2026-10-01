<script setup lang="ts">
/**
 * Component Storm 的大會 Demo 視圖。
 *
 * 跟 benchmark 頁（../ComponentStormPage.vue）共用同一套 config / metrics / createChildren /
 * triggerUpdate 流程，但 Child 換成視覺化版本（StageChild：燈號矩陣 + 重繪閃爍），
 * 每次 update 額外多了動畫與較多的 DOM，所以這裡的數字不可與 benchmark 頁或 README 的數據直接比較。
 * benchmark 頁與 CDP runner 依賴的 DOM 結構都不在這個檔案裡，可以放心調整這裡的呈現。
 */
import { onMounted, onUnmounted, onUpdated, provide, reactive, ref, nextTick } from 'vue'
import {
  componentStormConfig,
  UPDATE_SCOPE_OPTIONS,
  type UpdateScope,
} from '@/benchmarks/component-storm/config'
import { createComponentStormMetrics } from '@/benchmarks/component-storm/metrics'
import { createChildren } from '@/benchmarks/component-storm/createChildren'
import { REPORT_CHILD_RENDER_KEY } from '@/benchmarks/component-storm/keys'
import FpsCounter from '@/components/FpsCounter.vue'
import StageChild from './StageChild.vue'

const { componentCount, autoUpdate, updateInterval } = componentStormConfig

// 初始值來自 config.ts，台上用 radio 即時切換
const updateScope = ref<UpdateScope>(componentStormConfig.updateScope)

const metrics = createComponentStormMetrics()
const mountStart = performance.now()
const children = reactive(createChildren(componentCount))
const parentTick = ref(0)

let updatedIdsThisCycle = new Set<number>()

function reportChildRender(id: number): void {
  updatedIdsThisCycle.add(id)
  metrics.increment('childRenderCount')
}
provide(REPORT_CHILD_RENDER_KEY, reportChildRender)

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

async function triggerUpdate(): Promise<void> {
  updatedIdsThisCycle = new Set<number>()
  const start = performance.now()

  switch (updateScope.value) {
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

// 健康度門檻：Mount 超過 50ms、單次 Update 超過一個 frame（16.7ms）就標成警告橘
const MOUNT_BUDGET_MS = 50
const FRAME_BUDGET_MS = 1000 / 60
</script>

<template>
  <div class="storm-stage lab-theme">
    <header class="storm-stage__header">
      <div class="storm-stage__heading">
        <h1 class="storm-stage__title">Component Storm</h1>
        <span class="storm-stage__tag">STAGE VIEW</span>
      </div>
      <nav class="storm-stage__nav" aria-label="Component Storm">
        <RouterLink to="/" class="storm-stage__link">← Pain Scenarios</RouterLink>
        <RouterLink to="/scenarios/component-storm" class="storm-stage__link">
          Benchmark 原始頁
        </RouterLink>
      </nav>
      <p class="storm-stage__note">
        視覺化 Demo 版本：每個 Child 多了燈號與重繪閃爍，數字不與 benchmark 頁或 README
        數據直接比較。
      </p>
    </header>

    <main class="storm-stage__main">
      <!-- 左欄：操控與診斷艙 -->
      <div class="storm-stage__console">
        <FpsCounter />

        <section class="panel panel--controls" aria-labelledby="stage-params">
          <h2 id="stage-params" class="panel__title">Lab Parameters</h2>
          <dl class="params">
            <div class="params__row">
              <dt>COMPONENT_COUNT</dt>
              <dd>{{ componentCount }}</dd>
            </div>
            <div class="params__row">
              <dt>UPDATE_INTERVAL</dt>
              <dd>{{ updateInterval }}<span class="unit">ms</span></dd>
            </div>
            <div class="params__row">
              <dt>AUTO_UPDATE</dt>
              <dd>{{ autoUpdate }}</dd>
            </div>
          </dl>
          <fieldset class="scope">
            <legend class="scope__legend">UPDATE_SCOPE</legend>
            <div class="scope__options">
              <label v-for="scope in UPDATE_SCOPE_OPTIONS" :key="scope" class="scope__option">
                <input
                  v-model="updateScope"
                  class="scope__input"
                  type="radio"
                  name="stage-update-scope"
                  :value="scope"
                  @change="metrics.resetUpdateMetrics()"
                />
                {{ scope }}
              </label>
            </div>
            <p class="scope__hint">切換時 Update 相關指標會歸零</p>
          </fieldset>
          <button v-if="!autoUpdate" type="button" class="trigger" @click="triggerUpdate">
            Trigger Update
          </button>
          <p v-else class="trigger-auto">AUTO · 每 {{ updateInterval }} ms 觸發一次</p>
        </section>

        <section class="panel panel--terminal" aria-labelledby="stage-metrics">
          <h2 id="stage-metrics" class="panel__title">Runtime Metrics</h2>
          <dl class="metrics">
            <div class="metrics__row">
              <dt>Mount Time</dt>
              <dd :class="{ 'is-hot': metrics.duration.mountTime > MOUNT_BUDGET_MS }">
                {{ metrics.duration.mountTime.toFixed(3) }}<span class="unit">ms</span>
              </dd>
            </div>
            <div class="metrics__row">
              <dt>Average Update Duration</dt>
              <dd
                :class="{
                  'is-hot': metrics.duration.averageUpdateDuration > FRAME_BUDGET_MS,
                }"
              >
                {{ metrics.duration.averageUpdateDuration.toFixed(3) }}<span class="unit">ms</span>
              </dd>
            </div>
            <div class="metrics__row">
              <dt>Total Update Count</dt>
              <dd class="is-neutral">{{ metrics.duration.totalUpdateCount }}</dd>
            </div>
            <div class="metrics__row">
              <dt>Updated Component Count</dt>
              <dd class="is-neutral">{{ metrics.duration.lastUpdatedComponentCount }}</dd>
            </div>
            <div class="metrics__row metrics__row--minor">
              <dt>Parent Render Count</dt>
              <dd class="is-neutral">{{ metrics.counters.parentRenderCount }}</dd>
            </div>
            <div class="metrics__row metrics__row--minor">
              <dt>Child Render Count（累計）</dt>
              <dd class="is-neutral">{{ metrics.counters.childRenderCount }}</dd>
            </div>
            <div class="metrics__row metrics__row--minor">
              <dt>Parent Tick</dt>
              <dd class="is-neutral">{{ parentTick }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <!-- 右欄：矩陣監控面板 -->
      <section class="storm-stage__matrix" aria-labelledby="stage-matrix">
        <div class="matrix__bar">
          <h2 id="stage-matrix" class="panel__title">
            Children Matrix <span class="matrix__count">{{ componentCount }}</span>
          </h2>
          <p class="matrix__legend">
            <span class="matrix__legend-item">
              <span class="matrix__swatch" aria-hidden="true" />idle
            </span>
            <span class="matrix__legend-item">
              <span class="matrix__swatch matrix__swatch--lit" aria-hidden="true" />re-rendered
            </span>
            <span class="matrix__legend-item">燈號 = Derived ×1~×5</span>
          </p>
        </div>
        <ul class="matrix__grid">
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
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 1.5rem;
}

/* ---- header ---- */

.storm-stage__header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 0.5rem 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #18181b;
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

.storm-stage__nav {
  display: flex;
  gap: 1.25rem;
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
}

.storm-stage__link {
  color: var(--lab-text-muted);
  text-decoration: none;
}

.storm-stage__link:hover {
  color: var(--lab-text);
}

.storm-stage__link:focus-visible,
.trigger:focus-visible {
  outline: 2px solid var(--lab-signal);
  outline-offset: 3px;
}

.storm-stage__note {
  grid-column: 1 / -1;
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
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 左欄可捲動時，面板維持原本高度，不被 flex 壓扁 */
.storm-stage__console > * {
  flex-shrink: 0;
}

@media (min-width: 1024px) {
  .storm-stage {
    height: 100vh;
    overflow: hidden;
  }

  .storm-stage__main {
    flex: 1;
    min-height: 0;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  }

  .storm-stage__console,
  .matrix__grid {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .storm-stage__console {
    min-height: 0;
    padding-right: 0.25rem;
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

/* ---- panels ---- */

.panel {
  position: relative;
  padding: 1.25rem;
  border: 1px solid #27272a;
  border-radius: 8px;
}

.panel__title {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin: 0 0 1rem;
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.panel--controls {
  background-color: rgb(24 24 27 / 0.4);
  background-image:
    linear-gradient(to right, rgb(63 63 70 / 0.18) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(63 63 70 / 0.18) 1px, transparent 1px);
  background-size: 16px 16px;
}

.params {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem 1.5rem;
  margin: 0;
}

.params__row dt {
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.params__row dd {
  margin: 0.25rem 0 0;
  font-family: var(--lab-font-mono);
  font-size: 1.375rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--lab-signal);
  overflow-wrap: anywhere;
}

/* UPDATE_SCOPE：原生 radio 保留在 DOM 中負責鍵盤與螢幕閱讀器，外觀由 label 呈現 */
.scope {
  margin: 1.25rem 0 0;
  padding: 0;
  border: 0;
}

.scope__legend {
  margin-bottom: 0.5rem;
  padding: 0;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.scope__options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid #3f3f46;
  border-radius: 4px;
  overflow: hidden;
}

.scope__option {
  position: relative;
  padding: 0.625rem 0.5rem;
  font-family: var(--lab-font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  text-align: center;
  color: var(--lab-text-muted);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.scope__option + .scope__option {
  border-left: 1px solid #3f3f46;
}

.scope__option:hover {
  color: var(--lab-text);
  background: rgb(63 63 70 / 0.3);
}

.scope__option:has(.scope__input:checked) {
  color: var(--lab-signal);
  background: rgb(16 185 129 / 0.12);
  box-shadow: inset 0 -2px 0 var(--lab-signal);
}

.scope__option:has(.scope__input:focus-visible) {
  outline: 2px solid var(--lab-signal);
  outline-offset: -2px;
}

.scope__input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.scope__hint {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.unit {
  margin-left: 0.25rem;
  font-size: 0.6em;
  font-weight: 500;
  color: var(--lab-text-muted);
}

.trigger {
  display: block;
  width: 100%;
  margin-top: 1.5rem;
  padding: 0.875rem 1.5rem;
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

.trigger:hover {
  background: var(--lab-signal);
  box-shadow: 0 0 24px rgb(16 185 129 / 0.45);
}

.trigger:active {
  transform: scale(0.97);
}

.trigger-auto {
  margin: 1.5rem 0 0;
  font-family: var(--lab-font-mono);
  font-size: 0.8125rem;
  color: var(--lab-warn);
}

/* ---- terminal ---- */

.panel--terminal {
  background: #000;
  padding: 1.5rem;
}

.metrics {
  margin: 0;
  font-family: var(--lab-font-mono);
}

.metrics__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0;
  border-bottom: 1px dotted #27272a;
}

.metrics__row:last-child {
  border-bottom: 0;
}

.metrics__row dt {
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

.metrics__row dd {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--lab-signal);
  white-space: nowrap;
}

.metrics__row dd.is-hot {
  color: var(--lab-hot);
}

.metrics__row dd.is-neutral {
  color: #f4f4f5;
}

.metrics__row--minor dd {
  font-size: 1rem;
}

/* ---- matrix ---- */

.matrix__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}

.matrix__bar .panel__title {
  margin: 0;
}

.matrix__count {
  color: var(--lab-signal);
  font-variant-numeric: tabular-nums;
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

.matrix__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  align-content: start;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: #3f3f46 transparent;
}

@media (max-width: 640px) {
  .storm-stage {
    padding: 1rem;
  }

  .storm-stage__header {
    grid-template-columns: minmax(0, 1fr);
  }

  .params,
  .scope__options {
    grid-template-columns: minmax(0, 1fr);
  }

  .scope__option + .scope__option {
    border-left: 0;
    border-top: 1px solid #3f3f46;
  }

  .metrics__row dd {
    font-size: 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trigger {
    transition: none;
  }

  .trigger:active {
    transform: none;
  }
}
</style>
