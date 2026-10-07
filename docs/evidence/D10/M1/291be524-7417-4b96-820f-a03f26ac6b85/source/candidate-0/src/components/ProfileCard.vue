<script setup lang="ts">
interface Work {
  id: string;
  title: string;
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
      <ul class="profile-card__list" data-testid="works-list">
        <li v-for="work in works" :key="work.id" class="profile-card__item" :data-testid="`work-${work.id}`">
          {{ work.title }}
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
  border: 1px solid #d0d7de;
  border-radius: 12px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2328;
  background-color: #ffffff;
}

.profile-card__name {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
}

.profile-card__intro {
  margin: 0 0 1.5rem;
  line-height: 1.5;
}

.profile-card__works-title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}

.profile-card__list {
  margin: 0;
  padding-left: 1.25rem;
}

.profile-card__item {
  margin-bottom: 0.25rem;
}
</style>
