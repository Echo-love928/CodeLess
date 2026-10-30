<script setup lang="ts">
import { ref } from 'vue';
import { eventInfo } from '../data/eventData';
import type { ScheduleItem } from '../data/eventData';

const schedule: ScheduleItem[] = eventInfo.schedule;
const registered = ref(false);

function register(): void {
  registered.value = true;
}
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <h1 data-testid="event-name">{{ eventInfo.name }}</h1>
    <p data-testid="event-date">{{ eventInfo.date }}</p>
    <p data-testid="event-location">{{ eventInfo.location }}</p>

    <h2>日程安排</h2>
    <ul class="schedule">
      <li v-for="item in schedule" :key="item.time" class="schedule-item">
        <span class="time" :data-testid="`time-${item.time}`">{{ item.time }}</span>
        <span class="title" :data-testid="`title-${item.time}`">{{ item.title }}</span>
      </li>
    </ul>

    <button type="button" data-testid="register-btn" class="register" @click="register">
      我要报名
    </button>
    <p v-if="registered" data-testid="register-notice" class="notice">
      报名意向已记录（演示）
    </p>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
  color: #1f2937;
}

h1 {
  font-size: 24px;
  margin-bottom: 8px;
}

.schedule {
  list-style: none;
  padding: 0;
}

.schedule-item {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid #e5e7eb;
}

.time {
  font-weight: 600;
  color: #2563eb;
}

.register {
  margin-top: 16px;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}

.notice {
  margin-top: 12px;
  color: #059669;
}
</style>
