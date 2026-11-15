import { describe, expect, it } from 'vitest'
import { incidents, mechanics } from '../../mocks/fixtures'
import { approxDistanceLabel, getNearestMechanics } from './incidentGeo'

describe('incident mechanic distances', () => {
  it('returns five mechanics inside 50 km sorted nearest first', () => {
    const nearest = getNearestMechanics(mechanics, incidents[0], 50, 5)
    expect(nearest).toHaveLength(5)
    expect(nearest.map((mechanic) => mechanic.distanceKm)).toEqual([...nearest.map((mechanic) => mechanic.distanceKm)].sort((left, right) => left - right))
    expect(nearest.every((mechanic) => mechanic.distanceKm <= 50)).toBe(true)
    expect(nearest.some((mechanic) => mechanic.county === 'Mombasa')).toBe(false)
  })

  it('labels straight-line distances as approximate', () => {
    expect(approxDistanceLabel(3.24)).toBe('approx. distance 3.2 km')
  })
})