<script setup lang="ts">
import { works } from "../data/works";
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <header class="header">
      <h1 class="name">Grace Hopper</h1>
      <p class="tagline">计算机科学先驱，COBOL 语言的推动者</p>
    </header>
    <section class="works">
      <article v-for="work in works" :key="work.id" class="card">
        <h2 class="card-title">{{ work.title }}</h2>
        <p class="card-desc">{{ work.description }}</p>
      </article>
    </section>
    <footer class="footer">
      <p class="email">grace.hopper@example.com</p>
    </footer>
  </main>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: Georgia, serif;
  color: #1f2933;
}
.header {
  text-align: center;
  padding: 2rem 0;
  border-bottom: 2px solid #c9d2dc;
}
.name {
  margin: 0 0 0.5rem;
  font-size: 2.5rem;
}
.tagline {
  margin: 0;
  font-size: 1.1rem;
  color: #52606d;
}
.works {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 2rem 0;
}
.card {
  flex: 1 1 240px;
  border: 1px solid #c9d2dc;
  border-radius: 8px;
  padding: 1rem;
  background: #f8fafc;
}
.card-title {
  margin: 0 0 0.5rem;
  font-size: 1.2rem;
}
.card-desc {
  margin: 0;
  line-height: 1.6;
  color: #3e4c59;
}
.footer {
  text-align: center;
  padding-top: 1.5rem;
  border-top: 2px solid #c9d2dc;
}
.email {
  margin: 0;
  font-family: monospace;
}
</style>
