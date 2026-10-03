<template>
  <section class="profile-card">
    <h1 data-testid="name">{{ name }}</h1>
    <p data-testid="intro" class="intro">{{ intro }}</p>
    <h2 class="works-title">Works</h2>
    <ul data-testid="works" class="works">
      <li v-for="work in works" :key="work.title" class="work" data-testid="work-item">
        <h3 class="work-title" data-testid="work-title">{{ work.title }}</h3>
        <p class="work-description" data-testid="work-description">{{ work.description }}</p>
      </li>
    </ul>
  </section>
</template>

<script setup>
const props = defineProps({
  name: {
    type: String,
    required: true
  },
  intro: {
    type: String,
    required: true
  },
  works: {
    type: Array,
    required: true
  }
});
</script>

<style scoped>
.profile-card {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  margin-top: 0;
  font-size: 28px;
}

.intro {
  color: #444;
  line-height: 1.6;
}

.works-title {
  margin-top: 24px;
  font-size: 20px;
}

.works {
  list-style: none;
  padding: 0;
  margin: 0;
}

.work {
  padding: 12px 0;
  border-top: 1px solid #eee;
}

.work-title {
  margin: 0 0 4px;
  font-size: 17px;
}

.work-description {
  margin: 0;
  color: #555;
  line-height: 1.5;
}
</style>
