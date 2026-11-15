import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ApiError } from '../../api/client'
import type { User, UserRole } from '../../api/types'
import { AuthProvider } from '../../hooks/AuthContext'
import { ProtectedContent } from '../../components/ProtectedRoute'
import { ForbiddenPage } from '../../pages/AccessPages'
import { getCurrentUser, login } from '../../api/auth'
import { LoginPage } from './LoginPage'

vi.mock('../../api/auth', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))

function makeUser(role: UserRole): User {
  return { id: `test-${role}`, name: 'Test Staff', email: 'staff@autohire.ke', phone: '254712345678', role }
}

function ManagerWorkspace() {
  const location = useLocation()
  return <p>Manager workspace {location.search}</p>
}

function renderAuthRoutes(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<ProtectedContent roles={['manager']}><ManagerWorkspace /></ProtectedContent>} path="/admin/manager-only" />
          <Route element={<p>Office home</p>} path="/admin" />
          <Route element={<ForbiddenPage />} path="/403" />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function submitCredentials(password = 'wrong-password') {
  const actor = userEvent.setup()
  await actor.type(await screen.findByLabelText('Work email'), 'staff@autohire.ke')
  await actor.type(screen.getByLabelText('Password'), password)
  await actor.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('staff login', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError('Unauthenticated', 401))
    vi.mocked(login).mockReset()
  })

  afterEach(() => cleanup())

  it('shows one generic wrong-credentials message', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError('Invalid email or password', 401))
    renderAuthRoutes()
    await submitCredentials()
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  })

  it('shows retry guidance for rate limiting', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError('Too many requests', 429, 'RATE_LIMITED', 45))
    renderAuthRoutes()
    await submitCredentials('any-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('wait about 45 seconds')
  })

  it('clearly explains a deactivated account', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError('Disabled', 403, 'ACCOUNT_DEACTIVATED'))
    renderAuthRoutes()
    await submitCredentials('any-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('This account has been deactivated.')
  })

  it('offers retry after a network error', async () => {
    vi.mocked(login).mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(makeUser('agent'))
    renderAuthRoutes()
    await submitCredentials('any-password')
    const retry = await screen.findByRole('button', { name: 'Retry' })
    await userEvent.click(retry)
    expect(await screen.findByText('Office home')).toBeInTheDocument()
  })

  it('returns to the originally requested protected route after login', async () => {
    vi.mocked(login).mockResolvedValueOnce(makeUser('manager'))
    renderAuthRoutes('/admin/manager-only?view=week')
    await submitCredentials('correct-password')
    expect(await screen.findByText('Manager workspace ?view=week')).toBeInTheDocument()
  })

  it('sends an agent to 403 on a manager-only route', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser('agent'))
    renderAuthRoutes('/admin/manager-only')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument())
  })
})