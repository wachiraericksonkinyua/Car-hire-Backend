import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Clock3, MapPin, Wrench } from 'lucide-react'
import { useBookings, useDispatchIncident, useIncidents, useNearestMechanics, useVehicles } from '../../api/queries'
import type { Incident, IncidentDispatchType, NearbyMechanic } from '../../api/types'
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, Select, Skeleton } from '../../components/ui'
import { formatEat, formatKes } from '../../lib'
import { toLeaflet } from '../../lib/geo'
import { approxDistanceLabel } from './incidentGeo'
import { GeoMap } from './GeoMap'
import { SOSButton } from './SOSButton'

const categoryLabels: Record<Incident['category'], string> = {
  flat_tyre: 'Flat Tyre',
  battery: 'Battery',
  overheating: 'Overheating',
  accident: 'Accident',
  strange_noise: 'Strange Noise',
}

const dispatchLabels: Record<IncidentDispatchType, string> = {
  closest_partner: 'Closest partner mechanic',
  in_house_rescue: 'In-house rescue team',
  replacement_vehicle: 'Replacement vehicle',
}

function IncidentCard({ incident, onSelect }: { incident: Incident; onSelect: () => void }) {
  return <button className={`incident-card incident-card--${incident.status}`} onClick={onSelect} type="button">
    <span className="incident-card__top"><strong>{incident.reference}</strong><span>{incident.status.replaceAll('_', ' ')}</span></span>
    <span className="incident-card__category">{categoryLabels[incident.category]}{incident.immobilising && <AlertTriangle aria-label="Immobilising incident" size={15} />}</span>
    <span className="incident-card__location"><MapPin aria-hidden="true" size={14} />{incident.locationText}</span>
    <small>{formatEat(incident.createdAt)} · {incident.source}</small>
  </button>
}

