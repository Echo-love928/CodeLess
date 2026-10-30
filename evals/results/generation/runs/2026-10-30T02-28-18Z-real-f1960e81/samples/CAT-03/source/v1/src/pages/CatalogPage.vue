<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolCard from '../components/ToolCard.vue';
import ToolDetail from '../components/ToolDetail.vue';
import { tools } from '../data/tools';
import type { Tool, ToolCategory } from '../data/tools';

const categories: ToolCategory[] = ['构建', '测试', '文档'];
const keyword = ref<string>('');
const category = ref<string>('全部');
const selectedId = ref<string>('');

const filtered = computed<Tool[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  return tools.filter((t) => {
    const matchKw =
      kw === '' ||
      t.name.toLowerCase().includes(kw) ||
      t.summary.toLowerCase().includes(kw);
    const matchCat = category.value === '全部' || t.category === category.value;
    return matchKw && matchCat;
  });
});

const selected = computed<Tool | null>(
  () => tools.find((t) => t.id === selectedId.value) ?? null,
);

function onSelect(id: string): void {
  selectedId.value = id;
}

function onClose(): void {
  selectedId.value = '';
}
</script>

<template>
  <main class="catalog-page" data-ai-component="catalog-page">
    <h1>开源工具目录</h1>
    <div class="controls">
      <input
        v-model="keyword"
        class="search"
        type="text"
        placeholder="搜索工具关键字"
        data-testid="search-input"
      />
      <select v-model="category" class="category-select" data-testid="category-select">
        <option value="全部">全部</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <ToolDetail v-if="selected" :tool="selected" @close="onClose" />

    <ul v-if="filtered.length > 0" class="tool-list">
      <ToolCard v-for="t in filtered" :key="t.id" :tool="t" @select="onSelect" />
    </ul>
    <p v-else class="empty" data-testid="empty-state">没有匹配的工具</p>
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, sans-serif;
}
h1 {
  font-size: 22px;
  margin: 0 0 12px;
}
.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.search {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
}
.category-select {
  padding: 6px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
}
.tool-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
}
.empty {
  padding: 24px;
  text-align: center;
  color: #57606a;
}
</style>
