<script setup lang="ts">
import LabNavbar from '@/components/LabNavbar.vue'
</script>

<template>
  <!-- Stage 頁：全站導覽列 + 吃滿剩餘高度的全螢幕內容（內頁用 height / min-height: 100% 對齊這個區域） -->
  <div class="stage-layout">
    <LabNavbar />
    <div class="stage-layout__view">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.stage-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.stage-layout__view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
