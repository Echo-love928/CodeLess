<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface WorkItem {
  id: string;
  title: string;
  summary: string;
}

const name = 'Ada Lovelace';
const bio = 'Ada Lovelace was an English mathematician and writer, chiefly known for her work on Charles Babbage\'s proposed mechanical general-purpose computer, the Analytical Engine.';

const works: WorkItem[] = [
  {
    id: 'analytical-engine',
    title: 'Analytical Engine',
    summary: 'A proposed mechanical general-purpose computer designed by Charles Babbage, for which Ada wrote the first algorithm intended to be carried out by a machine.'
  },
  {
    id: 'note-g',
    title: 'Note G',
    summary: 'The final note in Ada Lovelace\'s 1843 translation of Menabrea\'s paper, containing an algorithm for computing Bernoulli numbers.'
  }
];
</script>

<template>
  <main class="home-page">
    <h1 class="page-heading" data-testid="page-heading">Ada Lovelace</h1>
    <ProfileCard :name="name" :bio="bio" :works="works" />
  </main>
</template>

<style scoped>
.home-page {
  padding: 1rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.page-heading {
  text-align: center;
  color: #1f2328;
}
</style>
