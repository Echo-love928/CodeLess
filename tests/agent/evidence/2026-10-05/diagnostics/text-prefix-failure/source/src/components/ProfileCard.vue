<script setup lang="ts">
interface Work {
  title: string;
  year: string;
}

interface Props {
  name: string;
  intro: string;
  works: Work[];
}

defineProps<Props>();
</script>

<template>
  <article class="profile-card">
    <h1 class="profile-card__name" data-testid="name">{{ name }}</h1>
    <p class="profile-card__intro" data-testid="intro">{{ intro }}</p>
    <section class="profile-card__works">
      <h2 class="profile-card__works-title">Works</h2>
      <ul class="profile-card__list">
        <li
          v-for="(work, index) in works"
          :key="work.title"
          class="profile-card__item"
          :data-testid="'work-' + index"
        >
          <span class="profile-card__work-title" :data-testid="'work-title-' + index">{{ work.title }}</span>
          <span class="profile-card__work-year" :data-testid="'work-year-' + index">{{ work.year }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.profile-card {
  max-width: 32rem;
  margin: 0 auto;
  padding: 2rem;
  border: 1px solid #d7dbe0;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.profile-card__name {
  margin: 0 0 0.75rem;
  font-size: 1.75rem;
  color: #102a43;
}

.profile-card__intro {
  margin: 0 0 1.5rem;
  line-height: 1.6;
  color: #334e68;
}

.profile-card__works-title {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #627d98;
}

.profile-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.profile-card__item {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  background: #f0f4f8;
}

.profile-card__work-title {
  font-weight: 600;
}

.profile-card__work-year {
  color: #627d98;
}
</style>
