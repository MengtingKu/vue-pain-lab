<script setup lang="ts">
import StatusBadge, { type ScenarioStatus } from '@/components/StatusBadge.vue'

defineProps<{
  title: string
  description: string
  status: ScenarioStatus
  to: string
  featured?: boolean
}>()
</script>

<template>
  <RouterLink
    :to="to"
    class="scenario-card"
    :class="{
      'scenario-card--featured': featured,
      'scenario-card--standby': status === 'empty',
    }"
  >
    <div v-if="featured" class="scenario-card__grid" aria-hidden="true" />

    <h3 class="scenario-card__title">{{ title }}</h3>
    <p class="scenario-card__description">{{ description }}</p>

    <!-- 示波器軌跡：平常是一條暗線，hover / focus 時有一道訊號脈衝跑過 -->
    <svg
      v-if="featured"
      class="scenario-card__trace"
      viewBox="0 0 640 72"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        class="scenario-card__trace-base"
        d="M0 48 H264 L276 48 L284 30 L292 58 L300 18 L310 64 L320 6 L330 60 L340 24 L348 54 L356 38 L364 48 H640"
        vector-effect="non-scaling-stroke"
      />
      <path
        class="scenario-card__trace-pulse"
        d="M0 48 H264 L276 48 L284 30 L292 58 L300 18 L310 64 L320 6 L330 60 L340 24 L348 54 L356 38 L364 48 H640"
        pathLength="1"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <div class="scenario-card__meta">
      <code class="scenario-card__route">{{ to }}</code>
      <StatusBadge :status="status" />
    </div>
  </RouterLink>
</template>

<style scoped>
.scenario-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.75rem;
  overflow: hidden;
  border: 1px solid var(--lab-rule);
  border-radius: 4px;
  background: var(--lab-surface);
  color: inherit;
  text-decoration: none;
  transition:
    transform 300ms var(--lab-ease-out),
    border-color 300ms var(--lab-ease-out),
    box-shadow 300ms var(--lab-ease-out);
}

.scenario-card:hover {
  transform: translateY(-4px);
  border-color: var(--lab-signal-edge);
  box-shadow: 0 16px 40px -20px rgb(16 185 129 / 0.35);
}

.scenario-card:focus-visible {
  outline: 2px solid var(--lab-signal);
  outline-offset: 3px;
  border-color: var(--lab-signal-edge);
}

.scenario-card__title {
  position: relative;
  margin: 0;
  font-size: 1.375rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.scenario-card__description {
  position: relative;
  flex: 1;
  margin: 0.75rem 0 0;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

.scenario-card__meta {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--lab-rule);
}

.scenario-card__route {
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  color: var(--lab-text-muted);
  overflow-wrap: anywhere;
}

/* ---- featured：Component Storm 觀測面板 ---- */

.scenario-card--featured {
  grid-column: 1 / -1;
  padding: 2.25rem;
}

.scenario-card--featured .scenario-card__title {
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 900;
  letter-spacing: -0.03em;
}

.scenario-card--featured .scenario-card__description {
  max-width: 38rem;
  font-size: 1rem;
}

.scenario-card__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgb(63 63 70 / 0.45) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(63 63 70 / 0.45) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: -1px -1px;
  mask-image: radial-gradient(ellipse 70% 90% at 80% 30%, #000 20%, transparent 75%);
  transition: opacity 300ms var(--lab-ease-out);
  opacity: 0.7;
}

.scenario-card--featured:hover .scenario-card__grid,
.scenario-card--featured:focus-visible .scenario-card__grid {
  opacity: 1;
}

.scenario-card__trace {
  position: relative;
  display: block;
  width: 100%;
  height: 72px;
  margin-top: 1.75rem;
  overflow: visible;
  fill: none;
}

.scenario-card__trace-base {
  stroke: var(--lab-rule-strong);
  stroke-width: 1;
}

.scenario-card__trace-pulse {
  stroke: var(--lab-signal);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 0.14 1.2;
  stroke-dashoffset: 0.14;
  opacity: 0;
  filter: drop-shadow(0 0 4px rgb(52 211 153 / 0.7));
  transition: opacity 300ms var(--lab-ease-out);
}

.scenario-card--featured:hover .scenario-card__trace-pulse,
.scenario-card--featured:focus-visible .scenario-card__trace-pulse {
  opacity: 1;
  animation: scenario-card-pulse 2.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes scenario-card-pulse {
  from {
    stroke-dashoffset: 0.14;
  }
  to {
    stroke-dashoffset: -1;
  }
}

/* ---- standby：尚未定義 ---- */

.scenario-card--standby {
  padding: 1.25rem 1.5rem;
  border-style: dashed;
  background: transparent;
}

.scenario-card--standby .scenario-card__title {
  font-size: 1.0625rem;
  font-weight: 700;
}

.scenario-card--standby .scenario-card__description {
  margin-top: 0.375rem;
  font-size: 0.875rem;
}

.scenario-card--standby .scenario-card__meta {
  margin-top: 1rem;
  padding-top: 0;
  border-top: 0;
}

.scenario-card--standby:hover {
  border-color: rgb(251 191 36 / 0.4);
  box-shadow: none;
}

@media (max-width: 720px) {
  .scenario-card {
    padding: 1.5rem;
  }

  .scenario-card--featured {
    padding: 1.75rem 1.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scenario-card,
  .scenario-card__grid,
  .scenario-card__trace-pulse {
    transition: none;
  }

  .scenario-card:hover {
    transform: none;
  }

  .scenario-card--featured:hover .scenario-card__trace-pulse,
  .scenario-card--featured:focus-visible .scenario-card__trace-pulse {
    animation: none;
    stroke-dasharray: none;
  }
}
</style>
