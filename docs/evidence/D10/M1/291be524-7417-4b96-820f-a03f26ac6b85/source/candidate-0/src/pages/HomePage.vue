<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  id: string;
  title: string;
}

const name: string = 'Ada Lovelace';

const intro: string =
  'Ada Lovelace was a nineteenth-century mathematician who wrote the first published algorithm intended for a machine, the Analytical Engine.';

const works: Work[] = [
  { id: 'analytical-engine', title: 'Analytical Engine' },
  { id: 'note-g', title: 'Note G' },
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
  padding: 3rem 1rem;
  background-color: #f6f8fa;
  box-sizing: border-box;
}
</style>
