<script setup lang="ts">
const props = defineProps<{ active: string }>();
const emit = defineEmits<{ (e: 'change', section: string): void }>();

const sections: { key: string; label: string }[] = [
  { key: 'about', label: '关于我' },
  { key: 'works', label: '作品集' },
  { key: 'contact', label: '联系方式' }
];

function select(key: string): void {
  if (key !== props.active) {
    emit('change', key);
  }
}
</script>

<template>
  <nav class="nav-bar" data-ai-component="nav-bar">
    <button
      v-for="section in sections"
      :key="section.key"
      type="button"
      class="nav-button"
      :class="{ active: section.key === active }"
      @click="select(section.key)"
    >
      {{ section.label }}
    </button>
  </nav>
</template>

<style scoped>
.nav-bar {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding: 20px 16px;
}
.nav-button {
  padding: 8px 20px;
  border: 1px solid #cfc8bc;
  border-radius: 999px;
  background: #fff;
  color: #4a453d;
  font-size: 14px;
  cursor: pointer;
}
.nav-button.active {
  background: #4a453d;
  border-color: #4a453d;
  color: #fff;
}
</style>
