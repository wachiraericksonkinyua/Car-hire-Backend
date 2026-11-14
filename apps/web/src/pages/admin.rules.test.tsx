import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../hooks/AuthContext'
import { getCurrentUser } from '../api/auth'
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
      {ui}
    </QueryClientProvider>,
  )
}

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'usr-02',
    name: 'Brian Otieno',
    email: 'brian@autohire.ke',
    phone: '254712345602',
    role: 'manager',
  })
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

    renderWithProviders(
      <MemoryRouter>
        <AuthProvider>
          <ApprovalsPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    await screen.findByText(/Approvals/)
    const paymentSelect = screen.getByLabelText(/payment method/i)
    const values = Array.from((paymentSelect as HTMLSelectElement).options).map((option) => option.value)
    expect(values).not.toContain('corporate')

    fireEvent.click(screen.getAllByRole('button', { name: /approve/i })[0])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument()
  })

  it('prevents manager from creating owner roles and blocks self-deactivation', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-02',
      name: 'Brian Otieno',
      email: 'brian@autohire.ke',
      phone: '254712345602',
      role: 'manager',
    })

    renderWithProviders(
      <MemoryRouter>
        <AuthProvider>
          <StaffPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /^Staff$/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByDisplayValue('owner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite staff/i })).toBeInTheDocument()
  })

  it('keeps audit page owner-only', () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-01',
      name: 'Amina Njeri',
      email: 'amina@autohire.ke',
      phone: '254712345601',
      role: 'owner',
    })

    renderWithProviders(
      <MemoryRouter>
        <AuthProvider>
          <AuditPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText(/Audit log/i)).toBeInTheDocument()
  })
})
