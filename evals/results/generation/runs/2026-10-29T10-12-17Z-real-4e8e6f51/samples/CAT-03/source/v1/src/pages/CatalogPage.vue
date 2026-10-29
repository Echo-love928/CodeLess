<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolCard from '../components/ToolCard.vue';
import ToolDetail from '../components/ToolDetail.vue';
import { categories, tools } from '../data/tools';
import type { Tool, ToolCategory } from '../data/tools';

const keyword = ref<string>('');
const activeCategory = ref<ToolCategory | '全部'>('全部');
const selectedId = ref<string | null>(null);

const filtered = computed<Tool[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  return tools.filter((t) => {
    const matchCat = activeCategory.value === '全部' || t.category === activeCategory.value;
    const matchKw =
      kw === '' || t.name.toLowerCase().includes(kw) || t.summary.toLowerCase().includes(kw);
    return matchCat && matchKw;
  });
});

const selectedTool = computed<Tool | null>(() => {
  return tools.find((t) => t.id === selectedId.value) ?? null;
});

function pickCategory(cat: ToolCategory | '全部'): void {
  activeCategory.value = cat;
}

function selectTool(id: string): void {
  selectedId.value = id;
}

function backToCatalog(): void {
  selectedId.value = null;
}
</script>

<template>
  <main class="catalog" data-ai-component="catalog-page">
    <h1 class="title">开源工具目录</h1>

    <div class="controls">
      <input
        v-model="keyword"
        type="text"
        class="search"
        data-testid="search-input"
        placeholder="搜索工具名称或简介"
      />
      <div class="filters">
        <button
          type="button"
          class="filter"
          :class="{ active: activeCategory === '全部' }"
          data-testid="filter-all"
          @click="pickCategory('全部')"
        >
          全部
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          type="button"
          class="filter"
          :class="{ active: activeCategory === cat }"
          :data-testid="'filter-' + cat"
          @click="pickCategory(cat)"
        >
          {{ cat }}
        </button>
      </div>
      <p class="status" data-testid="filter-status">当前类别：{{ activeCategory }}</p>
    </div>

    <ToolDetail v-if="selectedTool" :tool="selectedTool" @back="backToCatalog" />

    <div v-else class="list-wrap">
      <p v-if="filtered.length === 0" class="empty" data-testid="empty-state">没有匹配的工具</p>
      <ul v-else class="list" data-testid="tool-list">
        <li v-for="tool in filtered" :key="tool.id">
          <ToolCard :tool="tool" @select="selectTool" />
        </li>
      </ul>
    </div>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
}
.title {
  margin: 0 0 16px;
  font-size: 24px;
}
.controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.search {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
}
.filters {
  display: flex;
  gap: 8px;
}
.filter {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}
.filter.active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #fff;
}
.status {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.empty {
  padding: 32px;
  text-align: center;
  color: #64748b;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
}
</style>