export function IncidentsPage() {
  const incidentsQuery = useIncidents()
  const bookingsQuery = useBookings()
  const vehiclesQuery = useVehicles()
  const dispatchMutation = useDispatchIncident()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(() => searchParams.get('incidentId'))
  const [dispatchChoice, setDispatchChoice] = useState<IncidentDispatchType | null>(null)
  const [replacementVehicleId, setReplacementVehicleId] = useState('')
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const incidents = incidentsQuery.data ?? []
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? null
  const [latitude, longitude] = selectedIncident ? toLeaflet(selectedIncident.location) : [-1.2864, 36.8172]
  const nearbyQuery = useNearestMechanics(latitude, longitude, selectedIncident?.category, Boolean(selectedIncident))
  const nearbyMechanics = nearbyQuery.data ?? []
  const partnerMechanic = nearbyMechanics.find((mechanic) => mechanic.type === 'partner_garage')
  const availableVehicles = (vehiclesQuery.data ?? []).filter((vehicle) => vehicle.status === 'available')
  const affectedBookings = selectedIncident?.vehicleId
    ? (bookingsQuery.data ?? []).filter((booking) => booking.vehicleId === selectedIncident.vehicleId
      && Date.parse(booking.returnAt) >= Date.now()
      && !['cancelled', 'expired', 'completed'].includes(booking.status))
    : []

  async function confirmDispatch() {
    if (!selectedIncident || !dispatchChoice) return
    if (dispatchChoice === 'replacement_vehicle' && !replacementVehicleId) {
      setDispatchError('Choose an available replacement vehicle.')
      return
    }
    setDispatching(true)
    setDispatchError(null)
    try {
      await dispatchMutation.mutateAsync({
        incidentId: selectedIncident.id,
        type: dispatchChoice,
        mechanicId: dispatchChoice === 'closest_partner' ? partnerMechanic?.id : undefined,
        vehicleId: dispatchChoice === 'replacement_vehicle' ? replacementVehicleId : undefined,
      })
      setDispatchChoice(null)
      setReplacementVehicleId('')
    } catch {
      setDispatchError('Dispatch could not be completed. Refresh the incident and try again.')
    } finally {
      setDispatching(false)
    }
  }

  if (incidentsQuery.isLoading) return <Skeleton rows={5} />
  if (incidentsQuery.isError) return <ErrorState onRetry={() => void incidentsQuery.refetch()} retryLabel="Retry" title="Incidents could not be loaded" />

  return <section className="incidents-page">
    <header className="operations-page-header"><div><p className="eyebrow">Roadside operations</p><h2>Breakdown incidents</h2><p>Open incidents refresh every 15 seconds.</p></div><SOSButton source="desk" label="Log phone SOS" /></header>
    {incidents.length === 0 ? <EmptyState description="New calls and driver SOS reports will appear here." title="No incidents logged" /> : <div className="incident-list" aria-label="Incident list">
      {incidents.map((incident) => <IncidentCard incident={incident} key={incident.id} onSelect={() => { setSelectedIncidentId(incident.id); setSearchParams({ incidentId: incident.id }); setDispatchError(null) }} />)}
    </div>}

    {selectedIncident && <Drawer open title={`${selectedIncident.reference} · ${categoryLabels[selectedIncident.category]}`} onClose={() => { setSelectedIncidentId(null); setSearchParams({}); setDispatchChoice(null); setDispatchError(null) }}>
      <div className="incident-detail">
        <div className="incident-detail__status"><span className={`incident-status-chip incident-status-chip--${selectedIncident.status}`}>{selectedIncident.status.replaceAll('_', ' ')}</span><time><Clock3 aria-hidden="true" size={14} />{formatEat(selectedIncident.createdAt)}</time></div>
        <p>{selectedIncident.description || 'No description provided.'}</p>
        <p className="incident-detail__location"><MapPin aria-hidden="true" size={16} />{selectedIncident.locationText}</p>
        <GeoMap center={selectedIncident.location} marker={{ point: selectedIncident.location, label: selectedIncident.locationText, tone: 'danger' }} zoom={14} />

        <section className="incident-detail-section"><h3>Photos</h3>
          {selectedIncident.photos.length ? <div className="incident-photo-grid">{selectedIncident.photos.map((photo, index) => <img alt={`Incident photo ${index + 1}`} key={`${photo.slice(0, 40)}-${index}`} src={photo} />)}</div> : <p>No photos attached.</p>}
        </section>

        <section className="incident-detail-section"><h3><Wrench aria-hidden="true" size={16} />Nearest mechanics within 50 km</h3>
          {nearbyQuery.isLoading && <Skeleton rows={2} />}
          {nearbyQuery.isError && <p className="field__error">Nearby mechanics could not be loaded.</p>}
          {!nearbyQuery.isLoading && nearbyMechanics.length === 0 && <p>No mechanics are within 50 km.</p>}
          <ol className="nearest-mechanics-list">{nearbyMechanics.map((mechanic: NearbyMechanic) => <li key={mechanic.id}>
            <span><strong>{mechanic.name}</strong><small>{mechanic.type.replaceAll('_', ' ')} · {mechanic.specialties.map((item) => item.replaceAll('_', ' ')).join(', ')}</small></span>
            <span><b>{approxDistanceLabel(mechanic.distanceKm)}</b><small>{formatKes(mechanic.callOutRateKes)}</small></span>
          </li>)}</ol>
        </section>

        {selectedIncident.immobilising && <section className="incident-detail-section incident-upcoming"><h3>Upcoming bookings affected</h3>
          {affectedBookings.length ? <ul>{affectedBookings.map((booking) => <li key={booking.id}><strong>{booking.reference}</strong><span>{booking.customerName ?? 'Customer'} · {formatEat(booking.pickupAt)}</span></li>)}</ul> : <p>No upcoming bookings are affected.</p>}
        </section>}

        {selectedIncident.status === 'open' && <section className="incident-dispatch"><h3>Dispatch response</h3>
          <Button disabled={!partnerMechanic || dispatching} onClick={() => setDispatchChoice('closest_partner')} variant="primary">Dispatch closest partner</Button>
          {!partnerMechanic && <small>No partner mechanic within 50 km.</small>}
          <Button disabled={dispatching} onClick={() => setDispatchChoice('in_house_rescue')} variant="secondary">Dispatch in-house rescue team</Button>
          <Select label="Replacement vehicle" onChange={(event) => setReplacementVehicleId(event.target.value)} options={[{ value: '', label: 'Choose available vehicle' }, ...availableVehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.registration} · ${vehicle.make} ${vehicle.model}` }))]} value={replacementVehicleId} />
          <Button disabled={!replacementVehicleId || dispatching} onClick={() => setDispatchChoice('replacement_vehicle')} variant="secondary">Dispatch replacement vehicle</Button>
          {dispatchError && <p className="field__error" role="alert">{dispatchError}</p>}
        </section>}
      </div>
    </Drawer>}

    {dispatchChoice && selectedIncident && <ConfirmDialog
      cancelLabel="Cancel"
      confirmLabel={dispatching ? 'Dispatching…' : 'Confirm dispatch'}
      description={`Confirm ${dispatchLabels[dispatchChoice].toLowerCase()} for ${selectedIncident.reference}?`}
      onCancel={() => { setDispatchChoice(null); setDispatchError(null) }}
      onConfirm={() => void confirmDispatch()}
      open
      title="Confirm dispatch"
    />}
  </section>
}