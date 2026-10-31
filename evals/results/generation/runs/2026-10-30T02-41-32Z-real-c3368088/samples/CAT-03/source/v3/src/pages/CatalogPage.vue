<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolCard from '../components/ToolCard.vue';
import ToolDetail from '../components/ToolDetail.vue';
import { categories, tools } from '../data/tools';
import type { Tool, ToolCategory } from '../data/tools';

const keyword = ref('');
const activeCategory = ref<'全部' | ToolCategory>('全部');
const selectedId = ref<string | null>(null);

const filterOptions: Array<'全部' | ToolCategory> = ['全部', ...categories];

const filtered = computed<Tool[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  return tools.filter((tool: Tool) => {
    const matchCategory = activeCategory.value === '全部' || tool.category === activeCategory.value;
    const matchKeyword =
      kw === '' ||
      tool.name.toLowerCase().includes(kw) ||
      tool.summary.toLowerCase().includes(kw);
    return matchCategory && matchKeyword;
  });
});

const selectedTool = computed<Tool | null>(() =>
  tools.find((tool: Tool) => tool.id === selectedId.value) ?? null
);

function selectTool(id: string): void {
  selectedId.value = id;
}
</script>

<template>
  <main data-ai-component="catalog-page" class="catalog-page">
    <h1 class="page-title">开源工具目录</h1>

    <section class="controls">
      <label class="search-label" for="keyword-input">关键字搜索</label>
      <input
        id="keyword-input"
        v-model="keyword"
        data-testid="keyword-input"
        type="text"
        class="search-input"
        placeholder="输入工具名称或简介关键字"
      />
      <div class="filter-group">
        <button
          v-for="option in filterOptions"
          :key="option"
          type="button"
          class="filter-button"
          :class="{ active: activeCategory === option }"
          :data-testid="'filter-' + option"
          @click="activeCategory = option"
        >
          {{ option }}
        </button>
      </div>
    </section>

    <p v-if="filtered.length === 0" data-testid="empty-hint" class="empty-hint">没有匹配的工具</p>
    <p v-if="filtered.length === 0" data-testid="empty-hint" class="empty-hint">没有匹配的工具</p>

    <section v-else class="layout">
      <div class="list">
        <ToolCard
          v-for="tool in filtered"
          :key="tool.id"
          :tool="tool"
          @select="selectTool"
        />
      </div>
      <ToolDetail v-if="selectedTool" :tool="selectedTool" />
    </section>
  </main>
</template>

<style scoped>
.catalog-page { max-width: 960px; margin: 0 auto; padding: 20px 16px; font-family: system-ui, sans-serif; }
.page-title { margin: 0 0 16px; font-size: 1.5rem; }
.controls { margin-bottom: 16px; }
.search-label { display: block; margin-bottom: 6px; color: #4a5568; font-size: 0.9rem; }
.search-input { width: 100%; max-width: 360px; padding: 8px 10px; border: 1px solid #cbd5e0; border-radius: 6px; font: inherit; }
.filter-group { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
.filter-button { padding: 6px 14px; border: 1px solid #cbd5e0; border-radius: 999px; background: #fff; cursor: pointer; font: inherit; }
.filter-button.active { background: #1a5fb4; border-color: #1a5fb4; color: #fff; }
.empty-hint { color: #b23b3b; font-weight: 600; }
.layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
.list { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 720px) { .layout { grid-template-columns: 1fr 320px; align-items: start; } }
</style>
