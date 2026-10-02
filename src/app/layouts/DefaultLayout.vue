<script setup lang="ts">
import LabNavbar from '@/components/LabNavbar.vue'
</script>

<template>
  <div class="default-layout">
    <LabNavbar />
    <main class="default-layout__content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.default-layout__content {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem;
}
</style>
