<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { loadTasks, saveTasks, type Task } from '../data/tasks';

const tasks = ref<Task[]>(loadTasks());
const title = ref('');

watch(tasks, (value) => saveTasks(value), { deep: true });

const remaining = computed(() => tasks.value.filter((task) => !task.done).length);

function addTask(): void {
  const text = title.value.trim();
  if (!text) return;
  tasks.value.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: text, done: false });
  title.value = '';
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((task) => task.id !== id);
}
</script>

<template>
  <main data-ai-component="tasks-page" class="page">
    <h1>个人待办清单</h1>
    <div class="adder">
      <input v-model="title" data-testid="task-input" type="text" placeholder="任务标题" @keyup.enter="addTask" />
      <button type="button" data-testid="add-button" @click="addTask">添加</button>
    </div>
    <p data-testid="remaining-count">未完成：{{ remaining }}</p>
    <ul class="list">
      <li v-for="task in tasks" :key="task.id" data-testid="task-item" class="item">
        <label class="label">
          <input v-model="task.done" type="checkbox" />
          <span :class="['title', { done: task.done }]">{{ task.title }}</span>
        </label>
        <button type="button" class="delete" @click="removeTask(task.id)">删除</button>
      </li>
    </ul>
    <p v-if="tasks.length === 0" data-testid="empty-state">暂无任务</p>
  </main>
</template>

<style scoped>
.page {
  max-width: 520px;
  margin: 2rem auto;
  padding: 0 1rem;
  font-family: system-ui, sans-serif;
}
.adder {
  display: flex;
  gap: 0.5rem;
}
.adder input {
  flex: 1;
  padding: 0.5rem;
}
.list {
  list-style: none;
  padding: 0;
}
.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #ddd;
}
.label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.done {
  text-decoration: line-through;
  color: #888;
}
</style>
