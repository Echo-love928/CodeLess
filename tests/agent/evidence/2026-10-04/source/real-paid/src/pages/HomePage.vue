<script setup lang="ts">
import ProfileCard from '../components/ProfileCard.vue';

interface Work {
  id: string;
  title: string;
  description: string;
}

interface Profile {
  name: string;
  tagline: string;
  bio: string;
  works: Work[];
}

const profile: Profile = {
  name: 'Ada Lovelace',
  tagline: 'Mathematician & First Computer Programmer',
  bio: 'Ada Lovelace (1815-1852) was an English mathematician and writer, chiefly known for her work on Charles Babbage\'s proposed mechanical general-purpose computer, the Analytical Engine. She was the first to recognise that the machine had applications beyond pure calculation, and she published the first algorithm intended to be carried out by such a machine.',
  works: [
    {
      id: 'notes',
      title: 'Notes on the Analytical Engine',
      description:
        'A set of extensive notes (1843) containing the first published algorithm intended for a machine, including a method for computing Bernoulli numbers.',
    },
    {
      id: 'bernoulli',
      title: 'The Bernoulli Number Algorithm',
      description:
        'A detailed step-by-step program for the Analytical Engine, widely regarded as the earliest example of a computer program.',
    },
  ],
};
</script>

<template>
  <main class="home-page">
    <div class="page-wrapper">
      <ProfileCard
        :name="profile.name"
        :tagline="profile.tagline"
        :bio="profile.bio"
        :works="profile.works"
      />
    </div>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(160deg, #f6f7fb 0%, #e9ecf6 100%);
  padding: 3rem 1rem;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #1f2430;
}

.page-wrapper {
  max-width: 760px;
  margin: 0 auto;
}
</style>
