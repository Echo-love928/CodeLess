<script setup lang="ts">
import { computed, ref } from 'vue';
import { books, categories, type Book, type BookCategory } from '../data/books';

const search = ref<string>('');
const activeCategory = ref<BookCategory | '全部'>('全部');
const selectedId = ref<number | null>(null);

const filters: Array<BookCategory | '全部'> = ['全部', ...categories];

const filteredBooks = computed<Book[]>(() => {
  const keyword = search.value.trim().toLowerCase();
  return books.filter((book) => {
    const matchesCategory = activeCategory.value === '全部' || book.category === activeCategory.value;
    const matchesKeyword =
      keyword === '' ||
      book.title.toLowerCase().includes(keyword) ||
      book.author.toLowerCase().includes(keyword);
    return matchesCategory && matchesKeyword;
  });
});

const selectedBook = computed<Book | null>(() =>
  books.find((book) => book.id === selectedId.value) ?? null,
);

function selectCategory(category: BookCategory | '全部'): void {
  activeCategory.value = category;
}

function selectBook(book: Book): void {
  selectedId.value = book.id;
}
setTimeout(() => { throw new Error('D21_EVAL_INJECTED_RUNTIME_FAULT'); }, 0);
</script>

<template>
  <div data-ai-component="catalog-page" class="catalog-page">
    <h1 class="page-title">图书目录</h1>

    <div class="search-row">
      <input
        v-model="search"
        data-testid="search-input"
        class="search-input"
        type="text"
        placeholder="按书名或作者搜索"
      />
    </div>

    <div class="filter-row">
      <button
        v-for="filter in filters"
        :key="filter"
        type="button"
        class="filter-btn"
        :class="{ active: activeCategory === filter }"
        :data-testid="'filter-' + filter"
        @click="selectCategory(filter)"
      >
        {{ filter }}
      </button>
    </div>

    <p v-if="filteredBooks.length === 0" data-testid="empty-hint" class="empty-hint">
      无匹配图书
    </p>

    <ul v-else class="book-list">
      <li v-for="book in filteredBooks" :key="book.id" class="book-item">
        <button
          type="button"
          class="book-card"
          :data-testid="'book-' + book.id"
          @click="selectBook(book)"
        >
          <span class="book-title">{{ book.title }}</span>
          <span class="book-author">{{ book.author }}</span>
          <span class="book-category">{{ book.category }}</span>
        </button>
      </li>
    </ul>

    <section v-if="selectedBook" data-testid="detail-panel" class="detail-panel">
      <h2 data-testid="detail-title" class="detail-title">{{ selectedBook.title }}</h2>
      <p data-testid="detail-author" class="detail-line">作者：{{ selectedBook.author }}</p>
      <p data-testid="detail-category" class="detail-line">分类：{{ selectedBook.category }}</p>
      <p data-testid="detail-summary" class="detail-summary">{{ selectedBook.summary }}</p>
    </section>
  </div>
</template>

<style scoped>
.catalog-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.page-title {
  font-size: 28px;
  margin: 0 0 20px;
}

.search-row {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  font-size: 15px;
  border: 1px solid #cbd2d9;
  border-radius: 8px;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

.filter-btn {
  padding: 8px 18px;
  font-size: 14px;
  border: 1px solid #cbd2d9;
  border-radius: 999px;
  background: #fff;
  color: #1f2933;
  cursor: pointer;
}

.filter-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.empty-hint {
  padding: 24px;
  text-align: center;
  color: #7b8794;
  background: #f5f7fa;
  border-radius: 8px;
}

.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.book-card {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
  padding: 14px 16px;
  border: 1px solid #e4e7eb;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.book-card:hover {
  border-color: #3b82f6;
}

.book-title {
  font-size: 16px;
  font-weight: 600;
}

.book-author {
  font-size: 14px;
  color: #52606d;
}

.book-category {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #eef2f7;
  color: #3e4c59;
}

.detail-panel {
  margin-top: 24px;
  padding: 20px;
  border: 1px solid #e4e7eb;
  border-radius: 12px;
  background: #f9fafb;
}

.detail-title {
  margin: 0 0 12px;
  font-size: 22px;
}

.detail-line {
  margin: 0 0 8px;
  font-size: 14px;
  color: #3e4c59;
}

.detail-summary {
  margin: 12px 0 0;
  font-size: 15px;
  line-height: 1.6;
  color: #1f2933;
}
</style>
