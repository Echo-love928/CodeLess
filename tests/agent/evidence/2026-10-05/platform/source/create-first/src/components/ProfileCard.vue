<script setup lang="ts">
export interface Work {
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
  <article class="profile-card" data-testid="profile-card">
    <header class="profile-header">
      <h1 class="profile-name" data-testid="name">{{ name }}</h1>
      <p class="profile-bio" data-testid="bio">{{ bio }}</p>
    </header>

    <section class="profile-works" data-testid="works">
      <h2 class="works-title">Works</h2>
      <ul class="works-list">
        <li
          v-for="work in works"
          :key="work.id"
          class="work-item"
          data-testid="work-item"
        >
          <h3 class="work-title" data-testid="work-title">{{ work.title }}</h3>
          <p class="work-description" data-testid="work-description">{{ work.description }}</p>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.profile-card {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: Georgia, "Times New Roman", serif;
  color: #1f2430;
}

.profile-name {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
}

.profile-bio {
  margin: 0 0 24px;
  line-height: 1.6;
  color: #46506a;
}

.works-title {
  margin: 0 0 12px;
  font-size: 20px;
  border-bottom: 1px solid #d7dbe6;
  padding-bottom: 6px;
}

.works-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.work-item {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #e2e6f0;
  border-radius: 8px;
  background: #f8f9fc;
}

.work-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
}

.work-description {
  margin: 0;
  line-height: 1.5;
  color: #46506a;
}
</style>
