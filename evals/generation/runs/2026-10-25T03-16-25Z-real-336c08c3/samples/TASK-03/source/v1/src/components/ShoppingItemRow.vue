<script setup lang="ts">
import type { ShoppingItem } from '../data/shoppingStore';

defineProps<{ item: ShoppingItem }>();

const emit = defineEmits<{
  (e: 'toggle', id: string): void;
  (e: 'remove', id: string): void;
}>();
</script>

<template>
  <li class="shopping-row" data-ai-component="shopping-item-row">
    <label class="row-main">
      <input
        type="checkbox"
        :checked="item.purchased"
        :data-testid="'purchase-' + item.id"
        @change="emit('toggle', item.id)"
      />
      <span class="row-name" :class="{ 'row-name--done': item.purchased }" :data-testid="'name-' + item.id">{{ item.name }}</span>
      <span class="row-qty" :data-testid="'qty-' + item.id">数量 {{ item.quantity }}</span>
      <span v-if="item.purchased" class="row-badge">已购买</span>
    </label>
    <button type="button" class="row-remove" :data-testid="'remove-' + item.id" @click="emit('remove', item.id)">删除</button>
  </li>
</template>

<style scoped>
.shopping-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  list-style: none;
}
.row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  cursor: pointer;
}
.row-name {
  font-weight: 600;
  color: #1f2937;
}
.row-name--done {
  text-decoration: line-through;
  color: #9ca3af;
}
.row-qty {
  color: #6b7280;
  font-size: 14px;
}
.row-badge {
  font-size: 12px;
  color: #047857;
  background: #d1fae5;
  border-radius: 999px;
  padding: 2px 8px;
}
.row-remove {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #b91c1c;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
</style>
