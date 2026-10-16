<script setup lang="ts">
/**
 * Reactive Chain 的互動探測視圖（Stage）。
 *
 * 目的：讓操作者看得懂「驗證不同 Reactive Dependency Depth 對 Update Cost 的影響」——
 * 可以切換 DEPTH、每次 update 用一句話說明發生了什麼，並把各 DEPTH 的中位耗時放進同一張表比較。
 *
 * benchmark 頁（../ReactiveChainPage.vue）要搭配 DevTools 看 console.log；這頁把同一條鏈的
 * 觸發歷程直接畫在 TTY 面板上，console.log 改成可開關。鏈改用 createTracedChain（每個節點多一次
 * performance.now() 與一次 push），畫面也多了 log 與動畫，所以這裡的數字不可與 benchmark 頁或 README 的數據比較。
 * benchmark 頁與 CDP runner 依賴的 DOM 都不在這個檔案裡。
 */
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  onUpdated,
  ref,
  shallowRef,
  useTemplateRef,
} from 'vue'
import { log } from '@/benchmarks/reactive/logger'
import ChainTty, { type TtyLine, type TtyTone } from './ChainTty.vue'
import { createTracedChain, type TraceEvent, type TracedChain } from './createTracedChain'

// 可選的 computed 層數；100 與 ReactiveChainPage.vue 的 DEPTH 相同（benchmark 頁的常數刻意不抽出共用）
const DEPTH_OPTIONS = [1, 10, 50, 100, 200, 500] as const
const DEFAULT_DEPTH = 100
// 「×N」一次連續觸發的次數：單次只有幾 ms，取多次中位數才看得出 DEPTH 的影響
const BATCH_SIZE = 10
// EXECUTING 狀態與傳導光效至少維持的時間；實際 update 只要幾 ms，太短看不到
const EXECUTING_HOLD_MS = 700

interface RunCounts {
  computed: number
  watch: number
  watchEffect: number
  render: number
}

// ---- 追蹤 buffer：鏈執行中只寫入非 reactive 的變數，update 結束後才一次交給畫面 ----
// onTrace 在 computed getter 內被呼叫，這裡讀到的 reactive 狀態都會變成那個 computed 的依賴，所以一律用普通變數

let pending: TtyLine[] = []
let lineSeq = 0
let tracing = false
// 追蹤中的是不是 update（false = 首航依賴建立）：update 期間的 computed 計算標成 [RE-RUN]
let inUpdate = false
// 這一輪是否輸出 console.log（每輪開始前從 logToConsole 複製過來）
let consoleOn = false
let counts: RunCounts = emptyCounts()

const tty = useTemplateRef<InstanceType<typeof ChainTty>>('tty')

