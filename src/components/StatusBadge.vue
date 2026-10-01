<script setup lang="ts">
import { computed } from 'vue'

export type ScenarioStatus = 'drafted' | 'empty'

const props = defineProps<{
  status: ScenarioStatus
}>()

const codeMap: Record<ScenarioStatus, string> = {
  drafted: 'DRAFTED',
  empty: 'UNDEFINED',
}

const code = computed(() => codeMap[props.status])
</script>

<template>
  <span class="status-badge" :class="`status-badge--${status}`">
    <span class="status-badge__dot" aria-hidden="true" />
    {{ code }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 2px;
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  line-height: 1.4;
  white-space: nowrap;
}

.status-badge__dot {
  width: 6px;
  height: 6px;
  background: currentColor;
}

.status-badge--drafted {
  color: var(--lab-signal);
  border-color: rgb(52 211 153 / 0.35);
  background: rgb(52 211 153 / 0.06);
}

.status-badge--drafted .status-badge__dot {
  box-shadow: 0 0 6px rgb(52 211 153 / 0.8);
}

.status-badge--empty {
  color: var(--lab-warn);
  border-color: rgb(251 191 36 / 0.35);
  background: rgb(251 191 36 / 0.05);
}

.status-badge--empty .status-badge__dot {
  background: transparent;
  box-shadow: inset 0 0 0 1px currentColor;
}
</style>
