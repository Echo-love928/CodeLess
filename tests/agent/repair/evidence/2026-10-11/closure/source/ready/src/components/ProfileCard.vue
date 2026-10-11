<script setup lang="ts">
interface Props {
  name: string;
  bio: string;
}

defineProps<Props>();
</script>

<template>
  <article class="profile-card">
    <h1 data-testid="profile-name">{{ name }}</h1>
    <p data-testid="profile-bio">{{ bio }}</p>
  </article>
</template>

<style scoped>
.profile-card {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.profile-card h1 {
  margin: 0 0 0.5rem;
}

.profile-card p {
  margin: 0;
}
</style>