function emptyCounts(): RunCounts {
  return { computed: 0, watch: 0, watchEffect: 0, render: 0 }
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** performance.now() → 牆上時間 HH:MM:SS.mmmµµµ */
function stamp(time: number): string {
  const epoch = performance.timeOrigin + time
  const date = new Date(epoch)
  const micros = Math.floor((epoch % 1) * 1000)
  return (
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}` +
    `.${pad(date.getMilliseconds(), 3)}${pad(micros, 3)}`
  )
}

function emit(tone: TtyTone, glyph: string, tag: string, text: string, time = performance.now()) {
  pending.push({ id: lineSeq++, time: stamp(time), glyph, tag, text, tone })
}

function flush(): void {
  if (pending.length === 0) return
  // 首航建立發生在 setup 內，TTY 還沒掛載：留在 pending，onMounted 後再交出去
  if (!tty.value) return
  void tty.value.append(pending)
  pending = []
}

function onTrace(event: TraceEvent): void {
  if (!tracing) return
  switch (event.kind) {
    case 'computed':
      counts.computed++
      if (consoleOn) log(`computed${event.step} executed`)
      if (inUpdate) {
        emit(
          'rerun',
          '└─',
          'RE-RUN',
          `DEP_${pad(event.step, 3)} computed${event.step} resolved ➔ ${event.value}`,
          event.time,
        )
      } else {
        emit(
          'dep',
          '└─',
          `DEP_${pad(event.step, 3)}`,
          `computed${event.step} resolved ➔ ${event.value}`,
          event.time,
        )
      }
      break
    case 'watch':
      counts.watch++
      if (consoleOn) log('watch triggered')
      emit('hook', '├─', 'WATCH', `watch callback fired ➔ ${event.value}`, event.time)
      break
    case 'watchEffect':
      counts.watchEffect++
      if (consoleOn) log('watchEffect triggered')
      emit('hook', '├─', 'EFFECT', `watchEffect re-run ➔ ${event.value}`, event.time)
      break
  }
}

// ---- 建立鏈（切換 DEPTH 時整條重建；首航依賴建立也記錄進 TTY）----

interface InitSummary {
  depth: number
  computed: number
  watchEffect: number
}

const depth = ref<number>(DEFAULT_DEPTH)
const logToConsole = ref(false)
const chain = shallowRef<TracedChain>(buildChain(DEFAULT_DEPTH))
const initSummary = shallowRef<InitSummary>({
  depth: DEFAULT_DEPTH,
  computed: counts.computed,
  watchEffect: counts.watchEffect,
})

function buildChain(nextDepth: number): TracedChain {
  consoleOn = logToConsole.value
  counts = emptyCounts()
  tracing = true
  inUpdate = false
  emit('sys', '➔', 'INIT', `Establishing dependency chain · depth=${nextDepth}`)
  const built = createTracedChain(nextDepth, onTrace)
  emit(
    'done',
    '✔',
    'INIT',
    `Chain armed · ${counts.computed} computed · ${counts.watchEffect} watchEffect`,
  )
  tracing = false
  flush()
  return built
}

function setDepth(nextDepth: number): void {
  if (executing.value || nextDepth === depth.value) return
  chain.value.dispose()
  depth.value = nextDepth
  chain.value = buildChain(nextDepth)
  initSummary.value = {
    depth: nextDepth,
    computed: counts.computed,
    watchEffect: counts.watchEffect,
  }
  lastRun.value = null
}

// 只有追蹤中的 render 才記錄；TTY 在子元件內，寫入 log 不會觸發這裡
onUpdated(() => {
  if (!tracing) return
  counts.render++
  if (consoleOn) log('component render')
  emit('hook', '└─', 'RENDER', 'component patched')
})

// ---- 觸發 ----

interface RunSummary {
  index: number
  depth: number
  from: number
  to: number
  duration: number
  logged: boolean
  counts: RunCounts
}

interface DepthResult {
  depth: number
  logged: boolean
  durations: number[]
}

const executing = ref(false)
const executingProgress = shallowRef<{ current: number; total: number } | null>(null)
const pulseKey = ref(0)
const lastRun = shallowRef<RunSummary | null>(null)
const runCount = ref(0)
const results = shallowRef<DepthResult[]>([])

let holdTimer: ReturnType<typeof setTimeout> | undefined

/** 觸發一次 source++ 並量測到鏈 settle 為止 */
async function runOnce(): Promise<void> {
  // 先讓前一輪的畫面更新（按鈕狀態、光效、結果表）render 完，這次 render 不算進追蹤
  await nextTick()

  const index = runCount.value + 1
  const currentDepth = depth.value
  const target = chain.value
  const from = target.source.value
  consoleOn = logToConsole.value
  counts = emptyCounts()
  tracing = true
  inUpdate = true
  emit('update', '⚡', 'UPDATE', `#${pad(index, 3)} triggered by $ TRIGGER UPDATE`)
  if (consoleOn) log(`---- update #${index} · depth=${currentDepth} ----`)

  const start = performance.now()
  emit('sys', '➔', 'SOURCE', `ref.value ${from} → ${from + 1}`, start)
  target.source.value++
  await nextTick()
  const end = performance.now()
  const duration = end - start

  tracing = false
  inUpdate = false
  // Performance 面板的 Timings 軌道會出現這段區間，方便在 flame chart 裡找到這次 update
  performance.measure(
    `reactive-chain depth=${currentDepth} #${pad(index, 3)}${consoleOn ? ' +log' : ''}`,
    { start, end },
  )
  emit(
    'done',
    '✔',
    'SETTLED',
    `${duration.toFixed(3)} ms · ${counts.computed} computed · ${counts.watch} watch · ` +
      `${counts.watchEffect} effect · ${counts.render} render`,
  )
  flush()

  runCount.value = index
  recordResult(currentDepth, consoleOn, duration)
  lastRun.value = {
    index,
    depth: currentDepth,
    from,
    to: from + 1,
    duration,
    logged: consoleOn,
    counts,
  }
}

async function triggerUpdate(times: number): Promise<void> {
  if (executing.value) return
  executing.value = true
  pulseKey.value++
  const holdUntil = performance.now() + EXECUTING_HOLD_MS

  for (let i = 0; i < times; i++) {
    executingProgress.value = times > 1 ? { current: i + 1, total: times } : null
    await runOnce()
  }

  const remaining = holdUntil - performance.now()
  if (remaining > 0) {
    await new Promise<void>((resolve) => {
      holdTimer = setTimeout(resolve, remaining)
    })
  }
  executingProgress.value = null
  executing.value = false
}

// ---- 各 DEPTH 的比較表 ----

function recordResult(resultDepth: number, logged: boolean, duration: number): void {
  const list = results.value.slice()
  const i = list.findIndex((row) => row.depth === resultDepth && row.logged === logged)
  const existing = list[i]
  if (existing) {
    list[i] = { ...existing, durations: [...existing.durations, duration] }
  } else {
    list.push({ depth: resultDepth, logged, durations: [duration] })
  }
  list.sort((a, b) => a.depth - b.depth || Number(a.logged) - Number(b.logged))
  results.value = list
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const rows = computed(() => {
  const withMedian = results.value.map((row) => {
    const value = median(row.durations)
    return { ...row, runs: row.durations.length, median: value, perLayer: value / row.depth }
  })
  const cleanMax = Math.max(...withMedian.filter((row) => !row.logged).map((row) => row.median), 0)
  const loggedMax = Math.max(...withMedian.filter((row) => row.logged).map((row) => row.median), 0)
  return withMedian.map((row) => {
    const baseMax = row.logged ? loggedMax : cleanMax
    return { ...row, share: baseMax > 0 ? Math.min(row.median / baseMax, 1) : 0 }
  })
})

const measuredDepths = computed(() => new Set(results.value.map((row) => row.depth)))

interface DiagnosisResult {
  isLinear: boolean
  ratio: string
  minDepth: number
  maxDepth: number
}

/** 依據未開啟 log 且取樣充足的列，評估 Vue 響應式鏈的複雜度走勢 */
const diagnosis = computed<DiagnosisResult | null>(() => {
  const cleanRows = rows.value.filter((row) => !row.logged && row.runs >= 3)
  if (cleanRows.length < 2) return null

  const sorted = [...cleanRows].sort((a, b) => a.depth - b.depth)
  // depth 1 常被 scheduler/microtask 底噪主導，若有深度 >= 10 的組別則以其作為基準
  const targetRows = sorted.filter((row) => row.depth >= 10)
  const comparison = targetRows.length >= 2 ? targetRows : sorted

  const minLayer = comparison.reduce((a, b) => (a.perLayer < b.perLayer ? a : b))
  const maxLayer = comparison.reduce((a, b) => (a.perLayer > b.perLayer ? a : b))
  const ratioNum = minLayer.perLayer > 0 ? maxLayer.perLayer / minLayer.perLayer : 1

  return {
    isLinear: ratioNum <= 3.0,
    ratio: ratioNum.toFixed(2),
    minDepth: sorted[0]!.depth,
    maxDepth: sorted[sorted.length - 1]!.depth,
  }
})

function clearResults(): void {
  results.value = []
  lastRun.value = null
  runCount.value = 0
}

// ---- 操作引導：依目前進度標出該做哪一步 ----

type StepState = 'done' | 'current' | 'todo'

const currentStep = computed<2 | 3 | 4>(() => {
  if (!measuredDepths.value.has(depth.value)) return 2
  if (measuredDepths.value.size < 2) return 3
  return 4
})

function stepState(step: number): StepState {
  if (step < currentStep.value) return 'done'
  if (step === currentStep.value) return 'current'
  return 'todo'
}

onUnmounted(() => {
  if (holdTimer) clearTimeout(holdTimer)
  chain.value.dispose()
})

// setup 內建鏈時 TTY 尚未掛載，掛載後把首航 log 交出去
onMounted(flush)
</script>

<template>
  <div class="chain-stage lab-theme">
    <header class="chain-stage__header">
      <div class="chain-stage__heading">
        <h1>Reactive Chain</h1>
        <span class="chain-stage__tag">STAGE VIEW</span>
      </div>
      <p class="chain-stage__question">
        <span class="chain-stage__question-tag">QUESTION</span>
        一個 ref 後面串了 N 層 computed（像表單的 derived state → validation → display）， 改一次
        ref 要付多少成本？成本會不會隨層數（DEPTH）等比例變大？
      </p>
      <p class="chain-stage__note">
        互動探測版本：每個節點多了追蹤與 log 輸出，數字只在本頁內互相比較，不與 benchmark 頁或
        README 數據直接比較。
      </p>
    </header>

    <main class="chain-stage__main">
      <div class="chain-stage__console">
        <!-- ---- 操作引導：做什麼、為什麼 ---- -->
        <section class="guide" aria-labelledby="stage-guide">
          <h2 id="stage-guide">How To Run</h2>
          <ol class="guide__steps">
            <li :class="`is-${stepState(1)}`">
              <span class="guide__no">01</span>
              <div>
                <p class="guide__do">
                  選一個 <strong>DEPTH</strong>：決定 ref 與 watch 之間串幾層 computed。
                </p>
                <p class="guide__why">
                  <b>WHY</b> DEPTH 是這個實驗唯一的變因；切換時整條鏈會重建，其他條件都不變。
                </p>
              </div>
            </li>
            <li :class="`is-${stepState(2)}`">
              <span class="guide__no">02</span>
              <div>
                <p class="guide__do">
                  按 <strong>Trigger Update</strong>（建議按 <strong>×{{ BATCH_SIZE }}</strong
                  >）：source ref +1，Vue 沿鏈逐層重算 computed1 → computed{{ depth }}，最後觸發
                  watch / watchEffect / render。
                </p>
                <p class="guide__why">
                  <b>WHY</b> 單次 update 只有幾 ms，容易被 GC 或排程雜訊干擾；同一個 DEPTH
                  多跑幾次、取中位數才可信。
                </p>
              </div>
            </li>
            <li :class="`is-${stepState(3)}`">
              <span class="guide__no">03</span>
              <div>
                <p class="guide__do">
                  換另一個 DEPTH 再跑一輪（建議對比顯著差距，如 10 與 100/200）。
                </p>
                <p class="guide__why">
                  <b>WHY</b> 只看單一深度無法看出趨勢；跨 2 個以上 DEPTH 才能分析時間複雜度。
                </p>
              </div>
            </li>
            <li :class="`is-${stepState(4)}`">
              <span class="guide__no">04</span>
              <div>
                <p class="guide__do">
                  檢視下方 <strong>Depth vs Update Cost</strong> 的 Per Layer 走勢與診斷結論。
                </p>
                <p class="guide__why">
                  <b>VERDICT</b> 若 Per Layer 持平，代表 Vue 依賴鏈的 Update 是嚴格線性傳導 O(N)。
                </p>
              </div>
            </li>
          </ol>
        </section>

        <ol
          :key="pulseKey"
          class="topology"
          :class="{ 'is-propagating': pulseKey > 0 }"
          aria-label="Reactive dependency chain"
        >
          <li style="--i: 0">ref</li>
          <li style="--i: 1">computed ×{{ depth }}</li>
          <li style="--i: 2">watch</li>
          <li style="--i: 3">watchEffect</li>
          <li style="--i: 4">render</li>
        </ol>

        <!-- ---- 操作 ---- -->
        <section class="control" aria-labelledby="stage-control">
          <h2 id="stage-control">Lab Parameters</h2>

          <div class="control__row" role="group" aria-labelledby="depth-label">
            <span id="depth-label" class="control__label">
              DEPTH <small>computed 層數</small>
            </span>
            <div class="depth-picker">
              <button
                v-for="option in DEPTH_OPTIONS"
                :key="option"
                type="button"
                :aria-pressed="option === depth"
                :disabled="executing"
                @click="setDepth(option)"
              >
                {{ option }}
                <span
                  v-if="measuredDepths.has(option)"
                  class="depth-picker__dot"
                  title="已有量測結果"
                />
              </button>
            </div>
          </div>

          <label class="control__log">
            <input v-model="logToConsole" type="checkbox" :disabled="executing" />
            <span>
              每一層輸出 <code>console.log</code>
              <small>給 DevTools 觀察用；log 本身很貴，開啟後耗時會變大，比較 DEPTH 時請關掉</small>
            </span>
          </label>

          <div class="control__run">
            <button
              type="button"
              class="trigger"
              :class="{ 'is-executing': executing }"
              :disabled="executing"
              @click="triggerUpdate(1)"
            >
              <template v-if="executing">
                [ EXECUTING{{
                  executingProgress
                    ? ` ${executingProgress.current}/${executingProgress.total}`
                    : '...'
                }}
                ]
              </template>
              <template v-else>Trigger Update</template>
            </button>
            <button
              type="button"
              class="trigger trigger--batch"
              :disabled="executing"
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
          <h2 id="stage-result">Last Update · 這次發生了什麼</h2>

          <p v-if="!lastRun" class="result__empty">
            鏈已建立：DEPTH {{ initSummary.depth }}，首航計算了 {{ initSummary.computed }} 個
            computed、{{ initSummary.watchEffect }} 次 watchEffect。 按
            <strong>Trigger Update</strong> 後，這裡會說明這次改了什麼、Vue
            依序執行了哪些節點、花了多久。
          </p>
          <template v-else>
            <p class="result__story">
              <span class="result__index">#{{ pad(lastRun.index, 3) }}</span>
              source <b>{{ lastRun.from }} → {{ lastRun.to }}</b
              >，Vue 依序重算 <b>computed1 → computed{{ lastRun.depth }}</b
              >（{{ lastRun.counts.computed }} 次），接著 watch ×{{
                lastRun.counts.watch
              }}、watchEffect ×{{ lastRun.counts.watchEffect }}、render ×{{
                lastRun.counts.render
              }}，整條鏈 settle 花了 <b>{{ lastRun.duration.toFixed(3) }} ms</b>。
            </p>
            <dl class="result__grid">
              <div>
                <dt>Update Duration</dt>
                <dd class="result__key">
                  {{ lastRun.duration.toFixed(3) }}<span class="unit">ms</span>
                </dd>
              </div>
              <div>
                <dt>Per Layer</dt>
                <dd>
                  {{ (lastRun.duration / lastRun.depth).toFixed(4) }}<span class="unit">ms</span>
                </dd>
              </div>
              <div>
                <dt>Computed / Watch / Effect / Render</dt>
                <dd>
                  {{ lastRun.counts.computed }}<span class="unit">/</span>{{ lastRun.counts.watch
                  }}<span class="unit">/</span>{{ lastRun.counts.watchEffect
                  }}<span class="unit">/</span>{{ lastRun.counts.render }}
                </dd>
              </div>
            </dl>
            <p
              class="result__check"
              :class="lastRun.counts.computed === lastRun.depth ? 'is-ok' : 'is-off'"
            >
              <template v-if="lastRun.counts.computed === lastRun.depth">
                ✔ computed 執行次數 = DEPTH：每層剛好重算一次，Vue
                沒有多算也沒有跳過。成本差異只會來自「每層要花多久」。
              </template>
              <template v-else>
                ✖ computed 執行了 {{ lastRun.counts.computed }} 次，預期是 DEPTH（{{
                  lastRun.depth
                }}）次。
              </template>
              <span v-if="lastRun.logged" class="result__flag">這次有開 console.log，耗時偏高</span>
            </p>
          </template>

          <!-- chain 最外層的輸出值：render 依賴它，所以每次 update 都會走到 render，也用來確認更新已抵達 computed[DEPTH] -->
          <p class="result__final">
            <span>computed[{{ depth }}]</span>
            <span
              >FINAL_VAL: <b>{{ chain.finalValue.value }}</b></span
            >
          </p>
        </section>

        <!-- ---- 各 DEPTH 比較 ---- -->
        <section class="compare" aria-labelledby="stage-compare">
          <h2 id="stage-compare">Depth vs Update Cost</h2>

          <table v-if="rows.length" class="compare__table">
            <thead>
              <tr>
                <th scope="col">DEPTH</th>
                <th scope="col">Runs</th>
                <th scope="col">Median</th>
                <th scope="col">Per Layer</th>
                <th scope="col" class="compare__bar-col">
                  <span class="visually-hidden">Median 相對長度</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="`${row.depth}-${row.logged}`"
                :class="{ 'is-current': row.depth === depth && row.logged === logToConsole }"
              >
                <th scope="row">
                  {{ row.depth }}
                  <span v-if="row.logged" class="compare__flag">+log</span>
                </th>
                <td :class="{ 'is-thin': row.runs < 5 }">{{ row.runs }}</td>
                <td>{{ row.median.toFixed(3) }}<span class="unit">ms</span></td>
                <td>{{ row.perLayer.toFixed(4) }}<span class="unit">ms</span></td>
                <td class="compare__bar-col">
                  <span class="compare__bar" :style="{ inlineSize: `${row.share * 100}%` }" />
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="compare__empty">
            還沒有資料。用至少兩個 DEPTH 各按幾次 ×{{ BATCH_SIZE }}，這裡就會出現趨勢。
          </p>

          <div
            v-if="diagnosis"
            class="compare__verdict"
            :class="diagnosis.isLinear ? 'is-linear' : 'is-warning'"
          >
            <span class="compare__verdict-tag">{{
              diagnosis.isLinear ? 'LINEAR O(N)' : 'VARIANCE DETECTED'
            }}</span>
            <p>
              跨 DEPTH（{{ diagnosis.minDepth }} ➔ {{ diagnosis.maxDepth }}）實測：Per Layer
              耗時差異約 {{ diagnosis.ratio }}×。
              <template v-if="diagnosis.isLinear">
                符合線性傳導。Vue 3 響應式鏈的重算成本與層數成正比，無顯著超線性損耗。
              </template>
              <template v-else>
                Per Layer 差異較大（常因極小 DEPTH 包含排程固定底噪，或垃圾回收波動）。建議比對
                DEPTH ≥ 50 的數據。
              </template>
            </p>
          </div>

          <div class="compare__read">
            <p><b>怎麼讀</b></p>
            <ul>
              <li><b>Median</b> 隨 DEPTH 變大是預期的：層數越多，要重算的 computed 越多。</li>
              <li>
                重點看 <b>Per Layer</b>：大致持平 → 成本跟層數成正比（線性）；越深越大 →
                有超線性成本，深鏈值得拆。
              </li>
              <li>
                DEPTH 很小時，scheduler 與 render 的固定成本佔大宗，Per Layer 會偏高，屬正常現象。
              </li>
              <li>
                Runs 少於 5 的列（灰字）雜訊大，先別下結論；+log 的列不要跟沒開 log 的列比較。
              </li>
            </ul>
          </div>

          <button v-if="rows.length" type="button" class="compare__clear" @click="clearResults">
            clear results
          </button>
        </section>

        <!-- ---- DevTools 對照 ---- -->
        <details class="devtools">
          <summary>搭配 Chrome DevTools Performance 面板觀察每一層</summary>
          <ol>
            <li>勾選上方「每一層輸出 <code>console.log</code>」。</li>
            <li>F12 開啟 DevTools → <b>Performance</b> 面板 → 按 ● Record。</li>
            <li>回到這頁按一次 <b>Trigger Update</b>，再按 Stop。</li>
            <li>
              在 <b>Timings</b> 軌道找
              <code>reactive-chain depth={{ depth }} #NNN +log</code>：這一段就是一次 update
              的範圍。下方 Main 軌道是 Vue 逐層執行 computed getter → watch → watchEffect → render
              的 call stack，DEPTH 越大堆疊越深、越寬。
            </li>
            <li>
              切到 <b>Console</b>，會看到 <code>computed1 executed</code> …
              <code>computed{{ depth }} executed</code> → <code>watch triggered</code> →
              <code>watchEffect triggered</code> → <code>component render</code> 的固定順序（訊息與
              benchmark 頁相同）。
            </li>
          </ol>
          <p>
            想看沒有 log 干擾的成本：取消勾選後重錄，Timings 軌道的區段名稱不會帶
            <code>+log</code>。
          </p>
        </details>
      </div>

      <ChainTty ref="tty" />

      <p class="visually-hidden" role="status">
        <template v-if="lastRun">
          Update {{ lastRun.index }} at depth {{ lastRun.depth }} settled in
          {{ lastRun.duration.toFixed(3) }} ms
        </template>
      </p>
    </main>
  </div>
</template>

<style scoped>
/* Hardcore Dark Lab 的 Stage 版本（規範見 DESIGN.md）。這頁不是 benchmark，可以有動畫。 */

.chain-stage {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* 桌面版剛好一個螢幕高，左右兩欄各自捲動，TTY 底部永遠在畫面內 */
  height: 100%;
  min-height: 36rem;
  padding: 1.5rem;
  font-family: var(--lab-font-mono);
  color: var(--lab-text-silver);
}

.chain-stage strong,
.chain-stage b {
  font-weight: 700;
  color: var(--lab-text);
}

.chain-stage code {
  font-family: var(--lab-font-mono);
  font-size: 0.9em;
  color: var(--lab-signal);
}

/* ---- header ---- */

.chain-stage__header {
  display: grid;
  gap: 0.625rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--lab-hairline);
}

.chain-stage__heading {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.chain-stage__heading h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--lab-text);
}

