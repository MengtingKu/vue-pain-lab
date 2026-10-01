<script setup lang="ts">
import { computed, inject, onUpdated, useTemplateRef } from 'vue'
import { REPORT_CHILD_RENDER_KEY } from '@/benchmarks/component-storm/keys'

// 與 benchmark 用的 ComponentStormChild 相同的 Props 與 derived 計算，只有呈現方式不同
const props = defineProps<{
  id: number
  value: number
  label: string
}>()

const derivedItems = computed(() =>
  Array.from({ length: 5 }, (_, index) => props.value * (index + 1)),
)

const reportRender = inject(REPORT_CHILD_RENDER_KEY, null)

const flashEl = useTemplateRef<HTMLElement>('flash')
const litEl = useTemplateRef<HTMLElement>('lit')

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 急促閃爍：只動 opacity，用 Web Animations API 重播，不需要切 class 逼瀏覽器 reflow
const FLICKER: Keyframe[] = [
  { opacity: 1 },
  { opacity: 0.25 },
  { opacity: 1 },
  { opacity: 0.35 },
  { opacity: 0.9 },
  { opacity: 0 },
]

onUpdated(() => {
  reportRender?.(props.id)
  if (reduceMotion) return
  litEl.value?.animate(FLICKER, { duration: 650, easing: 'linear' })
  flashEl.value?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 700,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  })
})
</script>

<template>
  <li class="stage-child">
    <span ref="flash" class="stage-child__flash" aria-hidden="true" />
    <span class="stage-child__id">{{ label }}</span>
    <span class="stage-child__value" title="Prop Value">VAL {{ value }}</span>
    <span class="stage-child__lamps">
      <span
        v-for="(item, index) in derivedItems"
        :key="index"
        class="stage-child__lamp"
        :title="`×${index + 1} = ${item}`"
      />
      <span ref="lit" class="stage-child__lamps-lit" aria-hidden="true">
        <span v-for="index in 5" :key="index" class="stage-child__lamp stage-child__lamp--lit" />
      </span>
    </span>
  </li>
</template>

<style scoped>
.stage-child {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid #27272a;
  border-radius: 4px;
  background: rgb(24 24 27 / 0.6);
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
}

.stage-child__flash {
  position: absolute;
  inset: -1px;
  border: 1px solid rgb(52 211 153 / 0.7);
  border-radius: inherit;
  background: rgb(16 185 129 / 0.08);
  opacity: 0;
  pointer-events: none;
}

.stage-child__id {
  position: relative;
  /* child-999 的寬度，讓 VAL 標籤在每張卡片對齊 */
  min-width: 9ch;
  font-weight: 600;
  color: #f4f4f5;
  white-space: nowrap;
}

.stage-child__value {
  position: relative;
  padding: 0.0625rem 0.375rem;
  border: 1px solid rgb(6 182 212 / 0.3);
  border-radius: 3px;
  background: rgb(8 51 68 / 0.2);
  color: var(--lab-probe);
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stage-child__lamps {
  position: relative;
  margin-left: auto;
  display: grid;
  grid-template-columns: repeat(5, 6px);
  gap: 3px;
}

.stage-child__lamp {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: #3f3f46;
}

.stage-child__lamps-lit {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(5, 6px);
  gap: 3px;
  opacity: 0;
  pointer-events: none;
}

.stage-child__lamp--lit {
  background: var(--lab-signal);
  box-shadow: 0 0 6px rgb(52 211 153 / 0.9);
}
</style>
