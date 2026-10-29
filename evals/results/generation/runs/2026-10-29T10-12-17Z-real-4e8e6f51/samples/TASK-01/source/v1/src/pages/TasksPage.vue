<script setup lang="ts">
import { computed, ref } from 'vue';
import { loadTasks, saveTasks, type Task } from '../data/tasks';

const tasks = ref<Task[]>(loadTasks());
const newTitle = ref<string>('');

const remaining = computed<number>(() => tasks.value.filter((t) => !t.done).length);

function persist(): void {
  saveTasks(tasks.value);
}

function addTask(): void {
  const title = newTitle.value.trim();
  if (!title) return;
  tasks.value.push({ id: String(Date.now()) + '-' + String(Math.random()).slice(2, 8), title, done: false });
  newTitle.value = '';
  persist();
}

function toggleTask(id: string): void {
  const task = tasks.value.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  persist();
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((t) => t.id !== id);
  persist();
}
</script>

<template>
  <main data-ai-component="tasks-page" class="tasks-page">
    <h1 class="title">个人待办清单</h1>
    <div class="add-row">
      <input
        v-model="newTitle"
        class="task-input"
        data-testid="task-input"
        type="text"
        placeholder="输入任务标题"
        @keyup.enter="addTask"
      />
      <button class="add-btn" data-testid="add-btn" type="button" @click="addTask">添加</button>
    </div>
    <p class="remaining" data-testid="remaining">未完成：{{ remaining }}</p>
    <ul v-if="tasks.length > 0" class="task-list" data-testid="task-list">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ done: task.done }"
        :data-testid="'task-item-' + task.id"
      >
        <input
          class="task-check"
          type="checkbox"
          :checked="task.done"
          :data-testid="'task-check-' + task.id"
          @change="toggleTask(task.id)"
        />
        <span class="task-title" :data-testid="'task-title-' + task.id">{{ task.title }}</span>
        <button
          class="del-btn"
          type="button"
          :data-testid="'task-del-' + task.id"
          @click="removeTask(task.id)"
        >删除</button>
      </li>
    </ul>
    <p v-else class="empty" data-testid="empty">暂无任务</p>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 520px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, sans-serif;
  color: #1f2937;
}
.title {
  font-size: 22px;
  margin: 0 0 16px;
}
.add-row {
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
.add-btn,
.del-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.add-btn {
  background: #2563eb;
  color: #fff;
}
.del-btn {
  background: #fee2e2;
  color: #b91c1c;
}
.remaining {
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
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}
.task-title {
  flex: 1;
  font-size: 15px;
}
.task-item.done .task-title {
  text-decoration: line-through;
  color: #9ca3af;
}
.empty {
  color: #9ca3af;
  font-size: 14px;
}
</style>
