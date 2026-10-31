<script setup lang="ts">
interface Work {
  title: string;
  description: string;
}

const name: string = 'Grace Hopper';
const tagline: string = '计算机科学先驱，COBOL 语言的推动者';
const email: string = 'grace.hopper@example.com';
const works: Work[] = [
  {
    title: 'Harvard Mark I 编程',
    description: '在 Harvard Mark I 早期计算机上编写程序并参与调试与记录。',
  },
  {
    title: 'A-0 编译器',
    description: '参与开发早期编译器 A-0，让程序可以用符号指令来表达。',
  },
  {
    title: 'COBOL 标准化',
    description: '推动面向商业数据处理语言的标准化，最终形成 COBOL。',
  },
];
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <header class="hero">
      <h1 class="name">{{ name }}</h1>
      <p class="tagline">{{ tagline }}</p>
    </header>

    <section class="works" aria-label="代表作品">
      <article v-for="work in works" :key="work.title" class="card">
        <h2 class="card-title">{{ work.title }}</h2>
        <p class="card-desc">{{ work.description }}</p>
      </article>
    </section>

    <footer class="footer">
      <p class="email">{{ email }}</p>
    </footer>
  </main>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
  line-height: 1.6;
}

.hero {
  text-align: center;
  padding: 1.5rem 0 2rem;
  border-bottom: 1px solid #e4e7eb;
}

.name {
  margin: 0 0 0.5rem;
  font-size: 2.25rem;
  letter-spacing: 0.02em;
}

.tagline {
  margin: 0;
  color: #52606d;
  font-size: 1.05rem;
}

.works {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
  padding: 2rem 0;
}

.card {
  border: 1px solid #e4e7eb;
  border-radius: 0.75rem;
  padding: 1.25rem;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.card-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.card-desc {
  margin: 0;
  color: #52606d;
  font-size: 0.95rem;
}

.footer {
  border-top: 1px solid #e4e7eb;
  padding-top: 1.5rem;
  text-align: center;
}

.email {
  margin: 0;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  color: #334e68;
}
</style>
