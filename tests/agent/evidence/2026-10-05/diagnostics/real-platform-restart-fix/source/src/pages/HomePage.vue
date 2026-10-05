<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  id: string;
  title: string;
}

const name: string = 'Ada Lovelace';
const bio: string = 'Ada Lovelace was an English mathematician and writer, chiefly known for her work on Charles Babbage\'s proposed mechanical general-purpose computer, the Analytical Engine. She is often regarded as the first computer programmer.';
const works: Work[] = [
  { id: 'engine', title: 'Analytical Engine' },
  { id: 'note-g', title: 'Note G' },
];
</script>

<template>
  <main>
    <ProfileCard :name="name" :bio="bio" :works="works" />
  </main>
</template>
