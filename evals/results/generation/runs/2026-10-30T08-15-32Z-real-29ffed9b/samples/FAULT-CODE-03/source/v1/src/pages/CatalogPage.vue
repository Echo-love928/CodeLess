<script setup lang="ts">
import { computed, ref } from 'vue';
import { books, categories } from '../data/books';
import type { Book, BookCategory } from '../data/books';

const search = ref<string>('');
const activeCategory = ref<'全部' | BookCategory>('全部');
const selectedId = ref<string>('');

const filtered = computed<Book[]>(() => {
  const q = search.value.trim().toLowerCase();
  return books.filter((b) => {
    const okCategory = activeCategory.value === '全部' || b.category === activeCategory.value;
    const okSearch = q === '' || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    return okCategory && okSearch;
  });
});

const selected = computed<Book | null>(() => books.find((b) => b.id === selectedId.value) ?? null);

const filterOptions = computed<('全部' | BookCategory)[]>(() => ['全部', ...categories]);

function selectBook(id: string): void {
  selectedId.value = id;
}
setTimeout(() => { throw new Error('D21_EVAL_INJECTED_RUNTIME_FAULT'); }, 0);
</script>

<template>
  <main data-ai-component="catalog-page">
    <h1>图书目录</h1>
    <div>
      <label for="search-input">搜索书名或作者</label>
      <input id="search-input" v-model="search" type="text" placeholder="输入书名或作者" data-testid="search-input" />
    </div>
    <div>
      <button
        v-for="option in filterOptions"
        :key="option"
        type="button"
        :aria-pressed="activeCategory === option"
        :class="{ active: activeCategory === option }"
        data-testid="filter-button"
        @click="activeCategory = option"
      >
        {{ option }}
      </button>
    </div>
    <p data-testid="result-count">共 {{ filtered.length }} 本</p>
    <ul>
      <li v-for="book in filtered" :key="book.id">
        <button type="button" :data-testid="`book-${book.id}`" @click="selectBook(book.id)">
          {{ book.title }} · {{ book.author }} · {{ book.category }}
        </button>
      </li>
    </ul>
    <p v-if="filtered.length === 0" data-testid="empty-tip">没有符合条件的图书</p>
    <section v-if="selected" data-testid="book-detail">
      <h2 data-testid="detail-title">{{ selected.title }}</h2>
      <p data-testid="detail-author">作者：{{ selected.author }}</p>
      <p data-testid="detail-category">分类：{{ selected.category }}</p>
      <p data-testid="detail-summary">{{ selected.summary }}</p>
    </section>
  </main>
</template>
