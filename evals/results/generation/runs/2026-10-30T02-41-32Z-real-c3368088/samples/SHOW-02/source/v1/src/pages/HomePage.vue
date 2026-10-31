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
  { time: '14:00', title: '无障碍设计实践' }
];

const registered = ref<boolean>(false);

function register(): void {
  registered.value = true;
}
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <header class="hero">
      <h1 class="event-name">{{ eventName }}</h1>
      <p class="event-meta">{{ eventDate }}</p>
      <p class="event-meta">{{ eventLocation }}</p>
    </header>

    <section class="schedule">
      <h2 class="section-title">日程安排</h2>
      <ul class="schedule-list">
        <li v-for="item in schedule" :key="item.time" class="schedule-item">
          <span class="schedule-time">{{ item.time }}</span>
          <span class="schedule-title">{{ item.title }}</span>
        </li>
      </ul>
    </section>

    <section class="signup">
      <button type="button" class="signup-button" @click="register">我要报名</button>
      <p v-if="registered" class="signup-feedback">报名意向已记录（演示）</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.hero {
  border-bottom: 2px solid #e4e7eb;
  padding-bottom: 20px;
  margin-bottom: 28px;
}

.event-name {
  font-size: 28px;
  margin: 0 0 12px;
}

.event-meta {
  margin: 4px 0;
  color: #52606d;
  font-size: 16px;
}

.section-title {
  font-size: 20px;
  margin: 0 0 16px;
}

.schedule-list {
  list-style: none;
  margin: 0 0 32px;
  padding: 0;
}

.schedule-item {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #f8fafc;
}

.schedule-time {
  font-weight: 600;
  color: #2563eb;
  min-width: 56px;
}

.signup-button {
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 12px 28px;
  font-size: 16px;
  cursor: pointer;
}

.signup-button:hover {
  background: #1d4ed8;
}

.signup-feedback {
  margin-top: 14px;
  color: #15803d;
  font-size: 15px;
}
</style>
