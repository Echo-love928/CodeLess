<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { buildNextId, loadTasks, saveTasks, type Task, type TaskStatus } from '../data/tasks'

const columns: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: '待开始' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' },
]

const order: TaskStatus[] = ['todo', 'doing', 'done']

const tasks = ref<Task[]>([])
const newTitle = ref('')

onMounted(() => {
  tasks.value = loadTasks()
})

const grouped = computed(() => {
  const result: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
  for (const task of tasks.value) {
    if (result[task.status]) result[task.status].push(task)
  }
  return result
})

function persist() {
  saveTasks(tasks.value)
}

function addTask() {
  const title = newTitle.value.trim()
  if (!title) return
  tasks.value.push({ id: buildNextId(), title, status: 'todo' })
  newTitle.value = ''
  persist()
}

function nextTask(id: string) {
  const task = tasks.value.find((t) => t.id === id)
  if (!task) return
  const index = order.indexOf(task.status)
  if (index < order.length - 1) {
    task.status = order[index + 1]
    persist()
  }
}

function deleteTask(id: string) {
  tasks.value = tasks.value.filter((t) => t.id !== id)
  persist()
}
</script>

<template>
  <div class="tasks-page">
    <h1>学习计划看板</h1>
    <div class="new-task">
      <input
        data-testid="new-task-input"
        v-model="newTitle"
        type="text"
        placeholder="输入任务标题"
        @keyup.enter="addTask"
      />
      <button data-testid="add-task-btn" type="button" @click="addTask">新建任务</button>
    </div>
    <div class="board">
      <section v-for="col in columns" :key="col.key" class="column">
        <h2>{{ col.label }}</h2>
        <ul>
          <li v-for="task in grouped[col.key]" :key="task.id" class="task">
            <span class="title">{{ task.title }}</span>
            <button
              v-if="col.key !== 'done'"
              data-testid="next-{{ task.id }}"
              type="button"
              @click="nextTask(task.id)"
            >下一步</button>
            <button
              data-testid="delete-{{ task.id }}"
              type="button"
              @click="deleteTask(task.id)"
            >删除</button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tasks-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}
.new-task {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}
.new-task input {
  flex: 1;
  padding: 8px;
}
.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.column {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
}
.column h2 {
  font-size: 16px;
  margin: 0 0 12px;
}
.column ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.task {
  background: #fff;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.task .title {
  flex: 1;
  word-break: break-word;
}
</style>