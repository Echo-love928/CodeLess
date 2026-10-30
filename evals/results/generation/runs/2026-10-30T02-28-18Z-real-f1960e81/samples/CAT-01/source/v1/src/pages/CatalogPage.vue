<script setup lang="ts">
import { computed, ref } from 'vue';
import { books } from '../data/books';
import type { Book, BookCategory } from '../data/books';

type FilterCategory = '全部' | BookCategory;

const categories: FilterCategory[] = ['全部', '小说', '科技', '历史'];

const keyword = ref('');
const activeCategory = ref<FilterCategory>('全部');
const selectedBook = ref<Book | null>(null);

const filteredBooks = computed<Book[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  return books.filter((book) => {
    const matchCategory =
      activeCategory.value === '全部' || book.category === activeCategory.value;
    const matchKeyword =
      kw === '' ||
      book.title.toLowerCase().includes(kw) ||
      book.author.toLowerCase().includes(kw);
    return matchCategory && matchKeyword;
  });
});

function selectBook(book: Book): void {
  selectedBook.value = book;
}

function setCategory(category: FilterCategory): void {
  activeCategory.value = category;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog">
    <header class="catalog-header">
      <h1 class="page-title">图书目录</h1>
      <p class="page-subtitle">共 {{ books.length }} 本内置图书，支持搜索与分类筛选。</p>
    </header>

    <section class="controls">
      <label class="search-label" for="book-search">搜索</label>
      <input
        id="book-search"
        v-model="keyword"
        class="search-input"
        data-testid="search-input"
        type="text"
        placeholder="按书名或作者搜索"
      />
      <div class="filters">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          class="filter-btn"
          :class="{ active: activeCategory === category }"
          :data-testid="'filter-' + category"
          @click="setCategory(category)"
        >
          {{ category }}
        </button>
      </div>
    </section>

    <p class="result-count" data-testid="result-count">当前显示 {{ filteredBooks.length }} 本图书</p>

    <section class="book-list" data-testid="book-list">
      <article
        v-for="book in filteredBooks"
        :key="book.id"
        class="book-item"
        :data-testid="'book-' + book.id"
        @click="selectBook(book)"
      >
        <h2 class="book-title">{{ book.title }}</h2>
        <p class="book-author">{{ book.author }}</p>
        <span class="book-category">{{ book.category }}</span>
      </article>
    </section>

    <p v-if="filteredBooks.length === 0" class="empty" data-testid="empty-state">没有匹配的图书</p>

    <section v-if="selectedBook" class="detail" data-testid="book-detail">
      <h2 class="detail-title" data-testid="detail-title">{{ selectedBook.title }}</h2>
      <p class="detail-author" data-testid="detail-author">作者：{{ selectedBook.author }}</p>
      <p class="detail-category" data-testid="detail-category">分类：{{ selectedBook.category }}</p>
      <p class="detail-summary" data-testid="detail-summary">简介：{{ selectedBook.summary }}</p>
    </section>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}
.page-title {
  margin: 0 0 4px;
  font-size: 26px;
}
.page-subtitle {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 14px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.search-label {
  font-size: 14px;
}
.search-input {
  flex: 1 1 200px;
  min-width: 160px;
  padding: 8px 10px;
  border: 1px solid #cbd2d9;
  border-radius: 6px;
  font-size: 14px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-btn {
  padding: 6px 12px;
  border: 1px solid #cbd2d9;
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.filter-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.result-count {
  margin: 0 0 12px;
  font-size: 13px;
  color: #616e7c;
}
.book-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.book-item {
  padding: 12px 14px;
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  background: #f8fafc;
  cursor: pointer;
}
.book-item:hover {
  border-color: #2563eb;
}
.book-title {
  margin: 0 0 4px;
  font-size: 17px;
}
.book-author {
  margin: 0 0 4px;
  font-size: 13px;
  color: #616e7c;
}
.book-category {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e0e8f9;
  color: #1d4ed8;
  font-size: 12px;
}
.empty {
  color: #9aa5b1;
  font-size: 14px;
}
.detail {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #cbd2d9;
  border-left: 4px solid #2563eb;
  border-radius: 8px;
  background: #fff;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 20px;
}
.detail-author,
.detail-category,
.detail-summary {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.5;
}
</style>
