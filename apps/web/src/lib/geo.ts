export type LeafletCoordinate = [latitude: number, longitude: number]
export type GeoJsonPosition = [longitude: number, latitude: number]
export type GeoJsonPoint = { type: 'Point'; coordinates: GeoJsonPosition }

function assertCoordinates(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new RangeError('Coordinates are outside valid latitude/longitude bounds')
  }
}

export function toGeoJson([latitude, longitude]: LeafletCoordinate): GeoJsonPoint {
  assertCoordinates(latitude, longitude)
  return { type: 'Point', coordinates: [longitude, latitude] }
}

export function toLeaflet(point: GeoJsonPoint | GeoJsonPosition): LeafletCoordinate {
  const [longitude, latitude] = Array.isArray(point) ? point : point.coordinates
  assertCoordinates(latitude, longitude)
  return [latitude, longitude]
}