import type { TimelineItemBase } from 'react-calendar-timeline'
import type { Booking, BookingStatus, Incident, MaintenanceWindow } from '../../api/types'

export const TURNAROUND_BUFFER_MS = 60 * 60 * 1000

const statusColors: Record<BookingStatus, string> = {
  reserved: '#2563eb',
  confirmed: '#0f766e',
  checked_out: '#15803d',
  expired: '#737373',
  pending: '#a16207',
  awaiting_approval: '#c2410c',
  approved: '#0f766e',
  active: '#16a34a',
  completed: '#475569',
  cancelled: '#737373',
  rejected: '#9f1239',
  overdue: '#b91c1c',
  draft: '#64748b',
}

const bufferColors: Record<BookingStatus, string> = {
  reserved: '#bfdbfe',
  confirmed: '#99f6e4',
  checked_out: '#bbf7d0',
  expired: '#e5e5e5',
  pending: '#fef3c7',
  awaiting_approval: '#fed7aa',
  approved: '#99f6e4',
  active: '#bbf7d0',
  completed: '#cbd5e1',
  cancelled: '#e5e5e5',
  rejected: '#fecdd3',
  overdue: '#fecaca',
  draft: '#cbd5e1',
}

export interface FleetTimelineItem extends TimelineItemBase<number> {
  kind: 'booking' | 'buffer' | 'maintenance' | 'incident_warning'
  bookingId?: string
  incidentId?: string
}

export function getTimelineStatusColor(status: BookingStatus): string {
  return statusColors[status]
}

export function buildTimelineItems(bookings: Booking[], windows: MaintenanceWindow[], bufferMs = TURNAROUND_BUFFER_MS, incidents: Incident[] = []): FleetTimelineItem[] {
  const items: FleetTimelineItem[] = []
  for (const booking of bookings) {
    const start = Date.parse(booking.pickupAt)
    const end = Date.parse(booking.returnAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const title = booking.status === 'overdue' ? `OVERDUE · ${booking.reference}` : booking.reference
    items.push({
      id: `booking:${booking.id}`,
      group: booking.vehicleId,
      title,
      start_time: start,
      end_time: end,
      canMove: false,
      canResize: false,
      className: `fleet-timeline__booking fleet-timeline__booking--${booking.status}`,
      style: { backgroundColor: getTimelineStatusColor(booking.status), borderColor: getTimelineStatusColor(booking.status) },
      kind: 'booking',
      bookingId: booking.id,
    })
    items.push({
      id: `buffer:${booking.id}`,
      group: booking.vehicleId,
      title: '',
      start_time: end,
      end_time: end + bufferMs,
      canMove: false,
      canResize: false,
      className: 'fleet-timeline__buffer',
      style: { backgroundColor: bufferColors[booking.status] },
      kind: 'buffer',
      bookingId: booking.id,
    })
  }
  for (const window of windows) {
    const start = Date.parse(window.startAt)
    const end = Date.parse(window.endAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    items.push({
      id: `maintenance:${window.id}`,
      group: window.vehicleId,
      title: `Maintenance · ${window.reason}`,
      start_time: start,
      end_time: end,
      canMove: false,
      canResize: false,
      className: 'fleet-timeline__maintenance',
      kind: 'maintenance',
    })
  }
  for (const incident of incidents) {
    if (!incident.immobilising || !incident.vehicleId || ['resolved'].includes(incident.status)) continue
    const createdAt = Date.parse(incident.createdAt)
    if (!Number.isFinite(createdAt)) continue
    const start = Math.min(createdAt, Date.now())
    const end = Math.max(createdAt + 24 * 60 * 60 * 1000, Date.now() + 2 * 60 * 60 * 1000)
    items.push({
      id: `incident:${incident.id}`,
      group: incident.vehicleId,
      title: `IMMOBILISING · ${incident.reference}`,
      start_time: start,
      end_time: end,
      canMove: false,
      canResize: false,
      className: 'fleet-timeline__incident-warning',
      kind: 'incident_warning',
      incidentId: incident.id,
    })
  }
  return items
}

export function buildBookingPrefillUrl(vehicleId: string | number, time: number): string {
  const start = new Date(time)
  const end = new Date(time + 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    vehicleId: String(vehicleId),
    pickupAt: start.toISOString(),
    returnAt: end.toISOString(),
  })
  return `/admin/bookings/new?${params.toString()}`
}