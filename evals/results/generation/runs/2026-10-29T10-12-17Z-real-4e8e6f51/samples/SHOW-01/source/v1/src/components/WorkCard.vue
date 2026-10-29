<script setup lang="ts">
interface WorkCardProps {
  title: string;
  description: string;
}

defineProps<WorkCardProps>();
</script>

<template>
  <article class="work-card" data-ai-component="work-card">
    <h3 class="work-card__title">{{ title }}</h3>
    <p class="work-card__desc">{{ description }}</p>
  </article>
</template>

<style scoped>
.work-card {
  border: 1px solid #d7dbe0;
  border-radius: 10px;
  padding: 1.25rem;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.work-card__title {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  color: #1a2b4a;
}
.work-card__desc {
  margin: 0;
  color: #4a5666;
  line-height: 1.6;
}
</style>
