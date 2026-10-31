<template>
  <main class="page" data-ai-component="home-page">
    <header class="hero">
      <h1 class="title">2026 杭州前端开发者大会</h1>
      <p class="meta">日期：2026年11月20日</p>
      <p class="meta">地点：杭州国际博览中心</p>
    </header>

    <section class="schedule">
      <h2 class="section-title">活动日程</h2>
      <ul class="list">
        <li v-for="item in schedule" :key="item.time" class="item">
          <span class="time">{{ item.time }}</span>
          <span class="name">{{ item.title }}</span>
        </li>
      </ul>
    </section>

    <section class="signup">
      <button type="button" class="btn" @click="handleSignup">我要报名</button>
      <p v-if="registered" class="notice">报名意向已记录（演示）</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface ScheduleItem {
  time: string;
  title: string;
}

const schedule: ScheduleItem[] = [
  { time: '09:00', title: '开幕致辞' },
  { time: '10:30', title: 'Vue 性能优化实战' },
  { time: '14:00', title: '无障碍设计实践' }
];

const registered = ref(false);

function handleSignup(): void {
  registered.value = true;
}
</script>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 20px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.hero {
  border-bottom: 1px solid #e4e7eb;
  padding-bottom: 20px;
  margin-bottom: 28px;
}

.title {
  font-size: 28px;
  margin: 0 0 12px;
  color: #1a3d7c;
}

.meta {
  margin: 4px 0;
  font-size: 16px;
  color: #52606d;
}

.section-title {
  font-size: 20px;
  margin: 0 0 12px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: #f5f7fa;
  border-radius: 8px;
}

.time {
  font-weight: 600;
  color: #1a3d7c;
  min-width: 56px;
}

.name {
  font-size: 16px;
}

.signup {
  margin-top: 32px;
}

.btn {
  padding: 10px 24px;
  font-size: 16px;
  color: #fff;
  background: #1a3d7c;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn:hover {
  background: #15316a;
}

.notice {
  margin-top: 12px;
  color: #0b7a3b;
  font-size: 15px;
}
</style>
