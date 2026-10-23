<script setup lang="ts">
import { ref } from 'vue';

interface ScheduleItem {
  time: string;
  title: string;
}

const eventName = '2026 杭州前端开发者大会';
const eventDate = '2026年11月20日';
const eventVenue = '杭州国际博览中心';

const schedules: ScheduleItem[] = [
  { time: '09:00', title: '开幕致辞' },
  { time: '10:30', title: 'Vue 性能优化实战' },
  { time: '14:00', title: '无障碍设计实践' },
];

const registered = ref(false);

function register(): void {
  registered.value = true;
}
</script>

<template>
  <main class="event-page">
    <header class="event-header">
      <h1 class="event-title" data-testid="event-name">{{ eventName }}</h1>
      <p class="event-meta" data-testid="event-date">日期：{{ eventDate }}</p>
      <p class="event-meta" data-testid="event-venue">地点：{{ eventVenue }}</p>
    </header>

    <section class="schedule">
      <h2 class="section-title">活动日程</h2>
      <ul class="schedule-list">
        <li
          v-for="(item, index) in schedules"
          :key="item.time"
          class="schedule-item"
          :data-testid="`schedule-item-${index}`"
        >
          <span class="schedule-time">{{ item.time }}</span>
          <span class="schedule-title">{{ item.title }}</span>
        </li>
      </ul>
    </section>

    <section class="signup">
      <button type="button" class="signup-button" data-testid="register-button" @click="register">
        我要报名
      </button>
      <p v-if="registered" class="signup-message" data-testid="register-message">
        报名意向已记录（演示）
      </p>
    </section>
  </main>
</template>

<style scoped>
.event-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.event-header {
  border-bottom: 2px solid #e4e7eb;
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.event-title {
  font-size: 28px;
  margin: 0 0 12px;
}

.event-meta {
  margin: 4px 0;
  color: #52606d;
}

.section-title {
  font-size: 20px;
  margin: 0 0 12px;
}

.schedule-list {
  list-style: none;
  margin: 0 0 24px;
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

.schedule-title {
  flex: 1;
}

.signup-button {
  padding: 10px 24px;
  font-size: 16px;
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
  margin-top: 12px;
  color: #15803d;
  font-weight: 600;
}
</style>
