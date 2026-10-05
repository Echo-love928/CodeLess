<script setup lang="ts">
interface WorkItem {
  id: string;
  title: string;
  summary: string;
}

interface Props {
  name: string;
  bio: string;
  works: WorkItem[];
}

defineProps<Props>();
</script>

<template>
  <article class="profile-card">
    <h1 class="profile-name" data-testid="profile-name">{{ name }}</h1>
    <p class="profile-bio" data-testid="profile-bio">{{ bio }}</p>
    <section class="profile-works">
      <h2 class="works-heading">Works</h2>
      <ul class="works-list">
        <li v-for="work in works" :key="work.id" class="work-item">
          <h3 class="work-title" :data-testid="`work-title-${work.id}`">{{ work.title }}</h3>
          <p class="work-summary" :data-testid="`work-summary-${work.id}`">{{ work.summary }}</p>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.profile-card {
  max-width: 40rem;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid #d0d7de;
  border-radius: 0.75rem;
  background: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.profile-name {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
  color: #1f2328;
}

.profile-bio {
  margin: 0 0 1.5rem;
  color: #4b5563;
  line-height: 1.5;
}

.works-heading {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  color: #1f2328;
}

.works-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 1rem;
}

.work-item {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #f9fafb;
}

.work-title {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
  color: #1f2328;
}

.work-summary {
  margin: 0;
  color: #4b5563;
  line-height: 1.5;
}
</style>
