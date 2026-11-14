import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, Vehicle } from '../../api/types'
import { useBookingList, useMaintenanceWindows, useVehicles } from '../../api/queries'
import { TimelinePage } from './TimelinePage'

type MockTimelineProps = {
  groups: { id: string }[]
  items: { id: string | number; title?: string; kind: string }[]
  onCanvasClick: (groupId: string | number, time: number) => void
  onItemClick: (itemId: string | number) => void
}

vi.mock('../../api/queries', () => ({
  useBookingList: vi.fn(),
  useMaintenanceWindows: vi.fn(),
  useVehicles: vi.fn(),
}))

vi.mock('react-calendar-timeline', async () => {
  const { createElement } = await import('react')
  return {
    default: (props: MockTimelineProps) => createElement('div', { 'data-testid': 'mock-calendar' },
      createElement('button', { onClick: () => props.onCanvasClick(props.groups[0].id, Date.parse('2026-11-18T08:00:00.000Z')) }, 'Create from empty cell'),
      ...props.items.filter((item) => item.kind === 'booking').map((item) => createElement('button', { key: item.id, onClick: () => props.onItemClick(item.id) }, item.title)),
    ),
    DateHeader: () => null,
    SidebarHeader: () => null,
    TimelineHeaders: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  }
})

const booking: Booking = {
  id: 'booking-test',
  reference: 'BK-TEST-1',
  vehicleId: 'car-01',
  customerId: 'customer-1',
  customerName: 'Test Customer',
  status: 'overdue',
  pickupAt: '2026-11-17T06:00:00.000Z',
  returnAt: '2026-11-18T06:00:00.000Z',
  totalKes: 25000,
}

const vehicle: Vehicle = {
  id: 'car-01',
  make: 'Toyota',
  model: 'Prado TX',
  year: 2023,
  registration: 'KDA 101A',
  seats: 7,
  transmission: 'automatic',
  ratePerDay: 18000,
  status: 'available',
}

function PrefilledBooking() {
  const location = useLocation()
  return <output aria-label="booking prefill">{location.search}</output>
}

function renderTimeline() {
  return render(
    <MemoryRouter initialEntries={['/admin/timeline']}>
      <Routes>
        <Route element={<TimelinePage />} path="/admin/timeline" />
        <Route element={<PrefilledBooking />} path="/admin/bookings/new" />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(useBookingList).mockReturnValue({ data: [booking], isLoading: false, isError: false, refetch: vi.fn() } as never)
  vi.mocked(useVehicles).mockReturnValue({ data: [vehicle], isLoading: false, isError: false, refetch: vi.fn() } as never)
  vi.mocked(useMaintenanceWindows).mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as never)
})

describe('fleet timeline interactions', () => {
  it('starts a booking from an empty vehicle cell with vehicle and time prefilled', () => {
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: 'Create from empty cell' }))
    const query = new URLSearchParams(screen.getByLabelText('booking prefill').textContent ?? '')
    expect(query.get('vehicleId')).toBe('car-01')
    expect(query.get('pickupAt')).toBe('2026-11-18T08:00:00.000Z')
    expect(query.get('returnAt')).toBe('2026-11-19T08:00:00.000Z')
  })
})