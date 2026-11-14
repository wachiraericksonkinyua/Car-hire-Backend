import { describe, expect, it } from 'vitest'
import { bookings, incidents, vehicles } from '../../mocks/fixtures'
import { buildDashboardData, searchFixtures } from './dashboardData'
import { DASHBOARD_KPI_ROUTES } from './dashboardConfig'

describe('dashboard fallback and search fixtures', () => {
  it('builds all seven dashboard metrics from seeded data', () => {
    const data = buildDashboardData(vehicles, bookings, incidents, new Date('2026-11-14T09:00:00.000Z'))
    expect(Object.keys(data.metrics)).toHaveLength(7)
    expect(data.metrics.pendingApprovals).toBeGreaterThan(0)
    expect(data.metrics.activeBreakdowns).toBe(2)
    expect(data.metrics.monthlyRevenue).toBeGreaterThan(0)
    expect(data.pickups.length).toBeGreaterThan(0)
    expect(Object.values(data.fleetStatus).reduce((sum, count) => sum + count, 0)).toBe(11)
  })

  it('finds vehicles by plate, bookings by reference, and customers by name', () => {
    expect(searchFixtures('KDA 101A')[0]).toMatchObject({ type: 'vehicle', title: 'Toyota Prado TX' })
    expect(searchFixtures('BK-2611-0001')[0]).toMatchObject({ type: 'booking', title: 'BK-2611-0001' })
    expect(searchFixtures('Faith Wambui')[0]).toMatchObject({ type: 'customer', title: 'Faith Wambui' })
    expect(searchFixtures('x')).toEqual([])
  })
})

describe('dashboard KPI deep links', () => {
  it.each([
    ['vehiclesOutToday', '/admin/bookings?status=active'],
    ['pickupsDueToday', '/admin/bookings?pickup=due-today'],
    ['returnsDueToday', '/admin/bookings?return=due-today'],
    ['overdueVehicles', '/admin/bookings?status=overdue'],
    ['pendingApprovals', '/admin/approvals?status=pending'],
    ['activeBreakdowns', '/admin/incidents?status=active'],
    ['monthlyRevenue', '/admin/bookings?period=current-month&status=completed'],
  ] as const)('maps %s to its filtered list', (key, route) => {
    expect(DASHBOARD_KPI_ROUTES[key]).toBe(route)
  })
})