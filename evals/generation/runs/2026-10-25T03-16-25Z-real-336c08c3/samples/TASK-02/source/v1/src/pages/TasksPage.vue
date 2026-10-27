<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import TaskColumn from '../components/TaskColumn.vue';
import {
  COLUMNS,
  NEXT_STATUS,
  createTask,
  loadTasks,
  saveTasks,
  type Task,
} from '../data/taskStorage';

const tasks = ref<Task[]>([]);
const newTitle = ref('');
const message = ref('');
const loaded = ref(false);

function tasksFor(status: string): Task[] {
  return tasks.value.filter((task) => task.status === status);
}

const columnsWithTasks = computed(() =>
  COLUMNS.map((column) => ({
    column,
    tasks: tasksFor(column.status),
  })),
);

function addTask(): void {
  const title = newTitle.value.trim();
  if (title === '') {
    message.value = '请输入任务标题';
    return;
  }
  tasks.value = [...tasks.value, createTask(title)];
  newTitle.value = '';
  message.value = '';
}

function moveNext(id: string): void {
  tasks.value = tasks.value.map((task) =>
    task.id === id ? { ...task, status: NEXT_STATUS[task.status] } : task,
  );
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((task) => task.id !== id);
}

onMounted(() => {
  tasks.value = loadTasks();
  loaded.value = true;
});

watch(
  tasks,
  (value) => {
    if (loaded.value) {
      saveTasks(value);
    }
  },
  { deep: true },
);
</script>

<template>
  <main class="board-page" data-ai-component="tasks-page">
    <header class="header">
      <h1 class="page-title" data-testid="page-title">学习计划看板</h1>
      <form class="add-form" @submit.prevent="addTask">
        <input
          v-model="newTitle"
          type="text"
          class="title-input"
          data-testid="new-task-input"
          placeholder="输入任务标题"
        />
        <button type="submit" class="btn-add" data-testid="add-task">添加任务</button>
      </form>
      <p v-if="message" class="message" data-testid="form-message">{{ message }}</p>
    </header>

    <div class="board">
      <TaskColumn
        v-for="entry in columnsWithTasks"
        :key="entry.column.status"
        :column="entry.column"
        :tasks="entry.tasks"
        @next="moveNext"
        @delete="removeTask"
      />
    </div>
  </main>
</template>

<style scoped>
.board-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2733;
}
.page-title {
  margin: 0 0 16px;
  font-size: 22px;
}
.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.title-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #c8d0df;
  border-radius: 6px;
  font-size: 14px;
}
.btn-add {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #1f6feb;
  background: #1f6feb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.message {
  margin: 4px 0 0;
  color: #d93025;
  font-size: 13px;
}
.board {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
</style>
