<script setup lang="ts">
import { computed, ref } from 'vue';
import { books, categories } from '../data/books';
import type { Book, Category } from '../data/books';

const search = ref('');
const activeCategory = ref<Category | '全部'>('全部');
const selected = ref<Book | null>(null);

const filters: Array<Category | '全部'> = ['全部', ...categories];

const filtered = computed<Book[]>(() => {
  const keyword = search.value.trim().toLowerCase();
  return books.filter((book) => {
    const categoryMatch =
      activeCategory.value === '全部' || book.category === activeCategory.value;
    const keywordMatch =
      keyword === '' ||
      book.title.toLowerCase().includes(keyword) ||
      book.author.toLowerCase().includes(keyword);
    return categoryMatch && keywordMatch;
  });
});

function selectBook(book: Book): void {
  selected.value = book;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog">
    <h1>图书目录</h1>

    <section class="controls">
      <input
        v-model="search"
        type="text"
        data-testid="search-input"
        placeholder="按书名或作者搜索"
      />
      <div class="filters">
        <button
          v-for="option in filters"
          :key="option"
          type="button"
          :data-testid="`filter-${option}`"
          :class="{ active: activeCategory === option }"
          @click="activeCategory = option"
        >
          {{ option }}
        </button>
      </div>
    </section>

    <p data-testid="result-count">共 {{ filtered.length }} 本图书</p>

    <ul class="book-list">
      <li v-for="book in filtered" :key="book.id">
        <button
          type="button"
          class="book-card"
          :data-testid="`book-${book.id}`"
          @click="selectBook(book)"
        >
          <h2>{{ book.title }}</h2>
          <p>{{ book.author }}</p>
          <span>{{ book.category }}</span>
        </button>
      </li>
    </ul>

    <p v-if="filtered.length === 0" data-testid="empty-state">没有匹配的图书</p>

    <section v-if="selected" data-testid="book-detail" class="detail">
      <h2 data-testid="detail-title">{{ selected.title }}</h2>
      <p data-testid="detail-author">作者：{{ selected.author }}</p>
      <p data-testid="detail-category">分类：{{ selected.category }}</p>
      <p data-testid="detail-summary">{{ selected.summary }}</p>
    </section>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.controls input {
  flex: 1 1 200px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.filters {
  display: flex;
  gap: 8px;
}

.filters button {
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.filters button.active {
  background: #2b6cb0;
  border-color: #2b6cb0;
  color: #fff;
}

.book-list {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.book-card {
  width: 100%;
  text-align: left;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.book-card h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.book-card p {
  margin: 0 0 4px;
  color: #555;
}

.book-card span {
  font-size: 12px;
  color: #2b6cb0;
}

.detail {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f7fafc;
}

.detail h2 {
  margin-top: 0;
}
</style>
