<script setup lang="ts">
interface Work {
  id: number;
  title: string;
  location: string;
  color: string;
}

defineProps<{ work: Work }>();
</script>

<template>
  <article class="work-card" data-ai-component="work-card">
    <div class="work-swatch" :style="{ backgroundColor: work.color }"></div>
    <h3 class="work-title">{{ work.title }}</h3>
    <p class="work-location">{{ work.location }}</p>
  </article>
</template>

<style scoped>
.work-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.work-swatch {
  width: 100%;
  height: 140px;
}

.work-title {
  margin: 12px 12px 4px;
  font-size: 16px;
}

.work-location {
  margin: 0 12px 12px;
  color: #666;
  font-size: 13px;
}
</style>
