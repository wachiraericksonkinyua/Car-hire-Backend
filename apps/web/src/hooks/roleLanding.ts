import type { UserRole } from '../api/types'

export function getRoleLandingPath(role: UserRole): string {
  if (role === 'driver') return '/admin/my-trips'
  if (role === 'mechanic') return '/admin/incidents'
  return '/admin'
}