<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <details v-if="message.length > 240" class="log-message">
    <summary>{{ message.replace(/\s+/g, ' ').slice(0, 120) }}…（展开完整日志，{{ message.length }} 字符）</summary>
    <p tabindex="0" aria-label="完整日志，可滚动查看">{{ message }}</p>
  </details>
  <p v-else class="log-message">{{ message }}</p>
</template>

<style scoped>
.log-message { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
summary { cursor: pointer; padding: 8px 0; }
:is(summary, p):focus-visible { outline: 2px solid var(--blue, #4166d2); outline-offset: 2px; }
details p { max-height: 280px; overflow-y: auto; }
</style>
