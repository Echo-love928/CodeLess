import { requestJson } from './http'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: 'USER' | 'ADMIN'
}

export interface AuthSession {
  user: AuthUser
  csrfToken: string
}

// D03-A contracts/auth/README.md. The server owns the HttpOnly cookie.
const base = '/api/v0/auth'

async function getCsrfToken() {
  const value = await requestJson<{ token: string }>(`${base}/csrf`)
  return value.token
}

export async function getSession(): Promise<AuthSession> {
  const user = await requestJson<AuthUser>(`${base}/me`)
  return { user, csrfToken: await getCsrfToken() }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const csrfToken = await getCsrfToken()
  const user = await requestJson<AuthUser>(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ email, password }),
  })
  return { user, csrfToken: await getCsrfToken() }
}

export function logout(csrfToken: string) {
  return requestJson<void>(`${base}/logout`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  })
}
