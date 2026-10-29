<script setup lang="ts">
interface Work {
  title: string;
  description: string;
  testId: string;
}

const tagline = '计算机科学先驱，COBOL 语言的推动者';
const email = 'grace.hopper@example.com';

const works: Work[] = [
  {
    title: 'Harvard Mark I 编程',
    description: '为早期大型计算机 Harvard Mark I 编写程序并撰写操作手册。',
    testId: 'work-mark1',
  },
  {
    title: 'A-0 编译器',
    description: '开发早期编译器 A-0，让程序可以用接近自然语言的方式表达。',
    testId: 'work-a0',
  },
  {
    title: 'COBOL 标准化',
    description: '推动 COBOL 成为通用商用编程语言并促成其标准化。',
    testId: 'work-cobol',
  },
];
</script>

<template>
  <main class="profile" data-ai-component="home-page">
    <header class="profile__header">
      <h1 class="profile__name" data-testid="profile-name">Grace Hopper</h1>
      <p class="profile__tagline" data-testid="profile-tagline">{{ tagline }}</p>
    </header>

    <section class="profile__works">
      <h2 class="profile__section-title">代表作品</h2>
      <ul class="work-list">
        <li v-for="work in works" :key="work.testId" class="work-card" :data-testid="work.testId">
          <h3 class="work-card__title" :data-testid="`${work.testId}-title`">{{ work.title }}</h3>
          <p class="work-card__desc" :data-testid="`${work.testId}-desc`">{{ work.description }}</p>
        </li>
      </ul>
    </section>

    <footer class="profile__footer">
      <p class="profile__contact" data-testid="contact-email">联系邮箱：{{ email }}</p>
    </footer>
  </main>
</template>

<style scoped>
.profile {
  max-width: 880px;
  margin: 0 auto;
  padding: 48px 20px 64px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2937;
}

.profile__header {
  text-align: center;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 32px;
}

.profile__name {
  margin: 0;
  font-size: 2.5rem;
  letter-spacing: 0.02em;
}

.profile__tagline {
  margin: 12px 0 0;
  font-size: 1.1rem;
  color: #4b5563;
}

.profile__works {
  margin-top: 40px;
}

.profile__section-title {
  margin: 0 0 20px;
  font-size: 1.4rem;
}

.work-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.work-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  background: #f9fafb;
}

.work-card__title {
  margin: 0 0 10px;
  font-size: 1.15rem;
}

.work-card__desc {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #4b5563;
}

.profile__footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}

.profile__contact {
  margin: 0;
  color: #374151;
}
</style>
