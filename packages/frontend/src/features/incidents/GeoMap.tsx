import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Mechanic } from '../../api/types'
import { toGeoJson, toLeaflet, type GeoJsonPoint } from '../../lib/geo'
import 'leaflet/dist/leaflet.css'

const mechanicColors = {
  in_house: '#0f766e',
  partner_garage: '#2563eb',
  towing: '#c2410c',
}

function MapCenter({ point, zoom }: { point: GeoJsonPoint; zoom: number }) {
  const map = useMap()
  const [latitude, longitude] = toLeaflet(point)
  useEffect(() => {
    map.setView([latitude, longitude], zoom)
  }, [latitude, longitude, map, zoom])
  return null
}

function MapClickCapture({ enabled, onPlace }: { enabled: boolean; onPlace?: (point: GeoJsonPoint) => void }) {
  useMapEvents({
    click(event) {
      if (enabled && onPlace) onPlace(toGeoJson([event.latlng.lat, event.latlng.lng]))
    },
  })
  return null
}

export function GeoMap({
  mechanics = [],
  center,
  zoom = 12,
  selectedMechanicId,
  marker,
  placementEnabled = false,
  onPlace,
  onMechanicSelect,
  className = '',
}: {
  mechanics?: Mechanic[]
  center: GeoJsonPoint
  zoom?: number
  selectedMechanicId?: string
  marker?: { point: GeoJsonPoint; label: string; tone?: 'danger' | 'default' }
  placementEnabled?: boolean
  onPlace?: (point: GeoJsonPoint) => void
  onMechanicSelect?: (mechanicId: string) => void
  className?: string
}) {
  const mapCenter = toLeaflet(center)
  const markerPosition = marker ? toLeaflet(marker.point) : null

  return (
    <div className={`geo-map ${className}`}>
      <MapContainer center={mapCenter} scrollWheelZoom={false} style={{ height: '100%', minHeight: 280, width: '100%' }} zoom={zoom}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapCenter point={center} zoom={zoom} />
        <MapClickCapture enabled={placementEnabled} onPlace={onPlace} />
        {mechanics.map((mechanic) => {
          const position = toLeaflet(mechanic.location)
          const color = mechanicColors[mechanic.type]
          return <CircleMarker
            center={position}
            eventHandlers={{ click: () => onMechanicSelect?.(mechanic.id) }}
            key={mechanic.id}
            pathOptions={{ color, fillColor: color, fillOpacity: selectedMechanicId === mechanic.id ? 1 : 0.78, weight: selectedMechanicId === mechanic.id ? 4 : 2 }}
            radius={selectedMechanicId === mechanic.id ? 9 : 7}
          ><Popup>{mechanic.name}<br />{mechanic.town}, {mechanic.county}</Popup></CircleMarker>
        })}
        {marker && markerPosition && <CircleMarker
          center={markerPosition}
          pathOptions={{ color: marker.tone === 'danger' ? '#b91c1c' : '#111827', fillColor: marker.tone === 'danger' ? '#ef4444' : '#facc15', fillOpacity: 0.95, weight: 3 }}
          radius={11}
        ><Popup>{marker.label}</Popup></CircleMarker>}
      </MapContainer>
    </div>
  )
}