<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

interface Item {
  id: number;
  name: string;
  qty: number;
  bought: boolean;
}

const STORAGE_KEY = 'family-shopping-list';
const items = ref<Item[]>([]);
const name = ref<string>('');
const qty = ref<string>('1');
let nextId = 1;

function load(): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Item[];
    if (Array.isArray(parsed)) {
      items.value = parsed.map((p) => ({
        id: Number(p.id),
        name: String(p.name),
        qty: Number(p.qty),
        bought: Boolean(p.bought),
      }));
      nextId = items.value.reduce((m, i) => Math.max(m, i.id), 0) + 1;
    }
  } catch {
    items.value = [];
  }
}

function save(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value));
}

function addItem(): void {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  const amount = Math.max(1, Math.floor(Number(qty.value) || 1));
  items.value.push({ id: nextId++, name: trimmed, qty: amount, bought: false });
  name.value = '';
  qty.value = '1';
}

function toggleBought(id: number): void {
  const target = items.value.find((i) => i.id === id);
  if (target) target.bought = !target.bought;
}

function removeItem(id: number): void {
  items.value = items.value.filter((i) => i.id !== id);
}

function clearBought(): void {
  items.value = items.value.filter((i) => !i.bought);
}

watch(items, save, { deep: true });
onMounted(load);
</script>

<template>
  <main data-ai-component="tasks-page" class="page">
    <h1 class="title">家庭购物清单</h1>
    <form class="add-form" @submit.prevent="addItem">
      <input v-model="name" class="input-name" data-testid="name-input" placeholder="商品名称" />
      <input v-model="qty" class="input-qty" data-testid="qty-input" type="number" min="1" placeholder="数量" />
      <button type="submit" class="btn-add" data-testid="add-btn">加入清单</button>
    </form>
    <ul class="list">
      <li v-for="item in items" :key="item.id" class="item" :class="{ bought: item.bought }" :data-testid="'item-' + item.id">
        <span class="item-name">{{ item.name }}</span>
        <span class="item-qty">数量：{{ item.qty }}</span>
        <span v-if="item.bought" class="item-status">已购买</span>
        <button class="btn-toggle" :data-testid="'toggle-' + item.id" @click="toggleBought(item.id)">
          {{ item.bought ? '取消已购买' : '已购买' }}
        </button>
        <button class="btn-del" :data-testid="'delete-' + item.id" @click="removeItem(item.id)">删除</button>
      </li>
    </ul>
    <p v-if="items.length === 0" class="empty">清单为空，请添加商品。</p>
    <button class="btn-clear" data-testid="clear-bought" @click="clearBought">清除已购买</button>
  </main>
</template>

<style scoped>
.page { max-width: 640px; margin: 0 auto; padding: 24px; font-family: system-ui, sans-serif; }
.title { font-size: 24px; margin-bottom: 16px; }
.add-form { display: flex; gap: 8px; margin-bottom: 16px; }
.input-name { flex: 1; padding: 6px; }
.input-qty { width: 80px; padding: 6px; }
.list { list-style: none; padding: 0; margin: 0 0 16px; }
.item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; }
.item.bought .item-name { text-decoration: line-through; color: #999; }
.item-name { font-weight: 600; }
.item-status { color: #2a9d8f; font-size: 12px; }
.btn-toggle, .btn-del, .btn-clear, .btn-add { padding: 6px 12px; cursor: pointer; }
.empty { color: #888; }
</style>
