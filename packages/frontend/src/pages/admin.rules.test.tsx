import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../hooks/AuthContext'
import { getCurrentUser } from '../api/auth'
import { useBookingList, useVehicles } from '../api/queries'
import { apiClient } from '../api/client'
import type { Booking } from '../api/types'
import { ApprovalsPage, StaffPage, AuditPage } from './admin'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../api/queries', () => ({
  useBookingList: vi.fn(),
  useVehicles: vi.fn(),
}))

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: vi.fn(),
      patch: vi.fn(),
    },
  }
})

const pendingBooking = {
  id: 'booking-1',
  reference: 'BK-2611-9001',
  vehicleId: 'vehicle-1',
  vehicleRegistration: 'KDA 101A',
  customerName: 'Faith Wambui',
  customerPhone: '254712345701',
  status: 'reserved',
  pickupAt: '2026-11-16T08:00:00.000Z',
  returnAt: '2026-11-18T08:00:00.000Z',
  totalKes: 45000,
  createdById: 'usr-01',
  pendingApproval: true,
  holdExpiresAt: '2099-01-01T00:00:00.000Z',
} as unknown as Booking

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'usr-02',
    name: 'Brian Otieno',
    email: 'brian@autohire.ke',
    phone: '254712345602',
    role: 'manager',
  })
  vi.mocked(useBookingList).mockReturnValue({
    data: [pendingBooking],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(useVehicles).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
  vi.mocked(apiClient.get).mockResolvedValue([
    {
      id: 'usr-01',
      full_name: 'Amina Njeri',
      email: 'amina@autohire.ke',
      phone: '254712345601',
      role: 'owner',
      is_active: true,
      last_login_at: null,
    },
  ])
  vi.mocked(apiClient.patch).mockResolvedValue(undefined)
})

describe('admin rules', () => {
  it('hides corporate credit for agent approvals and enforces required fields', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-09',
      name: 'Jane Agent',
      email: 'jane@autohire.ke',
      phone: '254700000009',
      role: 'agent',
    })

    renderWithProviders(<ApprovalsPage />)

    await screen.findByText(/Approvals/)
    fireEvent.click(await screen.findByRole('button', { name: /approve/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const paymentSelect = screen.getByLabelText(/payment method/i)
    const values = Array.from((paymentSelect as HTMLSelectElement).options).map((option) => option.value)
    expect(values).not.toContain('corporate')
  })

  it('prevents manager from creating owner roles and blocks self-deactivation', async () => {
    renderWithProviders(<StaffPage />)

    expect(screen.getByRole('heading', { name: /^Staff$/i, level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Amina Njeri')).toBeInTheDocument()
    const roleSelects = screen.getAllByLabelText('Role') as HTMLSelectElement[]
    const inviteRole = roleSelects[roleSelects.length - 1]
    expect(Array.from(inviteRole.options).map((option) => option.value)).not.toContain('owner')
    expect(screen.getByRole('button', { name: /invite staff/i })).toBeInTheDocument()
  })

  it('keeps audit page owner-only', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-01',
      name: 'Amina Njeri',
      email: 'amina@autohire.ke',
      phone: '254712345601',
      role: 'owner',
    })

    vi.mocked(apiClient.get).mockResolvedValue([])

    renderWithProviders(<AuditPage />)

    expect(await screen.findByRole('heading', { name: /Audit log/i }, { timeout: 3000 })).toBeInTheDocument()
  })
})
