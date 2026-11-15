import { formatInTimeZone } from 'date-fns-tz'
import type { Booking, DashboardData, Incident, SearchResult, Vehicle } from '../../api/types'
import { bookings as bookingFixtures, customers, incidents as incidentFixtures, vehicles as vehicleFixtures } from '../../mocks/fixtures'

const activeBookingStatuses = new Set(['checked_out', 'overdue', 'active'])

export function buildDashboardData(
  vehicles: Vehicle[] = vehicleFixtures,
  bookings: Booking[] = bookingFixtures,
  incidents: Incident[] = incidentFixtures,
  now: Date = new Date(),
): DashboardData {
  const today = formatInTimeZone(now, 'Africa/Nairobi', 'yyyy-MM-dd')
  const month = today.slice(0, 7)
  const pickups = bookings.filter((booking) =>
    booking.status === 'confirmed' &&
    formatInTimeZone(booking.pickupAt, 'Africa/Nairobi', 'yyyy-MM-dd') === today,
  )
  const returns = bookings.filter((booking) =>
    activeBookingStatuses.has(booking.status) &&
    formatInTimeZone(booking.returnAt, 'Africa/Nairobi', 'yyyy-MM-dd') === today,
  )
  const rentedVehicleIds = new Set(
    bookings.filter((booking) => activeBookingStatuses.has(booking.status)).map((booking) => booking.vehicleId),
  )

  const fleetStatus = { available: 0, rented: 0, reserved: 0, maintenance: 0 }
  for (const vehicle of vehicles) {
    if (vehicle.status === 'maintenance') fleetStatus.maintenance += 1
    else if (rentedVehicleIds.has(vehicle.id)) fleetStatus.rented += 1
    else if (vehicle.status === 'booked') fleetStatus.reserved += 1
    else if (vehicle.status === 'available') fleetStatus.available += 1
  }

  const recentActivity = [...bookings]
    .sort((left, right) => right.pickupAt.localeCompare(left.pickupAt))
    .slice(0, 5)
    .map((booking) => ({
      id: booking.id,
      kind: 'booking' as const,
      reference: booking.reference,
      timestamp: booking.pickupAt,
    }))

  return {
    metrics: {
      vehiclesOutToday: bookings.filter((booking) => activeBookingStatuses.has(booking.status)).length,
      pickupsDueToday: pickups.length,
      returnsDueToday: returns.length,
      overdueVehicles: bookings.filter((booking) => booking.status === 'overdue').length,
      pendingApprovals: bookings.filter((booking) => booking.status === 'reserved' && booking.pendingApproval).length,
      activeBreakdowns: incidents.filter((incident) => incident.status !== 'resolved').length,
      monthlyRevenue: bookings
        .filter((booking) => booking.status === 'completed' && booking.pickupAt.slice(0, 7) === month)
        .reduce((total, booking) => total + booking.totalKes, 0),
    },
    pickups,
    returns,
    fleetStatus,
    recentActivity,
  }
}

export function searchFixtures(query: string): SearchResult[] {
  const term = query.trim().toLocaleLowerCase()
  if (term.length < 2) return []

  const vehicleResults: SearchResult[] = vehicleFixtures
    .filter((vehicle) => `${vehicle.registration} ${vehicle.make} ${vehicle.model}`.toLocaleLowerCase().includes(term))
    .map((vehicle) => ({
      id: vehicle.id,
      type: 'vehicle',
      title: `${vehicle.make} ${vehicle.model}`,
      subtitle: vehicle.registration,
      href: `/admin/vehicles/${vehicle.id}`,
    }))
  const bookingResults: SearchResult[] = bookingFixtures
    .filter((booking) => booking.reference.toLocaleLowerCase().includes(term))
    .map((booking) => ({
      id: booking.id,
      type: 'booking',
      title: booking.reference,
      subtitle: booking.customerName ?? '',
      href: `/admin/bookings/${booking.id}`,
    }))
  const customerResults: SearchResult[] = customers
    .filter((customer) => customer.name.toLocaleLowerCase().includes(term))
    .map((customer) => ({
      id: customer.id,
      type: 'customer',
      title: customer.name,
      subtitle: '',
      href: `/admin/bookings?customerId=${customer.id}`,
    }))
  return [...vehicleResults, ...bookingResults, ...customerResults].slice(0, 8)
}

export function getOpenIncidents() {
  return incidentFixtures.filter((incident) => incident.status === 'open')
}

export function getPendingApprovalCount() {
  return bookingFixtures.filter((booking) => booking.status === 'reserved' && booking.pendingApproval).length
}