<script setup lang="ts">
import ProfileCard from '../components/M1MissingCard.vue';

interface Work {
  title: string;
  description: string;
  meta: string;
}

const works: Work[] = [
  {
    title: 'Analytical Engine',
    description:
      'Ada collaborated with Charles Babbage on the Analytical Engine, describing how the machine could be programmed with punched cards to perform arbitrary calculations.',
    meta: 'Computing machine concept, 1837',
  },
  {
    title: 'Note G',
    description:
      'In Note G of her 1843 translation, Ada published an algorithm for computing Bernoulli numbers, widely regarded as the first computer program.',
    meta: 'Published algorithm, 1843',
  },
];
</script>

<template>
  <main class="home-page">
    <header class="home-page__header">
      <h1 class="home-page__name">Ada Lovelace</h1>
      <p class="home-page__bio">
        Augusta Ada King, Countess of Lovelace, was an English mathematician and
        writer who is often described as the world's first computer programmer for
        her work on Charles Babbage's early mechanical general-purpose computer.
      </p>
    </header>

    <section class="home-page__works">
      <h2 class="home-page__works-title">Works</h2>
      <ProfileCard
        v-for="work in works"
        :key="work.title"
        :title="work.title"
        :description="work.description"
        :meta="work.meta"
      />
    </section>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
  color: #1a1a1a;
}

.home-page__name {
  margin: 0 0 8px;
  font-size: 32px;
}

.home-page__bio {
  margin: 0 0 24px;
  line-height: 1.6;
}

.home-page__works-title {
  margin: 0 0 12px;
  font-size: 22px;
}
</style>
