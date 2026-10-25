<script setup lang="ts">
import WorkCard from '../components/WorkCard.vue';
import { profile } from '../data/profile';
</script>

<template>
  <main data-ai-component="home-page" class="home-page">
    <header class="hero">
      <h1 class="hero__name">{{ profile.name }}</h1>
      <p class="hero__tagline">{{ profile.tagline }}</p>
    </header>

    <section class="works">
      <h2 class="works__heading">代表作品</h2>
      <div class="works__grid">
        <WorkCard
          v-for="work in profile.works"
          :key="work.title"
          :title="work.title"
          :description="work.description"
        />
      </div>
    </section>

    <footer class="contact">
      <h2 class="contact__heading">联系方式</h2>
      <p class="contact__email">{{ profile.email }}</p>
    </footer>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1e293b;
}

.hero {
  text-align: center;
  padding: 2rem 0;
}

.hero__name {
  margin: 0 0 0.75rem;
  font-size: 2.4rem;
}

.hero__tagline {
  margin: 0;
  color: #475569;
  font-size: 1.1rem;
}

.works__heading,
.contact__heading {
  font-size: 1.3rem;
  margin: 0 0 1rem;
}

.works__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.contact {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #e2e8f0;
  text-align: center;
}

.contact__email {
  margin: 0;
  color: #475569;
}
</style>
