<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe }>();
</script>

<template>
  <section class="cafe-detail" data-ai-component="cafe-detail">
    <h2 class="detail-title" data-testid="detail-name">{{ cafe.name }}</h2>
    <p class="detail-district" data-testid="detail-district">城区：{{ cafe.district }}</p>
    <p class="detail-rating" data-testid="detail-rating">评分：{{ cafe.rating.toFixed(1) }}</p>
    <p class="detail-signature" data-testid="detail-signature">招牌饮品：{{ cafe.signature }}</p>
    <p class="detail-description" data-testid="detail-description">{{ cafe.description }}</p>
    <p class="detail-address" data-testid="detail-address">地址：{{ cafe.address }}</p>
  </section>
</template>

<style scoped>
.cafe-detail {
  margin-top: 20px;
  border: 1px solid #b07d4f;
  border-radius: 8px;
  padding: 16px 20px;
  background: #fdf8f2;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 18px;
}
.cafe-detail p {
  margin: 3px 0;
  font-size: 13px;
  color: #555;
}
</style>
