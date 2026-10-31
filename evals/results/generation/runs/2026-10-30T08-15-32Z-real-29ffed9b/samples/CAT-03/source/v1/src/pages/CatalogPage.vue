<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolCard from '../components/ToolCard.vue';
import { tools, categories } from '../data/tools';
import type { ToolCategory } from '../data/tools';

const keyword = ref('');
const selectedCategory = ref<'全部' | ToolCategory>('全部');
const expandedId = ref('');

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return tools.filter((tool) => {
    const matchCategory = selectedCategory.value === '全部' || tool.category === selectedCategory.value;
    const matchKeyword = kw === '' || tool.name.toLowerCase().includes(kw) || tool.summary.toLowerCase().includes(kw);
    return matchCategory && matchKeyword;
  });
});

function toggle(id: string): void {
  expandedId.value = expandedId.value === id ? '' : id;
}
</script>

<template>
  <main class="catalog-page" data-ai-component="catalog-page">
    <h1>开源工具目录</h1>
    <div class="controls">
      <label class="search-label" for="search">搜索</label>
      <input id="search" v-model="keyword" type="text" placeholder="输入关键字" data-testid="search-input" />
      <label class="category-label" for="category">类别</label>
      <select id="category" v-model="selectedCategory" data-testid="category-select">
        <option value="全部">全部</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <p class="count" data-testid="result-count">共 {{ filtered.length }} 个工具</p>
    <p v-if="filtered.length === 0" class="empty" data-testid="empty-state">没有匹配的工具</p>
    <ul v-else class="tool-list">
      <ToolCard
        v-for="tool in filtered"
        :key="tool.id"
        :tool="tool"
        :expanded="expandedId === tool.id"
        @toggle="toggle"
      />
    </ul>
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  text-align: left;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.controls input {
  padding: 6px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
}
.controls select {
  padding: 6px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
}
.count {
  color: #6b7280;
  font-size: 13px;
}
.empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
}
.tool-list {
  padding: 0;
  margin: 0;
}
</style>
