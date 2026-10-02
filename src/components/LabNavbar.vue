<script setup lang="ts">
/**
 * 全站頂部導覽列。DefaultLayout（Dashboard 與各 benchmark 頁）與 StageLayout（各 Stage 頁）共用。
 *
 * - 左：標題，連回 Dashboard（Dashboard 的卡片才是切換 scenario 的入口）。
 * - 右：只在「同時有 benchmark 與 Stage 兩種檢視」的 scenario 內顯示檢視切換；其他頁面不渲染。
 * - 狀態燈只在 Stage 頁呼吸；benchmark 頁維持靜態，避免 CDP 量測期間有常駐動畫。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

interface ViewPair {
  benchmark: string
  stage: string
}

const VIEW_PAIRS: readonly ViewPair[] = [
  { benchmark: '/scenarios/reactive-chain', stage: '/scenarios/reactive-chain/stage' },
  { benchmark: '/scenarios/composable-chaos', stage: '/scenarios/composable-chaos/stage' },
  { benchmark: '/scenarios/vdom-stress', stage: '/scenarios/vdom-stress/stage' },
  { benchmark: '/scenarios/component-storm', stage: '/scenarios/component-storm/stage' },
]

const route = useRoute()

const pair = computed(
  () => VIEW_PAIRS.find((p) => route.path === p.benchmark || route.path === p.stage) ?? null,
)

const isStage = computed(() => pair.value !== null && route.path === pair.value.stage)
</script>

<template>
  <header class="lab-nav lab-tokens" :class="{ 'is-live': isStage }">
    <RouterLink to="/" class="lab-nav__brand" title="回到 Pain Scenarios">
      <span class="lab-nav__lamp" aria-hidden="true" />
      [ VUE_PAIN_LAB // PERF_PROBER_v1.0 ]
    </RouterLink>

    <nav v-if="pair" class="lab-nav__modes" aria-label="檢視模式">
      <RouterLink
        :to="pair.benchmark"
        class="lab-nav__seg"
        :class="{ 'is-active': !isStage }"
        title="原始 benchmark 頁（CDP runner 量測用）"
      >
        [ 🛰️ TELEMETRY_BENCHMARK ]
      </RouterLink>
      <RouterLink
        :to="pair.stage"
        class="lab-nav__seg"
        :class="{ 'is-active': isStage }"
        title="互動探測頁"
      >
        [ 🔬 LIVE_STAGE_VIEW ]
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
/* 左右二分：左標題、右檢視切換；與頁面底色融合，只用一條系統髮絲線和內頁分隔 */
.lab-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  min-height: 3.5rem;
  box-sizing: border-box;
  padding: 0.625rem 1.5rem;
  border-bottom: 1px solid var(--lab-hairline);
  background: var(--lab-bg);
  font-family: var(--lab-font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  color: var(--lab-text-muted);
}

.lab-nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  font-weight: 700;
  color: var(--lab-text);
  text-decoration: none;
  transition: color 150ms var(--lab-ease-hard);
}

.lab-nav__brand:hover {
  color: var(--lab-signal);
}

.lab-nav__lamp {
  flex: none;
  width: 7px;
  height: 7px;
  background: var(--lab-signal-strong);
  box-shadow: 0 0 8px color-mix(in srgb, var(--lab-signal-strong) 60%, transparent);
  opacity: 0.85;
}

/* Stage 頁：慢速呼吸（只動 opacity） */
.lab-nav.is-live .lab-nav__lamp {
  animation: lamp-breathe 2.4s var(--lab-ease-hard) infinite;
}

/* 檢視切換：相鄰共用 1px 框線、無圓角 */
.lab-nav__modes {
  display: flex;
}

.lab-nav__seg {
  padding: 0.4375rem 0.75rem;
  border: 1px solid var(--lab-hairline-strong);
  font-weight: 700;
  white-space: nowrap;
  color: var(--lab-text-muted);
  text-decoration: none;
  transition:
    background-color 150ms var(--lab-ease-hard),
    color 150ms var(--lab-ease-hard);
}

.lab-nav__seg + .lab-nav__seg {
  border-left: 0;
}

.lab-nav__seg:hover {
  color: var(--lab-text);
  background: color-mix(in srgb, var(--lab-hairline-strong) 40%, transparent);
}

.lab-nav__seg.is-active {
  color: var(--lab-signal-strong);
  background: color-mix(in srgb, var(--lab-signal-strong) 10%, transparent);
  box-shadow: inset 0 -2px 0 var(--lab-signal-strong);
}

.lab-nav__brand:focus-visible,
.lab-nav__seg:focus-visible {
  outline: 1px solid var(--lab-signal);
  outline-offset: 2px;
}

@keyframes lamp-breathe {
  50% {
    opacity: 0.25;
  }
}

/* 窄螢幕：標題與切換各佔一列，兩顆切換鈕平分整列寬度並稍微縮小字距 */
@media (max-width: 640px) {
  .lab-nav {
    padding: 0.625rem 1rem;
    letter-spacing: 0.02em;
  }

  .lab-nav__modes {
    width: 100%;
  }

  /* 再窄（約 360px）時標籤允許在空白處換行，不撐出水平捲軸 */
  .lab-nav__seg {
    flex: 1;
    min-width: 0;
    padding: 0.4375rem 0.375rem;
    white-space: normal;
    font-size: 0.625rem;
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lab-nav__brand,
  .lab-nav__seg {
    transition: none;
  }

  .lab-nav.is-live .lab-nav__lamp {
    animation: none;
  }
}
</style>
