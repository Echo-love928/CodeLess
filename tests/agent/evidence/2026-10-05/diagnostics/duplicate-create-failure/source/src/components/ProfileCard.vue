<script setup lang="ts">
interface Work {
  id: string;
  title: string;
}

const props = defineProps<{
  name: string;
  bio: string;
  works: Work[];
}>();
</script>

<template>
  <article class="profile-card">
    <h2 class="profile-card__name" data-testid="profile-name">{{ props.name }}</h2>
    <p class="profile-card__bio" data-testid="profile-bio">{{ props.bio }}</p>
    <section class="profile-card__works">
      <h3 class="profile-card__works-title">Works</h3>
      <ul class="profile-card__works-list">
        <li
          v-for="work in props.works"
          :key="work.id"
          class="profile-card__work"
          :data-testid="`work-${work.id}`"
        >
          {{ work.title }}
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.profile-card {
  border: 1px solid #d0d5dd;
  border-radius: 12px;
  padding: 24px;
  max-width: 560px;
  margin: 0 auto;
  text-align: left;
  font-family: system-ui, sans-serif;
}

.profile-card__name {
  margin: 0 0 12px;
  font-size: 1.75rem;
}

.profile-card__bio {
  margin: 0 0 20px;
  line-height: 1.5;
  color: #475467;
}

.profile-card__works-title {
  margin: 0 0 8px;
  font-size: 1.125rem;
}

.profile-card__works-list {
  margin: 0;
  padding-left: 20px;
}

.profile-card__work {
  margin-bottom: 4px;
}
</style>
