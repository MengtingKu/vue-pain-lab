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
.child {
  display: grid;
  grid-template-columns: 100px 120px 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.75rem;
}

.child:hover {
  background-color: #f8fafc;
}

.child__label {
  font-weight: 600;
  color: #475569;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.child__value-box {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.child__badge {
  font-size: 0.65rem;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  background-color: #e0f2fe;
  color: #0369a1;
  font-weight: 500;
}

.child__value {
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.child__derived-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
}

.child__derived-label {
  color: #64748b;
  font-size: 0.7rem;
  white-space: nowrap;
}

.child__derived {
  display: flex;
  gap: 0.4rem;
  list-style: none;
  padding: 0;
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.child__derived-item {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.05rem 0.35rem;
  background-color: #f1f5f9;
  border-radius: 4px;
  color: #475569;
}

.child__multiplier {
  color: #94a3b8;
  font-size: 0.65rem;
}

.child__derived-value {
  font-weight: 600;
}
</style>
