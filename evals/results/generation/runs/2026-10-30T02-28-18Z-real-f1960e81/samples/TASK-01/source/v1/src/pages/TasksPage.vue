<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { loadTodos, saveTodos, type Todo } from '../data/todos';

const todos = ref<Todo[]>(loadTodos());
const newTitle = ref('');
const nextId = ref(todos.value.length > 0 ? Math.max(...todos.value.map((t) => t.id)) + 1 : 1);
const remaining = computed(() => todos.value.filter((t) => !t.done).length);

watch(todos, (value) => saveTodos(value), { deep: true });

function addTodo(): void {
  const title = newTitle.value.trim();
  if (!title) return;
  todos.value.push({ id: nextId.value, title, done: false });
  nextId.value += 1;
  newTitle.value = '';
}

function removeTodo(id: number): void {
  todos.value = todos.value.filter((t) => t.id !== id);
}
</script>

<template>
  <main data-ai-component="tasks-page" class="tasks-page">
    <h1 class="page-title">个人待办清单</h1>
    <form class="add-form" @submit.prevent="addTodo">
      <input
        v-model="newTitle"
        data-testid="todo-input"
        class="todo-input"
        type="text"
        placeholder="输入任务标题"
      />
      <button data-testid="add-button" class="add-button" type="submit">添加</button>
    </form>
    <p data-testid="remaining-count" class="remaining-count">未完成：{{ remaining }}</p>
    <ul class="todo-list">
      <li v-for="todo in todos" :key="todo.id" class="todo-item">
        <label class="todo-label">
          <input v-model="todo.done" type="checkbox" class="todo-check" />
          <span :data-testid="`todo-title-${todo.id}`" class="todo-title">{{ todo.title }}</span>
        </label>
        <button class="delete-button" type="button" @click="removeTodo(todo.id)">删除</button>
      </li>
    </ul>
    <p v-if="todos.length === 0" class="empty-tip">暂无任务</p>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 20px;
  font-family: system-ui, sans-serif;
  color: #1f2933;
}
.page-title {
  font-size: 24px;
  margin-bottom: 20px;
}
.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.todo-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
  font-size: 14px;
}
.add-button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.remaining-count {
  font-size: 14px;
  color: #52606d;
  margin-bottom: 12px;
}
.todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid #e4e7eb;
  border-radius: 4px;
  margin-bottom: 8px;
}
.todo-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.delete-button {
  border: none;
  background: transparent;
  color: #d64545;
  font-size: 14px;
  cursor: pointer;
}
.empty-tip {
  color: #9aa5b1;
  font-size: 14px;
}
</style>
