<script setup lang="ts">
/**
 * VDOM Stress 的互動探測視圖（Stage）。
 *
 * benchmark 頁（../VDomStressPage.vue）只量 renderDuration（建立陣列 → Vue nextTick），
 * 但大量 Mount 時真正的瓶頸是之後的瀏覽器 Layout（見 README Observation）。
 * 這頁在同一個流程後面多量三件事：MutationObserver 實際插入的節點數、強制 reflow 的 Layout 時間、
 * 到下一個 frame 的時間，並用「主執行緒連續被佔用的時間」對照 frame / long task 預算下判定。
 * 方格矩陣的樣式與 benchmark 頁的 card 不同，數字不可與 benchmark 頁或 README 的數據直接比較。
 */
import { computed, nextTick, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue'
import VdomMicroGrid, { type MicroCard } from './VdomMicroGrid.vue'
import VdomTty, { type TtyLine, type TtyTone } from './VdomTty.vue'

// 與 benchmark 頁相同的可選數量
const MASS_OPTIONS = [100, 500, 1000, 5000] as const
type Mass = (typeof MASS_OPTIONS)[number]

// 判定預算：一個 frame（60fps）與 long task 門檻
const FRAME_BUDGET_MS = 1000 / 60
const LONG_TASK_MS = 50

// 注入後的「點亮」與 EXECUTING 狀態至少維持的時間，太短看不到
const EXECUTING_HOLD_MS = 600
// TTY 列出插入節點時，頭尾各列幾個
const NODE_PREVIEW = 3

type Tier = 'stable' | 'drop' | 'choke'

interface InjectionResult {
  type: 'mount' | 'update'
  nodes: number
  inserted: number
  removed: number
  allocMs: number
  patchMs: number
  layoutMs: number
  frameMs: number
  blockedMs: number
  tier: Tier
}

const selectedMass = ref<Mass>(MASS_OPTIONS[1])
const cards = shallowRef<MicroCard[]>([])
const executing = ref(false)
const result = shallowRef<InjectionResult | null>(null)
const pulseKey = ref(0)

const matrixEl = useTemplateRef<HTMLElement>('matrix')
const tty = useTemplateRef<InstanceType<typeof VdomTty>>('tty')

const nextType = computed(() => (cards.value.length === 0 ? 'mount' : 'update'))

function tierOf(blockedMs: number): Tier {
  if (blockedMs <= FRAME_BUDGET_MS) return 'stable'
  if (blockedMs <= LONG_TASK_MS) return 'drop'
  return 'choke'
}

// ---- TTY ----

let lineSeq = 0

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** performance.now() → 牆上時間 HH:MM:SS.mmm */
function stamp(time: number): string {
  const date = new Date(performance.timeOrigin + time)
  return (
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}` +
    `.${pad(date.getMilliseconds(), 3)}`
  )
}

function line(tone: TtyTone, tag: string, text: string, time: number): TtyLine {
  return { id: lineSeq++, time: stamp(time), tag, text, tone }
}

function ms(value: number): string {
  return `${value.toFixed(2)} ms`
}

// 分頁在背景時瀏覽器不跑 requestAnimationFrame：最多等這麼久就繼續，避免按鈕卡在 RENDERING
const FRAME_FALLBACK_MS = 100

/** 等到下一個 frame 畫完：rAF 之後再排一個 task（背景分頁改用 timeout 保底） */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      setTimeout(resolve, 0)
    }
    requestAnimationFrame(finish)
    setTimeout(finish, FRAME_FALLBACK_MS)
  })
}

let holdTimer: ReturnType<typeof setTimeout> | undefined

function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => {
    holdTimer = setTimeout(resolve, duration)
  })
}

// ---- 注入 ----

async function inject(): Promise<void> {
  const matrix = matrixEl.value
  if (executing.value || purging.value || !matrix) return

  executing.value = true
  // 先讓 RENDERING / PATCHING 狀態畫出來，量測從下一個 task 開始
  await nextTick()
  await nextFrame()

  const nodes = selectedMass.value
  const type = cards.value.length === 0 ? 'mount' : 'update'
  // MutationObserver 的 callback 可能在 nextTick 之前就以 microtask 跑掉並帶走紀錄，所以 callback 也要收
  const records: MutationRecord[] = []
  const observer = new MutationObserver((batch) => {
    records.push(...batch)
  })
  observer.observe(matrix, { childList: true, subtree: true })

  // 先把之前累積、還沒算的 style / layout（上一次的點亮、PURGE 移除的節點等）結清，
  // 否則下面量到的 Layout 會混進不屬於這次注入的工作（背景分頁不畫 frame 時特別明顯）
  void matrix.offsetHeight

  // 以下到 Layout 結束都在同一個 task 裡，主執行緒不會讓出
  const start = performance.now()
  const next: MicroCard[] = []
  for (let i = 1; i <= nodes; i++) {
    next.push({ id: i, title: `Card #${i}` })
  }
  const allocEnd = performance.now()

  cards.value = next
  await nextTick()
  const patchEnd = performance.now()

  records.push(...observer.takeRecords())
  observer.disconnect()

  // 讀 offsetHeight 強制瀏覽器立刻算完 style + layout（本來就會在下一個 frame 算）
  void matrix.offsetHeight
  const layoutEnd = performance.now()

  await nextFrame()
  const frameEnd = performance.now()

  // ---- 整理實測結果 ----
  const insertedIds: number[] = []
  let removed = 0
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLLIElement) insertedIds.push(Number(node.title.replace('Card #', '')))
    }
    for (const node of record.removedNodes) {
      if (node instanceof HTMLLIElement) removed++
    }
  }

  const allocMs = allocEnd - start
  const patchMs = patchEnd - allocEnd
  const layoutMs = layoutEnd - patchEnd
  const frameMs = frameEnd - layoutEnd
  const blockedMs = layoutEnd - start
  const tier = tierOf(blockedMs)

  const log: TtyLine[] = [
    line('sys', 'INJECT', `${type.toUpperCase()} · ${nodes} nodes requested`, start),
    line('sys', 'ALLOC', `card data array built · ${ms(allocMs)}`, allocEnd),
    line('work', 'PATCH', `Vue render + DOM commit (renderDuration) · ${ms(patchMs)}`, patchEnd),
  ]

  if (insertedIds.length === 0) {
    log.push(
      line(
        'dom',
        'DOM',
        removed > 0
          ? `0 inserted · ${removed} removed`
          : `0 nodes inserted · keyed diff reused all ${nodes} nodes`,
        patchEnd,
      ),
    )
  } else {
    const head = insertedIds.slice(0, NODE_PREVIEW)
    const tail = insertedIds.length > NODE_PREVIEW * 2 ? insertedIds.slice(-NODE_PREVIEW) : []
    const shown = tail.length ? head : insertedIds
    for (const id of shown) {
      log.push(line('dom', 'DOM', `<li> #${pad(id, 4)} inserted`, patchEnd))
    }
    if (tail.length) {
      const skipped = insertedIds.length - head.length - tail.length
      log.push(line('dom', 'DOM', `… ${skipped.toLocaleString()} more <li> inserted`, patchEnd))
      for (const id of tail) {
        log.push(line('dom', 'DOM', `<li> #${pad(id, 4)} inserted`, patchEnd))
      }
    }
    if (removed > 0) log.push(line('dom', 'DOM', `${removed} <li> removed`, patchEnd))
  }

  log.push(
    line('work', 'LAYOUT', `forced reflow (style + layout) · ${ms(layoutMs)}`, layoutEnd),
    line(
      'sys',
      'FRAME',
      document.visibilityState === 'hidden'
        ? 'tab hidden · no frame presented (browser pauses rendering)'
        : `next frame presented · +${ms(frameMs)} (paint + vsync wait)`,
      frameEnd,
    ),
    line(
      tier,
      'SETTLED',
      `main thread blocked ${ms(blockedMs)} · ${
        tier === 'stable' ? 'within 1 frame' : tier === 'drop' ? 'frame dropped' : 'LONG TASK'
      }`,
      frameEnd,
    ),
  )

  result.value = {
    type,
    nodes,
    inserted: insertedIds.length,
    removed,
    allocMs,
    patchMs,
    layoutMs,
    frameMs,
    blockedMs,
    tier,
  }
  pulseKey.value++
  void tty.value?.append(log)

  await sleep(Math.max(0, EXECUTING_HOLD_MS - (performance.now() - start)))
  executing.value = false
}

