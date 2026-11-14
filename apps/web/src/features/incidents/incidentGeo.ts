import type { Incident, Mechanic, NearbyMechanic } from '../../api/types'
import { toLeaflet } from '../../lib/geo'

const EARTH_RADIUS_KM = 6371

function distanceKm(from: [number, number], to: [number, number]) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const [fromLat, fromLng] = from.map(toRadians)
  const [toLat, toLng] = to.map(toRadians)
  const latitudeDelta = toLat - fromLat
  const longitudeDelta = toLng - fromLng
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(longitudeDelta / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function getNearestMechanics(
  mechanics: Mechanic[],
  incident: Pick<Incident, 'location'>,
  radiusKm = 50,
  limit = 5,
): NearbyMechanic[] {
  const incidentCoordinates = toLeaflet(incident.location)
  return mechanics
    .map((mechanic) => ({ ...mechanic, distanceKm: distanceKm(incidentCoordinates, toLeaflet(mechanic.location)) }))
    .filter((mechanic) => mechanic.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit)
}

export function approxDistanceLabel(distance: number): string {
  const roundedDistance = distance < 1 ? Math.round(distance * 1000) : Math.round(distance * 10) / 10
  return `approx. distance ${roundedDistance}${distance < 1 ? ' m' : ' km'}`
}