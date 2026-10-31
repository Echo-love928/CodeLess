<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe }>();
const emit = defineEmits<{ (e: 'select', id: number): void }>();
</script>

<template>
  <article class="cafe-card" data-ai-component="cafe-card" @click="emit('select', cafe.id)">
    <h3 class="cafe-name" :data-testid="`cafe-name-${cafe.id}`">{{ cafe.name }}</h3>
    <p class="cafe-district" :data-testid="`cafe-district-${cafe.id}`">城区：{{ cafe.district }}</p>
    <p class="cafe-rating" :data-testid="`cafe-rating-${cafe.id}`">评分：{{ cafe.rating.toFixed(1) }}</p>
    <p class="cafe-signature" :data-testid="`cafe-signature-${cafe.id}`">招牌饮品：{{ cafe.signature }}</p>
  </article>
</template>

<style scoped>
.cafe-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  background: #fff;
}
.cafe-card:hover {
  border-color: #b07d4f;
}
.cafe-name {
  margin: 0 0 6px;
  font-size: 16px;
}
.cafe-card p {
  margin: 2px 0;
  font-size: 13px;
  color: #555;
}
</style>
