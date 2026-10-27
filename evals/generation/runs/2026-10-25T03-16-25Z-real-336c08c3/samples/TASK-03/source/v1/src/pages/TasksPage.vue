<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ShoppingItemRow from '../components/ShoppingItemRow.vue';
import { createId, loadItems, saveItems } from '../data/shoppingStore';
import type { ShoppingItem } from '../data/shoppingStore';

const items = ref<ShoppingItem[]>([]);
const nameInput = ref('');
const quantityInput = ref('1');

const purchasedCount = computed<number>(() => items.value.filter((item) => item.purchased).length);

function persist(): void {
  saveItems(items.value);
}

function addItem(): void {
  const name = nameInput.value.trim();
  if (name === '') return;
  const parsedQty = Number.parseInt(quantityInput.value, 10);
  const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
  items.value.push({ id: createId(), name, quantity, purchased: false });
  persist();
  nameInput.value = '';
  quantityInput.value = '1';
}

function toggleItem(id: string): void {
  const target = items.value.find((item) => item.id === id);
  if (!target) return;
  target.purchased = !target.purchased;
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

onMounted(() => {
  items.value = loadItems();
});
</script>

<template>
  <div class="tasks-page" data-ai-component="tasks-page">
    <header class="page-header">
      <h1 class="page-title" data-testid="page-title">家庭购物清单</h1>
      <p class="page-subtitle">输入商品名称和数量，加入购物清单并自动保存在本地。</p>
    </header>

    <form class="add-form" @submit.prevent="addItem">
      <div class="field">
        <label class="field-label" for="item-name">商品名称</label>
        <input
          id="item-name"
          v-model="nameInput"
          class="field-input"
          type="text"
          placeholder="例如：牛奶"
          data-testid="input-name"
        />
      </div>
      <div class="field field--qty">
        <label class="field-label" for="item-qty">数量</label>
        <input
          id="item-qty"
          v-model="quantityInput"
          class="field-input"
          type="number"
          min="1"
          data-testid="input-qty"
        />
      </div>
      <button type="submit" class="btn btn--primary" data-testid="add-button">加入清单</button>
    </form>

    <section class="list-section">
      <div class="list-header">
        <h2 class="list-title" data-testid="list-title">清单</h2>
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="purchasedCount === 0"
          data-testid="clear-purchased"
          @click="clearPurchased"
        >
          清除已购买
        </button>
      </div>
      <p v-if="items.length === 0" class="empty-hint" data-testid="empty-hint">清单还是空的，先添加一些商品吧。</p>
      <ul v-else class="shopping-list" data-testid="shopping-list">
        <ShoppingItemRow
          v-for="item in items"
          :key="item.id"
          :item="item"
          @toggle="toggleItem"
          @remove="removeItem"
        />
      </ul>
    </section>
  </div>
</template>

<style scoped>
.tasks-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2937;
}
.page-header {
  margin-bottom: 20px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 24px;
}
.page-subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
.add-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f9fafb;
  margin-bottom: 24px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 120px;
}
.field--qty {
  flex: 0 0 90px;
}
.field-label {
  font-size: 13px;
  color: #374151;
}
.field-input {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
}
.btn {
  border-radius: 6px;
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn--primary {
  background: #2563eb;
  color: #fff;
}
.btn--ghost {
  background: #fff;
  border-color: #cbd5e1;
  color: #374151;
}
.btn--ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.list-title {
  margin: 0;
  font-size: 18px;
}
.empty-hint {
  color: #9ca3af;
  font-size: 14px;
}
.shopping-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
}
</style>
