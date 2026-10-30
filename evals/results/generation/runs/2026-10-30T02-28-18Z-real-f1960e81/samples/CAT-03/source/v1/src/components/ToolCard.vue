<script setup lang="ts">
import type { Tool } from '../data/tools';

type ToolCardProps = { tool: Tool };

defineProps<ToolCardProps>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

function onSelect(id: string): void {
  emit('select', id);
}
</script>

<template>
  <li class="tool-card" data-ai-component="tool-card">
    <button class="tool-name" type="button" :data-testid="`tool-name-${tool.id}`" @click="onSelect(tool.id)">
      {{ tool.name }}
    </button>
    <div class="meta">
      <span class="category">类别：{{ tool.category }}</span>
      <span class="license">许可证：{{ tool.license }}</span>
    </div>
    <p class="summary">{{ tool.summary }}</p>
  </li>
</template>

<style scoped>
.tool-card {
  list-style: none;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  padding: 12px 14px;
  background: #fff;
}
.tool-name {
  background: none;
  border: none;
  padding: 0;
  font-size: 17px;
  font-weight: 600;
  color: #1f6feb;
  cursor: pointer;
}
.tool-name:hover {
  text-decoration: underline;
}
.meta {
  display: flex;
  gap: 12px;
  margin: 6px 0;
  font-size: 13px;
  color: #57606a;
}
.summary {
  margin: 0;
  font-size: 14px;
  color: #24292f;
}
</style>
