<script setup lang="ts">
/**
 * [SYS_KERNEL_DIAGNOSTIC_TTY]：Reactive Chain Stage 頁的 log 終端機。
 *
 * log 行由父元件透過 append() 推進來，lines 只在這個元件內被讀取：
 * 寫入 log 只會讓 TTY 自己 re-render，不會讓父元件 re-render，
 * 所以上千行 log 的 patch 成本不會算進父元件量到的 update 耗時，也不污染 RENDER 計數。
 */
import { nextTick, shallowRef, useTemplateRef } from 'vue'

export type TtyTone = 'sys' | 'dep' | 'rerun' | 'hook' | 'update' | 'done'

export interface TtyLine {
  id: number
  time: string
  glyph: string
  tag: string
  text: string
  tone: TtyTone
}

// 最多保留的行數（每次 update 約 DEPTH + 5 行）
const MAX_LINES = 1500

const lines = shallowRef<TtyLine[]>([])
const screen = useTemplateRef<HTMLElement>('screen')

async function append(batch: TtyLine[]): Promise<void> {
  if (batch.length === 0) return
  lines.value = [...lines.value, ...batch].slice(-MAX_LINES)
  await nextTick()
  if (screen.value) screen.value.scrollTop = screen.value.scrollHeight
}

function clear(): void {
  lines.value = []
}

defineExpose({ append })
</script>

<template>
  <section class="tty" aria-labelledby="stage-tty">
    <div class="tty__bar">
      <h2 id="stage-tty">[SYS_KERNEL_DIAGNOSTIC_TTY]</h2>
      <span class="tty__count">{{ lines.length }} / {{ MAX_LINES }} lines</span>
      <button type="button" class="tty__clear" @click="clear">clear</button>
    </div>
    <!-- 每次 update 會一次湧入上百行，不做逐行朗讀；摘要由父元件的 status 告知 -->
    <div ref="screen" class="tty__screen" role="log" aria-live="off" tabindex="0">
      <p v-for="line in lines" :key="line.id" class="tty__line" :class="`tty__line--${line.tone}`">
        <span class="tty__time">[{{ line.time }}]</span>
        <span class="tty__glyph">{{ line.glyph }}</span>
        <span class="tty__tag">[{{ line.tag }}]</span>
        <span class="tty__text">{{ line.text }}</span>
      </p>
      <p class="tty__prompt"><span class="tty__cursor" aria-hidden="true" /></p>
    </div>
  </section>
</template>

<style scoped>
.tty {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--lab-tty-rule);
  background: var(--lab-tty-bg);
  font-family: var(--lab-font-mono);
}

.tty__bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--lab-tty-rule);
}

.tty__bar h2 {
  flex: 1;
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--lab-text-silver);
}

.tty__count {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--lab-tty-dim);
}

.tty__clear {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--lab-tty-rule);
  border-radius: 2px;
  background: transparent;
  color: var(--lab-tty-dim);
  font: inherit;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.tty__clear:hover {
  border-color: var(--lab-tty-dim);
  color: var(--lab-text);
}

.tty__clear:focus-visible,
.tty__screen:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: -1px;
}

.tty__screen {
  flex: 1;
  min-height: 0;
  padding: 0.625rem 0.875rem 0.875rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--lab-tty-rule) transparent;
  font-size: 11px;
  line-height: 1.65;
  color: var(--lab-text-silver);
}

.tty__screen::-webkit-scrollbar {
  width: 4px;
}

.tty__screen::-webkit-scrollbar-thumb {
  background: var(--lab-tty-rule);
}

.tty__line {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  column-gap: 0.75ch;
  margin: 0;
  white-space: pre;
}

.tty__time {
  color: var(--lab-tty-dim);
  font-variant-numeric: tabular-nums;
}

.tty__glyph {
  width: 2ch;
  color: var(--lab-tty-dim);
}

.tty__tag {
  min-width: 9ch;
  font-weight: 700;
}

.tty__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/*
 * 行的語意色（時間戳與 └─ 等符號一律保持冷灰，見上方 .tty__time / .tty__glyph）：
 * - dep：首航建立時的 computed 節點計算 → 綠
 * - rerun：update 期間的 computed 重算 → 標籤琥珀 [RE-RUN]、內容銀灰（與 Composable Chaos 相同）
 * - hook：watch / watchEffect / render 這些鏈結終點的副作用 → 琥珀
 * - update：觸發 → 琥珀；done：INIT / SETTLED 總結 → 綠；sys：其餘 → 銀灰
 */
.tty__line--dep {
  color: var(--lab-signal-strong);
}

.tty__line--dep .tty__tag {
  font-weight: 500;
  color: var(--lab-signal);
}

.tty__line--rerun .tty__tag {
  color: var(--lab-warn);
}

.tty__line--hook,
.tty__line--update {
  color: var(--lab-warn);
}

.tty__line--update {
  margin-top: 0.75rem;
}

.tty__line--done {
  color: var(--lab-signal);
}

.tty__prompt {
  margin: 0.25rem 0 0;
}

.tty__cursor {
  display: inline-block;
  width: 0.6em;
  height: 1.1em;
  vertical-align: text-bottom;
  background: var(--lab-signal);
  animation: caret 1s steps(1) infinite;
}

@keyframes caret {
  50% {
    opacity: 0;
  }
}

@media (max-width: 1080px) {
  .tty {
    height: 70vh;
  }
}

@media (max-width: 640px) {
  .tty__bar {
    flex-wrap: wrap;
  }

  /* 窄螢幕放不下整行 log：改成水平捲動，不截斷內容 */
  .tty__screen {
    overflow-x: auto;
  }

  .tty__text {
    overflow: visible;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tty__cursor {
    animation: none;
  }
}
</style>
