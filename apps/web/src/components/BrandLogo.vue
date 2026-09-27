<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <span class="brand" :class="{ 'brand--compact': compact }">
    <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M23 5H12a7 7 0 0 0-7 7v8a7 7 0 0 0 7 7h11v-6H12a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h11V5Z" fill="currentColor" /><rect x="24" y="13" width="5" height="6" rx=".7" fill="currentColor" /></svg></span>
    <span v-if="!compact" class="brand__word">CodeLess</span>
  </span>
</template>
