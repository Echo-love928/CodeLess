import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import TasksPage from './pages/TasksPage.vue'
import CatalogPage from './pages/CatalogPage.vue'

// Template-owned placeholder pages export `templatePlaceholder`; generated pages replace them.
// A plan may fill only /tasks or /catalog. Then "/" opens that generated page instead of the
// home placeholder, so previews, published sites and exports start on generated content.
const pages = import.meta.glob<{ templatePlaceholder?: unknown }>(
  ['./pages/HomePage.vue', './pages/TasksPage.vue', './pages/CatalogPage.vue'], { eager: true })
const generated = (file: string) => pages[`./pages/${file}`]?.templatePlaceholder !== true
const entry = generated('HomePage.vue') ? null
  : generated('TasksPage.vue') ? '/tasks'
    : generated('CatalogPage.vue') ? '/catalog' : null
const home: RouteRecordRaw = entry ? { path: '/', redirect: entry } : { path: '/', component: HomePage }

export default createRouter({
  history: createWebHistory(),
  routes: [
    home,
    { path: '/tasks', component: TasksPage },
    { path: '/catalog', component: CatalogPage }
  ]
})
