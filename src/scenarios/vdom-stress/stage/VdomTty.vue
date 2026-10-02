<script setup lang="ts">
/**
 * [SYS_VDOM_PATCH_STREAM]：Stage 頁的 log 終端機。
 *
 * log 行由父元件在量測結束後透過 append() 推進來，lines 只在這個元件內被讀取：
 * 寫 log 只會讓 TTY 自己 re-render，不會讓父元件（以及底下 5000 格的方格矩陣）重新 patch。
 */
import { nextTick, shallowRef, useTemplateRef } from 'vue'

export type TtyTone = 'sys' | 'dom' | 'work' | 'stable' | 'drop' | 'choke'

export interface TtyLine {
  id: number
  time: string
  tag: string
  text: string
  tone: TtyTone
}

// 最多保留的行數（每次注入約 12 行）
const MAX_LINES = 400

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
  <div class="tty">
    <div class="tty__bar">
      <span class="tty__title">[SYS_VDOM_PATCH_STREAM]</span>
      <span class="tty__count">{{ lines.length }} lines</span>
      <button type="button" class="tty__clear" @click="clear">clear</button>
    </div>
    <!-- 每次注入會一次湧入十幾行，不逐行朗讀；結論由父元件的 status 告知 -->
    <div ref="screen" class="tty__screen" role="log" aria-live="off" tabindex="0">
      <p v-if="lines.length === 0" class="tty__empty">
        等待注入…按下 INJECT 後，這裡會列出資料準備、Vue patch、實際插入的 DOM 節點、Layout 與下一個
        frame 的實測時間。
      </p>
      <p v-for="line in lines" :key="line.id" class="tty__line" :class="`tty__line--${line.tone}`">
        <span class="tty__time">[{{ line.time }}]</span>
        <span class="tty__tag">[{{ line.tag }}]</span>
        <span class="tty__text">{{ line.text }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.tty {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 6rem;
  border: 1px solid var(--lab-tty-rule);
  background: var(--lab-tty-bg);
}

.tty__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--lab-tty-rule);
  font-size: 0.6875rem;
}

.tty__title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--lab-text-silver);
}

.tty__count {
  font-variant-numeric: tabular-nums;
  color: var(--lab-tty-dim);
}

.tty__clear {
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--lab-tty-rule);
  border-radius: 2px;
  background: transparent;
  color: var(--lab-tty-dim);
  font: inherit;
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
  min-width: 0;
  min-height: 0;
  padding: 0.5rem 0.75rem 0.75rem;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--lab-tty-rule) transparent;
  font-size: 11px;
  line-height: 1.65;
  color: var(--lab-text-silver);
}

.tty__empty {
  margin: 0;
  font-family: var(--lab-font-sans);
  color: var(--lab-tty-dim);
}

.tty__line {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  column-gap: 0.75ch;
  margin: 0;
  white-space: pre;
}

.tty__time {
  font-variant-numeric: tabular-nums;
  color: var(--lab-tty-dim);
}

.tty__tag {
  min-width: 8ch;
  font-weight: 700;
  color: var(--lab-tty-dim);
}

.tty__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 語意色：DOM 節點建立 → 綠；Vue patch / Layout 等主執行緒工作 → 琥珀；結算行依判定等級上色 */
.tty__line--dom .tty__tag,
.tty__line--dom .tty__text,
.tty__line--stable {
  color: var(--lab-signal);
}

.tty__line--work .tty__tag,
.tty__line--drop {
  color: var(--lab-warn);
}

.tty__line--choke {
  color: var(--lab-hot);
}

.tty__line--stable .tty__tag,
.tty__line--drop .tty__tag,
.tty__line--choke .tty__tag {
  color: inherit;
}

@media (max-width: 700px) {
  .tty__text {
    overflow: visible;
  }
}
</style>
