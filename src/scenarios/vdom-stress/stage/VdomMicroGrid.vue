<script setup lang="ts">
/**
 * Stage 頁的方格矩陣：每個 card 一格。
 *
 * 獨立成子元件，props 只有 cards：父元件因為判定、狀態列或 TTY 改變而 re-render 時，
 * cards 參考沒變就不會重新 patch 這幾千格。點亮 / 光暈由父元件外層 class 控制。
 */
export interface MicroCard {
  id: number
  title: string
}

defineProps<{
  cards: readonly MicroCard[]
}>()
</script>

<template>
  <ul class="micro-grid">
    <li v-for="card in cards" :key="card.id" class="micro-grid__cell" :title="card.title" />
  </ul>
</template>

<style scoped>
/* 高密度晶圓排列：8px 方格、1px gap，格線由容器底色在 gap 中透出 */
.micro-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8px, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.micro-grid__cell {
  aspect-ratio: 1;
  background: var(--micro-cell, var(--lab-cell));
  transition: background-color 400ms var(--lab-ease-hard);
}

@media (prefers-reduced-motion: reduce) {
  .micro-grid__cell {
    transition: none;
  }
}
</style>
