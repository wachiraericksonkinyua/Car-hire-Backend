import { describe, expect, it } from 'vitest'
import type { Booking } from '../../api/types'
import { buildBookingPrefillUrl, buildTimelineItems, getTimelineStatusColor, TURNAROUND_BUFFER_MS } from './timelineModel'

const booking: Booking = {
  id: 'booking-1',
  reference: 'BK-TEST-1',
  vehicleId: 'car-01',
  customerId: 'customer-1',
  status: 'overdue',
  pickupAt: '2026-11-14T06:00:00.000Z',
  returnAt: '2026-11-15T06:00:00.000Z',
  totalKes: 10000,
}

describe('fleet timeline model', () => {
  it('maps overdue bookings to the danger red and includes an overdue label', () => {
    const item = buildTimelineItems([booking], []).find((entry) => entry.kind === 'booking')
    expect(getTimelineStatusColor('overdue')).toBe('#b91c1c')
    expect(item?.title).toContain('OVERDUE')
    expect(item?.style?.backgroundColor).toBe('#b91c1c')
  })

  it('allocates the turnaround tail after the booking return time', () => {
    const items = buildTimelineItems([booking], [])
    const buffer = items.find((entry) => entry.kind === 'buffer')
    expect(buffer?.start_time).toBe(Date.parse(booking.returnAt))
    expect((buffer?.end_time ?? 0) - (buffer?.start_time ?? 0)).toBe(TURNAROUND_BUFFER_MS)
    expect(buffer?.style?.backgroundColor).not.toBe(getTimelineStatusColor('overdue'))
  })

  it('prefills vehicle and a 24-hour time range from an empty-cell click', () => {
    const time = Date.parse('2026-11-17T09:30:00.000Z')
    const url = new URL(buildBookingPrefillUrl('car-01', time), 'https://autohire.test')
    expect(url.pathname).toBe('/admin/bookings/new')
    expect(url.searchParams.get('vehicleId')).toBe('car-01')
    expect(url.searchParams.get('pickupAt')).toBe('2026-11-17T09:30:00.000Z')
    expect(url.searchParams.get('returnAt')).toBe('2026-11-18T09:30:00.000Z')
  })
})