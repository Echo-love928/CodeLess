import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Trusted deterministic Vue proposals only. No model provider or runtime quality claim.
export async function fixture(root) {
  await mkdir(join(root, 'src/pages'), { recursive: true })
  await mkdir(join(root, 'src/components'), { recursive: true })
  await mkdir(join(root, 'src/data'), { recursive: true })
  await writeFile(join(root, 'src/components/WorkCard.vue'), `<script setup lang="ts">
defineProps<{ title: string }>()
</script>
<template><article data-ai-component="work-card"><h3>{{ title }}</h3><p>代表作品的说明</p></article></template>
<style scoped>article { color:rgb(0, 0, 0); padding:12px; border-radius:4px; border:1px solid #ccc; }</style>`)
  await writeFile(join(root, 'src/data/stable.ts'), 'export const unchanged = "unrelated data must stay byte-identical"\n')
  const source = `<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkCard from '../components/WorkCard.vue'
const params = new URLSearchParams(location.search)
const id = params.get('case') ?? 'SHOW-01'
const section = ref('关于我'), registered = ref(false), title = ref(''), quantity = ref(1), query = ref(''), category = ref('全部')
type Item = { title:string; done:boolean; stage:number; quantity:number }
const tasks = ref<Item[]>(JSON.parse(localStorage.getItem('d21-fixture') ?? '[]'))
watch(tasks, value => { if (!params.has('noStorage')) localStorage.setItem('d21-fixture', JSON.stringify(value)) }, { deep:true, flush:'sync' })
const pending = computed(() => tasks.value.filter(task => !task.done).length)
function add() { if (title.value.trim()) { tasks.value.push({ title:title.value.trim(), done:false, stage:0, quantity:quantity.value }); title.value='' } }
function remove(item:Item) { tasks.value = tasks.value.filter(task => task !== item) }
const count = id === 'CAT-01' ? 8 : id === 'CAT-02' ? 6 : 9
const categories = id === 'CAT-01' ? ['小说','科技','历史'] : id === 'CAT-02' ? ['西湖区','上城区','拱墅区'] : ['构建','测试','文档']
const items = Array.from({ length:count }, (_, i) => ({ name:'条目'+i, author:'作者'+i, category:categories[i%3], description:'简介'+i }))
const filtered = computed(() => items.filter(item => (category.value === '全部' || item.category === category.value) && (item.name.includes(query.value) || item.author.includes(query.value))))
const selected = ref<typeof items[number] | null>(null)
if (params.has('runtimeError')) setTimeout(() => { throw new Error('D21 explicit runtime fault') }, 0)
</script>
<template><main data-ai-component="home-page">
<template v-if="!params.has('blank')">
<template v-if="id === 'SHOW-01'"><h1>Grace Hopper</h1><p>计算机科学先驱，COBOL 语言的推动者</p>
<WorkCard v-for="name in ['Harvard Mark I 编程','A-0 编译器','COBOL 标准化']" :key="name" :title="name"/><p>grace.hopper@example.com</p></template>
<template v-if="id === 'SHOW-02'"><h1>2026 杭州前端开发者大会</h1><p>2026年11月20日</p><p>杭州国际博览中心</p>
<ul><li>09:00 开幕致辞</li><li>10:30 Vue 性能优化实战</li><li>14:00 无障碍设计实践</li></ul>
<button @click="registered=true">我要报名</button><p v-if="registered">报名意向已记录（演示）</p></template>
<template v-if="id === 'SHOW-03'"><nav><button v-for="name in ['关于我','作品集','联系方式']" :key="name" @click="section=name">{{ name }}</button></nav>
<section v-if="section==='关于我'"><h1>关于我</h1><p>林夏</p></section>
<section v-if="section==='作品集'"><h1>作品集</h1><article v-for="n in 4" :key="n"><h2>作品{{ n }}</h2><p>地点{{ n }}</p><div style="height:30px;background:teal"></div></article></section>
<section v-if="section==='联系方式'"><h1>联系方式</h1><p>linxia@example.com</p></section></template>
<template v-if="id.startsWith('TASK-')"><h1>个人待办清单</h1><p v-if="id==='TASK-01'">未完成：{{ pending }}</p>
<input v-model="title" aria-label="标题"/><input v-if="id==='TASK-03'" v-model.number="quantity" type="number" aria-label="数量"/>
<button @click="add">{{ id==='TASK-03' ? '加入清单' : '添加' }}</button>
<template v-if="id==='TASK-02'"><section v-for="(name,index) in ['待开始','进行中','已完成']" :key="name"><h2>{{ name }}</h2><ul>
<li v-for="item in tasks.filter(task => task.stage===index)" :key="item.title"><span>{{ item.title }}</span><button @click="item.stage=Math.min(2,item.stage+1)">下一步</button><button @click="remove(item)">删除</button></li></ul></section></template>
<template v-else><ul><li v-for="item in tasks" :key="item.title"><span>{{ item.title }}</span><span v-if="id==='TASK-03'">{{ item.quantity }}</span><input v-model="item.done" type="checkbox" aria-label="已购买或完成"/><button @click="remove(item)">删除</button></li></ul>
<button v-if="id==='TASK-03'" @click="tasks=tasks.filter(item=>!item.done)">清除已购买</button></template></template>
<template v-if="id.startsWith('CAT-')"><h1>目录</h1><input v-model="query" aria-label="搜索"/>
<select v-if="id==='CAT-02'" v-model="category" aria-label="城区"><option v-for="name in ['全部',...categories]" :key="name">{{ name }}</option></select>
<nav v-else><button v-for="name in ['全部',...categories]" :key="name" @click="category=name">{{ name }}</button></nav>
<article v-for="item in filtered" :key="item.name" @click="selected=item"><h2>{{ item.name }}</h2><p>{{ item.author }}</p><p>{{ item.category }}</p><p>{{ item.description }}</p></article>
<p v-if="!filtered.length">没有匹配的工具</p><section v-if="selected" role="region" aria-label="详情"><h2>详情</h2><p>{{ selected.name }}</p><p>{{ selected.author }}</p><p>{{ selected.category }}</p><p>{{ selected.description }}</p></section></template>
</template></main></template>`
  for (const name of ['HomePage', 'TasksPage', 'CatalogPage']) await writeFile(join(root, `src/pages/${name}.vue`), name === 'TasksPage' ? source.replace('data-ai-component="home-page"', 'data-ai-component="tasks-page"') : name === 'CatalogPage' ? source.replace('data-ai-component="home-page"', 'data-ai-component="catalog-page"') : source)
}

export async function changeFixture(root, edit) {
  const { readFile } = await import('node:fs/promises')
  const path = join(root, edit.file)
  let source = await readFile(path, 'utf8')
  if (edit.kind === 'text') source = source.replace(edit.before, edit.after)
  else { const property = edit.property === 'padding-top' ? 'padding' : edit.property; source = source.replace(`${property}:${edit.before}`, `${property}:${edit.after}`) }
  await writeFile(path, source)
}
