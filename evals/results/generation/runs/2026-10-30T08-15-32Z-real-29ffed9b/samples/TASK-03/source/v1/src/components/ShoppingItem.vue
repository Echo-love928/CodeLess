<script setup lang="ts">
import type { ShoppingItemData } from '../data/storage';

defineProps<{ item: ShoppingItemData }>();

const emit = defineEmits<{
  (event: 'toggle', id: number): void;
  (event: 'remove', id: number): void;
}>();
</script>

<template>
  <li class="shopping-item" data-ai-component="shopping-item">
    <label class="item-main">
      <input
        type="checkbox"
        :checked="item.purchased"
        :data-testid="'toggle-' + item.id"
        @change="emit('toggle', item.id)"
      />
      <span class="item-name" :class="{ purchased: item.purchased }" :data-testid="'name-' + item.id">
        {{ item.name }}
      </span>
      <span class="item-qty" :data-testid="'qty-' + item.id">数量：{{ item.quantity }}</span>
    </label>
    <button type="button" class="delete-btn" :data-testid="'delete-' + item.id" @click="emit('remove', item.id)">
      删除
    </button>
  </li>
</template>

<style scoped>
.shopping-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
}
.item-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}
.item-name {
  font-weight: 600;
}
.item-name.purchased {
  text-decoration: line-through;
  color: #9ca3af;
}
.item-qty {
  color: #6b7280;
  font-size: 14px;
}
.delete-btn {
  background: #fee2e2;
  color: #b91c1c;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.delete-btn:hover {
  background: #fecaca;
}
</style>
