import { ApiError } from '../../api/http'
import { clearSession, session } from '../auth/session'
import { checkAdmin } from './admin-api'
import type { RouteRecordRaw } from 'vue-router'

export const adminRoute: RouteRecordRaw = {
  path: '/admin', name: 'admin', component: () => import('./AdminPage.vue'), meta: { requiresAuth: true },
  async beforeEnter() {
    if (session.user?.role !== 'ADMIN') return { path: '/apps', query: { reason: 'admin-required' } }
    try {
      if (await checkAdmin()) return true
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unauthorized') {
        clearSession()
        return { path: '/login', query: { redirect: '/admin', reason: 'required' } }
      }
    }
    return { path: '/apps', query: { reason: 'admin-unavailable' } }
  },
}
