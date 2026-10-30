<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { loadTodos, saveTodos, createTodo } from '../data/todos';
import type { Todo } from '../data/todos';

const todos = ref<Todo[]>([]);
const newTitle = ref('');

onMounted(() => {
  todos.value = loadTodos();
});

const remaining = computed(() => todos.value.filter((t) => !t.done).length);

function persist(): void {
  saveTodos(todos.value);
}

function addTodo(): void {
  const title = newTitle.value.trim();
  if (!title) return;
  todos.value.push(createTodo(title, todos.value));
  newTitle.value = '';
  persist();
}

function toggle(todo: Todo): void {
  todo.done = !todo.done;
  persist();
}

function remove(todo: Todo): void {
  todos.value = todos.value.filter((t) => t.id !== todo.id);
  persist();
}
</script>

<template>
  <main data-ai-component="tasks-page" class="tasks-page">
    <h1 class="page-title">个人待办清单</h1>

    <form class="add-form" @submit.prevent="addTodo">
      <input
        v-model="newTitle"
        class="task-input"
        type="text"
        placeholder="输入任务标题"
        data-testid="task-input"
      />
      <button type="submit" class="add-btn" data-testid="add-btn">添加</button>
    </form>

    <p class="counter" data-testid="remaining-count">未完成：{{ remaining }}</p>

    <ul v-if="todos.length" class="task-list">
      <li v-for="todo in todos" :key="todo.id" class="task-item" :class="{ done: todo.done }">
        <label class="task-label">
          <input
            type="checkbox"
            :checked="todo.done"
            :data-testid="'toggle-' + todo.id"
            @change="toggle(todo)"
          />
          <span class="task-title">{{ todo.title }}</span>
        </label>
        <button
          type="button"
          class="delete-btn"
          :data-testid="'delete-' + todo.id"
          @click="remove(todo)"
        >
          删除
        </button>
      </li>
    </ul>
    <p v-else class="empty" data-testid="empty">暂无任务</p>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
  color: #1f2937;
}
.page-title {
  font-size: 24px;
  margin: 0 0 16px;
}
.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.task-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}
.add-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.counter {
  font-size: 14px;
  color: #4b5563;
  margin: 0 0 12px;
}
.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
}
.task-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  cursor: pointer;
}
.task-item.done .task-title {
  text-decoration: line-through;
  color: #9ca3af;
}
.delete-btn {
  padding: 4px 10px;
  border: 1px solid #ef4444;
  border-radius: 6px;
  background: #fff;
  color: #ef4444;
  font-size: 13px;
  cursor: pointer;
}
.empty {
  color: #9ca3af;
  font-size: 14px;
}
</style>
