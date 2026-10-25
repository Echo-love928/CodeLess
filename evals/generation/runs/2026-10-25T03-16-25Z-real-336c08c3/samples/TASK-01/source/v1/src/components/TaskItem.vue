<script setup lang="ts">
import type { Task } from '../data/tasks';

defineProps<{ task: Task }>();

const emit = defineEmits<{
  (e: 'toggle', id: string): void;
  (e: 'remove', id: string): void;
}>();
</script>

<template>
  <li class="task-item" data-ai-component="task-item">
    <label class="task-check">
      <input
        type="checkbox"
        :checked="task.completed"
        :data-testid="`task-toggle-${task.id}`"
        @change="emit('toggle', task.id)"
      />
      <span class="task-title" :class="{ done: task.completed }">{{ task.title }}</span>
    </label>
    <button type="button" class="delete-btn" :data-testid="`task-delete-${task.id}`" @click="emit('remove', task.id)">
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
  list-style: none;
}
.task-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.task-title.done {
  text-decoration: line-through;
  color: #9ca3af;
}
.delete-btn {
  border: 1px solid #ef4444;
  color: #ef4444;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
</style>
