import { useMemo, useState, type FormEvent } from 'react'
import { MapPin, Plus, X } from 'lucide-react'
import { useCreateMechanic, useMechanics } from '../../api/queries'
import type { MechanicType } from '../../api/types'
import { Button, ErrorState, Input, Select, Skeleton, Toast } from '../../components/ui'
import { useAuth } from '../../hooks/AuthContext'
import { toGeoJson, toLeaflet, type GeoJsonPoint } from '../../lib/geo'
import { GeoMap } from './GeoMap'

const nairobiCenter = toGeoJson([-1.2864, 36.8172])
const mechanicTypeLabels: Record<MechanicType, string> = {
  in_house: 'In-House',
  partner_garage: 'Partner Garage',
  towing: 'Towing',
}

export function MechanicsPage() {
  const { user } = useAuth()
  const mechanicsQuery = useMechanics()
  const createMechanic = useCreateMechanic()
  const [county, setCounty] = useState('all')
  const [specialty, setSpecialty] = useState('all')
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [adding, setAdding] = useState(false)
  const [pin, setPin] = useState<GeoJsonPoint | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const canAdd = user?.role === 'owner' || user?.role === 'manager'
  const mechanics = mechanicsQuery.data ?? []
  const counties = [...new Set(mechanics.map((mechanic) => mechanic.county))].sort()
  const specialties = [...new Set(mechanics.flatMap((mechanic) => mechanic.specialties))].sort()
  const visibleMechanics = useMemo(() => mechanics.filter((mechanic) =>
    (county === 'all' || mechanic.county === county)
    && (specialty === 'all' || mechanic.specialties.includes(specialty))), [mechanics, county, specialty])
  const selectedMechanic = visibleMechanics.find((mechanic) => mechanic.id === selectedId)

  async function submitMechanic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (!pin) { setFormError('Click the map to place the mechanic pin.'); return }
    const name = String(formData.get('name') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    const countyValue = String(formData.get('county') ?? '').trim()
    const town = String(formData.get('town') ?? '').trim()
    const rate = Number(formData.get('rate'))
    const type = String(formData.get('type')) as MechanicType
    const mechanicSpecialties = String(formData.get('specialties') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    if (!name || !phone || !countyValue || !town || !Number.isSafeInteger(rate)) { setFormError('Complete all required mechanic details.'); return }
    setFormError(null)
    try {
      await createMechanic.mutateAsync({
        name, phone, whatsapp: String(formData.get('whatsapp') || phone).trim(), county: countyValue, town,
        type, specialties: mechanicSpecialties, callOutRateKes: rate, location: pin,
      })
      setAdding(false)
      setPin(null)
      setToast(`${name} added to the mechanic directory.`)
    } catch {
      setFormError('Mechanic could not be saved. Check the details and try again.')
    }
  }

  if (mechanicsQuery.isLoading) return <Skeleton rows={5} />
  if (mechanicsQuery.isError) return <ErrorState onRetry={() => void mechanicsQuery.refetch()} retryLabel="Retry" title="Mechanic directory could not be loaded" />

  const mapCenter = pin ?? selectedMechanic?.location ?? nairobiCenter
  const [pinLatitude, pinLongitude] = pin ? toLeaflet(pin) : [0, 0]

  return (
    <section className="mechanics-page">
      <header className="operations-page-header"><div><p className="eyebrow">Roadside operations</p><h2>Mechanic directory</h2></div>
        {canAdd && <Button onClick={() => { setAdding(!adding); setFormError(null); if (adding) setPin(null) }} variant={adding ? 'secondary' : 'primary'}>{adding ? <X size={17} /> : <Plus size={17} />}{adding ? 'Cancel' : 'Add mechanic'}</Button>}
      </header>
      <div className="mechanics-filters">
        <Select label="County" onChange={(event) => setCounty(event.target.value)} options={[{ value: 'all', label: 'All counties' }, ...counties.map((value) => ({ value, label: value }))]} value={county} />
        <Select label="Specialty" onChange={(event) => setSpecialty(event.target.value)} options={[{ value: 'all', label: 'All specialties' }, ...specialties.map((value) => ({ value, label: value.replaceAll('_', ' ') }))]} value={specialty} />
      </div>
      {adding && <section aria-label="Add mechanic" className="mechanic-add-panel">
        <div><h3>Add mechanic</h3><p>Click the map to set the service location.</p></div>
        <form className="mechanic-form" onSubmit={(event) => void submitMechanic(event)}>
          <Input label="Name" name="name" required />
          <Input label="Phone" name="phone" required type="tel" />
          <Input label="WhatsApp" name="whatsapp" type="tel" />
          <Input label="County" name="county" required />
          <Input label="Town" name="town" required />
          <Select label="Mechanic type" name="type" options={Object.entries(mechanicTypeLabels).map(([value, label]) => ({ value, label }))} />
          <Input hint="Separate specialties with commas." label="Specialties" name="specialties" placeholder="flat_tyre, battery" />
          <Input label="Call-out rate (KES)" min="0" name="rate" required type="number" />
          {pin && <p className="mechanic-pin-readout" role="status"><MapPin aria-hidden="true" size={16} /> Pin: {pinLatitude.toFixed(5)}, {pinLongitude.toFixed(5)}</p>}
          {formError && <p className="field__error" role="alert">{formError}</p>}
          <Button disabled={createMechanic.isPending || !pin} type="submit">{createMechanic.isPending ? 'Saving…' : 'Save mechanic'}</Button>
        </form>
      </section>}
      <div className="mechanics-directory-layout">
        <div className="mechanics-map-wrap">
          {adding && <p className="mechanics-map-hint" role="status">{pin ? 'Pin placed. Click another location to move it.' : 'Click the map to place a pin.'}</p>}
          <GeoMap center={mapCenter} marker={pin ? { point: pin, label: 'New mechanic location' } : undefined} mechanics={visibleMechanics} onMechanicSelect={setSelectedId} onPlace={setPin} placementEnabled={adding} selectedMechanicId={selectedId} />
        </div>
        <aside aria-label="Mechanics list" className="mechanics-list-panel">
          <header><h3>Mechanics</h3><span>{visibleMechanics.length}</span></header>
          {visibleMechanics.length === 0 && <p className="empty-state">No mechanics match these filters.</p>}
          <ul>{visibleMechanics.map((mechanic) => <li key={mechanic.id}>
            <button aria-pressed={selectedId === mechanic.id} className={selectedId === mechanic.id ? 'mechanic-list-item is-selected' : 'mechanic-list-item'} onClick={() => setSelectedId(mechanic.id)} type="button">
              <span className={`mechanic-type-mark mechanic-type-mark--${mechanic.type}`} />
              <span className="mechanic-list-item__content"><strong>{mechanic.name}</strong><small>{mechanic.town}, {mechanic.county}</small><small>{mechanic.specialties.map((item) => item.replaceAll('_', ' ')).join(' · ')}</small></span>
              <span className="mechanic-list-item__rate">{mechanic.callOutRateKes === 0 ? 'In-house' : `KES ${new Intl.NumberFormat('en-KE').format(mechanic.callOutRateKes)}`}</span>
            </button>
          </li>)}</ul>
        </aside>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </section>
  )
}