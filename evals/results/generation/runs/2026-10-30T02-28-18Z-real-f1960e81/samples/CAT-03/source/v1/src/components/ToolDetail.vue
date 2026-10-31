<script setup lang="ts">
import type { Tool } from '../data/tools';

type ToolDetailProps = { tool: Tool };

defineProps<ToolDetailProps>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <section class="tool-detail" data-ai-component="tool-detail">
    <h2 class="detail-name" data-testid="detail-name">{{ tool.name }}</h2>
    <div class="meta">
      <span data-testid="detail-category">类别：{{ tool.category }}</span>
      <span data-testid="detail-license">许可证：{{ tool.license }}</span>
    </div>
    <p class="summary" data-testid="detail-summary">{{ tool.summary }}</p>
    <p class="detail-text" data-testid="detail-text">{{ tool.detail }}</p>
    <button class="close" type="button" data-testid="detail-close" @click="emit('close')">关闭</button>
  </section>
</template>

<style scoped>
.tool-detail {
  border: 1px solid #1f6feb;
  border-radius: 8px;
  padding: 14px 16px;
  background: #f6f8fa;
  margin-bottom: 16px;
}
.detail-name {
  margin: 0 0 6px;
  font-size: 20px;
}
.meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #57606a;
  margin-bottom: 6px;
}
.summary {
  font-size: 14px;
  font-weight: 600;
  margin: 6px 0;
}
.detail-text {
  font-size: 14px;
  color: #24292f;
  margin: 6px 0 10px;
}
.close {
  padding: 4px 12px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
</style>
