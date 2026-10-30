<script setup lang="ts">
import { computed, ref } from 'vue';
import { books } from '../data/books';
import type { Book, BookCategory } from '../data/books';

type FilterCategory = '全部' | BookCategory;

const categories: FilterCategory[] = ['全部', '小说', '科技', '历史'];
const keyword = ref<string>('');
const activeCategory = ref<FilterCategory>('全部');
const selectedId = ref<number>(books[0].id);

const filteredBooks = computed<Book[]>(() => {
  const key = keyword.value.trim();
  return books.filter((book) => {
    const matchCategory = activeCategory.value === '全部' || book.category === activeCategory.value;
    const matchKeyword = key === '' || book.title.includes(key) || book.author.includes(key);
    return matchCategory && matchKeyword;
  });
});

const selectedBook = computed<Book | null>(() => {
  const hit = books.find((book) => book.id === selectedId.value);
  return hit ?? null;
});

function selectBook(book: Book): void {
  selectedId.value = book.id;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog">
    <h1 class="catalog-title">图书目录</h1>

    <section class="controls">
      <input
        v-model="keyword"
        data-testid="search-input"
        class="search"
        type="text"
        placeholder="按书名或作者搜索"
      />
      <div class="filters">
        <button
          v-for="cat in categories"
          :key="cat"
          :data-testid="'filter-' + cat"
          type="button"
          class="filter-btn"
          :class="{ active: activeCategory === cat }"
          @click="activeCategory = cat"
        >
          {{ cat }}
        </button>
      </div>
    </section>

    <p data-testid="result-count" class="count">共 {{ filteredBooks.length }} 本图书</p>

    <div class="layout">
      <ul class="book-list">
        <li v-for="book in filteredBooks" :key="book.id">
          <button
            :data-testid="'book-' + book.id"
            type="button"
            class="book-card"
            :class="{ selected: book.id === selectedId }"
            @click="selectBook(book)"
          >
            <span class="book-title">{{ book.title }}</span>
            <span class="book-meta">{{ book.author }} · {{ book.category }}</span>
            <span class="book-summary">{{ book.summary }}</span>
          </button>
        </li>
      </ul>

      <aside v-if="selectedBook" data-testid="detail-panel" class="detail">
        <h2 data-testid="detail-title" class="detail-title">{{ selectedBook.title }}</h2>
        <p data-testid="detail-author" class="detail-line">作者：{{ selectedBook.author }}</p>
        <p data-testid="detail-category" class="detail-line">分类：{{ selectedBook.category }}</p>
        <p data-testid="detail-summary" class="detail-summary">{{ selectedBook.summary }}</p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2933;
}
.catalog-title {
  font-size: 26px;
  margin: 0 0 16px;
}
.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.search {
  padding: 10px 12px;
  border: 1px solid #cbd2d9;
  border-radius: 8px;
  font-size: 15px;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-btn {
  padding: 8px 16px;
  border: 1px solid #cbd2d9;
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
}
.filter-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.count {
  color: #616e7c;
  font-size: 14px;
  margin: 0 0 12px;
}
.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 720px) {
  .layout {
    grid-template-columns: 3fr 2fr;
    align-items: start;
  }
}
.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.book-card {
  width: 100%;
  text-align: left;
  background: #fff;
  border: 1px solid #e4e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.book-card.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb inset;
}
.book-title {
  font-size: 16px;
  font-weight: 600;
}
.book-meta {
  font-size: 13px;
  color: #616e7c;
}
.book-summary {
  font-size: 13px;
  color: #3e4c59;
}
.detail {
  background: #f5f7fa;
  border-radius: 10px;
  padding: 16px;
  position: sticky;
  top: 16px;
}
.detail-title {
  font-size: 20px;
  margin: 0 0 10px;
}
.detail-line {
  margin: 0 0 6px;
  font-size: 14px;
}
.detail-summary {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.6;
}
</style>
