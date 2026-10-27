<script setup lang="ts">
import type { ColumnDef, Task } from '../data/taskStorage';

defineProps<{
  column: ColumnDef;
  tasks: Task[];
}>();

const emit = defineEmits<{
  (e: 'next', id: string): void;
  (e: 'delete', id: string): void;
}>();
</script>

<template>
  <section class="column" data-ai-component="task-column" :data-testid="`column-${column.status}`">
    <h2 class="column-title" :data-testid="`column-title-${column.status}`">{{ column.label }}</h2>
    <p class="count" :data-testid="`column-count-${column.status}`">{{ tasks.length }} 个任务</p>
    <ul class="task-list">
      <li v-for="task in tasks" :key="task.id" class="task-card" :data-testid="`task-${task.id}`">
        <p class="task-title" :data-testid="`task-title-${task.id}`">{{ task.title }}</p>
        <div class="actions">
          <button
            type="button"
            class="btn-next"
            :data-testid="`next-${task.id}`"
            @click="emit('next', task.id)"
          >
            下一步
          </button>
          <button
            type="button"
            class="btn-delete"
            :data-testid="`delete-${task.id}`"
            @click="emit('delete', task.id)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>
    <p v-if="tasks.length === 0" class="empty" :data-testid="`empty-${column.status}`">暂无任务</p>
  </section>
</template>

<style scoped>
.column {
  background: #f5f7fb;
  border: 1px solid #e2e6ef;
  border-radius: 10px;
  padding: 12px;
  min-height: 200px;
}
.column-title {
  margin: 0 0 4px;
  font-size: 16px;
}
.count {
  margin: 0 0 10px;
  color: #7a8699;
  font-size: 12px;
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
  border: 1px solid #e2e6ef;
  border-radius: 8px;
  padding: 10px;
}
.task-title {
  margin: 0 0 8px;
  font-size: 14px;
  word-break: break-word;
}
.actions {
  display: flex;
  gap: 8px;
}
button {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #c8d0df;
  background: #fff;
  cursor: pointer;
}
.btn-next {
  color: #1f6feb;
  border-color: #1f6feb;
}
.btn-delete {
  color: #d93025;
  border-color: #d93025;
}
.empty {
  color: #9aa5b8;
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
