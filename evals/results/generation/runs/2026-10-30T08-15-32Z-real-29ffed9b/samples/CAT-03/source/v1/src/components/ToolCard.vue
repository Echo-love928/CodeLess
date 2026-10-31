<script setup lang="ts">
import type { Tool } from '../data/tools';

defineProps<{ tool: Tool; expanded: boolean }>();
const emit = defineEmits<{ (e: 'toggle', id: string): void }>();
</script>

<template>
  <li class="tool-card" data-ai-component="tool-card">
    <button type="button" class="tool-name" :data-testid="'tool-name-' + tool.id" @click="emit('toggle', tool.id)">
      {{ tool.name }}
    </button>
    <p class="meta">类别：{{ tool.category }}　许可证：{{ tool.license }}</p>
    <p class="summary">{{ tool.summary }}</p>
    <p v-if="expanded" class="details" :data-testid="'tool-details-' + tool.id">{{ tool.details }}</p>
  </li>
</template>

<style scoped>
.tool-card {
  list-style: none;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  text-align: left;
}
.tool-name {
  background: none;
  border: none;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
}
.meta {
  margin: 6px 0;
  color: #6b7280;
  font-size: 13px;
}
.summary {
  margin: 4px 0;
}
.details {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px dashed #dcdfe6;
  color: #374151;
}
</style>
