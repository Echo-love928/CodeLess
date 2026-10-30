<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createId, loadItems, saveItems, type ShoppingItem } from '../data/shoppingList';

const items = ref<ShoppingItem[]>([]);
const name = ref('');
const quantity = ref('1');
const error = ref('');

function persist(): void {
  saveItems(items.value);
}

onMounted(() => {
  items.value = loadItems();
});

function addItem(): void {
  const trimmed = name.value.trim();
  const qty = Number(quantity.value);
  if (!trimmed) {
    error.value = '请输入商品名称';
    return;
  }
  if (!Number.isFinite(qty) || qty < 1) {
    error.value = '数量必须大于 0';
    return;
  }
  error.value = '';
  items.value.push({
    id: createId(),
    name: trimmed,
    quantity: Math.floor(qty),
    purchased: false
  });
  name.value = '';
  quantity.value = '1';
  persist();
}

function togglePurchased(item: ShoppingItem): void {
  item.purchased = !item.purchased;
  persist();
}

function removeItem(id: string): void {
  items.value = items.value.filter((item) => item.id !== id);
  persist();
}

function clearPurchased(): void {
  items.value = items.value.filter((item) => !item.purchased);
  persist();
}
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <h1>家庭购物清单</h1>

    <form class="form" @submit.prevent="addItem">
      <label for="item-name">商品名称</label>
      <input id="item-name" v-model="name" data-testid="item-name" type="text" placeholder="例如：牛奶" />
      <label for="item-quantity">数量</label>
      <input id="item-quantity" v-model="quantity" data-testid="item-quantity" type="number" min="1" />
      <button type="submit" data-testid="add-button">加入清单</button>
    </form>

    <p v-if="error" class="error" data-testid="form-error">{{ error }}</p>

    <p v-if="items.length === 0" class="empty" data-testid="empty-hint">清单为空，请添加商品。</p>

    <ul v-else class="list">
      <li
        v-for="item in items"
        :key="item.id"
        class="item"
        :class="{ purchased: item.purchased }"
        :data-testid="`item-${item.id}`"
      >
        <span class="name" :data-testid="`name-${item.id}`">{{ item.name }}</span>
        <span class="qty" :data-testid="`qty-${item.id}`">数量：{{ item.quantity }}</span>
        <span v-if="item.purchased" class="status" :data-testid="`status-${item.id}`">已购买</span>
        <span v-else class="status" :data-testid="`status-${item.id}`">未购买</span>
        <button type="button" :data-testid="`toggle-${item.id}`" @click="togglePurchased(item)">
          {{ item.purchased ? '取消已购买' : '已购买' }}
        </button>
        <button type="button" :data-testid="`delete-${item.id}`" @click="removeItem(item.id)">删除</button>
      </li>
    </ul>

    <button type="button" data-testid="clear-purchased" class="clear" @click="clearPurchased">清除已购买</button>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  font-family: sans-serif;
}
.form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}
.list {
  list-style: none;
  padding: 0;
}
.item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #ddd;
}
.item.purchased .name {
  text-decoration: line-through;
  color: #888;
}
.error {
  color: #c00;
}
.clear {
  margin-top: 16px;
}
</style>
