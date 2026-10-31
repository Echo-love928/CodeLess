<script setup lang="ts">
import { computed, ref } from 'vue';
import CafeCard from '../components/CafeCard.vue';
import CafeDetail from '../components/CafeDetail.vue';
import { cafes } from '../data/cafes';
import type { Cafe } from '../data/cafes';

const districts = ['全部', ...Array.from(new Set(cafes.map((c) => c.district)))];
const selectedDistrict = ref<string>('全部');
const keyword = ref<string>('');
const selectedId = ref<number | null>(null);

const filtered = computed<Cafe[]>(() =>
  cafes.filter((c) => {
    const okDistrict = selectedDistrict.value === '全部' || c.district === selectedDistrict.value;
    const okName = c.name.includes(keyword.value.trim());
    return okDistrict && okName;
  }),
);

const selectedCafe = computed<Cafe | null>(
  () => cafes.find((c) => c.id === selectedId.value) ?? null,
);

function selectCafe(id: number): void {
  selectedId.value = id;
}
</script>

<template>
  <main class="catalog-page" data-ai-component="catalog-page">
    <h1 class="page-title" data-testid="page-title">城市咖啡馆目录</h1>
    <div class="controls">
      <label class="control">
        城区筛选
        <select v-model="selectedDistrict" data-testid="district-select">
          <option v-for="d in districts" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label class="control">
        名称搜索
        <input v-model="keyword" type="text" placeholder="输入咖啡馆名称" data-testid="name-search" />
      </label>
    </div>
    <p class="result-count" data-testid="result-count">共 {{ filtered.length }} 家咖啡馆</p>
    <div v-if="filtered.length > 0" class="cafe-list">
      <CafeCard v-for="c in filtered" :key="c.id" :cafe="c" @select="selectCafe" />
    </div>
    <p v-else class="empty" data-testid="empty-tip">没有找到匹配的咖啡馆</p>
    <CafeDetail v-if="selectedCafe" :cafe="selectedCafe" />
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}
.page-title {
  font-size: 22px;
  margin: 0 0 16px;
}
.controls {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.control {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: #555;
  gap: 4px;
}
.control select,
.control input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
}
.result-count {
  font-size: 13px;
  color: #888;
  margin: 0 0 12px;
}
.cafe-list {
  display: grid;
  gap: 12px;
}
.empty {
  color: #999;
  font-size: 14px;
}
</style>
