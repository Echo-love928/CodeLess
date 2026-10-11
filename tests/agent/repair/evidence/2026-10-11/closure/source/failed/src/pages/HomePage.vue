<script setup lang="ts">
import ProfileCard from '../components/M1MissingCard.vue';

interface Work {
  title: string;
  description: string;
}

const name = 'Ada Lovelace';
const bio = 'Ada Lovelace was an English mathematician and writer, chiefly known for her work on Charles Babbage\'s proposed mechanical general-purpose computer, the Analytical Engine.';

const works: Work[] = [
  {
    title: 'Analytical Engine',
    description: 'A proposed mechanical general-purpose computer designed by Charles Babbage, for which Ada Lovelace wrote the first algorithm intended to be carried out by a machine.',
  },
  {
    title: 'Note G',
    description: 'The final note in Ada Lovelace\'s translation of Menabrea\'s article, containing an algorithm for computing Bernoulli numbers and often regarded as the first published computer program.',
  },
];
</script>

<template>
  <main class="home-page">
    <ProfileCard :name="name" :bio="bio" />

    <section class="works">
      <h2>Works</h2>
      <ul>
        <li v-for="work in works" :key="work.title" class="work-item">
          <h3>{{ work.title }}</h3>
          <p>{{ work.description }}</p>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: sans-serif;
}

.works h2 {
  margin-bottom: 0.5rem;
}

.works ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.work-item {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.work-item h3 {
  margin: 0 0 0.5rem;
}

.work-item p {
  margin: 0;
}
</style>
