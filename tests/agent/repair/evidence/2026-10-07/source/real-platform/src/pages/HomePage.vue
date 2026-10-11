<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  id: string;
  title: string;
  description: string;
}

const name: string = 'Ada Lovelace';
const bio: string =
  'Ada Lovelace was an English mathematician and writer who foresaw that machines could do more than calculate numbers.';
const works: Work[] = [
  {
    id: 'analytical-engine',
    title: 'Analytical Engine',
    description:
      'A general-purpose mechanical computer designed by Charles Babbage, for which Ada described how operations could be sequenced and stored.',
  },
  {
    id: 'note-g',
    title: 'Note G',
    description:
      'The final note to her translation of Menabrea\u2019s paper, containing the first published algorithm intended for a machine.',
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
  min-height: 100vh;
  padding: 40px 16px;
  background-color: #fafafa;
}
</style>
