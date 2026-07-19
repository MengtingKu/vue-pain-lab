<script setup lang="ts">
import StatusBadge, { type ScenarioStatus } from '@/components/StatusBadge.vue'

defineProps<{
  title: string
  description: string
  status: ScenarioStatus
  to: string
}>()
</script>

<template>
  <RouterLink :to="to" class="scenario-card">
    <div class="scenario-card__header">
      <h2 class="scenario-card__title">{{ title }}</h2>
      <StatusBadge :status="status" />
    </div>
    <p class="scenario-card__description">{{ description }}</p>
  </RouterLink>
</template>

<style scoped>
.scenario-card {
  display: block;
  padding: 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.scenario-card:hover {
  border-color: #94a3b8;
}

.scenario-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.scenario-card__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.scenario-card__description {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.5;
}
</style>
