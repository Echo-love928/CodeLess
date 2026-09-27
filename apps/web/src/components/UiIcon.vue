<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
</script>

<template>
  <svg class="ui-icon" :width="size || 18" :height="size || 18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="1.3" /><rect x="14" y="3" width="7" height="7" rx="1.3" /><rect x="3" y="14" width="7" height="7" rx="1.3" /><rect x="14" y="14" width="7" height="7" rx="1.3" /></template>
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'arrow'" d="M5 12h14m-5-5 5 5-5 5" />
    <path v-else-if="name === 'up'" d="M12 19V5m-6 6 6-6 6 6" />
    <path v-else-if="name === 'back'" d="M19 12H5m5-5-5 5 5 5" />
    <template v-else-if="name === 'search'"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></template>
    <path v-else-if="name === 'book'" d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2Z" />
    <path v-else-if="name === 'doc'" d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6" />
    <path v-else-if="name === 'pen'" d="m4 16-1 5 5-1L20 8l-4-4ZM13 7l4 4M3 21h18" />
    <template v-else-if="name === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18M7 15h3m4 0h3M7 18h3" /></template>
    <template v-else-if="name === 'check'"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" /></template>
    <template v-else-if="name === 'monitor'"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M7 21h10" /></template>
    <template v-else-if="name === 'phone'"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></template>
    <path v-else-if="name === 'cursor'" d="m5 3 14 10-7 1-3 7Z" />
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></template>
  </svg>
</template>
