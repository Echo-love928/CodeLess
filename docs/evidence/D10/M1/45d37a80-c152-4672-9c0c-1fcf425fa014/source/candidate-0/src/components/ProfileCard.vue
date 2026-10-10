<script setup lang="ts">
interface Work {
  title: string;
  description: string;
}

defineProps<{
  name: string;
  bio: string;
  works: Work[];
}>();
</script>

<template>
  <section class="profile-card">
    <h1 data-testid="profile-name">{{ name }}</h1>
    <p data-testid="profile-bio">{{ bio }}</p>
    <h2>Works</h2>
    <ul class="works">
      <li v-for="(work, index) in works" :key="work.title" :data-testid="`work-item-${index}`">
        <h3>{{ work.title }}</h3>
        <p>{{ work.description }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: system-ui, sans-serif;
  text-align: left;
}

.works {
  list-style: none;
  padding: 0;
}
</style>
