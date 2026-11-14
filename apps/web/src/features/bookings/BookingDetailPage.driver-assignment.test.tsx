import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Booking, Driver } from '../../api/types'
import { useAssignDriver, useAvailableDrivers, useBookingDetail, useUpdateBooking } from '../../api/queries'
import { BookingDetailPage } from './BookingDetailPage'

vi.mock('../../api/queries', () => ({
  useAssignDriver: vi.fn(),
  useAvailableDrivers: vi.fn(),
  useBookingDetail: vi.fn(),
  useUpdateBooking: vi.fn(),
}))
vi.mock('../../hooks/useCan', () => ({ useCan: () => true }))

const booking: Booking = {
  id: 'booking-driver-test',
  reference: 'BK-DRIVER-TEST',
  vehicleId: 'car-01',
  customerId: 'customer-1',
  status: 'confirmed',
  mode: 'chauffeur',
  pickupAt: '2026-12-01T06:00:00.000Z',
  returnAt: '2026-12-03T06:00:00.000Z',
  totalKes: 25000,
}

const validDriver: Driver = {
  id: 'driver-valid',
  name: 'Valid Driver',
  email: 'valid@autohire.ke',
  phone: '254712345678',
  role: 'driver',
  status: 'available',
  languages: ['English'],
  licenceClass: 'B',
  licenceExpiresAt: '2028-01-01T00:00:00.000Z',
  psvExpiresAt: '2028-01-01T00:00:00.000Z',
  rating: 4.8,
}

const expiredDriver: Driver = {
  ...validDriver,
  id: 'driver-expired',
  name: 'Expired Driver',
  licenceExpiresAt: '2025-01-01T00:00:00.000Z',
}

const assignMutateAsync = vi.fn()

beforeEach(() => {
  vi.mocked(useBookingDetail).mockReturnValue({ data: booking, isLoading: false, isError: false, refetch: vi.fn() } as never)
  vi.mocked(useUpdateBooking).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useAvailableDrivers).mockReturnValue({ data: { drivers: [validDriver, expiredDriver], autoAssignDriverId: validDriver.id }, isLoading: false, isError: false, refetch: vi.fn() } as never)
  assignMutateAsync.mockReset()
  assignMutateAsync.mockRejectedValue(new ApiError('Unavailable', 409, 'DRIVER_UNAVAILABLE'))
  vi.mocked(useAssignDriver).mockReturnValue({ mutateAsync: assignMutateAsync, isPending: false } as never)
})

function renderBookingDetail() {
  return render(<MemoryRouter initialEntries={['/admin/bookings/booking-driver-test']}><Routes><Route element={<BookingDetailPage />} path="/admin/bookings/:id" /></Routes></MemoryRouter>)
}

describe('booking driver assignment', () => {
  it('never offers an expired driver and explains a 409 assignment race', async () => {
    renderBookingDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Assign driver' }))
    const driverSelect = screen.getByLabelText('Available drivers')
    expect(Array.from((driverSelect as HTMLSelectElement).options).map((option) => option.textContent)).toContain('Valid Driver · B · 4.8 / 5')
    expect(Array.from((driverSelect as HTMLSelectElement).options).some((option) => option.textContent?.includes('Expired Driver'))).toBe(false)
    fireEvent.change(driverSelect, { target: { value: validDriver.id } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign driver' })[1])
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/just assigned to another booking/i))
    expect(assignMutateAsync).toHaveBeenCalledWith(validDriver.id)
  })
})