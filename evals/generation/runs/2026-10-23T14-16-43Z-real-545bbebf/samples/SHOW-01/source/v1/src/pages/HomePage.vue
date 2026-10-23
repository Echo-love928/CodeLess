<script setup lang="ts">
import WorkCard from '../components/WorkCard.vue';
import { works } from '../data/works';
import type { Work } from '../data/works';

const workItems: Work[] = works;
</script>

<template>
  <main class="home-page">
    <header class="hero">
      <h1 class="hero-name" data-testid="profile-name">Grace Hopper</h1>
      <p class="hero-tagline" data-testid="profile-tagline">计算机科学先驱，COBOL 语言的推动者</p>
    </header>

    <section class="works" aria-label="代表作品">
      <WorkCard
        v-for="work in workItems"
        :key="work.id"
        :title="work.title"
        :description="work.description"
      />
    </section>

    <footer class="contact">
      <p class="contact-email" data-testid="contact-email">grace.hopper@example.com</p>
    </footer>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  font-family: system-ui, sans-serif;
  color: #1f2933;
}

.hero {
  text-align: center;
  margin-bottom: 2.5rem;
}

.hero-name {
  margin: 0 0 0.75rem;
  font-size: 2.25rem;
}

.hero-tagline {
  margin: 0;
  font-size: 1.1rem;
  color: #52606d;
}

.works {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.contact {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #d8dee9;
  text-align: center;
}

.contact-email {
  margin: 0;
  color: #3e4c59;
}
</style>
