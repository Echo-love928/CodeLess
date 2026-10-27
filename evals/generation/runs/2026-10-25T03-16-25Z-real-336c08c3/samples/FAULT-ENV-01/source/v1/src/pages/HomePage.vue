<script setup lang="ts">
import { ref } from 'vue';

interface SessionItem {
  time: string;
  title: string;
}

const eventName: string = '2026 杭州前端开发者大会';
const eventDate: string = '2026年11月20日';
const eventVenue: string = '杭州国际博览中心';

const sessions: SessionItem[] = [
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
    <h1 class="event-name" data-testid="event-name">{{ eventName }}</h1>
    <p class="event-date" data-testid="event-date">日期：{{ eventDate }}</p>
    <p class="event-venue" data-testid="event-venue">地点：{{ eventVenue }}</p>

    <section class="schedule">
      <h2 class="schedule-title">活动日程</h2>
      <ul class="session-list">
        <li
          v-for="(session, index) in sessions"
          :key="session.time"
          class="session-item"
          :data-testid="`session-${index}`"
        >
          <span class="session-time">{{ session.time }}</span>
          <span class="session-name">{{ session.title }}</span>
        </li>
      </ul>
    </section>

    <button type="button" class="register-button" data-testid="register-button" @click="handleRegister">
      我要报名
    </button>
    <p v-if="registered" class="register-notice" data-testid="register-notice">
      报名意向已记录（演示）
    </p>
  </main>
</template>

<style scoped>
.event-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #1f2933;
}

.event-name {
  font-size: 28px;
  margin: 0 0 16px;
}

.event-date,
.event-venue {
  margin: 4px 0;
  font-size: 16px;
  color: #52606d;
}

.schedule {
  margin-top: 32px;
}

.schedule-title {
  font-size: 20px;
  margin: 0 0 12px;
}

.session-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.session-time {
  font-weight: 600;
  color: #2b6cb0;
}

.register-button {
  margin-top: 32px;
  padding: 10px 24px;
  font-size: 16px;
  color: #ffffff;
  background: #2b6cb0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.register-button:hover {
  background: #23558a;
}

.register-notice {
  margin-top: 12px;
  color: #2f855a;
  font-size: 15px;
}
</style>
