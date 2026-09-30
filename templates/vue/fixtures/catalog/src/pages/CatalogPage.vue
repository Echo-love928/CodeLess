<script setup lang="ts">
import { computed, ref } from 'vue'

const query = ref('')
const category = ref('全部')
const items = [
  { name: '山间书屋', category: '阅读', detail: '安静角落与周末书单' },
  { name: '手作工坊', category: '体验', detail: '亲手完成一件小作品' },
  { name: '城市地图', category: '出行', detail: '发现附近的好去处' }
]
const filtered = computed(() => items.filter((item) =>
  (category.value === '全部' || item.category === category.value) &&
  `${item.name} ${item.detail}`.toLowerCase().includes(query.value.trim().toLowerCase())))
</script>

<template>
  <main><header><p>探索目录</p><h1>寻找下一次灵感</h1></header>
    <input v-model="query" type="search" aria-label="搜索目录" placeholder="搜索名称或描述">
    <nav aria-label="分类"><button v-for="name in ['全部','阅读','体验','出行']" :key="name" :aria-pressed="category === name" @click="category = name">{{ name }}</button></nav>
    <section aria-label="结果"><article v-for="item in filtered" :key="item.name"><small>{{ item.category }}</small><h2>{{ item.name }}</h2><p>{{ item.detail }}</p></article><p v-if="!filtered.length">没有匹配的结果</p></section>
  </main>
</template>

<style scoped>
main{max-width:900px;margin:auto;padding:54px 24px;font-family:system-ui;color:#173b35}header p{color:#0f766e}input{width:100%;padding:14px;margin:24px 0;border:1px solid #99b7ae;border-radius:8px}nav{display:flex;gap:8px;flex-wrap:wrap}button{padding:9px 18px;border:0;border-radius:30px;background:#e1eee8;color:#173b35;cursor:pointer}button[aria-pressed=true]{background:#146c5c;color:white}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:30px}article{padding:24px;border:1px solid #d6e5dc;border-radius:12px}small{color:#0f766e}
</style>
