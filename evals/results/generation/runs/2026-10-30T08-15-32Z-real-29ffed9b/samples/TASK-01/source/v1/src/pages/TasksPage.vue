<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { loadTasks, saveTasks, type Task } from '../data/tasks';

const tasks = ref<Task[]>([]);
const newTitle = ref<string>('');
const nextId = ref<number>(1);

const remaining = computed<number>(() => tasks.value.filter((t) => !t.done).length);

function persist(): void {
  saveTasks(tasks.value);
}

function addTask(): void {
  const title = newTitle.value.trim();
  if (!title) return;
  tasks.value = [...tasks.value, { id: nextId.value, title, done: false }];
  nextId.value += 1;
  newTitle.value = '';
  persist();
}

function toggleTask(id: number): void {
  tasks.value = tasks.value.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  persist();
}

function removeTask(id: number): void {
  tasks.value = tasks.value.filter((t) => t.id !== id);
  persist();
}

onMounted(() => {
  tasks.value = loadTasks();
  nextId.value = tasks.value.reduce((max, t) => (t.id > max ? t.id : max), 0) + 1;
});
</script>

<template>
  <main data-ai-component="tasks-page" class="tasks-page">
    <h1 class="title">个人待办清单</h1>
    <p class="count" data-testid="remaining-count">未完成：{{ remaining }}</p>
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
    <p v-if="tasks.length === 0" class="empty" data-testid="empty-hint">暂无任务</p>
    <ul class="task-list">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ done: task.done }"
        data-testid="task-item"
      >
        <label class="task-label">
          <input
            class="task-check"
            type="checkbox"
            :checked="task.done"
            :data-testid="'check-' + task.id"
            @change="toggleTask(task.id)"
          />
          <span class="task-title" :data-testid="'title-' + task.id">{{ task.title }}</span>
        </label>
        <button
          class="del-btn"
          type="button"
          :data-testid="'delete-' + task.id"
          @click="removeTask(task.id)"
        >
          删除
        </button>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 520px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
}
.title {
  font-size: 22px;
  margin: 0 0 8px;
}
.count {
  color: #555;
  margin: 0 0 16px;
}
.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.task-input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.add-btn,
.del-btn {
  padding: 8px 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;
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
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.task-label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.task-item.done .task-title {
  color: #999;
  text-decoration: line-through;
}
.empty {
  color: #999;
}
</style>
