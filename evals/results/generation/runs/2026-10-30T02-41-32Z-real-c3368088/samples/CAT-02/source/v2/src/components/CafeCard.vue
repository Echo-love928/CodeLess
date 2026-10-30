<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe }>();
const emit = defineEmits<{ (e: 'select', id: number): void }>();
</script>

<template>
  <article class="cafe-card" data-ai-component="cafe-card" @click="emit('select', cafe.id)">
    <h3 class="cafe-name">{{ cafe.name }}</h3>
    <p class="cafe-meta">城区：{{ cafe.district }}</p>
    <p class="cafe-meta">评分：{{ cafe.rating }}</p>
    <p class="cafe-meta">招牌饮品：{{ cafe.signature }}</p>
  </article>
</template>

<style scoped>
.cafe-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.cafe-card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.cafe-name {
  margin: 0 0 8px;
  font-size: 18px;
}
.cafe-meta {
  margin: 4px 0;
  font-size: 14px;
  color: #555;
}
</style>
