import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vehicle } from '../../api/types'
import { useVehicles } from '../../api/queries'
import { HomePage } from './HomePage'

vi.mock('../../api/queries', () => ({ useVehicles: vi.fn() }))

const vehicle: Vehicle = {
  id: 'car-01',
  make: 'Toyota',
  model: 'Prado TX',
  category: 'SUV',
  year: 2023,
  registration: 'KDA 101A',
  seats: 7,
  transmission: 'automatic',
  ratePerDay: 18000,
  status: 'available',
}

function LocationOutput() {
  const location = useLocation()
  return <output aria-label="Current location">{location.pathname}{location.search}</output>
}

function renderHome(data: Vehicle[]) {
  vi.mocked(useVehicles).mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() } as never)
  return render(<MemoryRouter initialEntries={['/']}><LocationOutput /><Routes><Route element={<HomePage />} path="/" /><Route element={<div />} path="/vehicles" /></Routes></MemoryRouter>)
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function fillBooking(values: { rentalAt: string; returnAt: string }) {
  fireEvent.change(screen.getByLabelText('Car type'), { target: { value: 'SUV' } })
  fireEvent.change(screen.getByLabelText('Place of rental'), { target: { value: 'Nairobi CBD' } })
  fireEvent.change(screen.getByLabelText('Place of return'), { target: { value: 'Westlands' } })
  fireEvent.change(screen.getByLabelText('Rental date and time (EAT)'), { target: { value: values.rentalAt } })
  fireEvent.change(screen.getByLabelText('Return date and time (EAT)'), { target: { value: values.returnAt } })
}

describe('home page booking form', () => {
  it('rejects rental times in the past', async () => {
    renderHome([vehicle])
    fillBooking({ rentalAt: '2020-01-02T10:30', returnAt: '2020-01-05T10:30' })
    fireEvent.click(screen.getByRole('button', { name: 'Book now' }))
    expect(await screen.findByText('Rental time cannot be in the past.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/')
  })

  it('rejects a return that is not after the rental time', async () => {
    renderHome([vehicle])
    fillBooking({ rentalAt: '2027-01-05T10:30', returnAt: '2027-01-02T10:30' })
    fireEvent.click(screen.getByRole('button', { name: 'Book now' }))
    expect(await screen.findByText('Return must be after the rental time.')).toBeInTheDocument()
  })

  it('navigates with API category, EAT-converted times, and locations', async () => {
    renderHome([vehicle])
    fillBooking({ rentalAt: '2027-01-02T10:30', returnAt: '2027-01-05T10:30' })
    fireEvent.click(screen.getByRole('button', { name: 'Book now' }))
    const location = screen.getByLabelText('Current location').textContent ?? ''
    const query = new URLSearchParams(location.slice(location.indexOf('?') + 1))
    expect(location).toContain('/vehicles?')
    expect(query.get('category')).toBe('SUV')
    expect(query.get('from')).toBe('2027-01-02T07:30:00.000Z')
    expect(query.get('to')).toBe('2027-01-05T07:30:00.000Z')
    expect(query.get('pickup')).toBe('Nairobi CBD')
    expect(query.get('return')).toBe('Westlands')
  })

  it('shows an empty state instead of a broken featured grid when the API has no vehicles', () => {
    const { container } = renderHome([])
    expect(screen.getByText('No featured cars yet')).toBeInTheDocument()
    expect(container.querySelector('.home-vehicle-grid')).toBeNull()
  })
})