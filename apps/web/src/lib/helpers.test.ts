import { describe, expect, it } from 'vitest'
import { formatEat, formatKes, toUtc } from './format'
import { toGeoJson, toLeaflet } from './geo'
import { formatKenyanPhone, isKenyanPhone, normalisePhone } from './phone'

describe('KES and EAT helpers', () => {
  it('formats integer KES values and rejects fractional money', () => {
    expect(formatKes(12500)).toBe('KES 12,500')
    expect(() => formatKes(12.5)).toThrow(TypeError)
  })

  it('formats UTC timestamps in Nairobi time and converts EAT input to UTC', () => {
    expect(formatEat('2026-01-02T06:00:00.000Z')).toBe('02 Jan 2026, 09:00')
    expect(toUtc('2026-01-02T09:00')).toBe('2026-01-02T06:00:00.000Z')
    expect(() => toUtc('not-a-date')).toThrow(TypeError)
  })
})

describe('Kenyan phone helpers', () => {
  it.each([
    ['0712 345 678', '254712345678'],
    ['+254 712 345 678', '254712345678'],
    ['0112-345-678', '254112345678'],
    ['112345678', '254112345678'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected)
  })

  it('validates both Kenyan mobile prefixes and formats for display', () => {
    expect(isKenyanPhone('0712 345 678')).toBe(true)
    expect(isKenyanPhone('+254 112 345 678')).toBe(true)
    expect(isKenyanPhone('020 123 4567')).toBe(false)
    expect(isKenyanPhone('07123')).toBe(false)
    expect(formatKenyanPhone('254712345678')).toBe('0712 345 678')
  })
})

describe('coordinate conversion helpers', () => {
  it('converts Leaflet latitude/longitude order into GeoJSON longitude/latitude', () => {
    expect(toGeoJson([-1.2864, 36.8172])).toEqual({
      type: 'Point',
      coordinates: [36.8172, -1.2864],
    })
  })

  it('converts GeoJSON points and positions into Leaflet order', () => {
    expect(toLeaflet({ type: 'Point', coordinates: [36.8172, -1.2864] })).toEqual([
      -1.2864,
      36.8172,
    ])
    expect(toLeaflet([36.8172, -1.2864])).toEqual([-1.2864, 36.8172])
    expect(() => toLeaflet([181, 0])).toThrow(RangeError)
    expect(() => toGeoJson([91, 0])).toThrow(RangeError)
  })
})