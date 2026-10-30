<script setup lang="ts">
import { computed, ref } from 'vue';
import CafeCard from '../components/CafeCard.vue';
import CafeDetail from '../components/CafeDetail.vue';
import { cafes, districts, type Cafe } from '../data/cafes';

const selectedDistrict = ref<string>('全部');
const keyword = ref<string>('');
const selectedId = ref<string>('');

const filtered = computed<Cafe[]>(() =>
  cafes.filter((cafe) => {
    const districtOk = selectedDistrict.value === '全部' || cafe.district === selectedDistrict.value;
    const keywordOk = cafe.name.includes(keyword.value.trim());
    return districtOk && keywordOk;
  })
);

const selectedCafe = computed<Cafe | undefined>(() =>
  cafes.find((cafe) => cafe.id === selectedId.value)
);

function selectCafe(id: string): void {
  selectedId.value = id;
}
</script>

<template>
  <main class="catalog-page" data-ai-component="catalog-page">
    <h1 class="page-title">城市咖啡馆目录</h1>
    <div class="controls">
      <label class="control-label" for="district-select">城区筛选</label>
      <select id="district-select" v-model="selectedDistrict" data-testid="district-select">
        <option value="全部">全部</option>
        <option v-for="d in districts" :key="d" :value="d">{{ d }}</option>
      </select>
      <label class="control-label" for="name-search">名称搜索</label>
      <input id="name-search" v-model="keyword" type="text" placeholder="输入咖啡馆名称" data-testid="name-search" />
    </div>
    <p class="result-count" data-testid="result-count">共 {{ filtered.length }} 家咖啡馆</p>
    <section class="cafe-list">
      <CafeCard v-for="cafe in filtered" :key="cafe.id" :cafe="cafe" @select="selectCafe" />
      <p v-if="filtered.length === 0" class="empty" data-testid="empty">没有符合条件的咖啡馆</p>
    </section>
    <CafeDetail v-if="selectedCafe" :cafe="selectedCafe" data-testid="cafe-detail-panel" />
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #2f2a24;
}
.page-title {
  margin: 0 0 16px;
  font-size: 22px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.control-label {
  font-size: 14px;
  color: #6b6157;
}
.controls select,
.controls input {
  padding: 6px 10px;
  border: 1px solid #cfc6b8;
  border-radius: 6px;
  font-size: 14px;
}
.result-count {
  margin: 0 0 12px;
  font-size: 14px;
  color: #8a6d4b;
}
.empty {
  font-size: 14px;
  color: #8a6d4b;
}
</style>
