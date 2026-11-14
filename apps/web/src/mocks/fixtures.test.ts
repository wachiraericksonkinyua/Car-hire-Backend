import { describe, expect, it } from 'vitest'
import { bookings, users, vehicles } from './fixtures'

describe('development fixtures', () => {
  it('provides the specified roles and fleet size', () => {
    expect(vehicles).toHaveLength(12)
    expect(users.map((user) => user.role)).toEqual(['owner', 'manager', 'agent', 'driver', 'mechanic'])
    expect(vehicles.map(({ make, model }) => `${make} ${model}`)).toContain('Toyota Prado TX')
    expect(vehicles.map(({ make, model }) => `${make} ${model}`)).toContain('Toyota Hiace')
    expect(vehicles.every((vehicle) => Number.isSafeInteger(vehicle.ratePerDay))).toBe(true)
  })

  it('provides 20 bookings across all fixture statuses', () => {
    expect(bookings).toHaveLength(20)
    expect(new Set(bookings.map((booking) => booking.status)).size).toBe(10)
  })
})