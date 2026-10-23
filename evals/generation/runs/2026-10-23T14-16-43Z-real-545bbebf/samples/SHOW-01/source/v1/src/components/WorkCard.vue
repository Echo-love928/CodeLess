<script setup lang="ts">
interface Props {
  title: string;
  description: string;
}

defineProps<Props>();
</script>

<template>
  <article class="work-card">
    <h3 class="work-card-title">{{ title }}</h3>
    <p class="work-card-desc">{{ description }}</p>
  </article>
</template>

<style scoped>
.work-card {
  border: 1px solid #d8dee9;
  border-radius: 10px;
  padding: 1.25rem;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.work-card-title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  color: #1f2933;
}

.work-card-desc {
  margin: 0;
  color: #52606d;
  line-height: 1.6;
}
</style>
