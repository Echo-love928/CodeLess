<script setup lang="ts">
import { computed, ref } from 'vue';
import TaskItem from '../components/TaskItem.vue';
import { createTask, loadTasks, saveTasks, type Task } from '../data/tasks';

const tasks = ref<Task[]>(loadTasks());
const newTitle = ref('');

const remaining = computed(() => tasks.value.filter((task) => !task.completed).length);

function persist(): void {
  saveTasks(tasks.value);
}

function addTask(): void {
  const title = newTitle.value.trim();
  if (!title) {
    return;
  }
  tasks.value.push(createTask(title));
  newTitle.value = '';
  persist();
}

function toggleTask(id: string): void {
  const target = tasks.value.find((task) => task.id === id);
  if (!target) {
    return;
  }
  target.completed = !target.completed;
  persist();
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((task) => task.id !== id);
  persist();
}
</script>

<template>
  <main class="tasks-page" data-ai-component="tasks-page">
    <h1 class="page-title">个人待办清单</h1>
    <form class="add-form" @submit.prevent="addTask">
      <input
        v-model="newTitle"
        type="text"
        class="task-input"
        data-testid="task-input"
        placeholder="输入任务标题"
      />
      <button type="submit" class="add-btn" data-testid="add-button">添加</button>
    </form>
    <p class="remaining" data-testid="remaining-count">未完成：{{ remaining }}</p>
    <ul class="task-list">
      <TaskItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @toggle="toggleTask"
        @remove="removeTask"
      />
    </ul>
    <p v-if="tasks.length === 0" class="empty" data-testid="empty-hint">暂无任务</p>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
}
.page-title {
  font-size: 22px;
  margin-bottom: 16px;
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
}
.add-btn {
  border: none;
  background: #2563eb;
  color: #fff;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.remaining {
  font-weight: 600;
  margin-bottom: 8px;
}
.task-list {
  margin: 0;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.empty {
  color: #9ca3af;
  margin-top: 12px;
}
</style>
