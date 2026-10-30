<script setup lang="ts">
interface Work {
  title: string;
  description: string;
}

const name = 'Grace Hopper';
const tagline = '计算机科学先驱，COBOL 语言的推动者';
const email = 'grace.hopper@example.com';
const works: Work[] = [
  { title: 'Harvard Mark I 编程', description: '在 Harvard Mark I 上编写程序，为早期计算机编程奠定实践基础。' },
  { title: 'A-0 编译器', description: '设计 A-0 编译器，让程序可以用更接近人类的符号语言编写。' },
  { title: 'COBOL 标准化', description: '推动 COBOL 语言的标准化，使其成为广泛使用的商业编程语言。' },
];
</script>

<template>
  <div data-ai-component="home-page" class="home">
    <header class="header">
      <h1 data-testid="name">{{ name }}</h1>
      <p class="tagline" data-testid="tagline">{{ tagline }}</p>
    </header>

    <section class="works">
      <h2 class="works-title">代表作品</h2>
      <ul class="card-list">
        <li v-for="(work, index) in works" :key="work.title" class="card">
          <h3 class="card-title" :data-testid="`work-title-${index}`">{{ work.title }}</h3>
          <p class="card-desc" :data-testid="`work-desc-${index}`">{{ work.description }}</p>
        </li>
      </ul>
    </section>

    <footer class="footer">
      <p class="contact-label">联系方式</p>
      <p class="email" data-testid="email">{{ email }}</p>
    </footer>
  </div>
</template>

<style scoped>
.home {
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: system-ui, sans-serif;
  color: #1f2933;
}
.header {
  text-align: center;
  margin-bottom: 40px;
}
h1 {
  font-size: 2rem;
  margin: 0 0 12px;
}
.tagline {
  font-size: 1.05rem;
  color: #52606d;
  margin: 0;
}
.works-title {
  font-size: 1.3rem;
  margin-bottom: 20px;
}
.card-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 16px;
}
.card {
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  padding: 20px;
  background: #f9fafb;
}
.card-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
}
.card-desc {
  margin: 0;
  color: #52606d;
}
.footer {
  margin-top: 48px;
  text-align: center;
  border-top: 1px solid #e4e7eb;
  padding-top: 24px;
}
.contact-label {
  margin: 0 0 6px;
  color: #7b8794;
  font-size: 0.9rem;
}
.email {
  margin: 0;
  font-size: 1rem;
}
</style>
