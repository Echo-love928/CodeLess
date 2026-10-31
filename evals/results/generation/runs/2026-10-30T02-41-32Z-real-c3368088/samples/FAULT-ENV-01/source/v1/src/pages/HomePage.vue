<script setup lang="ts">
import { ref } from 'vue';
import { eventInfo } from '../data/event';
import type { ScheduleItem } from '../data/event';

const registered = ref(false);
const schedule: ScheduleItem[] = eventInfo.schedule;
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <h1 class="title">{{ eventInfo.name }}</h1>
    <p class="meta" data-testid="event-date">日期：{{ eventInfo.date }}</p>
    <p class="meta" data-testid="event-location">地点：{{ eventInfo.location }}</p>

    <h2 class="subtitle">活动日程</h2>
    <ul class="schedule">
      <li v-for="item in schedule" :key="item.time" class="item">
        <span class="time">{{ item.time }}</span>
        <span class="item-title">{{ item.title }}</span>
      </li>
    </ul>

    <button type="button" class="register" data-testid="register-button" @click="registered = true">
      我要报名
    </button>
    <p v-if="registered" class="feedback" data-testid="register-feedback">报名意向已记录（演示）</p>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 20px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2937;
}

.title {
  font-size: 26px;
  margin: 0 0 16px;
}

.meta {
  margin: 4px 0;
  color: #4b5563;
}

.subtitle {
  font-size: 18px;
  margin: 28px 0 12px;
}

.schedule {
  list-style: none;
  margin: 0 0 28px;
  padding: 0;
}

.item {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #f9fafb;
}

.time {
  font-weight: 600;
  color: #2563eb;
  min-width: 56px;
}

.register {
  padding: 12px 28px;
  font-size: 16px;
  color: #ffffff;
  background: #2563eb;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.register:hover {
  background: #1d4ed8;
}

.feedback {
  margin-top: 14px;
  color: #15803d;
  font-weight: 600;
}
</style>