// PURGE：矩陣先整體淡出（消磁），再真正清空資料
const PURGE_FADE_MS = 200
const purging = ref(false)

async function purge(): Promise<void> {
  if (executing.value || purging.value || cards.value.length === 0) return
  purging.value = true
  await sleep(PURGE_FADE_MS)
  cards.value = []
  result.value = null
  purging.value = false
}

onUnmounted(() => {
  if (holdTimer) clearTimeout(holdTimer)
})

// ---- 判定文字（全部由實測值組成）----

const bottleneck = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.layoutMs > r.patchMs
    ? `瓶頸在瀏覽器 Layout（${ms(r.layoutMs)}），不在 Vue。`
    : `瓶頸在 Vue 的 render / patch（${ms(r.patchMs)}）。`
})

interface LedePart {
  text: string
  strong?: boolean
}

const ledeParts = computed<LedePart[]>(() => {
  const r = result.value
  if (!r) {
    return [
      { text: '選擇 INJECTION_MASS，按下 ' },
      { text: 'INJECT', strong: true },
      { text: '：這裡會依實測的主執行緒佔用時間下判定。' },
    ]
  }
  const nodes = r.nodes.toLocaleString()
  const verb = r.type === 'mount' ? '掛載' : '更新'
  const blocked = { text: ms(r.blockedMs), strong: true }

  if (r.type === 'update' && r.inserted === 0 && r.removed === 0) {
    return [
      { text: `診斷：${nodes} 個節點的資料內容沒變，keyed diff 沒有寫入任何 DOM；主執行緒被佔用 ` },
      blocked,
      {
        text: '，幾乎全是 Vue 重建陣列與比對的成本。按 PURGE 清空後再注入，才會看到真正的 Mount 成本。',
      },
    ]
  }
  if (r.tier === 'stable') {
    return [
      { text: `診斷：${verb} ${nodes} 個節點只佔用主執行緒 ` },
      blocked,
      { text: '，在一個 frame（16.7 ms）內完成，使用者感覺不到卡頓。' },
    ]
  }
  if (r.tier === 'drop') {
    return [
      { text: '診斷：主執行緒被佔用 ' },
      blocked,
      { text: `，超過一個 frame 會掉幀，但還沒到 50 ms 的長任務門檻。${bottleneck.value}` },
    ]
  }
  return [
    { text: `診斷：一次${verb} ${nodes} 個節點，主執行緒連續被佔用 ` },
    blocked,
    {
      text:
        `（Vue patch ${ms(r.patchMs)} ＋ Layout ${ms(r.layoutMs)}），超過 50 ms 長任務門檻，` +
        `這段期間點擊與捲動都不會回應。${bottleneck.value}`,
    },
  ]
})
</script>

