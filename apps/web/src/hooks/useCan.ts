import { useAuth } from './AuthContext'
import type { UserRole } from '../api/types'

export type Permission =
  | 'dashboard:view'
  | 'timeline:view'
  | 'vehicles:read'
  | 'vehicles:manage'
  | 'bookings:create'
  | 'payments:record'
  | 'approvals:offline'
  | 'booking:approve-corporate'
  | 'handover:manage'
  | 'drivers:assign'
  | 'mechanics:read'
  | 'mechanics:dispatch'
  | 'incidents:manage'
  | 'staff:manage'
  | 'audit:read'
  | 'settings:manage'
  | 'trips:read-own'
  | 'maintenance:read'

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  owner: [
    'dashboard:view', 'timeline:view', 'vehicles:read', 'vehicles:manage', 'bookings:create',
    'payments:record', 'approvals:offline', 'booking:approve-corporate', 'handover:manage',
    'drivers:assign', 'mechanics:read', 'mechanics:dispatch', 'incidents:manage', 'staff:manage',
    'audit:read', 'settings:manage', 'maintenance:read',
  ],
  manager: [
    'dashboard:view', 'timeline:view', 'vehicles:read', 'vehicles:manage', 'bookings:create',
    'payments:record', 'approvals:offline', 'booking:approve-corporate', 'handover:manage',
    'drivers:assign', 'mechanics:read', 'mechanics:dispatch', 'incidents:manage', 'staff:manage',
    'maintenance:read',
  ],
  agent: [
    'dashboard:view', 'timeline:view', 'vehicles:read', 'bookings:create', 'payments:record',
    'approvals:offline', 'handover:manage', 'drivers:assign', 'mechanics:read',
    'mechanics:dispatch', 'incidents:manage',
  ],
  driver: ['handover:manage', 'mechanics:read', 'trips:read-own'],
  mechanic: ['vehicles:read', 'incidents:manage', 'maintenance:read'],
}

export function roleHasPermission(role: UserRole | null, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false
}

export function canApproveBooking(approverId: string, createdById: string): boolean {
  return Boolean(approverId) && approverId !== createdById
}

export function useCan(permission: Permission): boolean {
  const { role } = useAuth()
  return roleHasPermission(role, permission)
}