<script setup lang="ts">
interface Props {
  title: string;
  description: string;
  meta?: string;
}

defineProps<Props>();
</script>

<template>
  <article class="profile-card">
    <h2 class="profile-card__title">{{ title }}</h2>
    <p class="profile-card__description">{{ description }}</p>
    <p v-if="meta" class="profile-card__meta">{{ meta }}</p>
  </article>
</template>

<style scoped>
.profile-card {
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  padding: 16px;
  margin: 0 0 16px;
  background: #ffffff;
}

.profile-card__title {
  margin: 0 0 8px;
  font-size: 20px;
}

.profile-card__description {
  margin: 0;
  line-height: 1.5;
}

.profile-card__meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: #666666;
}
</style>
