<script setup lang="ts">
interface Work {
  title: string;
  description: string;
}

const props = defineProps<{
  name: string;
  bio: string;
  works: Work[];
}>();
</script>

<template>
  <section class="profile-card">
    <h1 data-testid="profile-name">{{ props.name }}</h1>
    <p data-testid="profile-bio">{{ props.bio }}</p>
    <h2 data-testid="works-heading">Works</h2>
    <ul class="works">
      <li v-for="(work, index) in props.works" :key="work.title" class="work-item">
        <h3 :data-testid="'work-title-' + index">{{ work.title }}</h3>
        <p :data-testid="'work-desc-' + index">{{ work.description }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
}

.works {
  list-style: none;
  padding: 0;
}

.work-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
</style>
