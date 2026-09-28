import { reactive } from 'vue'
import * as authApi from '../../api/auth'
import { ApiError } from '../../api/http'

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous' | 'unavailable'

export const session = reactive<{
  status: SessionStatus
  user: authApi.AuthUser | null
  csrfToken: string | null
}>({ status: 'unknown', user: null, csrfToken: null })

let pendingRestore: Promise<SessionStatus> | null = null

function accept(value: authApi.AuthSession) {
  if (!value?.user?.id || !value.csrfToken) throw new ApiError('server')
  session.user = value.user
  session.csrfToken = value.csrfToken
  session.status = 'authenticated'
}

export function clearSession(status: SessionStatus = 'anonymous') {
  session.user = null
  session.csrfToken = null
  session.status = status
}

export function restoreSession(force = false): Promise<SessionStatus> {
  if (!force && session.status !== 'unknown') return Promise.resolve(session.status)
  if (pendingRestore) return pendingRestore
  pendingRestore = authApi.getSession()
    .then(value => { accept(value); return session.status })
    .catch(error => {
      clearSession(error instanceof ApiError && error.kind === 'unauthorized' ? 'anonymous' : 'unavailable')
      return session.status
    })
    .finally(() => { pendingRestore = null })
  return pendingRestore
}

export async function signIn(email: string, password: string) {
  const value = await authApi.login(email, password)
  accept(value)
}

export async function signOut() {
  if (!session.csrfToken) { clearSession(); return }
  await authApi.logout(session.csrfToken)
  clearSession()
}
