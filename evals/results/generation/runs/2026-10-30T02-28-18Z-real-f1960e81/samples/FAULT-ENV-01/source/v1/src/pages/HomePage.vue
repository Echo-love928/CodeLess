<script setup lang="ts">
import { ref } from 'vue';

interface ScheduleItem {
  time: string;
  title: string;
}

const schedules: ScheduleItem[] = [
  { time: '09:00', title: '开幕致辞' },
  { time: '10:30', title: 'Vue 性能优化实战' },
  { time: '14:00', title: '无障碍设计实践' },
];

const registered = ref(false);

const register = (): void => {
  registered.value = true;
};
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <header class="hero">
      <h1 class="title">2026 杭州前端开发者大会</h1>
      <p class="meta" data-testid="event-date">2026年11月20日</p>
      <p class="meta" data-testid="event-location">杭州国际博览中心</p>
    </header>

    <section class="schedule">
      <h2 class="section-title">活动日程</h2>
      <ul class="list">
        <li v-for="item in schedules" :key="item.time" class="item">
          <span class="time">{{ item.time }}</span>
          <span class="item-title">{{ item.title }}</span>
        </li>
      </ul>
    </section>

    <section class="actions">
      <button type="button" class="btn" data-testid="register-btn" @click="register">
        我要报名
      </button>
      <p v-if="registered" class="confirm" data-testid="register-confirm">
        报名意向已记录（演示）
      </p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}
.hero {
  padding: 1.5rem;
  border-radius: 12px;
  background: #f0f4ff;
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.6rem;
}
.meta {
  margin: 0.25rem 0;
  color: #47526b;
}
.section-title {
  margin: 2rem 0 0.75rem;
  font-size: 1.15rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e3e8f0;
}
.time {
  font-weight: 600;
  color: #2f5bea;
}
.actions {
  margin-top: 2rem;
}
.btn {
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 8px;
  background: #2f5bea;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
}
.btn:hover {
  background: #2449c4;
}
.confirm {
  margin-top: 0.75rem;
  color: #1a7f4b;
}
</style>
