import { createRouter, createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'
import AppsView from './views/AppsView.vue'
import WorkbenchView from './views/WorkbenchView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/apps', name: 'apps', component: AppsView },
    { path: '/workbench/:id', name: 'workbench', component: WorkbenchView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/apps' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
