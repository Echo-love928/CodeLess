<script setup lang="ts">
import { computed, ref } from 'vue';
import CafeCard from '../components/CafeCard.vue';
import CafeDetail from '../components/CafeDetail.vue';
import { cafes } from '../data/cafes';
import type { Cafe } from '../data/cafes';

const districts = computed<string[]>(() => {
  const set: string[] = [];
  for (const cafe of cafes) {
    if (!set.includes(cafe.district)) {
      set.push(cafe.district);
    }
  }
  return set;
});

const selectedDistrict = ref<string>('all');
const searchText = ref<string>('');
const selectedCafe = ref<Cafe | null>(null);

const filteredCafes = computed<Cafe[]>(() => {
  const keyword = searchText.value.trim();
  return cafes.filter((cafe) => {
    const districtOk = selectedDistrict.value === 'all' || cafe.district === selectedDistrict.value;
    const nameOk = keyword === '' || cafe.name.includes(keyword);
    return districtOk && nameOk;
  });
});

function selectCafe(id: number): void {
  selectedCafe.value = cafes.find((cafe) => cafe.id === id) ?? null;
}
</script>

<template>
  <main class="catalog-page" data-ai-component="catalog-page">
    <h1 class="page-title">城市咖啡馆目录</h1>
    <div class="filters">
      <label class="filter-label" for="district-select">城区筛选</label>
      <select id="district-select" v-model="selectedDistrict" class="filter-select" data-testid="district-select">
        <option value="all">全部城区</option>
        <option v-for="district in districts" :key="district" :value="district">{{ district }}</option>
      </select>
      <label class="filter-label" for="search-input">按名称搜索</label>
      <input id="search-input" v-model="searchText" type="text" class="filter-input" placeholder="输入咖啡馆名称" data-testid="search-input" />
    </div>
    <p class="result-count" data-testid="result-count">共 {{ filteredCafes.length }} 家咖啡馆</p>
    <div class="cafe-list">
      <CafeCard
        v-for="cafe in filteredCafes"
        :key="cafe.id"
        :cafe="cafe"
        @select="selectCafe"
      />
    </div>
    <p v-if="filteredCafes.length === 0" class="empty-tip" data-testid="empty-tip">没有符合条件的咖啡馆</p>
    <CafeDetail v-if="selectedCafe" :cafe="selectedCafe" />
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
}
.page-title {
  margin: 0 0 16px;
  font-size: 24px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.filter-label {
  font-size: 14px;
  color: #333;
}
.filter-select,
.filter-input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
}
.result-count {
  margin: 0 0 12px;
  font-size: 14px;
  color: #666;
}
.cafe-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.empty-tip {
  color: #999;
}
</style>