.chain-stage__tag {
  padding: 0.125rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--lab-signal) 40%, transparent);
  border-radius: 2px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--lab-signal);
}

.chain-stage__question {
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--lab-text-silver);
}

.chain-stage__question-tag {
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

.chain-stage__note {
  margin: 0;
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
}

/* ---- 雙欄：左操控、右 TTY（約 43%）---- */

.chain-stage__main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 1.5rem;
}

.chain-stage__console {
  /* 讓 .visually-hidden（position: absolute）以捲動欄為定位基準；否則它會以整頁為基準、跟著欄內內容撐出頁面底部空白 */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  min-height: 0;
  padding-right: 0.75rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--lab-hairline-strong) transparent;
}

.chain-stage__console h2 {
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

.chain-stage__console h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--lab-hairline);
}

/* ---- 操作引導 ---- */

.guide__steps {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guide__steps li {
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

.guide__steps li.is-current {
  --tone: var(--lab-warn);

  border-color: color-mix(in srgb, var(--lab-warn) 35%, var(--lab-hairline));
  border-left-color: var(--tone);
}

.guide__steps li.is-done {
  --tone: var(--lab-signal-strong);
}

.guide__steps li.is-todo {
  opacity: 0.6;
}

.guide__no {
  font-size: 0.875rem;
  font-weight: 800;
  color: var(--tone);
}

.guide__steps li.is-done .guide__no::after {
  content: ' ✔';
  font-size: 0.75rem;
}

.guide__do,
.guide__why {
  margin: 0;
  font-family: var(--lab-font-sans);
  line-height: 1.6;
}

.guide__do {
  font-size: 0.8125rem;
  color: var(--lab-text-silver);
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

/* ---- 鏈路拓撲 + 傳導光效 ---- */

.topology {
  /* 傳導屬於運行期更新：用琥珀，與 Composable Chaos 的 ripple 一致 */
  --pulse: var(--lab-warn);

  position: relative;
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.75rem;
  margin: 0;
  /* 留出光暈空間，再用 overflow: clip 裁掉換行時懸空的連接線與掃描線 */
  padding: 0.5rem 0;
  overflow: clip;
  list-style: none;
  font-size: 0.75rem;
}

.topology li {
  position: relative;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--lab-hairline-strong);
  background: var(--lab-panel-sunken);
  white-space: nowrap;
  color: var(--lab-text-muted);
}

.topology li:nth-child(2) {
  border-color: var(--lab-signal-edge);
  font-weight: 700;
  color: var(--lab-signal);
}

.topology li + li::before,
.topology li + li::after {
  content: '';
  position: absolute;
  top: 50%;
}

.topology li + li::before {
  right: calc(100% + 5px);
  width: calc(1.75rem - 9px);
  height: 1px;
  background: var(--lab-hairline-strong);
}

.topology li + li::after {
  right: calc(100% + 2px);
  translate: 0 -50%;
  border-block: 3.5px solid transparent;
  border-left: 5px solid var(--lab-hairline-strong);
}

/* 節點依序點亮：每個節點延遲 --i × 110ms，從傳導色退回原色 */
.topology.is-propagating li {
  animation: node-hit 520ms var(--lab-ease-out) calc(var(--i) * 110ms);
}

.topology.is-propagating li + li::before {
  animation: wire-hit 520ms var(--lab-ease-out) calc(var(--i) * 110ms - 60ms);
}

.topology.is-propagating li + li::after {
  animation: arrow-hit 520ms var(--lab-ease-out) calc(var(--i) * 110ms - 60ms);
}

/* 掃描線：一道由左到右穿過整條鏈的光帶 */
.topology.is-propagating::after {
  content: '';
  position: absolute;
  inset-block: 0;
  left: 0;
  width: 96px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--pulse) 28%, transparent) 70%,
    color-mix(in srgb, var(--pulse) 60%, transparent) 96%,
    transparent
  );
  pointer-events: none;
  translate: -96px 0;
  animation: scanline 640ms var(--lab-ease-out) forwards;
}

