<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  title: string;
  description: string;
}

const name = 'Ada Lovelace';
const bio = 'Augusta Ada King, Countess of Lovelace, was an English mathematician and writer, chiefly known for her work on Charles Babbage\u2019s proposed mechanical general-purpose computer, the Analytical Engine.';
const works: Work[] = [
  {
    title: 'Analytical Engine',
    description: 'Ada translated an article on the Analytical Engine and wrote extensive notes describing how the machine could be programmed beyond mere calculation.'
  },
  {
    title: 'Note G',
    description: 'Note G contains an algorithm for computing Bernoulli numbers, widely regarded as the first published computer program.'
  }
];
</script>

<template>
  <main class="home-page">
    <ProfileCard :name="name" :bio="bio" :works="works" />
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f7f7f9;
  padding: 32px 16px;
}
</style>
