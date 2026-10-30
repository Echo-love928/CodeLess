<script setup lang="ts">
import type { Cafe } from '../data/cafes';

defineProps<{ cafe: Cafe | null }>();
</script>

<template>
  <section class="cafe-detail" data-ai-component="cafe-detail">
    <template v-if="cafe">
      <h2 class="detail-title">{{ cafe.name }}</h2>
      <p class="detail-line">城区：{{ cafe.district }}</p>
      <p class="detail-line">评分：{{ cafe.rating }}</p>
      <p class="detail-line">招牌饮品：{{ cafe.signature }}</p>
      <p class="detail-desc">{{ cafe.description }}</p>
    </template>
    <p v-else class="detail-empty">点击上方咖啡馆卡片查看详情</p>
  </section>
</template>

<style scoped>
.cafe-detail {
  margin-top: 24px;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 20px;
}
.detail-line {
  margin: 4px 0;
  font-size: 14px;
  color: #444;
}
.detail-desc {
  margin: 10px 0 0;
  font-size: 14px;
  color: #333;
}
.detail-empty {
  margin: 0;
  color: #888;
}
</style>
