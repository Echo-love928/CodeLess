<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();
</script>

<template>
  <li class="cafe-card" data-ai-component="cafe-card" @click="emit('select', cafe.id)">
    <h3 class="cafe-name">{{ cafe.name }}</h3>
    <p class="cafe-district">{{ cafe.district }}</p>
    <p class="cafe-rating">评分 {{ cafe.rating }}</p>
    <p class="cafe-drink">招牌饮品：{{ cafe.signatureDrink }}</p>
  </li>
</template>

<style scoped>
.cafe-card {
  list-style: none;
  border: 1px solid #d8cfc4;
  border-radius: 10px;
  padding: 12px 16px;
  margin: 0 0 12px;
  cursor: pointer;
  background: #fffdf9;
}
.cafe-card:hover {
  border-color: #a8734b;
}
.cafe-name {
  margin: 0 0 6px;
  font-size: 18px;
}
.cafe-card p {
  margin: 2px 0;
  color: #5a4f45;
}
</style>
