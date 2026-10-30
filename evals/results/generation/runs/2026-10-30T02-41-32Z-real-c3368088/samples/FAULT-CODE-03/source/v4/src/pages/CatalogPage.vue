<script setup lang="ts">
import { computed, ref } from 'vue';
import { books } from '../data/books';
import type { Book, BookCategory } from '../data/books';

type Filter = '全部' | BookCategory;

const query = ref<string>('');
const filter = ref<Filter>('全部');
const selected = ref<Book | null>(null);

const filters: Filter[] = ['全部', '小说', '科技', '历史'];

const filtered = computed<Book[]>(() => {
  const q = query.value.trim();
  return books.filter((b) => {
    const matchQuery = q === '' || b.title.includes(q) || b.author.includes(q);
    const matchFilter = filter.value === '全部' || b.category === filter.value;
    return matchQuery && matchFilter;
  });
});

function selectBook(b: Book): void {
  selected.value = b;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog">
    <h1 class="title">图书目录</h1>

    <div class="controls">
      <input
        v-model="query"
        class="search"
        data-testid="search-input"
        type="text"
        placeholder="按书名或作者搜索"
      />
      <div class="filters" data-testid="category-filters">
        <button
          v-for="f in filters"
          :key="f"
          class="filter-btn"
          :class="{ active: filter === f }"
          type="button"
          @click="filter = f"
        >
          {{ f }}
        </button>
      </div>
    </div>

    <p class="count" data-testid="result-count">
      {{ filtered.length }} 本图书
    </p>

    <ul class="list" data-testid="book-list">
      <li v-for="b in filtered" :key="b.id" class="book-card">
        <button class="book-btn" type="button" @click="selectBook(b)">
          <span class="book-title">{{ b.title }}</span>
          <span class="book-author">{{ b.author }}</span>
          <span class="book-cat">{{ b.category }}</span>
        </button>
      </li>
    </ul>

    <p v-if="filtered.length === 0" class="empty" data-testid="empty">
      没有匹配的图书
    </p>

    <section v-if="selected" class="detail" data-testid="detail">
      <h2 class="detail-title">{{ selected.title }}</h2>
      <p class="detail-author" data-testid="detail-author">{{ selected.author }}</p>
      <p class="detail-cat" data-testid="detail-category">{{ selected.category }}</p>
      <p class="detail-summary" data-testid="detail-summary">{{ selected.summary }}</p>
    </section>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
}
.title {
  font-size: 24px;
  margin-bottom: 16px;
}
.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.search {
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.filters {
  display: flex;
  gap: 8px;
}
.filter-btn {
  padding: 6px 14px;
  border: 1px solid #ccc;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
}
.filter-btn.active {
  background: #3459e6;
  color: #fff;
  border-color: #3459e6;
}
.count {
  color: #666;
  font-size: 13px;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.book-btn {
  width: 100%;
  text-align: left;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
  display: flex;
  gap: 12px;
  cursor: pointer;
}
.book-title {
  font-weight: 600;
}
.book-author {
  color: #555;
}
.book-cat {
  margin-left: auto;
  color: #3459e6;
  font-size: 13px;
}
.empty {
  color: #999;
}
.detail {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #d5defa;
  border-radius: 8px;
  background: #f4f7ff;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 20px;
}
.detail p {
  margin: 4px 0;
}
</style>
