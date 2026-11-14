import { apiClient, setAccessToken } from './client'
import type { AuthSession, User } from './types'

export async function login(email: string, password: string): Promise<User> {
  const session = await apiClient.post<AuthSession>('/auth/login', { email, password })
  setAccessToken(session.accessToken)
  return session.user
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<{ loggedOut: boolean }>('/auth/logout')
  } finally {
    setAccessToken(null)
  }
}

export function getCurrentUser() {
  return apiClient.get<User>('/auth/me')
}