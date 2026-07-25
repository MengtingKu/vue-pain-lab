<script setup lang="ts">
import ScenarioCard from '@/components/ScenarioCard.vue'
import type { ScenarioStatus } from '@/components/StatusBadge.vue'

interface ScenarioSummary {
  title: string
  description: string
  status: ScenarioStatus
  to: string
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
    description: '資料夾已建立，痛點描述還沒寫下來。',
    status: 'empty',
    to: '/scenarios/component-storm',
  },
  {
    title: 'Composable Chaos',
    description: '資料夾已建立，痛點描述還沒寫下來。',
    status: 'empty',
    to: '/scenarios/composable-chaos',
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
    to: '/scenarios/reactive-chain',
  },
]
</script>

<template>
  <section>
    <h1>Pain Scenarios</h1>
    <p class="dashboard__subtitle">每張卡片對應一個真實遇到的 Vue 開發痛點。</p>
    <div class="dashboard__grid">
      <ScenarioCard v-for="scenario in scenarios" :key="scenario.to" v-bind="scenario" />
    </div>
  </section>
</template>

<style scoped>
.dashboard__subtitle {
  color: #64748b;
  margin-top: -0.5rem;
}

.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}
</style>
