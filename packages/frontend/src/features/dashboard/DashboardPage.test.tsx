import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { UserRole } from '../../api/types'
import { buildDashboardData } from './dashboardData'
import { DashboardView } from './DashboardPage'

vi.mock('recharts', () => ({
  Cell: () => null,
  Pie: ({ children }: { children: ReactNode }) => <>{children}</>,
  PieChart: ({ children }: { children: ReactNode }) => <>{children}</>,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}))

function renderDashboard(role: UserRole, cardErrors?: Record<string, string>) {
  const data = buildDashboardData(undefined, undefined, undefined, new Date('2026-11-14T09:00:00.000Z'))
  data.cardErrors = cardErrors
  return render(<MemoryRouter><DashboardView data={data} failed={false} loading={false} onRetry={() => undefined} role={role} /></MemoryRouter>)
}

describe('DashboardView', () => {
  afterEach(() => cleanup())

  it('shows monthly revenue to owners and managers, but not agents', () => {
    const { unmount } = renderDashboard('owner')
    expect(screen.getByText('Monthly revenue')).toBeInTheDocument()
    unmount()
    renderDashboard('manager')
    expect(screen.getByText('Monthly revenue')).toBeInTheDocument()
    cleanup()
    renderDashboard('agent')
    expect(screen.queryByText('Monthly revenue')).not.toBeInTheDocument()
  })

  it('isolates a failed KPI while keeping other cards and panels visible', () => {
    renderDashboard('agent', { overdueVehicles: 'Overdue metric unavailable' })
    expect(screen.getByText('Overdue metric unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Vehicles out today/ })).toBeInTheDocument()
    expect(screen.getByText("Today's pickups")).toBeInTheDocument()
    expect(screen.getByText('Fleet status')).toBeInTheDocument()
  })
})