import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentUser } from '../api/auth'
import type { User, UserRole } from '../api/types'
import { AuthProvider } from './AuthContext'
import { canApproveBooking, useCan, type Permission } from './useCan'

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))

const roles: UserRole[] = ['owner', 'manager', 'agent', 'driver', 'mechanic']
const matrix: [Permission, UserRole[]][] = [
  ['dashboard:view', ['owner', 'manager', 'agent']],
  ['timeline:view', ['owner', 'manager', 'agent']],
  ['vehicles:read', ['owner', 'manager', 'agent', 'mechanic']],
  ['vehicles:manage', ['owner', 'manager']],
  ['bookings:create', ['owner', 'manager', 'agent']],
  ['payments:record', ['owner', 'manager', 'agent']],
  ['approvals:offline', ['owner', 'manager', 'agent']],
  ['booking:approve-corporate', ['owner', 'manager']],
  ['handover:manage', ['owner', 'manager', 'agent', 'driver']],
  ['drivers:assign', ['owner', 'manager', 'agent']],
  ['mechanics:read', ['owner', 'manager', 'agent', 'driver']],
  ['mechanics:dispatch', ['owner', 'manager', 'agent']],
  ['incidents:manage', ['owner', 'manager', 'agent', 'mechanic']],
  ['staff:manage', ['owner', 'manager']],
  ['audit:read', ['owner']],
  ['settings:manage', ['owner']],
  ['trips:read-own', ['driver']],
  ['maintenance:read', ['owner', 'manager', 'mechanic']],
]

function makeUser(role: UserRole): User {
  return { id: `test-${role}`, name: 'Test Staff', email: 'staff@autohire.ke', phone: '254712345678', role }
}

function PermissionProbe({ permission }: { permission: Permission }) {
  return <output data-testid={permission}>{String(useCan(permission))}</output>
}

function PermissionMatrix() {
  return <>{matrix.map(([permission]) => <PermissionProbe key={permission} permission={permission} />)}</>
}

describe('useCan documented section 5 matrix', () => {
  afterEach(() => cleanup())

  it('matches every capability row for all five roles', async () => {
    for (const role of roles) {
      vi.mocked(getCurrentUser).mockResolvedValue(makeUser(role))
      render(<AuthProvider><PermissionMatrix /></AuthProvider>)
      await waitFor(() => expect(screen.getByTestId('dashboard:view')).not.toBeEmptyDOMElement())
      for (const [permission, allowedRoles] of matrix) {
        expect(screen.getByTestId(permission)).toHaveTextContent(String(allowedRoles.includes(role)))
      }
      cleanup()
    }
  })

  it('prevents a booking creator from approving their own booking', () => {
    expect(canApproveBooking('staff-1', 'staff-1')).toBe(false)
    expect(canApproveBooking('staff-2', 'staff-1')).toBe(true)
    expect(canApproveBooking('', 'staff-1')).toBe(false)
  })
})