<template>
  <div class="vdom-stage lab-theme">
    <header class="vdom-stage__header">
      <div class="vdom-stage__heading">
        <h1>VDOM Stress</h1>
        <span class="vdom-stage__tag">STAGE VIEW</span>
      </div>
      <p class="vdom-stage__note">
        互動探測版本：多量了 Layout 與下一個 frame，方格樣式也不同，數字不與 benchmark 頁或 README
        數據直接比較。
      </p>
    </header>

    <main class="vdom-stage__main">
      <!-- ---- 左：Mass Control ---- -->
      <section class="control" aria-labelledby="stage-control">
        <h2 id="stage-control">Mass Control Panel</h2>
        <div class="control__panel">
          <fieldset class="mass">
            <legend>INJECTION_MASS</legend>
            <div class="mass__options">
              <label v-for="option in MASS_OPTIONS" :key="option" class="mass__option">
                <input
                  v-model="selectedMass"
                  type="radio"
                  name="stage-injection-mass"
                  :value="option"
                  :disabled="executing"
                />
                {{ option.toLocaleString() }}
              </label>
            </div>
          </fieldset>

          <p class="control__next">
            下一次注入：<strong>{{ nextType.toUpperCase() }}</strong>
            <template v-if="nextType === 'mount'">（矩陣是空的，所有節點都要新建）</template>
            <template v-else
              >（已有 {{ cards.length.toLocaleString() }} 個節點，走 keyed diff）</template
            >
          </p>

          <div class="control__actions">
            <button
              type="button"
              class="inject"
              :class="{ 'is-executing': executing }"
              :disabled="executing"
              @click="inject"
            >
              {{ executing ? '[ RENDERING / PATCHING... ]' : '[ ⚡ INJECT MASS UI NODES ]' }}
            </button>
            <button
              type="button"
              class="purge"
              :class="{ 'is-purging': purging }"
              :disabled="executing || cards.length === 0"
              @click="purge"
            >
              [ PURGE ]
            </button>
          </div>

          <dl class="budget" aria-label="判定門檻">
            <div class="budget--stable">
              <dt>STABLE</dt>
              <dd>≤ 16.7 ms（1 frame）</dd>
            </div>
            <div class="budget--drop">
              <dt>FRAME DROP</dt>
              <dd>≤ 50 ms</dd>
            </div>
            <div class="budget--choke">
              <dt>VDOM CHOKED</dt>
              <dd>&gt; 50 ms（long task）</dd>
            </div>
          </dl>
          <p class="budget__note">
            判定依據：主執行緒連續被佔用的時間（資料準備 ＋ Vue patch ＋ 瀏覽器
            Layout），不看節點數。
          </p>
        </div>
      </section>

      <!-- ---- 右：結論 → 終端機 → 數據 ---- -->
      <section
        class="verdict"
        :class="result ? `verdict--${result.tier}` : 'verdict--pending'"
        aria-labelledby="stage-verdict"
      >
        <h2 id="stage-verdict">[ CORE_DIAGNOSTIC_VERDICT ]</h2>
        <!-- 判定為 CHOKED 的瞬間，面板外框硬閃兩次；每次注入換 key 重播 -->
        <span
          v-if="result?.tier === 'choke'"
          :key="pulseKey"
          class="verdict__flash"
          aria-hidden="true"
        />

        <div class="verdict__lead" role="status">
          <p class="verdict__headline">
            <template v-if="!result">[ VDOM STATUS: AWAITING INJECTION ]</template>
            <template v-else-if="result.tier === 'stable'">[ VDOM STATUS: STABLE ]</template>
            <template v-else-if="result.tier === 'drop'">[ VDOM STATUS: FRAME DROP ]</template>
            <template v-else>[ PERFORMANCE CRASH: VDOM CHOKED ]</template>
          </p>
          <!-- 診斷句在 script 組好：中文句子在 template 換行會被插入多餘的空白 -->
          <p class="verdict__lede">
            <template v-for="(part, i) in ledeParts" :key="i">
              <strong v-if="part.strong">{{ part.text }}</strong>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
        </div>

        <VdomTty ref="tty" />

        <p class="verdict__status">
          <span class="verdict__bracket">[</span>
          <span
            >RENDER_TYPE: <b>{{ result?.type ?? '-' }}</b></span
          >
          <span class="verdict__sep">|</span>
          <span
            >NODES: <b>{{ result ? result.nodes : '-' }}</b></span
          >
          <span class="verdict__sep">|</span>
          <span
            >RENDER_DURATION: <b>{{ result ? ms(result.patchMs) : '-' }}</b></span
          >
          <span class="verdict__sep">|</span>
          <span
            >LAYOUT: <b>{{ result ? ms(result.layoutMs) : '-' }}</b></span
          >
          <span class="verdict__sep">|</span>
          <!-- 最後一項與收尾的 ] 綁在一起，避免 ] 單獨換到下一行 -->
          <span class="verdict__tail">
            BLOCKED: <b class="verdict__blocked">{{ result ? ms(result.blockedMs) : '-' }}</b>
            <span class="verdict__bracket">]</span>
          </span>
        </p>
      </section>

      <!-- ---- 下：方格矩陣 ---- -->
      <section
        class="matrix"
        :class="[result ? `matrix--${result.tier}` : 'matrix--idle', { 'is-purging': purging }]"
        aria-labelledby="stage-matrix"
      >
        <h2 id="stage-matrix">
          [ RENDERED_NODE_MATRIX ]
          <span class="matrix__count">{{ cards.length.toLocaleString() }} nodes</span>
        </h2>
        <div ref="matrix" class="matrix__frame">
          <!-- 每次注入換 key 重播一次掃描光；不碰底下的方格，不會觸發矩陣重新 patch -->
          <span v-if="pulseKey > 0" :key="pulseKey" class="matrix__sweep" aria-hidden="true" />
          <p v-if="cards.length === 0" class="matrix__empty">
            矩陣是空的：注入後每個節點會成為一格。
          </p>
          <VdomMicroGrid :cards="cards" />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Hardcore Dark Lab 的 Stage 版本（規範見 DESIGN.md）。這頁不是 benchmark，可以有動畫。 */

