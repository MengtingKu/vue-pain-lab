<script setup lang="ts">
import ScenarioCard from '@/components/ScenarioCard.vue'
import type { ScenarioStatus } from '@/components/StatusBadge.vue'

interface ScenarioSummary {
  title: string
  description: string
  status: ScenarioStatus
  to: string
  featured?: boolean
}

const scenarios: ScenarioSummary[] = [
  {
    title: 'Home Loading Slow',
    description:
      '首頁開啟需要等待很久，畫面「慢慢長出來」，還不確定慢在 Network、Vue Runtime 還是 Component 初始化。',
    status: 'drafted',
    to: '/scenarios/home-loading',
  },
  {
    title: 'Huge Table',
    description: '資料夾已建立，痛點描述還沒寫下來。',
    status: 'empty',
    to: '/scenarios/huge-table',
  },
  {
    title: 'Component Storm',
    description:
      '後台系統常見一個 Parent 掛大量結構一致的 Child：Component 數量增加、Parent 更新時，Runtime Cost 會怎麼變？',
    status: 'drafted',
    // 大會展示用的 Demo 視圖；benchmark 頁本身仍在 /scenarios/component-storm（Demo 頁 header 有連結）
    to: '/scenarios/component-storm/stage',
    featured: true,
  },
  {
    title: 'Composable Chaos',
    description:
      '中大型專案常見業務邏輯拆分成多層 Nested Composable（層層嵌套呼叫）：當抽象與封裝層數越疊越深，會對 Vue Runtime 帶來有感的效能開銷嗎？',
    status: 'drafted',
    to: '/scenarios/composable-chaos/stage',
  },
  {
    title: 'Long Running SPA',
    description: '資料夾已建立，痛點描述還沒寫下來。',
    status: 'empty',
    to: '/scenarios/long-running-spa',
  },
  {
    title: 'Reactive Chain',
    description:
      '大型後台表單的 derived state 常常疊好幾層 computed，這條鏈到底多深才會讓 update cost 有感？',
    status: 'drafted',
    to: '/scenarios/reactive-chain/stage',
  },
  {
    title: 'VDOM Stress Test',
    description:
      '一次性大量 Render UI（100～5000 張 Card）時，Vue Runtime 的 Rendering 成本會怎麼變？',
    status: 'drafted',
    to: '/scenarios/vdom-stress',
  },
]

// featured 的卡片橫跨整列，放在最前面才不會讓前一列留下空格
const drafted = scenarios
  .filter((scenario) => scenario.status === 'drafted')
  .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
const standby = scenarios.filter((scenario) => scenario.status === 'empty')
</script>

<template>
  <section class="dashboard lab-theme">
    <header class="dashboard__header">
      <h1 class="dashboard__title">Pain Scenarios</h1>
      <p class="dashboard__subtitle">每張卡片對應一個真實遇到的 Vue 開發痛點。</p>
      <p class="dashboard__readout">
        <span>{{ scenarios.length }} SCENARIOS</span>
        <span class="dashboard__readout-drafted">{{ drafted.length }} DRAFTED</span>
        <span class="dashboard__readout-standby">{{ standby.length }} UNDEFINED</span>
      </p>
    </header>

    <section class="dashboard__group" aria-labelledby="dashboard-drafted">
      <h2 id="dashboard-drafted" class="dashboard__group-title">
        已描述痛點 <span class="dashboard__group-count">{{ drafted.length }}</span>
      </h2>
      <div class="dashboard__grid">
        <ScenarioCard v-for="scenario in drafted" :key="scenario.to" v-bind="scenario" />
      </div>
    </section>

    <section class="dashboard__group" aria-labelledby="dashboard-standby">
      <h2 id="dashboard-standby" class="dashboard__group-title">
        尚未定義 <span class="dashboard__group-count">{{ standby.length }}</span>
      </h2>
      <div class="dashboard__grid dashboard__grid--standby">
        <ScenarioCard v-for="scenario in standby" :key="scenario.to" v-bind="scenario" />
      </div>
    </section>
  </section>
</template>

<style scoped>
.dashboard__header {
  position: relative;
  padding: 0.25rem 0 0 1.5rem;
}

/* 實驗室觀測線：頂端一個訊號點，往下漸隱 */
.dashboard__header::before {
  content: '';
  position: absolute;
  top: 0.5rem;
  bottom: 0;
  left: 0;
  width: 2px;
  background: linear-gradient(to bottom, var(--lab-signal), rgb(52 211 153 / 0));
}

.dashboard__header::after {
  content: '';
  position: absolute;
  top: 0.25rem;
  left: -3px;
  width: 8px;
  height: 8px;
  background: var(--lab-signal);
  box-shadow: 0 0 10px rgb(52 211 153 / 0.6);
}

.dashboard__title {
  margin: 0;
  font-size: clamp(2.5rem, 7vw, 4.25rem);
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.dashboard__subtitle {
  margin: 1rem 0 0;
  max-width: 40rem;
  font-size: 1.0625rem;
  line-height: 1.7;
  color: var(--lab-text-muted);
}

.dashboard__readout {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin: 1.25rem 0 0;
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--lab-text-muted);
  font-variant-numeric: tabular-nums;
}

.dashboard__readout-drafted {
  color: var(--lab-signal);
}

.dashboard__readout-standby {
  color: var(--lab-warn);
}

.dashboard__group {
  margin-top: 4rem;
}

.dashboard__group + .dashboard__group {
  margin-top: 3.5rem;
}

.dashboard__group-title {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin: 0 0 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--lab-rule);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--lab-text-muted);
}

.dashboard__group-count {
  font-family: var(--lab-font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
}

.dashboard__grid--standby {
  gap: 1rem;
}

@media (max-width: 720px) {
  .dashboard__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .dashboard__group {
    margin-top: 3rem;
  }
}
</style>
