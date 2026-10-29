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

const registered = ref(false);

function handleRegister(): void {
  registered.value = true;
}
</script>

<template>
  <main class="event-page" data-ai-component="home-page">
    <h1 class="event-name" data-testid="event-name">{{ eventName }}</h1>
    <p class="event-info" data-testid="event-date">日期：{{ eventDate }}</p>
    <p class="event-info" data-testid="event-location">地点：{{ eventLocation }}</p>

    <h2 class="section-title">活动日程</h2>
    <ul class="schedule-list">
      <li v-for="item in schedule" :key="item.time" class="schedule-item">
        <span class="schedule-time">{{ item.time }}</span>
        <span class="schedule-title">{{ item.title }}</span>
      </li>
    </ul>

    <button class="register-btn" type="button" data-testid="register-button" @click="handleRegister">
      我要报名
    </button>
    <p v-if="registered" class="register-note" data-testid="register-note">
      报名意向已记录（演示）
    </p>
  </main>
</template>

<style scoped>
.event-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 20px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2933;
}

.event-name {
  font-size: 26px;
  margin: 0 0 12px;
}

.event-info {
  margin: 4px 0;
  color: #52606d;
}

.section-title {
  font-size: 18px;
  margin: 24px 0 8px;
}

.schedule-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.schedule-item {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e4e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
}

.schedule-time {
  font-weight: 600;
  color: #2563eb;
}

.register-btn {
  margin-top: 20px;
  padding: 10px 24px;
  font-size: 16px;
  color: #fff;
  background-color: #2563eb;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.register-btn:hover {
  background-color: #1d4ed8;
}

.register-note {
  margin-top: 12px;
  color: #047857;
}
</style>