.vdom-stage {
  --tier: var(--lab-text-muted);

  box-sizing: border-box;
  min-height: 100%;
  padding: 1.5rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

.vdom-stage strong {
  font-family: var(--lab-font-mono);
  font-weight: 700;
  color: var(--lab-text);
}

/* ---- header ---- */

.vdom-stage__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: baseline;
  gap: 0.5rem 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.vdom-stage__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
}

.vdom-stage__heading h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.vdom-stage__tag {
  padding: 0.125rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--lab-signal) 40%, transparent);
  border-radius: 2px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  white-space: nowrap;
  color: var(--lab-signal);
}

.vdom-stage__note {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

/* ---- 版面：上排左控制、右診斷（等高），下排方格矩陣滿寬 ---- */

.vdom-stage__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 2rem 1.5rem;
}

.matrix {
  grid-column: 1 / -1;
}

.vdom-stage h2 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 0.875rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.vdom-stage h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- Mass Control Panel ---- */

.control {
  display: flex;
  flex-direction: column;
}

.control__panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1rem;
  border: 1px solid var(--lab-hairline);
  border-top-color: color-mix(in srgb, var(--lab-signal) 40%, var(--lab-hairline));
  background: var(--lab-panel);
}

.mass {
  margin: 0;
  padding: 0;
  border: 0;
}

