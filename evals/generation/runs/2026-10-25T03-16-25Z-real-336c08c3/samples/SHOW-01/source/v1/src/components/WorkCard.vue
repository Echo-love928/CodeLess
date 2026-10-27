<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <article data-ai-component="work-card" class="work-card">
    <h3 class="work-card__title">{{ title }}</h3>
    <p class="work-card__description">{{ description }}</p>
  </article>
</template>

<style scoped>
.work-card {
  border: 1px solid #d8dde6;
  border-radius: 10px;
  padding: 1.25rem;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
}

.work-card__title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
  color: #1e293b;
}

.work-card__description {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}
</style>
