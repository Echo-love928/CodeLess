<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  id: string;
  title: string;
}

const name = 'Ada Lovelace';
const bio = 'Ada Lovelace was an English mathematician who wrote the first algorithm intended for a machine, the Analytical Engine.';
const works: Work[] = [
  { id: 'analytical-engine', title: 'Analytical Engine' },
  { id: 'note-g', title: 'Note G' },
];
</script>

<template>
  <main class="home-page">
    <ProfileCard :name="name" :bio="bio" :works="works" />
  </main>
</template>

<style scoped>
.home-page {
  padding: 40px 16px;
  text-align: center;
  font-family: system-ui, sans-serif;
}
</style>