.mass legend {
  padding: 0 0 0.5rem;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.mass__options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mass__option {
  position: relative;
  padding: 0.75rem 0;
  border: 1px solid var(--lab-hairline-strong);
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--lab-text-muted);
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-hard),
    color 150ms var(--lab-ease-hard);
}

.mass__option + .mass__option {
  border-left: 0;
}

.mass__option:hover {
  color: var(--lab-text);
  background: color-mix(in srgb, var(--lab-hairline-strong) 40%, transparent);
}

.mass__option:has(input:checked) {
  color: var(--lab-signal);
  background: color-mix(in srgb, var(--lab-signal) 12%, transparent);
  box-shadow: inset 0 -2px 0 var(--lab-signal);
}

.mass__option:has(input:focus-visible) {
  outline: 1px solid var(--lab-signal);
  outline-offset: -1px;
}

.mass__option:has(input:disabled) {
  cursor: not-allowed;
}

.mass__option input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.control__next {
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

.control__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
}

.inject,
.purge {
  position: relative;
  min-height: 3.25rem;
  padding: 0 1rem;
  border-radius: 2px;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-hard),
    border-color 150ms var(--lab-ease-hard),
    box-shadow 150ms var(--lab-ease-hard),
    transform 80ms var(--lab-ease-hard);
}

.inject {
  border: 1px solid var(--lab-signal-strong);
  background: color-mix(in srgb, var(--lab-signal-strong) 8%, transparent);
  color: var(--lab-signal);
}

