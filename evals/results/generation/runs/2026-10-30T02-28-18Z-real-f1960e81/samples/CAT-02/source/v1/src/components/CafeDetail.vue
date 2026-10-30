<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe }>();
</script>

<template>
  <section class="cafe-detail" data-ai-component="cafe-detail">
    <h2 class="detail-title">咖啡馆详情</h2>
    <h3 class="detail-name">{{ cafe.name }}</h3>
    <p class="detail-district">所在城区：{{ cafe.district }}</p>
    <p class="detail-rating">评分 {{ cafe.rating.toFixed(1) }}</p>
    <p class="detail-signature">招牌饮品：{{ cafe.signature }}</p>
    <p class="detail-address">地址：{{ cafe.address }}</p>
    <p class="detail-description">{{ cafe.description }}</p>
  </section>
</template>

<style scoped>
.cafe-detail {
  margin-top: 20px;
  border: 1px solid #8a6d4b;
  border-radius: 8px;
  padding: 16px;
  background: #f7f2e9;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 15px;
  color: #8a6d4b;
}
.detail-name {
  margin: 0 0 8px;
  font-size: 18px;
}
.cafe-detail p {
  margin: 4px 0;
  font-size: 14px;
  color: #3d3d3d;
}
</style>
