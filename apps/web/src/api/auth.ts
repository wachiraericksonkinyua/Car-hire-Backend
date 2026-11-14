import { apiClient, setAccessToken } from './client'
import type { User } from './types'

interface BackendUser {
  id: string
  email: string
  full_name: string
  role: User['role']
  is_active: boolean
}

function mapUser(user: BackendUser): User {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    phone: '',
    role: user.role,
    active: user.is_active,
  }
}

export async function login(email: string, password: string): Promise<User> {
  const session = await apiClient.post<{ access_token: string; user: BackendUser }>('/auth/login', { email, password })
  setAccessToken(session.access_token)
  return mapUser(session.user)
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<{ message?: string }>('/auth/logout')
  } finally {
    setAccessToken(null)
  }
}

export async function getCurrentUser() {
  return mapUser(await apiClient.get<BackendUser>('/auth/me'))
}