@keyframes node-hit {
  0% {
    border-color: var(--pulse);
    color: var(--lab-text);
    background: color-mix(in srgb, var(--pulse) 18%, var(--lab-panel-sunken));
    box-shadow: 0 0 14px color-mix(in srgb, var(--pulse) 45%, transparent);
  }
}

@keyframes wire-hit {
  0% {
    background: var(--pulse);
    box-shadow: 0 0 6px var(--pulse);
  }
}

@keyframes arrow-hit {
  0% {
    border-left-color: var(--pulse);
  }
}

@keyframes scanline {
  to {
    translate: 100cqw 0;
  }
}

/* ---- 控制列 ---- */

.control {
  display: grid;
  gap: 0.875rem;
}

.control h2 {
  margin-bottom: 0;
}

.control__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem 1rem;
}

.control__label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
}

.control__label small,
.control__log small {
  font-family: var(--lab-font-sans);
  font-size: 0.6875rem;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--lab-text-muted);
}

.depth-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.depth-picker button {
  position: relative;
  min-width: 3.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lab-hairline-strong);
  border-radius: 2px;
  background: var(--lab-panel-sunken);
  color: var(--lab-text-silver);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 150ms var(--lab-ease-out),
    background-color 150ms var(--lab-ease-out);
}

.depth-picker button:hover:not(:disabled) {
  border-color: var(--lab-signal-edge);
}

