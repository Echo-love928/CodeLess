<script setup lang="ts">
import type { Tool } from '../data/tools';

typedefineProps();

const props = defineProps<{ tool: Tool }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();

function open(): void {
  emit('select', props.tool.id);
}
</script>

<template>
  <article class="tool-card" data-ai-component="tool-card">
    <button type="button" class="tool-name" :data-testid="'tool-name-' + tool.id" @click="open">
      {{ tool.name }}
    </button>
    <p class="tool-meta">{{ tool.category }} · {{ tool.license }}</p>
    <p class="tool-summary">{{ tool.summary }}</p>
  </article>
</template>

<style scoped>
.tool-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fff;
}
.tool-name {
  background: none;
  border: none;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1d4ed8;
  cursor: pointer;
}
.tool-name:hover {
  text-decoration: underline;
}
.tool-meta {
  margin: 6px 0;
  font-size: 12px;
  color: #64748b;
}
.tool-summary {
  margin: 0;
  font-size: 14px;
  color: #334155;
}
</style>
