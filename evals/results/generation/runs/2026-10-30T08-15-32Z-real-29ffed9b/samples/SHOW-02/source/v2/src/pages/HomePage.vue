<script setup lang="ts">
import { ref } from 'vue';

interface ScheduleItem {
  time: string;
  title: string;
}

const eventName = '2026 杭州前端开发者大会';
const eventDate = '2026年11月20日';
const eventLocation = '杭州国际博览中心';

const schedule: ScheduleItem[] = [
  { time: '09:00', title: '开幕致辞' },
  { time: '10:30', title: 'Vue 性能优化实战' },
  { time: '14:00', title: '无障碍设计实践' },
];

const registered = ref<boolean>(false);

function register(): void {
  registered.value = true;
}
</script>

<template>
  <main data-ai-component="home-page" class="event-page">
    <header class="hero">
      <h1 class="event-name">{{ eventName }}</h1>
      <p class="event-date">{{ eventDate }}</p>
      <p class="event-location">{{ eventLocation }}</p>
    </header>

    <section class="schedule">
      <h2 class="schedule-title">活动日程</h2>
      <ul class="schedule-list">
        <li v-for="item in schedule" :key="item.time" class="schedule-item">
          <p class="schedule-item-text">{{ item.time }} {{ item.title }}</p>
        </li>
      </ul>
    </section>

    <section class="signup">
      <button type="button" class="signup-button" @click="register">我要报名</button>
      <p v-if="registered" class="signup-message">报名意向已记录（演示）</p>
    </section>
  </main>
</template>

<style scoped>
.event-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.hero {
  border-bottom: 2px solid #2563eb;
  padding-bottom: 1.5rem;
  margin-bottom: 2rem;
}

.event-name {
  margin: 0 0 0.75rem;
  font-size: 1.875rem;
}

.event-date,
.event-location {
  margin: 0.25rem 0;
  color: #52606d;
  font-size: 1.05rem;
}

.schedule-title {
  font-size: 1.25rem;
  margin: 0 0 1rem;
}

.schedule-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.schedule-item {
  padding: 0.75rem 1rem;
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  background: #f8fafc;
}

.schedule-item-text {
  margin: 0;
  font-weight: 600;
}

.signup {
  margin-top: 2rem;
}

.signup-button {
  padding: 0.7rem 1.6rem;
  font-size: 1rem;
  color: #ffffff;
  background: #2563eb;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.signup-button:hover {
  background: #1d4ed8;
}

.signup-message {
  margin-top: 0.9rem;
  color: #047857;
  font-weight: 600;
}
</style>