.depth-picker button[aria-pressed='true'] {
  border-color: var(--lab-signal-strong);
  background: color-mix(in srgb, var(--lab-signal-strong) 14%, transparent);
  color: var(--lab-signal);
}

.depth-picker button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.depth-picker button:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 2px;
}

/* 已量測過的 DEPTH：右上角小點 */
.depth-picker__dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  background: var(--lab-warn);
}

.control__log {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--lab-text-silver);
  cursor: pointer;
}

.control__log input {
  flex: none;
  margin: 0.2rem 0 0;
  accent-color: var(--lab-signal-strong);
}

.control__log small {
  display: block;
}

.control__run {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
}

/* 兩顆按鈕的差別說明：跨兩欄放在按鈕下方 */
.control__hint {
  grid-column: 1 / -1;
  margin: -0.25rem 0 0;
  font-family: var(--lab-font-sans);
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--lab-text-muted);
}

.control__hint b {
  font-family: var(--lab-font-mono);
  font-weight: 700;
  color: var(--lab-text-silver);
}

.trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  min-height: 3.5rem;
  padding: 0 1.5rem;
  border: 1px solid var(--lab-signal-strong);
  border-radius: 2px;
  background: color-mix(in srgb, var(--lab-signal-strong) 8%, transparent);
  color: var(--lab-signal);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background-color 150ms var(--lab-ease-out),
    box-shadow 150ms var(--lab-ease-out);
}

