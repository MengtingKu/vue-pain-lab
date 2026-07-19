<script setup lang="ts"></script>

<template>
  <header class="lab-header">
    <RouterLink to="/" class="lab-header__title">Vue Pain Lab</RouterLink>
    <p class="lab-header__tagline">驗證新版 Vue 是否真的解決了日常開發的痛點</p>
  </header>
</template>

<style scoped>
.lab-header {
  padding: 1.5rem 2rem;
  border-bottom: 1px solid #e2e8f0;
}

.lab-header__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: inherit;
  text-decoration: none;
}

.lab-header__tagline {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #64748b;
}
</style>