/* hover：低調的綠色微光；按下：機械式按壓 */
.inject:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lab-signal-strong) 14%, transparent);
  box-shadow: 0 0 8px rgb(16 185 129 / 0.3);
}

.inject:active:not(:disabled) {
  background: color-mix(in srgb, var(--lab-signal-strong) 24%, transparent);
  transform: scale(0.98);
}

/*
 * RENDERING / PATCHING：核心超載。
 * 外框以 steps() 硬切明暗（0.36s 一個週期，約每秒 2.8 次，低於 WCAG 2.3.1 的每秒 3 次閃爍上限），
 * 加一道暗色半透明的流動光帶。兩者都只動 opacity / transform，主執行緒被 VDOM 佔住時仍由 compositor 繼續播放，
 * 正好把「主執行緒卡住、畫面卻還在閃」直接演給使用者看。
 */
.inject.is-executing {
  overflow: hidden;
  border-color: color-mix(in srgb, var(--lab-hot) 45%, transparent);
  background: color-mix(in srgb, var(--lab-hot) 8%, var(--lab-panel-sunken));
  color: var(--lab-hot);
  cursor: progress;
}

.inject.is-executing::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 45%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--lab-hot) 22%, transparent),
    transparent
  );
  pointer-events: none;
  animation: overload-flow 720ms var(--lab-ease-hard) infinite;
}

.inject.is-executing::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--lab-hot);
  border-radius: inherit;
  box-shadow: inset 0 0 14px color-mix(in srgb, var(--lab-hot) 35%, transparent);
  pointer-events: none;
  animation: overload-pulse 360ms steps(2, jump-none) infinite;
}

.purge {
  border: 1px solid var(--lab-hairline-strong);
  background: transparent;
  color: var(--lab-text-muted);
}

.purge:hover:not(:disabled) {
  border-color: var(--lab-text-muted);
  color: var(--lab-text);
}

.purge:active:not(:disabled) {
  transform: scale(0.98);
}

/* PURGE：按下的瞬間硬閃一下暗綠（除能），矩陣同時淡出 */
.purge.is-purging {
  animation: purge-flash 200ms steps(2, jump-none) 1;
}

.purge:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.inject:focus-visible,
.purge:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 3px;
}

/* 判定門檻對照 */
.budget {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: auto 0 0;
  border: 1px solid var(--lab-hairline);
}

.budget div {
  display: grid;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-left: 1px solid var(--lab-hairline);
  box-shadow: inset 0 2px 0 var(--budget);
}

.budget div:first-child {
  border-left: 0;
}

.budget--stable {
  --budget: var(--lab-signal);
}

.budget--drop {
  --budget: var(--lab-warn);
}

.budget--choke {
  --budget: var(--lab-hot);
}

.budget dt {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--budget);
}

.budget dd {
  margin: 0;
  font-size: 0.6875rem;
  color: var(--lab-text-muted);
}

.budget__note {
  margin: -0.5rem 0 0;
  font-family: var(--lab-font-sans);
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

/* ---- [ CORE_DIAGNOSTIC_VERDICT ] ---- */

.verdict {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  border: 1px solid color-mix(in srgb, var(--tier) 35%, var(--lab-hairline));
  background: var(--lab-panel-sunken);
}

.verdict::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  width: 14px;
  height: 14px;
  border-top: 1px solid var(--tier);
  border-left: 1px solid var(--tier);
}

.verdict__flash {
  position: absolute;
  inset: -1px;
  z-index: 1;
  border: 1px solid var(--lab-hot);
  box-shadow: 0 0 16px color-mix(in srgb, var(--lab-hot) 45%, transparent);
  pointer-events: none;
  opacity: 0;
  animation: verdict-flash 560ms steps(1, end) 1;
}

.verdict--pending {
  --tier: var(--lab-text-muted);
}

.verdict--stable,
.matrix--stable {
  --tier: var(--lab-signal);
}

.verdict--drop,
.matrix--drop {
  --tier: var(--lab-warn);
}

.verdict--choke,
.matrix--choke {
  --tier: var(--lab-hot);
}

