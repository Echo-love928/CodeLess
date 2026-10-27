<script setup lang="ts">
import { computed, ref } from 'vue';
import { books, categories, type Book, type BookCategory } from '../data/books';

const searchText = ref('');
const activeCategory = ref<'全部' | BookCategory>('全部');
const selectedId = ref<number | null>(null);

const categoryOptions: Array<'全部' | BookCategory> = ['全部', ...categories];

const filteredBooks = computed<Book[]>(() => {
  const keyword = searchText.value.trim().toLowerCase();
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

const selectedBook = computed<Book | null>(() => {
  const list = filteredBooks.value;
  if (list.length === 0 || selectedId.value === null) {
    return null;
  }
  return list.find((book: Book) => book.id === selectedId.value) ?? null;
});

function selectCategory(option: '全部' | BookCategory): void {
  activeCategory.value = option;
  selectedId.value = null;
}

function selectBook(book: Book): void {
  selectedId.value = book.id;
}

function onSearchInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  searchText.value = target.value;
  selectedId.value = null;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog-page">
    <h1 class="page-title">图书目录</h1>

    <section class="controls">
      <input
        class="search-input"
        data-testid="search-input"
        type="text"
        placeholder="按书名或作者搜索"
        :value="searchText"
        @input="onSearchInput"
      />
      <div class="category-buttons">
        <button
          v-for="option in categoryOptions"
          :key="option"
          type="button"
          class="category-button"
          :class="{ active: activeCategory === option }"
          :data-testid="'category-' + option"
          @click="selectCategory(option)"
        >
          {{ option }}
        </button>
      </div>
    </section>

    <section class="book-list-section">
      <p v-if="filteredBooks.length === 0" class="empty-hint" data-testid="empty-hint">
        没有找到匹配的图书
      </p>
      <ul v-else class="book-list">
        <li v-for="book in filteredBooks" :key="book.id" class="book-item">
          <button
            type="button"
            class="book-button"
            :class="{ active: selectedId === book.id }"
            :data-testid="'book-' + book.id"
            @click="selectBook(book)"
          >
            <span class="book-title" :data-testid="'book-title-' + book.id">{{ book.title }}</span>
            <span class="book-author" :data-testid="'book-author-' + book.id">{{ book.author }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section class="detail-section">
      <div v-if="selectedBook" class="detail-panel" data-testid="detail-panel">
        <h2 class="detail-title" data-testid="detail-title">{{ selectedBook.title }}</h2>
        <p class="detail-author" data-testid="detail-author">作者：{{ selectedBook.author }}</p>
        <p class="detail-category" data-testid="detail-category">分类：{{ selectedBook.category }}</p>
        <p class="detail-summary" data-testid="detail-summary">{{ selectedBook.summary }}</p>
      </div>
      <p v-else class="detail-empty" data-testid="detail-empty">请选择一本书查看详情</p>
    </section>
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2937;
}

.page-title {
  font-size: 26px;
  margin: 0 0 20px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.search-input {
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  outline: none;
}

.search-input:focus {
  border-color: #2563eb;
}

.category-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-button {
  padding: 8px 16px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-button.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.book-list-section {
  margin-bottom: 20px;
}

.empty-hint {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 8px;
}

.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.book-button {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.book-button:hover {
  border-color: #93c5fd;
}

.book-button.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}

.book-title {
  font-size: 16px;
  font-weight: 600;
}

.book-author {
  font-size: 13px;
  color: #6b7280;
}

.detail-section {
  border-top: 1px solid #e5e7eb;
  padding-top: 20px;
}

.detail-panel {
  padding: 20px;
  background: #f9fafb;
  border-radius: 10px;
}

.detail-title {
  margin: 0 0 12px;
  font-size: 20px;
}

.detail-author,
.detail-category {
  margin: 0 0 8px;
  font-size: 14px;
  color: #374151;
}

.detail-summary {
  margin: 12px 0 0;
  font-size: 15px;
  line-height: 1.7;
  color: #1f2937;
}

.detail-empty {
  margin: 0;
  color: #9ca3af;
}
</style>
