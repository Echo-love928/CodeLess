<script setup lang="ts">
import { ref } from 'vue';

interface ScheduleItem {
  time: string;
  title: string;
}

const eventName = '2026 杭州前端开发者大会';
const eventDate = '2026年11月20日';
const eventVenue = '杭州国际博览中心';

const schedule: ScheduleItem[] = [
  { time: '09:00', title: '开幕致辞' },
  { time: '10:30', title: 'Vue 性能优化实战' },
  { time: '14:00', title: '无障碍设计实践' },
];

const registered = ref<boolean>(false);

function handleRegister(): void {
  registered.value = true;
}
</script>

<template>
  <main data-ai-component="home-page" class="event-page">
    <header class="event-header">
      <h1 class="event-name" data-testid="event-name">{{ eventName }}</h1>
      <p class="event-meta"><span data-testid="event-date">{{ eventDate }}</span> · <span data-testid="event-venue">{{ eventVenue }}</span></p>
    </header>

    <section class="schedule-section">
      <h2 class="section-title">活动日程</h2>
      <ul class="schedule-list">
        <li v-for="item in schedule" :key="item.time" class="schedule-item">
          <span class="schedule-text">{{ item.time }} {{ item.title }}</span>
        </li>
      </ul>
    </section>

    <section class="register-section">
      <button class="register-button" type="button" data-testid="register-button" @click="handleRegister">我要报名</button>
      <p v-if="registered" class="register-feedback" data-testid="register-feedback">报名意向已记录（演示）</p>
    </section>
  </main>
</template>

<style scoped>
.event-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 20px;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  color: #1f2933;
}

.event-header {
  text-align: center;
  margin-bottom: 28px;
}

.event-name {
  font-size: 26px;
  margin: 0 0 10px;
}

.event-meta {
  margin: 0;
  color: #52606d;
  font-size: 15px;
}

.section-title {
  font-size: 18px;
  margin: 0 0 12px;
}

.schedule-list {
  list-style: none;
  padding: 0;
  margin: 0 0 28px;
}

.schedule-item {
  padding: 10px 14px;
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #f9fafb;
}

.schedule-text {
  font-size: 15px;
}

.register-section {
  text-align: center;
}

.register-button {
  padding: 10px 28px;
  font-size: 16px;
  color: #ffffff;
  background: #2563eb;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.register-button:hover {
  background: #1d4ed8;
}

.register-feedback {
  margin: 14px 0 0;
  color: #047857;
  font-size: 15px;
}
</style>
