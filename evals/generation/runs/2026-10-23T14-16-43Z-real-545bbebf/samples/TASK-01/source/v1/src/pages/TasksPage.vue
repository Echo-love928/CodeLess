<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import TaskItem from '../components/TaskItem.vue';
import { createTask, loadTasks, saveTasks, type Task } from '../data/tasks';

const tasks = ref<Task[]>([]);
const newTitle = ref('');

onMounted(() => {
  tasks.value = loadTasks();
});

watch(
  tasks,
  (value) => {
    saveTasks(value);
  },
  { deep: true },
);

const pendingCount = computed(() => tasks.value.filter((task) => !task.completed).length);

function addTask(): void {
  const title = newTitle.value.trim();
  if (!title) {
    return;
  }
  tasks.value.push(createTask(title));
  newTitle.value = '';
}

function toggleTask(id: string): void {
  const target = tasks.value.find((task) => task.id === id);
  if (target) {
    target.completed = !target.completed;
  }
}

function removeTask(id: string): void {
  tasks.value = tasks.value.filter((task) => task.id !== id);
}
</script>

<template>
  <main class="tasks-page">
    <h1 class="page-title" data-testid="page-title">个人待办清单</h1>
    <p class="pending-count" data-testid="pending-count">未完成：{{ pendingCount }}</p>

    <form class="add-form" @submit.prevent="addTask">
      <input
        v-model="newTitle"
        type="text"
        class="task-input"
        placeholder="输入任务标题"
        data-testid="task-input"
      />
      <button type="submit" class="add-btn" data-testid="add-button">添加</button>
    </form>

    <p v-if="tasks.length === 0" class="empty-tip" data-testid="empty-tip">暂无任务</p>

    <ul class="task-list" data-testid="task-list">
      <TaskItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @toggle="toggleTask"
        @remove="removeTask"
      />
    </ul>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 16px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2937;
}
.page-title {
  font-size: 22px;
  margin-bottom: 12px;
}
.pending-count {
  font-size: 14px;
  color: #4b5563;
  margin-bottom: 16px;
}
.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.task-input {
  flex: 1;
  min-width: 0;
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
.add-btn:hover {
  background: #1d4ed8;
}
.empty-tip {
  font-size: 14px;
  color: #9ca3af;
}
.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
</style>
