<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

interface Task {
  id: number;
  title: string;
  done: boolean;
}

const STORAGE_KEY = 'tasks-page-items';

const tasks = ref<Task[]>([]);
const newTitle = ref('');
const loaded = ref(false);
let nextId = 1;

function assignIds(items: Task[]): void {
  let id = 1;
  for (const item of items) {
    item.id = id++;
  }
  nextId = id;
}

function loadTasks(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Task[];
      if (Array.isArray(parsed)) {
        tasks.value = parsed.map((item) => ({
          id: Number(item.id),
          title: String(item.title),
          done: Boolean(item.done)
        }));
      }
    }
  } catch {
    tasks.value = [];
  }
  assignIds(tasks.value);
  loaded.value = true;
}

function addTask(): void {
  const title = newTitle.value.trim();
  if (!title) {
    return;
  }
  tasks.value.push({ id: nextId++, title, done: false });
  newTitle.value = '';
}

function removeTask(index: number): void {
  tasks.value.splice(index, 1);
  assignIds(tasks.value);
}

const remaining = computed(() => tasks.value.filter((item) => !item.done).length);

watch(
  tasks,
  (value) => {
    if (!loaded.value) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true }
);

onMounted(() => {
  loadTasks();
});
</script>

<template>
  <main data-ai-component="tasks-page" class="tasks-page">
    <h1 class="title">个人待办清单</h1>
    <form class="add-form" @submit.prevent="addTask">
      <input
        v-model="newTitle"
        data-testid="task-input"
        class="task-input"
        type="text"
        placeholder="输入任务标题"
      />
      <button data-testid="add-button" class="add-button" type="submit">添加</button>
    </form>
    <p data-testid="remaining-count" class="remaining">未完成：{{ remaining }}</p>
    <ul v-if="tasks.length > 0" class="task-list">
      <li
        v-for="(task, index) in tasks"
        :key="index"
        class="task-item"
        :class="{ completed: task.done }"
      >
        <label class="task-label">
          <input v-model="task.done" data-testid="task-checkbox" type="checkbox" />
          <span :data-testid="`task-title-${index + 1}`" class="task-title">{{ task.title }}</span>
        </label>
        <button
          :data-testid="`delete-button-${index + 1}`"
          class="delete-button"
          type="button"
          @click="removeTask(index)"
        >
          删除
        </button>
      </li>
    </ul>
    <p v-else data-testid="empty-hint" class="empty">暂无任务，请添加。</p>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 480px;
  margin: 0 auto;
  padding: 24px;
  font-family: sans-serif;
  color: #1f2933;
}
.title {
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
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.add-button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.remaining {
  font-weight: 600;
  margin-bottom: 12px;
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
  padding: 8px;
  border-bottom: 1px solid #e2e8f0;
}
.task-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.completed .task-title {
  text-decoration: line-through;
  color: #94a3b8;
}
.delete-button {
  padding: 4px 10px;
  border: 1px solid #dc2626;
  border-radius: 4px;
  background: #fff;
  color: #dc2626;
  cursor: pointer;
}
.empty {
  color: #94a3b8;
}
</style>
