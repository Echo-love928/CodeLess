<script setup lang="ts">
import { ref, watch } from 'vue'

type Task = { id: number; text: string; done: boolean }
const storageKey = 'codeless-fixture-tasks'
function load(): Task[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (Array.isArray(parsed) && parsed.every((item) => typeof item.id === 'number' && typeof item.text === 'string' && typeof item.done === 'boolean')) return parsed
  } catch { /* Start from the sample when storage is unavailable. */ }
  return [{ id: 1, text: '整理今天的重点', done: false }, { id: 2, text: '完成页面草稿', done: true }]
}
const tasks = ref<Task[]>(load())
const draft = ref('')
watch(tasks, (value) => { try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Keep in-memory state. */ } }, { deep: true })
function add() {
  const text = draft.value.trim()
  if (!text) return
  tasks.value.push({ id: Date.now(), text, done: false })
  draft.value = ''
}
</script>

<template>
  <main><h1>今日任务</h1><p>计划清楚，做起来更轻松。</p>
    <form @submit.prevent="add"><input v-model="draft" aria-label="新任务" placeholder="添加一项任务"><button>添加</button></form>
    <ul><li v-for="task in tasks" :key="task.id"><label><input v-model="task.done" type="checkbox"><span :class="{ done: task.done }">{{ task.text }}</span></label></li></ul>
  </main>
</template>

<style scoped>
main{max-width:620px;margin:10vh auto;padding:30px;font-family:system-ui;color:#183153}form{display:flex;gap:8px;margin:28px 0}form input{flex:1;padding:12px}button{padding:12px 22px;background:#2255a4;color:white;border:0;border-radius:6px}ul{list-style:none;padding:0}li{padding:15px;border-bottom:1px solid #dce6ef}.done{text-decoration:line-through;color:#64748b}
</style>
