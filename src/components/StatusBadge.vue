<script setup lang="ts">
import { computed } from 'vue'

export type ScenarioStatus = 'drafted' | 'empty'

const props = defineProps<{
  status: ScenarioStatus
}>()

const labelMap: Record<ScenarioStatus, string> = {
  drafted: '已描述痛點',
  empty: '尚未定義',
}

const label = computed(() => labelMap[props.status])
</script>

<template>
  <span class="status-badge" :class="`status-badge--${status}`">{{ label }}</span>
</template>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge--drafted {
  background: #e0f2fe;
  color: #0369a1;
}

.status-badge--empty {
  background: #f1f5f9;
  color: #64748b;
}
</style>
