<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  title: string;
  year: string;
}

const name: string = 'Ada Lovelace';
const intro: string =
  'Ada Lovelace was an English mathematician and writer, chiefly known for her work on Charles Babbage\'s proposed mechanical general-purpose computer, the Analytical Engine.';
const works: Work[] = [
  { title: 'Analytical Engine', year: '1837' },
  { title: 'Note G', year: '1843' },
];
</script>

<template>
  <main class="home-page">
    <ProfileCard :name="name" :intro="intro" :works="works" />
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: #eef2f6;
}
</style>