.trigger:not(.is-executing, .trigger--batch)::before {
  content: '$';
  color: var(--lab-text-muted);
}

.trigger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lab-signal-strong) 16%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--lab-signal-strong) 18%, transparent);
}

.trigger:active:not(:disabled) {
  background: var(--lab-signal-strong);
  color: var(--lab-panel-sunken);
  transition-duration: 0ms;
}

.trigger:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 3px;
}

.trigger:disabled:not(.is-executing) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* EXECUTING：停用、改用傳導色，外框以 opacity 呼吸 */
.trigger.is-executing {
  border-color: color-mix(in srgb, var(--lab-warn) 35%, transparent);
  background: color-mix(in srgb, var(--lab-warn) 6%, transparent);
  color: var(--lab-warn);
  cursor: progress;
}

.trigger.is-executing::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid var(--lab-warn);
  border-radius: inherit;
  box-shadow: 0 0 12px color-mix(in srgb, var(--lab-warn) 35%, transparent);
  animation: frame-breathe 700ms ease-in-out infinite;
}

@keyframes frame-breathe {
  50% {
    opacity: 0.15;
  }
}

/* ---- Last Update ---- */

.result {
  display: grid;
  gap: 0.75rem;
}

.result h2 {
  margin-bottom: 0;
}

.result__empty,
.result__story {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-family: var(--lab-font-sans);
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
  background-color: var(--lab-panel);
  background-image:
    linear-gradient(to right, var(--lab-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--lab-grid-line) 1px, transparent 1px);
  background-size: 12px 12px;
}

