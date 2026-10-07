<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  title: string;
  description: string;
}

const name = 'Ada Lovelace';
const intro =
  'Ada Lovelace was a 19th-century mathematician who wrote the first algorithm intended for a machine, the Analytical Engine.';
const works: Work[] = [
  {
    title: 'Analytical Engine',
    description:
      'A proposed mechanical general-purpose computer designed by Charles Babbage, which Ada studied in depth and described in her notes.',
  },
  {
    title: 'Note G',
    description:
      'The final note in her translation of Menabrea\'s paper, containing an algorithm for computing Bernoulli numbers.',
  },
];
</script>

<template>
  <main class="home-page">
    <ProfileCard :name="name" :intro="intro" :works="works" />
  </main>
</template>

<style scoped>
.home-page {
  display: block;
  min-height: 100vh;
  padding: 2rem 1rem;
  background: #f5f7fa;
}
</style>
