<script setup lang="ts">
import ProfileCard from '../components/M1MissingCard.vue';

interface Work {
  title: string;
  description: string;
}

const name = 'Ada Lovelace';
const bio = 'English mathematician and writer, chiefly known for her work on Charles Babbage\'s proposed mechanical general-purpose computer, the Analytical Engine.';
const works: Work[] = [
  {
    title: 'Analytical Engine',
    description: 'A proposed mechanical general-purpose computer designed by Charles Babbage, for which Ada wrote the first algorithm.',
  },
  {
    title: 'Note G',
    description: 'The final note in Ada Lovelace\'s translation of Menabrea\'s paper, containing an algorithm for computing Bernoulli numbers.',
  },
];
</script>

<template>
  <main class="home-page">
    <ProfileCard :name="name" :bio="bio" :works="works" />
  </main>
</template>

<style scoped>
.home-page {
  padding: 2rem 1rem;
}
</style>
