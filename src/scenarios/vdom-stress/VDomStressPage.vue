<script setup lang="ts">
import { nextTick, ref } from 'vue'

interface Card {
  id: number
  title: string
}

const RENDER_COUNT_OPTIONS = [100, 500, 1000, 5000] as const

// 目前選擇的 Render 數量，預設 100
const selectedCount = ref<number>(RENDER_COUNT_OPTIONS[0])

// Render 出來的 Card 陣列，Trigger Render 前為空陣列
const cards = ref<Card[]>([])

// Raw Rendering 量測：只記錄 start / end / duration，不做任何額外運算
const renderStartTime = ref<number | null>(null)
const renderEndTime = ref<number | null>(null)
const renderDuration = ref<number | null>(null)

async function triggerRender(): Promise<void> {
  renderStartTime.value = performance.now()
  renderEndTime.value = null
  renderDuration.value = null

  const next: Card[] = []
  for (let i = 1; i <= selectedCount.value; i++) {
    next.push({ id: i, title: `Card #${i}` })
  }
  cards.value = next

  // 等待 Vue 把這次的 Card 陣列實際 Render 到 DOM 後，再量測結束時間
  await nextTick()
  renderEndTime.value = performance.now()
  renderDuration.value = renderEndTime.value - renderStartTime.value
}
</script>

<template>
  <article>
    <h1>VDOM Stress Test</h1>
    <p>
      Raw Rendering Benchmark：選擇 Render 數量並觸發 Render，觀察大量 UI Node
      一次性掛載時的 Vue Runtime 成本。不做任何 Rendering 最佳化。
    </p>

    <section class="params">
      <h2>Lab Parameters</h2>
      <div class="params__options">
        <label v-for="option in RENDER_COUNT_OPTIONS" :key="option" class="params__option">
          <input v-model="selectedCount" type="radio" name="render-count" :value="option" />
          {{ option }}
        </label>
      </div>
      <button type="button" @click="triggerRender">Trigger Render</button>
    </section>

    <section class="metrics">
      <h2>Runtime Metrics</h2>
      <dl>
        <dt>Current Render Count</dt>
        <dd>{{ cards.length }}</dd>
        <dt>renderStartTime</dt>
        <dd>{{ renderStartTime !== null ? `${renderStartTime.toFixed(3)} ms` : '-' }}</dd>
        <dt>renderEndTime</dt>
        <dd>{{ renderEndTime !== null ? `${renderEndTime.toFixed(3)} ms` : '-' }}</dd>
        <dt>renderDuration</dt>
        <dd>{{ renderDuration !== null ? `${renderDuration.toFixed(3)} ms` : '-' }}</dd>
      </dl>
    </section>

    <section class="cards">
      <h2>Rendered Cards（{{ cards.length }}）</h2>
      <ul class="cards__list">
        <li v-for="card in cards" :key="card.id" class="cards__item">
          <span class="cards__id">#{{ card.id }}</span>
          <span class="cards__title">{{ card.title }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.params__options {
  display: flex;
  gap: 1rem;
  margin: 0.5rem 0 1rem;
}

.params__option {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}

.metrics dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0.5rem 0 1rem;
}

.metrics dt {
  color: #64748b;
}

.metrics dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.metrics {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.cards__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem;
  max-height: 480px;
  overflow-y: auto;
}

.cards__item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.cards__id {
  font-size: 0.75rem;
  color: #94a3b8;
}

.cards__title {
  font-weight: 600;
}
</style>
