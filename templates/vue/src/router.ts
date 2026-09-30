import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import TasksPage from './pages/TasksPage.vue'
import CatalogPage from './pages/CatalogPage.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/tasks', component: TasksPage },
    { path: '/catalog', component: CatalogPage }
  ]
})
