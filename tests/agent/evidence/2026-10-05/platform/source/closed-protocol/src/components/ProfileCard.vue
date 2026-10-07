<script setup lang="ts">
interface Work {
  title: string;
  description: string;
}

defineProps<{
  name: string;
  intro: string;
  works: Work[];
}>();
</script>

<template>
  <section class="profile-card">
    <h1 class="profile-name" data-testid="name">{{ name }}</h1>
    <p class="profile-intro" data-testid="intro">{{ intro }}</p>
    <h2 class="works-heading">Works</h2>
    <ul class="works-list" data-testid="works">
      <li v-for="work in works" :key="work.title" class="work-item">
        <h3 class="work-title" data-testid="work-title">{{ work.title }}</h3>
        <p class="work-description">{{ work.description }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, sans-serif;
  color: #1f2933;
}

.profile-name {
  margin: 0 0 0.5rem;
  font-size: 2rem;
}

.profile-intro {
  margin: 0 0 1.5rem;
  line-height: 1.6;
  color: #52606d;
}

.works-heading {
  font-size: 1.25rem;
  margin: 0 0 0.75rem;
}

.works-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
}

.work-item {
  border: 1px solid #d9e2ec;
  border-radius: 0.5rem;
  padding: 1rem;
}

.work-title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.work-description {
  margin: 0;
  color: #52606d;
  line-height: 1.5;
}
</style>
