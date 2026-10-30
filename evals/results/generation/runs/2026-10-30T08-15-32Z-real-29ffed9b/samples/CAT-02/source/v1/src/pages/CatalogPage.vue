<script setup lang="ts">
import { computed, ref } from 'vue';
import CafeCard from '../components/CafeCard.vue';
import { cafes, districts } from '../data/cafes';
import type { Cafe } from '../data/cafes';

const selectedDistrict = ref<string>('全部城区');
const search = ref<string>('');
const selectedId = ref<string>('');

const filtered = computed<Cafe[]>(() => {
  const keyword = search.value.trim();
  return cafes.filter((cafe) => {
    const districtOk =
      selectedDistrict.value === '全部城区' || cafe.district === selectedDistrict.value;
    const nameOk = keyword === '' || cafe.name.includes(keyword);
    return districtOk && nameOk;
  });
});

const selectedCafe = computed<Cafe | null>(
  () => cafes.find((cafe) => cafe.id === selectedId.value) ?? null
);

function selectCafe(id: string): void {
  selectedId.value = id;
}
</script>

<template>
  <main class="catalog-page" data-ai-component="catalog-page">
    <h1 class="page-title">城市咖啡馆目录</h1>

    <div class="controls">
      <label class="control">
        城区
        <select v-model="selectedDistrict" data-testid="district-select">
          <option value="全部城区">全部城区</option>
          <option v-for="d in districts" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label class="control">
        搜索
        <input
          v-model="search"
          type="text"
          placeholder="按名称搜索"
          data-testid="search-input"
        />
      </label>
    </div>

    <p class="count" data-testid="result-count">共 {{ filtered.length }} 家咖啡馆</p>

    <ul class="cafe-list">
      <CafeCard
        v-for="cafe in filtered"
        :key="cafe.id"
        :cafe="cafe"
        @select="selectCafe"
      />
    </ul>

    <section v-if="selectedCafe" class="detail" data-testid="cafe-detail">
      <h2 class="detail-name" data-testid="detail-name">{{ selectedCafe.name }}</h2>
      <p class="detail-line" data-testid="detail-district">城区：{{ selectedCafe.district }}</p>
      <p class="detail-line" data-testid="detail-rating">评分：{{ selectedCafe.rating }}</p>
      <p class="detail-line" data-testid="detail-drink">招牌饮品：{{ selectedCafe.signatureDrink }}</p>
      <p class="detail-line" data-testid="detail-address">地址：{{ selectedCafe.address }}</p>
      <p class="detail-line" data-testid="detail-description">简介：{{ selectedCafe.description }}</p>
    </section>
  </main>
</template>

<style scoped>
.catalog-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: inherit;
  color: #3d342c;
}
.page-title {
  font-size: 24px;
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
  gap: 4px;
  font-size: 14px;
}
.control select,
.control input {
  padding: 6px 8px;
  border: 1px solid #d8cfc4;
  border-radius: 6px;
}
.count {
  color: #6b5d4f;
  margin: 0 0 12px;
}
.cafe-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.detail {
  margin-top: 24px;
  border: 1px solid #a8734b;
  border-radius: 10px;
  padding: 16px 20px;
  background: #fdf7ef;
}
.detail-name {
  margin: 0 0 8px;
  font-size: 20px;
}
.detail-line {
  margin: 4px 0;
  color: #5a4f45;
}
</style>
