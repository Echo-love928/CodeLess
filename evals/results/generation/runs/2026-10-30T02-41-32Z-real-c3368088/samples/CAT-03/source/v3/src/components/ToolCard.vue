<script setup lang="ts">
import type { Tool } from '../data/tools';

defineProps<{ tool: Tool }>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();
</script>

<template>
  <article data-ai-component="tool-card" class="tool-card">
    <p class="tool-name">
      <button type="button" class="name-button" @click="emit('select', tool.id)">{{ tool.name }}</button>
    </p>
    <p class="meta"><span class="category">{{ tool.category }}</span> · <span class="license">{{ tool.license }}</span></p>
    <p class="summary">{{ tool.summary }}</p>
  </article>
</template>

<style scoped>
.tool-card { border: 1px solid #d8dee9; border-radius: 8px; padding: 12px 14px; background: #fff; }
.tool-name { margin: 0 0 6px; font-size: 1.1rem; }
.name-button { background: none; border: none; padding: 0; color: #1a5fb4; font: inherit; cursor: pointer; text-decoration: underline; }
.meta { margin: 0 0 6px; color: #4a5568; font-size: 0.85rem; }
.summary { margin: 0; color: #2d3748; }
</style>
