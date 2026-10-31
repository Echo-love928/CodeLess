<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();
</script>

<template>
  <article class="cafe-card" data-ai-component="cafe-card" @click="emit('select', cafe.id)">
    <h3 class="cafe-name" :data-testid="`cafe-name-${cafe.id}`">{{ cafe.name }}</h3>
    <p class="cafe-district">{{ cafe.district }}</p>
    <p class="cafe-rating">评分 {{ cafe.rating.toFixed(1) }}</p>
    <p class="cafe-signature">招牌饮品：{{ cafe.signature }}</p>
  </article>
</template>

<style scoped>
.cafe-card {
  border: 1px solid #d8d2c8;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
  cursor: pointer;
  background: #fffdf9;
}
.cafe-card:hover {
  border-color: #8a6d4b;
}
.cafe-name {
  margin: 0 0 6px;
  font-size: 16px;
}
.cafe-card p {
  margin: 2px 0;
  color: #4a4a4a;
  font-size: 14px;
}
</style>
