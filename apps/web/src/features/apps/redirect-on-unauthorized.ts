import type { Router } from 'vue-router'
import { ApiError } from '../../api/http'
import { clearSession } from '../auth/session'

export async function redirectOnUnauthorized(cause: unknown, router: Router): Promise<boolean> {
  if (!(cause instanceof ApiError && cause.kind === 'unauthorized')) return false
  const redirect = router.currentRoute.value.fullPath
  clearSession()
  await router.replace({ path: '/login', query: { redirect, reason: 'expired' } })
  return true
}
