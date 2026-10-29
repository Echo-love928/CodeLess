<script setup lang="ts">
import { computed, ref } from 'vue';
import { books } from '../data/books';
import type { Book, BookCategory } from '../data/books';

type Filter = '全部' | BookCategory;

const filters: Filter[] = ['全部', '小说', '科技', '历史'];
const keyword = ref<string>('');
const activeFilter = ref<Filter>('全部');
const selected = ref<Book | null>(null);

const filteredBooks = computed<Book[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  return books.filter((book) => {
    const matchCategory = activeFilter.value === '全部' || book.category === activeFilter.value;
    const matchKeyword =
      kw === '' ||
      book.title.toLowerCase().includes(kw) ||
      book.author.toLowerCase().includes(kw);
    return matchCategory && matchKeyword;
  });
});

function selectBook(book: Book): void {
  selected.value = book;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog">
    <h1 class="title">图书目录</h1>

    <input
      v-model="keyword"
      data-testid="search-input"
      class="search"
      type="text"
      placeholder="按书名或作者搜索"
    />

    <div class="filters">
      <button
        v-for="item in filters"
        :key="item"
        :data-testid="'filter-' + item"
        type="button"
        class="filter-btn"
        :class="{ active: activeFilter === item }"
        @click="activeFilter = item"
      >
        {{ item }}
      </button>
    </div>

    <p data-testid="count" class="count">共 {{ filteredBooks.length }} 本</p>

    <ul class="book-list">
      <li v-for="book in filteredBooks" :key="book.id" class="book-item">
        <button
          :data-testid="'book-' + book.id"
          type="button"
          class="book-btn"
          @click="selectBook(book)"
        >
          <span class="book-title">{{ book.title }}</span>
          <span class="book-meta">{{ book.author }} · {{ book.category }}</span>
        </button>
      </li>
    </ul>

    <p v-if="filteredBooks.length === 0" data-testid="empty" class="empty">没有符合条件的图书</p>

    <section v-if="selected" data-testid="detail" class="detail">
      <h2 data-testid="detail-title" class="detail-title">{{ selected.title }}</h2>
      <p data-testid="detail-author" class="detail-line">作者：{{ selected.author }}</p>
      <p data-testid="detail-category" class="detail-line">分类：{{ selected.category }}</p>
      <p data-testid="detail-summary" class="detail-line">简介：{{ selected.summary }}</p>
    </section>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, sans-serif;
  color: #1f2933;
}
.title {
  font-size: 26px;
  margin: 0 0 16px;
}
.search {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid #cbd2d9;
  border-radius: 8px;
  margin-bottom: 12px;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.filter-btn {
  padding: 6px 14px;
  font-size: 14px;
  border: 1px solid #cbd2d9;
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
}
.filter-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.count {
  font-size: 13px;
  color: #616e7c;
  margin: 0 0 12px;
}
.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.book-btn {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.book-btn:hover {
  border-color: #2563eb;
}
.book-title {
  font-size: 16px;
  font-weight: 600;
}
.book-meta {
  font-size: 13px;
  color: #616e7c;
}
.empty {
  color: #616e7c;
  font-size: 14px;
  margin-top: 16px;
}
.detail {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #e4e7eb;
  border-radius: 10px;
  background: #f8fafc;
}
.detail-title {
  font-size: 20px;
  margin: 0 0 10px;
}
.detail-line {
  font-size: 14px;
  margin: 6px 0;
  line-height: 1.6;
}
</style>