.verdict__lead {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.verdict__headline {
  margin: 0;
  font-size: clamp(1.5rem, 2.4vw, 2.125rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: balance;
  color: var(--tier);
  text-shadow: 0 0 24px color-mix(in srgb, var(--tier) 35%, transparent);
}

.verdict--pending .verdict__headline {
  font-size: 1.25rem;
  color: color-mix(in srgb, var(--lab-warn) 55%, var(--lab-text-muted));
  text-shadow: none;
}

.verdict__lede {
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--lab-text-silver);
}

.verdict--pending .verdict__lede {
  color: color-mix(in srgb, var(--lab-warn) 75%, var(--lab-text-muted));
}

.verdict__lede strong {
  color: var(--tier);
}

.verdict--pending .verdict__lede strong {
  color: var(--lab-warn);
}

.verdict__status {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75ch;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lab-tty-rule);
  border-top: 0;
  background: var(--lab-tty-bg);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.verdict__status b {
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-text-silver);
}

.verdict__status b.verdict__blocked {
  color: var(--tier);
}

.verdict__tail {
  white-space: nowrap;
}

.verdict__bracket,
.verdict__sep {
  color: var(--lab-hairline-strong);
}

/* ---- [ RENDERED_NODE_MATRIX ] ---- */

.matrix--idle {
  --tier: var(--lab-hairline-strong);
}

.matrix__count {
  order: 2;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--lab-text-muted);
}

/* 矩陣視窗：高度鎖定，幾千格只在框內捲動 */
.matrix__frame {
  position: relative;
  max-height: 260px;
  padding: 1px;
  /* 掃描光會位移到框外：橫向裁掉，不讓它撐出水平捲軸 */
  overflow: hidden auto;
  border: 1px solid var(--lab-hairline);
  /* 格線：方格之間 1px 的 gap 透出這個底色 */
  background: var(--lab-tty-rule);
  transition:
    border-color 400ms var(--lab-ease-hard),
    box-shadow 400ms var(--lab-ease-hard);
}

/*
 * 終端機風格捲軸：4px 暗灰滑塊、軌道與頁面底色相同。
 * lab-theme 在 html 上設了會繼承的 scrollbar-color，Chrome 只要看到標準屬性就忽略 ::-webkit-scrollbar，
 * 所以這裡先重設回 auto。
 */
.matrix__frame {
  scrollbar-color: auto;
  scrollbar-width: auto;
}

.matrix__frame::-webkit-scrollbar {
  width: 4px;
}

.matrix__frame::-webkit-scrollbar-track {
  background: var(--lab-bg);
}

.matrix__frame::-webkit-scrollbar-thumb {
  background: var(--lab-scroll-thumb);
}

/* 不支援 ::-webkit-scrollbar 的瀏覽器（Firefox）改用標準屬性；Chrome 一旦設了標準屬性就會忽略上面的 4px 設定 */
@supports not selector(::-webkit-scrollbar) {
  .matrix__frame {
    scrollbar-width: thin;
    scrollbar-color: var(--lab-scroll-thumb) var(--lab-bg);
  }
}

/* 注入後依判定等級亮起：方格染上 22% 的等級色，外框微光 */
.matrix:not(.matrix--idle) .matrix__frame {
  --micro-cell: color-mix(in srgb, var(--tier) 22%, var(--lab-cell));

  border-color: color-mix(in srgb, var(--tier) 45%, var(--lab-hairline));
  box-shadow: 0 0 22px color-mix(in srgb, var(--tier) 18%, transparent);
}

/* PURGE 消磁：整個方格矩陣一起在 0.2 秒內淡出（單一元素的 opacity，不是幾千格各自動畫） */
.matrix__frame :deep(.micro-grid) {
  transition: opacity 200ms var(--lab-ease-hard);
}

.matrix.is-purging .matrix__frame {
  border-color: var(--lab-hairline);
  box-shadow: none;
}

.matrix.is-purging .matrix__frame :deep(.micro-grid) {
  opacity: 0;
}