.result__grid dt {
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.result__grid dd {
  margin: 0.375rem 0 0;
  font-size: 1.125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums slashed-zero;
  white-space: nowrap;
  color: var(--lab-text);
}

.result__grid dd.result__key {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--lab-warn);
  text-shadow: 0 0 18px color-mix(in srgb, var(--lab-warn) 30%, transparent);
}

.result__check {
  margin: 0;
  font-family: var(--lab-font-sans);
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
  border: 1px solid color-mix(in srgb, var(--lab-warn) 40%, transparent);
  font-size: 0.6875rem;
  color: var(--lab-warn);
}

.result__final {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: 0;
  padding: 0.5rem 1rem;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.result__final b {
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--lab-signal);
}

.unit {
  margin-inline: 0.2em;
  font-size: 0.6em;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
  text-shadow: none;
}

/* ---- Depth vs Update Cost ---- */

.compare {
  display: grid;
  gap: 0.75rem;
}

.compare h2 {
  margin-bottom: 0;
}

.compare__table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums slashed-zero;
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
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lab-text-muted);
}

.compare__table tbody th {
  text-align: left;
  font-weight: 700;
  color: var(--lab-text);
}

.compare__table tbody tr.is-current {
  background: color-mix(in srgb, var(--lab-signal-strong) 8%, transparent);
}

