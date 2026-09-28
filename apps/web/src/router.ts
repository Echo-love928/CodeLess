import { createRouter, createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'
import AppsView from './views/AppsView.vue'
import WorkbenchView from './views/WorkbenchView.vue'
import { restoreSession, session } from './features/auth/session'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/apps', name: 'apps', component: AppsView, meta: { requiresAuth: true } },
    { path: '/workbench/:id', name: 'workbench', component: WorkbenchView, props: true, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/apps' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async to => {
  if (to.meta.requiresAuth) await restoreSession(true)
  else if (session.status === 'unknown') await restoreSession()
  if (to.meta.requiresAuth && session.status !== 'authenticated') {
    return { path: '/login', query: { redirect: to.fullPath, reason: session.status === 'unavailable' ? 'unavailable' : 'required' } }
  }
  if (to.path === '/login' && session.status === 'authenticated') return '/apps'
})