/* 空矩陣時說明文字填滿整個（固定高度的）視窗，不露出底下的格線底色 */
.matrix__empty {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-height: 100%;
  margin: 0;
  padding: 2.5rem 1rem;
  background: var(--lab-panel-sunken);
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  text-align: center;
  color: var(--lab-text-muted);
}

/* 一次性的掃描光，由左到右掃過矩陣 */
.matrix__sweep {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 1;
  width: 18%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tier) 30%, transparent) 80%,
    transparent
  );
  pointer-events: none;
  translate: -100% 0;
  animation: sweep 700ms var(--lab-ease-hard) forwards;
}

@keyframes sweep {
  to {
    translate: 560% 0;
    opacity: 0;
  }
}

@keyframes overload-pulse {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.2;
  }
}

@keyframes overload-flow {
  from {
    translate: -100% 0;
  }

  to {
    translate: 230% 0;
  }
}

@keyframes purge-flash {
  from {
    border-color: var(--lab-signal-strong);
    background: color-mix(in srgb, var(--lab-signal-strong) 18%, transparent);
    color: var(--lab-text);
  }

  to {
    border-color: var(--lab-hairline-strong);
    background: transparent;
  }
}

/* 亮 → 暗 → 亮 → 暗：兩次硬閃 */
@keyframes verdict-flash {
  0% {
    opacity: 1;
  }

  25% {
    opacity: 0;
  }

  50% {
    opacity: 1;
  }

  75%,
  100% {
    opacity: 0;
  }
}

/*
 * ---- 單一螢幕版面（寬且夠高的視窗）----
 * 整頁鎖在 StageLayout 給的可用高度（導覽列以下）、頁面本身不捲動：下排矩陣固定高度（160–320px，依視窗高度），
 * 上排吃剩下的高度，右側 TTY 吸收差額並在框內捲動。窄或矮的視窗放不下，維持整頁捲動。
 */
@media (min-width: 1001px) and (min-height: 640px) {
  .vdom-stage {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .vdom-stage__header {
    flex: none;
  }

  .vdom-stage__main {
    flex: 1;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    row-gap: 1.25rem;
  }

  .control,
  .verdict {
    min-height: 0;
  }

  .control__panel {
    min-height: 0;
    overflow-y: auto;
  }

  .matrix__frame {
    height: clamp(160px, 30vh, 320px);
  }
}

/* 一般筆電高度（< 820px）：收緊間距，讓左側面板與 TTY 不必在框內捲動 */
@media (min-width: 1001px) and (min-height: 640px) and (max-height: 820px) {
  .vdom-stage {
    padding: 1rem 1.5rem;
  }

  .vdom-stage__header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
  }

  .vdom-stage__main {
    row-gap: 1rem;
  }

  .vdom-stage h2 {
    margin-bottom: 0.625rem;
  }

  .control__panel {
    gap: 0.75rem;
    padding: 0.875rem 1rem;
  }

  .verdict {
    padding: 1rem 1.25rem;
  }

  .verdict__lead {
    gap: 0.5rem;
    margin-bottom: 0.875rem;
  }

  .verdict__headline {
    font-size: 1.625rem;
  }

  .matrix__frame {
    height: clamp(150px, 25vh, 320px);
  }
}

/* ---- 窄螢幕 ---- */

@media (max-width: 1000px) {
  .vdom-stage__main {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .vdom-stage {
    padding: 1rem;
  }

  .vdom-stage__header {
    grid-template-columns: minmax(0, 1fr);
  }

  .control__actions,
  .budget {
    grid-template-columns: minmax(0, 1fr);
  }

  .budget div {
    border-left: 0;
    border-top: 1px solid var(--lab-hairline);
  }

  .budget div:first-child {
    border-top: 0;
  }

  .inject {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inject.is-executing::after,
  .purge.is-purging,
  .matrix__sweep {
    animation: none;
  }

  .inject.is-executing::before,
  .verdict__flash {
    display: none;
  }

  .matrix__frame :deep(.micro-grid) {
    transition: none;
  }

  .matrix__sweep {
    display: none;
  }

  .mass__option,
  .inject,
  .purge,
  .matrix__frame {
    transition: none;
  }
}
</style>
