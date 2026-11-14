import type { DashboardCardKey } from '../../api/types'

export const DASHBOARD_KPI_ROUTES: Record<DashboardCardKey, string> = {
  vehiclesOutToday: '/admin/bookings?status=active',
  pickupsDueToday: '/admin/bookings?pickup=due-today',
  returnsDueToday: '/admin/bookings?return=due-today',
  overdueVehicles: '/admin/bookings?status=overdue',
  pendingApprovals: '/admin/approvals?status=pending',
  activeBreakdowns: '/admin/incidents?status=active',
  monthlyRevenue: '/admin/bookings?period=current-month&status=completed',
}