.compare__table tbody tr.is-current th {
  color: var(--lab-signal);
}

.compare__table td.is-thin {
  color: var(--lab-text-muted);
}

.compare__table .compare__bar-col {
  width: 35%;
  text-align: left;
}

.compare__bar {
  display: block;
  min-inline-size: 2px;
  height: 0.5rem;
  background: var(--lab-warn);
  transition: inline-size 300ms var(--lab-ease-out);
}

.compare__flag {
  margin-left: 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--lab-warn);
}

.compare__empty {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--lab-hairline-strong);
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  color: var(--lab-text-muted);
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

.compare__verdict.is-linear {
  border-left: 2px solid var(--lab-signal);
}

.compare__verdict.is-warning {
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

.compare__verdict.is-linear .compare__verdict-tag {
  color: var(--lab-signal);
}

.compare__verdict.is-warning .compare__verdict-tag {
  color: var(--lab-warn);
}

.compare__verdict p {
  margin: 0;
  color: var(--lab-text-silver);
}

.compare__read {
  font-family: var(--lab-font-sans);
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
  font: inherit;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.compare__clear:hover {
  color: var(--lab-text);
}

/* ---- DevTools 對照 ---- */

.devtools {
  border: 1px solid var(--lab-hairline);
  background: var(--lab-panel-sunken);
  font-family: var(--lab-font-sans);
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--lab-text-silver);
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
  margin: 0;
  padding: 0 1rem 0 2.25rem;
}

.devtools li + li {
  margin-top: 0.375rem;
}

.devtools p {
  margin: 0.75rem 1rem 1rem;
  font-size: 0.75rem;
  color: var(--lab-text-muted);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* ---- 窄螢幕：TTY 移到下方 ---- */

@media (max-width: 1080px) {
  .chain-stage {
    height: auto;
    min-height: 100%;
  }

  .chain-stage__main {
    grid-template-columns: minmax(0, 1fr);
  }

  .chain-stage__console {
    padding-right: 0;
    overflow: visible;
  }
}

@media (max-width: 640px) {
  .chain-stage {
    padding: 1rem;
  }

  .result__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .compare__table th,
  .compare__table td {
    padding-inline: 0.5rem;
  }

  .compare__table .compare__bar-col {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .topology.is-propagating li,
  .topology.is-propagating li + li::before,
  .topology.is-propagating li + li::after,
  .trigger.is-executing::after {
    animation: none;
  }

  /* 不跑掃描線，改成整條鏈短暫泛起傳導色後淡出 */
  .topology.is-propagating::after {
    translate: 0;
    width: 100%;
    background: color-mix(in srgb, var(--pulse) 10%, transparent);
    animation: tint-fade 640ms ease-out forwards;
  }

  @keyframes tint-fade {
    to {
      opacity: 0;
    }
  }

  .trigger,
  .guide__steps li,
  .depth-picker button,
  .compare__bar {
    transition: none;
  }
}
</style>
