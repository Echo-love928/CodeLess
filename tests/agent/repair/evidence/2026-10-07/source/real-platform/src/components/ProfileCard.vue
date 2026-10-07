<script setup lang="ts">
interface Work {
  id: string;
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
    <h1 class="profile-name" data-testid="profile-name">{{ name }}</h1>
    <p class="profile-bio" data-testid="profile-bio">{{ bio }}</p>
    <h2 class="works-heading">Works</h2>
    <ul class="works-list">
      <li
        v-for="work in works"
        :key="work.id"
        class="work-item"
        :data-testid="`work-${work.id}`"
      >
        <h3 class="work-title">{{ work.title }}</h3>
        <p class="work-description">{{ work.description }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  border: 1px solid #dddddd;
  border-radius: 8px;
  font-family: Georgia, serif;
  color: #222222;
}

.profile-name {
  margin: 0 0 8px;
  font-size: 28px;
}

.profile-bio {
  margin: 0 0 20px;
  font-size: 16px;
  line-height: 1.5;
}

.works-heading {
  margin: 0 0 12px;
  font-size: 20px;
}

.works-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.work-item {
  padding: 12px;
  border: 1px solid #eeeeee;
  border-radius: 6px;
}

.work-title {
  margin: 0 0 6px;
  font-size: 18px;
}

.work-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
</style>
