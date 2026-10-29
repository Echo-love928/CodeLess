<script setup lang="ts">
import WorkCard from '../components/WorkCard.vue';

interface Work {
  title: string;
  description: string;
}

const name = 'Grace Hopper';
const intro = '计算机科学先驱，COBOL 语言的推动者';
const email = 'grace.hopper@example.com';
const works: Work[] = [
  {
    title: 'Harvard Mark I 编程',
    description: '为哈佛 Mark I 计算机编写程序，并参与编写早期计算手册。',
  },
  {
    title: 'A-0 编译器',
    description: '主持开发 A-0 系统，将符号化指令自动转换为机器代码。',
  },
  {
    title: 'COBOL 标准化',
    description: '推动面向商业的通用编程语言标准化，促成 COBOL 的诞生。',
  },
];
</script>

<template>
  <main class="profile" data-ai-component="home-page">
    <header class="profile__header">
      <h1 class="profile__name" data-testid="profile-name">{{ name }}</h1>
      <p class="profile__intro" data-testid="profile-intro">{{ intro }}</p>
    </header>

    <section class="profile__works" aria-labelledby="works-heading">
      <h2 id="works-heading" class="profile__works-heading">代表作品</h2>
      <div class="profile__grid">
        <WorkCard
          v-for="work in works"
          :key="work.title"
          :title="work.title"
          :description="work.description"
        />
      </div>
    </section>

    <footer class="profile__footer">
      <p class="profile__contact" data-testid="contact-email">
        {{ email }}
      </p>
    </footer>
  </main>
</template>

<style scoped>
.profile {
  max-width: 960px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1a2b4a;
}
.profile__header {
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e3e6ea;
}
.profile__name {
  margin: 0 0 0.5rem;
  font-size: 2rem;
}
.profile__intro {
  margin: 0;
  color: #4a5666;
  font-size: 1.05rem;
}
.profile__works {
  padding: 2rem 0;
}
.profile__works-heading {
  margin: 0 0 1rem;
  font-size: 1.3rem;
}
.profile__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}
.profile__footer {
  padding-top: 1.5rem;
  border-top: 1px solid #e3e6ea;
}
.profile__contact {
  margin: 0;
  color: #4a5666;
}
</style>
