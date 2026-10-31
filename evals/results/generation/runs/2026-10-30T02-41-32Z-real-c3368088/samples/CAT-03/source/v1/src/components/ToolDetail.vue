<script setup lang="ts">
import type { Tool } from '../data/tools';

defineProps<{ tool: Tool }>();
</script>

<template>
  <aside data-ai-component="tool-detail" class="tool-detail">
    <h2 class="detail-name">{{ tool.name }}</h2>
    <p class="detail-meta">{{ tool.category }} · {{ tool.license }}</p>
    <p class="detail-summary">{{ tool.summary }}</p>
    <p class="detail-description">{{ tool.description }}</p>
  </aside>
</template>

<style scoped>
.tool-detail { border: 1px solid #b6c2d2; border-radius: 8px; padding: 14px 16px; background: #f7fafc; }
.detail-name { margin: 0 0 6px; font-size: 1.2rem; }
.detail-meta { margin: 0 0 6px; color: #4a5568; font-size: 0.85rem; }
.detail-summary { margin: 0 0 8px; font-weight: 600; color: #2d3748; }
.detail-description { margin: 0; color: #2d3748; }
</style>
