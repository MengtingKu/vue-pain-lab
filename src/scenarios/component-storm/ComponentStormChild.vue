<script setup lang="ts">
import { computed, inject, onUpdated } from 'vue'
import { REPORT_CHILD_RENDER_KEY } from '@/benchmarks/component-storm/keys'

// 所有 Child 的 Props 結構完全一致，不允許任何 Child 有專屬 Prop
const props = defineProps<{
  id: number
  value: number
  label: string
}>()

// Reactive Logic 對所有 Child 一致：用 value 做幾層 derived 計算，模擬常見的顯示邏輯
const derivedItems = computed(() =>
  Array.from({ length: 5 }, (_, index) => props.value * (index + 1)),
)

const reportRender = inject(REPORT_CHILD_RENDER_KEY, null)

onUpdated(() => {
  reportRender?.(props.id)
})
</script>

<template>
  <li class="child">
    <span class="child__label">{{ label }}</span>
    <div class="child__value-box" title="Prop Value">
      <span class="child__badge">Value</span>
      <span class="child__value">{{ value }}</span>
    </div>
    <div class="child__derived-box">
      <span class="child__derived-label">Derived (×1~5):</span>
      <ul class="child__derived">
        <li v-for="(item, index) in derivedItems" :key="index" class="child__derived-item">
          <span class="child__multiplier">×{{ index + 1 }}=</span>
          <span class="child__derived-value">{{ item }}</span>
        </li>
      </ul>
    </div>
  </li>
</template>

<style scoped>
/* 暗色 lab 風格：只改 CSS，template / script 維持 benchmark 原樣 */
.child {
  display: grid;
  grid-template-columns: 100px 120px 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px dashed rgb(39 39 42 / 0.8);
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
}

.child:hover {
  background-color: rgb(24 24 27 / 0.8);
}

.child__label {
  font-weight: 600;
  color: #f4f4f5;
}

.child__value-box {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  justify-self: start;
  padding: 0.0625rem 0.375rem;
  border: 1px solid rgb(6 182 212 / 0.3);
  border-radius: 3px;
  background: rgb(8 51 68 / 0.2);
}

.child__badge {
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(34 211 238 / 0.75);
}

.child__value {
  font-weight: 700;
  color: var(--lab-probe);
  font-variant-numeric: tabular-nums;
}

.child__derived-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
}

.child__derived-label {
  font-size: 0.6875rem;
  white-space: nowrap;
  color: var(--lab-text-muted);
}

.child__derived {
  display: flex;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-variant-numeric: tabular-nums;
}

.child__derived-item {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.0625rem 0.375rem;
  border: 1px solid #27272a;
  border-radius: 2px;
  background: #0c0c0e;
  color: var(--lab-signal);
}

.child__multiplier {
  font-size: 0.625rem;
  color: #71717a;
}

.child__derived-value {
  font-weight: 600;
}
</style>
