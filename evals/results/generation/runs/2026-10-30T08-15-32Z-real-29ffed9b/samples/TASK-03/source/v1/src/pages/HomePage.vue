<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ShoppingItem from '../components/ShoppingItem.vue';
import { loadItems, saveItems } from '../data/storage';
import type { ShoppingItemData } from '../data/storage';

const items = ref<ShoppingItemData[]>(loadItems());
const nameInput = ref('');
const quantityInput = ref('1');
const error = ref('');

watch(
  items,
  (value) => {
    saveItems(value);
  },
  { deep: true }
);

const purchasedCount = computed(() => items.value.filter((item) => item.purchased).length);
const pendingCount = computed(() => items.value.filter((item) => !item.purchased).length);

function addItem(): void {
  const name = nameInput.value.trim();
  const quantity = Number(quantityInput.value);
  if (!name) {
    error.value = '请输入商品名称';
    return;
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    error.value = '请输入大于 0 的整数数量';
    return;
  }
  error.value = '';
  const nextId = items.value.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  items.value = [...items.value, { id: nextId, name, quantity, purchased: false }];
  nameInput.value = '';
  quantityInput.value = '1';
}

function toggleItem(id: number): void {
  items.value = items.value.map((item) =>
    item.id === id ? { ...item, purchased: !item.purchased } : item
  );
}

function removeItem(id: number): void {
  items.value = items.value.filter((item) => item.id !== id);
}

function clearPurchased(): void {
  items.value = items.value.filter((item) => !item.purchased);
}
</script>

<template>
  <main class="home-page" data-ai-component="home-page">
    <h1 class="title">家庭购物清单</h1>
    <form class="add-form" @submit.prevent="addItem">
      <input
        v-model="nameInput"
        type="text"
        class="name-input"
        placeholder="商品名称"
        data-testid="name-input"
      />
      <input
        v-model="quantityInput"
        type="number"
        min="1"
        class="qty-input"
        placeholder="数量"
        data-testid="quantity-input"
      />
      <button type="submit" class="add-btn" data-testid="add-btn">加入清单</button>
    </form>
    <p v-if="error" class="error" data-testid="error">{{ error }}</p>
    <section class="summary">
      <p class="summary-text" data-testid="summary-text">
        未购买：{{ pendingCount }} 项，已购买：{{ purchasedCount }} 项
      </p>
      <button
        type="button"
        class="clear-btn"
        data-testid="clear-purchased"
        @click="clearPurchased"
      >
        清除已购买
      </button>
    </section>
    <p v-if="items.length === 0" class="empty" data-testid="empty-text">清单为空，请添加商品</p>
    <ul v-else class="item-list">
      <ShoppingItem
        v-for="item in items"
        :key="item.id"
        :item="item"
        @toggle="toggleItem"
        @remove="removeItem"
      />
    </ul>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
}
.title {
  font-size: 22px;
  margin-bottom: 16px;
}
.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.name-input {
  flex: 2;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.qty-input {
  width: 80px;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.add-btn {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
}
.add-btn:hover {
  background: #1d4ed8;
}
.error {
  color: #b91c1c;
  font-size: 14px;
  margin: 4px 0;
}
.summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0;
}
.summary-text {
  color: #374151;
  font-size: 14px;
}
.clear-btn {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.clear-btn:hover {
  background: #e5e7eb;
}
.empty {
  color: #9ca3af;
  text-align: center;
  padding: 24px 0;
}
.item-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
</style>
