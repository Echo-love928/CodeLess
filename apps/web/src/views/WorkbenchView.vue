<script setup lang="ts">
import WorkbenchPage from '../features/workbench/WorkbenchPage.vue'

defineProps<{ id: string }>()
</script>

<template>
  <WorkbenchPage :id="id" />
</template>
