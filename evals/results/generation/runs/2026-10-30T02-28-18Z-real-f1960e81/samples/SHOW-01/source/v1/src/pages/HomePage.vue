<script setup lang="ts">
import { profile } from '../data/profile';
</script>

<template>
  <main data-ai-component="home-page" class="home">
    <header class="hero">
      <h1 class="name" data-testid="profile-name">{{ profile.name }}</h1>
      <p class="intro" data-testid="profile-intro">{{ profile.intro }}</p>
    </header>
    <section class="works">
      <article
        v-for="(work, index) in profile.works"
        :key="work.title"
        class="card"
        :data-testid="'work-card-' + index"
      >
        <h2 class="card-title">{{ work.title }}</h2>
        <p class="card-desc">{{ work.description }}</p>
      </article>
    </section>
    <footer class="footer">
      <p class="email" data-testid="contact-email">{{ profile.email }}</p>
    </footer>
  </main>
</template>

<style scoped>
.home {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}
.hero {
  text-align: center;
  padding: 1.5rem 0 2rem;
}
.name {
  margin: 0 0 0.75rem;
  font-size: 2.25rem;
}
.intro {
  margin: 0;
  font-size: 1.1rem;
  color: #52606d;
}
.works {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
}
.card {
  border: 1px solid #d9e2ec;
  border-radius: 10px;
  padding: 1.25rem;
  background: #f8fafc;
}
.card-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
.card-desc {
  margin: 0;
  color: #52606d;
  line-height: 1.6;
}
.footer {
  margin-top: 2.5rem;
  text-align: center;
  border-top: 1px solid #d9e2ec;
  padding-top: 1.25rem;
}
.email {
  margin: 0;
  color: #334e68;
}
</style>
