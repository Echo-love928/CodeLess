<template>
  <main class="home-page">
    <h1>Ada Lovelace</h1>
    <p class="intro">
      Ada Lovelace was an English mathematician who wrote the first published
      algorithm intended for a machine, the Analytical Engine.
    </p>
    <ProfileCard
      name="Ada Lovelace"
      intro="Mathematician and writer, known as the first computer programmer."
      :works="works"
    />
  </main>
</template>

<script setup>
import ProfileCard from '../components/ProfileCard.vue';

const works = [
  {
    title: 'Notes on the Analytical Engine',
    description:
      'A set of notes containing the first algorithm intended to be carried out by a machine.',
  },
  {
    title: 'Note G',
    description:
      'A detailed method for computing Bernoulli numbers, widely regarded as the first computer program.',
  },
];
</script>

<style scoped>
.home-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: system-ui, sans-serif;
  color: #1f2933;
}

h1 {
  margin-bottom: 0.5rem;
}

.intro {
  margin-top: 0;
  margin-bottom: 1.5rem;
  line-height: 1.6;
}
</style>
