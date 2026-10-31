<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { loadItems, saveItems, type ShoppingItem } from '../data/shoppingList';

const items = ref<ShoppingItem[]>([]);
const name = ref<string>('');
const quantity = ref<number>(1);

onMounted(() => {
  items.value = loadItems();
});

function persist(): void {
  saveItems(items.value);
}

function addItem(): void {
  const trimmed = name.value.trim();
  const qty = Number(quantity.value);
  if (!trimmed || !Number.isFinite(qty) || qty < 1) {
    return;
  }
  const maxId = items.value.reduce((max, item) => (item.id > max ? item.id : max), 0);
  items.value = [
    ...items.value,
    { id: maxId + 1, name: trimmed, quantity: Math.floor(qty), purchased: false },
  ];
  persist();
  name.value = '';
  quantity.value = 1;
}

function togglePurchased(id: number): void {
  items.value = items.value.map((item) =>
    item.id === id ? { ...item, purchased: !item.purchased } : item,
  );
  persist();
}

function removeItem(id: number): void {
  items.value = items.value.filter((item) => item.id !== id);
  persist();
}

function clearPurchased(): void {
  items.value = items.value.filter((item) => !item.purchased);
  persist();
}

const purchasedCount = computed(
  () => items.value.filter((item) => item.purchased).length,
);
</script>

<template>
  <main data-ai-component="tasks-page" class="page">
    <h1>家庭购物清单</h1>
    <form class="add-form" @submit.prevent="addItem">
      <label>
        商品名称
        <input v-model="name" data-testid="item-name" type="text" placeholder="例如：牛奶" />
      </label>
      <label>
        数量
        <input v-model="quantity" data-testid="item-quantity" type="number" min="1" />
      </label>
      <button type="submit" data-testid="add-btn">加入清单</button>
    </form>

    <p data-testid="summary">共 {{ items.length }} 项，已购买 {{ purchasedCount }} 项</p>

    <p v-if="items.length === 0" data-testid="empty">清单为空，请添加商品。</p>

    <ul class="list">
      <li v-for="item in items" :key="item.id" class="item">
        <span class="name" :class="{ done: item.purchased }" data-testid="item-name-text">
          {{ item.name }}
        </span>
        <span class="qty" data-testid="item-qty-text">数量：{{ item.quantity }}</span>
        <span class="status" data-testid="item-status">{{ item.purchased ? '已购买' : '未购买' }}</span>
        <button type="button" :data-testid="'toggle-' + item.id" @click="togglePurchased(item.id)">
          {{ item.purchased ? '取消已购买' : '标记已购买' }}
        </button>
        <button type="button" :data-testid="'delete-' + item.id" @click="removeItem(item.id)">
          删除
        </button>
      </li>
    </ul>

    <button type="button" data-testid="clear-purchased" @click="clearPurchased">
      清除已购买
    </button>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}
.add-form {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.add-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.list {
  list-style: none;
  padding: 0;
}
.item {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}
.name.done,
.status {
  font-weight: 600;
}
.name.done {
  text-decoration: line-through;
  color: #888;
}
button {
  cursor: pointer;
}
</style>
