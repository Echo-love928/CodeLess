<script setup lang="ts">
import { ref, computed } from 'vue';
import { COLUMNS, loadTasks, saveTasks, nextColumn } from '../data/tasks';
import type { ColumnId, Task, ColumnDef } from '../data/tasks';

let idSeed = 0;

function createId(): string {
  return `${Date.now().toString(36)}-${(idSeed++).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function hashId(input: string): string {
  // Deterministic 64-char hex id derived from the task title.
  const seeds = [
    '6a09e667f3bcc908',
    'bb67ae8584caa73b',
    '3c6ef372fe94f82b',
    'a54ff53a5f1d36f1',
  ];
  const bytes: number[] = [];
  for (let i = 0; i < 32; i++) {
    let value = (i * 131 + 7) & 0xff;
    for (let j = 0; j < input.length; j++) {
      value = (value * 33 + input.charCodeAt(j) + i + j) & 0xff;
    }
    bytes.push(value);
  }
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const tasks = ref<Task[]>(loadTasks());
const newTitle = ref('');

function persist(): void {
  saveTasks(tasks.value);
}

function taskId(title: string): string {
  const base = hashId(title);
  let candidate = base;
  let counter = 0;
  while (tasks.value.some((t) => t.id === candidate)) {
    counter++;
    candidate = hashId(`${title}#${counter}`);
  }
  return candidate;
}

function addTask(): void {
  const title = newTitle.value.trim();
  if (!title) {
    return;
  }
  tasks.value.push({
    id: taskId(title),
    title,
    column: 'todo',
  });
  newTitle.value = '';
  persist();
}

function advance(id: string): void {
  const task = tasks.value.find((t) => t.id === id);
  if (!task) {
    return;
  }
  const target = nextColumn(task.column);
  if (target === task.column) {
    return;
  }
  task.column = target;
  persist();
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((t) => t.id !== id);
  persist();
}

function tasksFor(column: ColumnId): Task[] {
  return tasks.value.filter((t) => t.column === column);
}

const columns = computed<ColumnDef[]>(() => COLUMNS);
</script>

<template>
  <main data-ai-component="tasks-page" class="board-page">
    <h1 class="board-title">学习计划看板</h1>

    <form class="add-form" @submit.prevent="addTask">
      <input
        v-model="newTitle"
        class="title-input"
        data-testid="new-task-input"
        placeholder="输入任务标题"
      />
      <button type="submit" class="add-btn" data-testid="add-task-btn">新建</button>
    </form>

    <div class="columns">
      <section v-for="col in columns" :key="col.id" class="column" :data-testid="`column-${col.id}`">
        <h2 class="column-title">{{ col.label }}</h2>
        <ul class="task-list">
          <li
            v-for="task in tasksFor(col.id)"
            :key="task.id"
            class="task-card"
            :data-testid="`task-${task.id}`"
          >
            <span class="task-title" :data-testid="`title-${task.id}`">{{ task.title }}</span>
            <div class="task-actions">
              <button
                type="button"
                class="next-btn"
                :data-testid="`next-${task.id}`"
                @click="advance(task.id)"
              >
                下一步
              </button>
              <button
                type="button"
                class="delete-btn"
                :data-testid="`delete-${task.id}`"
                @click="removeTask(task.id)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>
        <p class="empty" :data-testid="`empty-${col.id}`" v-if="tasksFor(col.id).length === 0">
          暂无任务
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.board-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: Arial, sans-serif;
}
.board-title {
  text-align: center;
  margin-bottom: 20px;
}
.add-form {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 24px;
}
.title-input {
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  width: 240px;
}
.add-btn,
.next-btn,
.delete-btn {
  cursor: pointer;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  background: #4a6cf7;
  color: #fff;
}
.delete-btn {
  background: #e55353;
}
.columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.column {
  background: #f5f6fa;
  border-radius: 10px;
  padding: 12px;
  min-height: 200px;
}
.column-title {
  margin: 0 0 12px;
  font-size: 16px;
  text-align: center;
}
.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-card {
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.task-title {
  display: block;
  margin-bottom: 8px;
}
.task-actions {
  display: flex;
  gap: 8px;
}
.task-actions button {
  padding: 4px 8px;
  font-size: 12px;
}
.empty {
  color: #999;
  text-align: center;
  font-size: 13px;
}
</style>
