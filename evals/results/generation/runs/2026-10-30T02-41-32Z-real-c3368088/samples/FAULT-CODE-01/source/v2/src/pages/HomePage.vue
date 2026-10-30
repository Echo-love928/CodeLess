<script setup lang="ts">
interface Work {
  title: string;
  description: string;
}

const works: Work[] = [
  {
    title: 'Harvard Mark I 编程',
    description: '在 Harvard Mark I 上编写程序，推动了早期计算机编程方法的发展。',
  },
  {
    title: 'A-0 编译器',
    description: '开发 A-0 编译器，将符号指令转换为机器代码，奠定了编译器技术的基础。',
  },
  {
    title: 'COBOL 标准化',
    description: '积极推动 COBOL 语言的标准化，使程序更易读、更易维护。',
  },
];
</script>

<template>
  <main data-ai-component="home-page" class="home">
    <header class="header">
      <h1 class="name">Grace Hopper</h1>
      <p class="tagline">计算机科学先驱，COBOL 语言的推动者</p>
    </header>

    <section class="works">
      <h2 class="works-title">代表作品</h2>
      <ul class="card-list">
        <li
          v-for="(work, index) in works"
          :key="work.title"
          class="card"
          :data-testid="`work-card-${index + 1}`"
        >
          <h3 class="card-title" :data-testid="`work-title-${index + 1}`">{{ work.title }}</h3>
          <p class="card-desc" :data-testid="`work-desc-${index + 1}`">{{ work.description }}</p>
        </li>
      </ul>
    </section>

    <footer class="footer">
      <p class="contact" data-testid="contact-email">grace.hopper@example.com</p>
    </footer>
  </main>
</template>

<style scoped>
.home {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2937;
}

.header {
  text-align: center;
  padding: 1.5rem 0 2rem;
  border-bottom: 1px solid #e5e7eb;
}

.name {
  font-size: 2.25rem;
  margin: 0 0 0.75rem;
  letter-spacing: 0.02em;
}

.tagline {
  margin: 0;
  font-size: 1.1rem;
  color: #4b5563;
}

.works {
  padding: 2rem 0;
}

.works-title {
  font-size: 1.4rem;
  margin: 0 0 1.25rem;
}

.card-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 1.25rem;
  background: #f9fafb;
}

.card-title {
  margin: 0 0 0.6rem;
  font-size: 1.1rem;
}

.card-desc {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #4b5563;
}

.footer {
  border-top: 1px solid #e5e7eb;
  padding-top: 1.5rem;
  text-align: center;
}

.contact {
  margin: 0;
  font-size: 1rem;
  color: #111827;
}
</style>
