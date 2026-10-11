<script setup lang="ts">
interface WorkItem {
  id: string;
  title: string;
  description: string;
  year: string;
}

defineProps<{
  name: string;
  role: string;
  bio: string;
  works: WorkItem[];
}>();
</script>

<template>
  <section class="profile-card">
    <header class="profile-card__header">
      <h1 class="profile-card__name" data-testid="name">{{ name }}</h1>
      <p class="profile-card__role" data-testid="role">{{ role }}</p>
    </header>
    <p class="profile-card__bio" data-testid="bio">{{ bio }}</p>
    <section class="profile-card__works">
      <h2 class="profile-card__works-title" data-testid="works-title">Works</h2>
      <ul class="profile-card__list" data-testid="works-list">
        <li
          v-for="work in works"
          :key="work.id"
          class="profile-card__item"
          :data-testid="`work-${work.id}`"
        >
          <h3 class="profile-card__item-title">{{ work.title }}</h3>
          <p class="profile-card__item-year">{{ work.year }}</p>
          <p class="profile-card__item-desc">{{ work.description }}</p>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2rem;
  border: 1px solid #e2e2e2;
  border-radius: 12px;
  font-family: Georgia, 'Times New Roman', serif;
  color: #1f2933;
  background: #ffffff;
}

.profile-card__name {
  margin: 0;
  font-size: 2.25rem;
}

.profile-card__role {
  margin: 0.25rem 0 0;
  color: #52606d;
  font-size: 1rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.profile-card__bio {
  margin: 1.25rem 0 0;
  line-height: 1.6;
}

.profile-card__works {
  margin-top: 2rem;
}

.profile-card__works-title {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  border-bottom: 2px solid #e2e2e2;
  padding-bottom: 0.5rem;
}

.profile-card__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}

.profile-card__item {
  padding: 1rem;
  border-radius: 8px;
  background: #f5f7fa;
}

.profile-card__item-title {
  margin: 0;
  font-size: 1.1rem;
}

.profile-card__item-year {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #7b8794;
}

.profile-card__item-desc {
  margin: 0.5rem 0 0;
  line-height: 1.5;
}
</style>
