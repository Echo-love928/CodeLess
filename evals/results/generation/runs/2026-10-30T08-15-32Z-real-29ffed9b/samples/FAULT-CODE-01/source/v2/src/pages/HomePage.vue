<script setup lang="ts">
import { name, tagline, email, works } from "../data/graceHopper";
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <header class="header">
      <h1 class="name">{{ name }}</h1>
      <p class="tagline">{{ tagline }}</p>
    </header>

    <section class="cards">
      <article v-for="work in works" :key="work.id" class="card">
        <h2 class="card-title">{{ work.title }}</h2>
        <p class="card-desc">{{ work.description }}</p>
      </article>
    </section>

    <footer class="footer">
      <p class="email">{{ email }}</p>
    </footer>
  </main>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 20px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2933;
}
.header {
  text-align: center;
  margin-bottom: 32px;
}
.name {
  font-size: 2.2rem;
  margin: 0 0 8px;
}
.tagline {
  color: #52606d;
  margin: 0;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.card {
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}
.card-title {
  font-size: 1.1rem;
  margin: 0 0 8px;
}
.card-desc {
  font-size: 0.9rem;
  color: #52606d;
  margin: 0;
}
.footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #e4e7eb;
  text-align: center;
}
.email {
  color: #3e4c59;
  margin: 0;
}
</style>
