<script setup lang="ts">
import type { Tool } from '../data/tools';

const props = defineProps<{ tool: Tool }>();
const emit = defineEmits<{ (e: 'back'): void }>();
</script>

<template>
  <section class="tool-detail" data-ai-component="tool-detail">
    <h2 class="detail-name" data-testid="detail-name">{{ props.tool.name }}</h2>
    <p class="detail-meta" data-testid="detail-meta">{{ props.tool.category }} · {{ props.tool.license }}</p>
    <p class="detail-desc" data-testid="detail-desc">{{ props.tool.description }}</p>
    <button type="button" class="back" data-testid="detail-back" @click="emit('back')">返回目录</button>
  </section>
</template>

<style scoped>
.tool-detail {
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  padding: 16px;
  background: #f8fafc;
}
.detail-name {
  margin: 0 0 6px;
  font-size: 18px;
}
.detail-meta {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
}
.detail-desc {
  margin: 0 0 12px;
  font-size: 14px;
  color: #334155;
}
.back {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
</style>
