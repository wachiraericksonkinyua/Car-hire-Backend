import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '../../api/types'
import { useMyDriverTrips, useUpdateDriverTripStatus } from '../../api/queries'
import { MyTripsPage } from './MyTripsPage'

vi.mock('../../api/queries', () => ({ useMyDriverTrips: vi.fn(), useUpdateDriverTripStatus: vi.fn() }))
vi.mock('../../hooks/AuthContext', () => ({ useAuth: () => ({ user: { id: 'usr-04', name: 'Peter Mwangi' }, logout: vi.fn() }) }))

const ownTrip: Booking = {
  id: 'trip-own',
  reference: 'BK-OWN-01',
  vehicleId: 'car-01',
  vehicleRegistration: 'KDA 101A',
  customerId: 'customer-1',
  customerName: 'Own Customer',
  customerPhone: '254712345678',
  status: 'active',
  pickupAt: '2026-11-14T06:00:00.000Z',
  returnAt: '2026-11-14T15:00:00.000Z',
  totalKes: 10000,
  driver: { id: 'usr-04', name: 'Peter Mwangi', email: 'peter@autohire.ke', phone: '254112345604', role: 'driver' },
}

const otherTrip: Booking = {
  ...ownTrip,
  id: 'trip-other',
  reference: 'BK-OTHER-02',
  driver: { id: 'drv-02', name: 'Grace Wanjiru', email: 'grace.driver@autohire.ke', phone: '254712345620', role: 'driver' },
}

const mutateAsync = vi.fn()

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(useMyDriverTrips).mockReturnValue({ data: [ownTrip, otherTrip], isLoading: false, isError: false, refetch: vi.fn() } as never)
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue(ownTrip)
  vi.mocked(useUpdateDriverTripStatus).mockReturnValue({ mutateAsync, isPending: false } as never)
})

function renderTrips() {
  return render(<MemoryRouter><MyTripsPage /></MemoryRouter>)
}

describe('driver trip view', () => {
  it('shows only trips assigned to the signed-in driver', () => {
    renderTrips()
    expect(screen.getByText('BK-OWN-01')).toBeInTheDocument()
    expect(screen.queryByText('BK-OTHER-02')).not.toBeInTheDocument()
    expect(screen.getByText('KDA 101A')).toBeInTheDocument()
  })

  it('requires confirmation before advancing a trip status', async () => {
    renderTrips()
    fireEvent.click(screen.getAllByRole('button', { name: 'En Route to Pickup' })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ bookingId: 'trip-own', status: 'en_route_to_pickup' }))
  })
})