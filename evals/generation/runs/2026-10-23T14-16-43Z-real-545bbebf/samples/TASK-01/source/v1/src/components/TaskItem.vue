<script setup lang="ts">
import type { Task } from '../data/tasks';

defineProps<{ task: Task }>();

const emit = defineEmits<{
  (e: 'toggle', id: string): void;
  (e: 'remove', id: string): void;
}>();
</script>

<template>
  <li class="task-item" :class="{ done: task.completed }" :data-testid="`task-item-${task.id}`">
    <label class="task-check">
      <input
        type="checkbox"
        :checked="task.completed"
        :data-testid="`task-toggle-${task.id}`"
        @change="emit('toggle', task.id)"
      />
      <span class="task-title" :data-testid="`task-title-${task.id}`">{{ task.title }}</span>
    </label>
    <button
      type="button"
      class="delete-btn"
      :data-testid="`task-delete-${task.id}`"
      @click="emit('remove', task.id)"
    >
      删除
    </button>
  </li>
</template>

<style scoped>
.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
}
.task-check {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.task-title {
  word-break: break-word;
}
.done .task-title {
  text-decoration: line-through;
  color: #9ca3af;
}
.delete-btn {
  border: 1px solid #fca5a5;
  background: #fff;
  color: #dc2626;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.delete-btn:hover {
  background: #fef2f2;
}
</style>
