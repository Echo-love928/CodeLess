<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { createTask, loadTasks, saveTasks, type Task } from '../data/taskStorage';

const tasks = ref<Task[]>([]);
const newTitle = ref('');

const remaining = computed<number>(() => tasks.value.filter((task) => !task.done).length);

function persist(): void {
  saveTasks(tasks.value);
}

function addTask(): void {
  const title = newTitle.value.trim();
  if (title === '') {
    return;
  }
  tasks.value.push(createTask(title));
  newTitle.value = '';
  persist();
}

function toggleTask(id: string): void {
  const task = tasks.value.find((item) => item.id === id);
  if (!task) {
    return;
  }
  task.done = !task.done;
  persist();
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((item) => item.id !== id);
  persist();
}

onMounted(() => {
  tasks.value = loadTasks();
});
const d21EvalInjectedCount: number = 'D21 injected type fault';
</script>

<template>
  <main data-ai-component="tasks-page" class="tasks-page">
    <h1 class="tasks-title">个人待办清单</h1>
    <div class="tasks-input-row">
      <input
        v-model="newTitle"
        class="tasks-input"
        data-testid="task-input"
        type="text"
        placeholder="输入任务标题"
      />
      <button class="tasks-add" data-testid="add-task" type="button" @click="addTask">添加</button>
    </div>
    <p class="tasks-remaining" data-testid="remaining-count">未完成：{{ remaining }}</p>
    <ul class="tasks-list">
      <li v-for="task in tasks" :key="task.id" class="tasks-item">
        <input
          :checked="task.done"
          class="tasks-checkbox"
          :data-testid="'toggle-' + task.id"
          type="checkbox"
          @change="toggleTask(task.id)"
        />
        <span class="tasks-item-title" :class="{ 'is-done': task.done }">{{ task.title }}</span>
        <button
          class="tasks-remove"
          :data-testid="'remove-' + task.id"
          type="button"
          @click="removeTask(task.id)"
        >删除</button>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
}

.tasks-title {
  font-size: 24px;
  margin-bottom: 16px;
}

.tasks-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tasks-input {
  flex: 1;
  padding: 8px;
  font-size: 14px;
}

.tasks-add {
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
}

.tasks-remaining {
  font-size: 14px;
  color: #555;
  margin-bottom: 12px;
}

.tasks-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tasks-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.tasks-item-title {
  flex: 1;
  font-size: 14px;
}

.tasks-item-title.is-done {
  text-decoration: line-through;
  color: #999;
}

.tasks-remove {
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
