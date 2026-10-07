<script setup lang="ts">
interface Work {
  id: string;
  title: string;
}

const props = defineProps<{
  name: string;
  bio: string;
  works: Work[];
}>();
</script>

<template>
  <section class="profile-card">
    <h1 data-testid="name">{{ props.name }}</h1>
    <p data-testid="bio">{{ props.bio }}</p>
    <h2>Works</h2>
    <ul class="works">
      <li v-for="work in props.works" :key="work.id" :data-testid="`work-${work.id}`">
        {{ work.title }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 32rem;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.75rem;
  font-family: system-ui, sans-serif;
  color: #1f2328;
}

.works {
  padding-left: 1.25rem;
}
</style>
