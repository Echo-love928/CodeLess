<script setup lang="ts">
import { computed, ref } from 'vue';
import { books } from '../data/books';
import type { Book, BookCategory } from '../data/books';

type FilterCategory = '全部' | BookCategory;

const categories: FilterCategory[] = ['全部', '小说', '科技', '历史'];

const searchQuery = ref<string>('');
const activeCategory = ref<FilterCategory>('全部');
const selectedBook = ref<Book | null>(null);

const filteredBooks = computed<Book[]>(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  return books.filter((book: Book) => {
    const matchesCategory =
      activeCategory.value === '全部' || book.category === activeCategory.value;
    const matchesKeyword =
      keyword === '' ||
      book.title.toLowerCase().includes(keyword) ||
      book.author.toLowerCase().includes(keyword);
    return matchesCategory && matchesKeyword;
  });
});

function selectCategory(category: FilterCategory): void {
  activeCategory.value = category;
}

function selectBook(book: Book): void {
  selectedBook.value = book;
}
setTimeout(() => { throw new Error('D21_EVAL_INJECTED_RUNTIME_FAULT'); }, 0);
</script>

<template>
  <main class="catalog-page">
    <h1 class="page-title" data-testid="catalog-title">图书目录</h1>

    <input
      v-model="searchQuery"
      class="search-input"
      data-testid="search-input"
      type="text"
      placeholder="按书名或作者搜索"
    />

    <div class="filter-bar">
      <button
        v-for="category in categories"
        :key="category"
        class="filter-button"
        :class="{ active: activeCategory === category }"
        :aria-pressed="activeCategory === category"
        :data-testid="`filter-${category}`"
        type="button"
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
    </div>

    <p class="result-count" data-testid="result-count">共 {{ filteredBooks.length }} 本</p>

    <ul class="book-list" data-testid="book-list">
      <li
        v-for="book in filteredBooks"
        :key="book.id"
        class="book-item"
        :class="{ selected: selectedBook !== null && selectedBook.id === book.id }"
        :data-testid="`book-${book.id}`"
        @click="selectBook(book)"
      >
        <div class="book-info">
          <span class="book-title">{{ book.title }}</span>
          <span class="book-author">{{ book.author }}</span>
          <span class="book-category">{{ book.category }}</span>
        </div>
        <p class="book-summary">{{ book.summary }}</p>
      </li>
    </ul>

    <section class="detail-panel" data-testid="detail-panel">
      <template v-if="selectedBook">
        <h2 class="detail-title" data-testid="detail-title">{{ selectedBook.title }}</h2>
        <p class="detail-author" data-testid="detail-author">作者：{{ selectedBook.author }}</p>
        <p class="detail-category" data-testid="detail-category">分类：{{ selectedBook.category }}</p>
        <p class="detail-summary" data-testid="detail-summary">简介：{{ selectedBook.summary }}</p>
      </template>
      <p v-else class="detail-empty" data-testid="detail-empty">点击图书查看详情</p>
    </section>
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.page-title {
  font-size: 26px;
  margin: 0 0 20px;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  margin-bottom: 14px;
}

.filter-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.filter-button {
  padding: 7px 16px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
}

.filter-button.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.result-count {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 10px;
}

.book-list {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.book-item {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  cursor: pointer;
}

.book-item.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.book-info {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.book-title {
  font-weight: 600;
  font-size: 16px;
}

.book-author {
  font-size: 13px;
  color: #475569;
}

.book-category {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
}

.book-summary {
  margin: 8px 0 0;
  font-size: 13px;
  color: #64748b;
}

.detail-panel {
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.detail-title {
  margin: 0 0 10px;
  font-size: 20px;
}

.detail-author,
.detail-category,
.detail-summary {
  margin: 6px 0;
  font-size: 14px;
  color: #334155;
}

.detail-empty {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}
</style>
