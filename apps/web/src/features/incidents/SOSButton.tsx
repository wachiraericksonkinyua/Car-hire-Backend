import { useState, type ChangeEvent, type FormEvent } from 'react'
import { AlertTriangle, Camera, MapPin, Phone } from 'lucide-react'
import { useCreateIncident } from '../../api/queries'
import type { IncidentCategory, IncidentCreateRequest } from '../../api/types'
import { Button, Input, Modal, Select } from '../../components/ui'
import { toGeoJson, type GeoJsonPoint } from '../../lib/geo'
import { GeoMap } from './GeoMap'

const nairobiFallback = toGeoJson([-1.2864, 36.8172])
const incidentCategories: { value: IncidentCategory; label: string }[] = [
  { value: 'flat_tyre', label: 'Flat Tyre' },
  { value: 'battery', label: 'Battery' },
  { value: 'overheating', label: 'Overheating' },
  { value: 'accident', label: 'Accident' },
  { value: 'strange_noise', label: 'Strange Noise' },
]

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Photo could not be read')))
    reader.addEventListener('error', () => reject(new Error('Photo could not be read')))
    reader.readAsDataURL(file)
  })
}

export function SOSButton({ source, vehicleId, label = 'SOS' }: { source: IncidentCreateRequest['source']; vehicleId?: string; label?: string }) {
  const createIncident = useCreateIncident()
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState<GeoJsonPoint | null>(null)
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle')
  const [locationText, setLocationText] = useState('')
  const [category, setCategory] = useState<IncidentCategory>('flat_tyre')
  const [description, setDescription] = useState('')
  const [immobilising, setImmobilising] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [manualPinMode, setManualPinMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function requestGps() {
    setGpsState('loading')
    if (!navigator.geolocation) {
      setGpsState('denied')
      return
    }
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation(toGeoJson([position.coords.latitude, position.coords.longitude]))
      setLocationText('GPS location')
      setGpsState('ready')
    }, () => {
      setGpsState('denied')
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 })
  }

  function showForm() {
    setOpen(true)
    setError(null)
    setLocation(null)
    setLocationText('')
    setGpsState('idle')
    setManualPinMode(source === 'desk')
    if (source !== 'desk') requestGps()
  }

  function onPhotos(event: ChangeEvent<HTMLInputElement>) {
    setPhotos((current) => [...current, ...Array.from(event.currentTarget.files ?? [])])
    event.currentTarget.value = ''
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedLocation = location ?? (locationText.trim() ? nairobiFallback : null)
    if (!submittedLocation) { setError('Set a GPS location, place a pin, or enter a road, landmark or town.'); return }
    setError(null)
    try {
      const photoData = await Promise.all(photos.map(readPhoto))
      await createIncident.mutateAsync({
        category,
        description: description.trim(),
        location: submittedLocation,
        locationText: locationText.trim() || (gpsState === 'ready' ? 'GPS location' : 'Manually placed pin'),
        vehicleId,
        immobilising,
        photos: photoData,
        source,
      })
      setOpen(false)
      setPhotos([])
      setDescription('')
    } catch {
      setError('SOS could not be sent. Your details and photos are still here; try again.')
    }
  }

  return <>
    <Button className="sos-trigger" onClick={showForm} variant="danger"><AlertTriangle aria-hidden="true" size={17} />{label}</Button>
    {open && <Modal open title="Send SOS" onClose={() => setOpen(false)}>
      <form className="sos-form" onSubmit={(event) => void submit(event)}>
        <Select label="Issue category" onChange={(event) => setCategory(event.target.value as IncidentCategory)} options={incidentCategories} value={category} />
        <label className="field"><span className="field__label">Describe the issue</span><textarea className="control sos-description" onChange={(event) => setDescription(event.target.value)} value={description} /></label>
        {gpsState === 'loading' && <p role="status">Getting your GPS location…</p>}
        {gpsState === 'ready' && <p className="sos-location-status" role="status"><MapPin aria-hidden="true" size={16} /> GPS location captured</p>}
        {gpsState === 'denied' && <div className="sos-fallback" role="alert"><p>GPS location unavailable. Place a pin or enter a nearby road, landmark or town.</p><a href="tel:+254700123456"><Phone aria-hidden="true" size={16} /> Call the desk</a></div>}
        <div className="sos-map-controls">
          <Button onClick={() => setManualPinMode(!manualPinMode)} type="button" variant={manualPinMode ? 'primary' : 'secondary'}><MapPin aria-hidden="true" size={16} />{manualPinMode ? 'Click map to place pin' : 'Place pin manually'}</Button>
        </div>
        <GeoMap center={location ?? nairobiFallback} marker={location ? { point: location, label: locationText || 'Incident location', tone: 'danger' } : undefined} onPlace={(point) => { setLocation(point); setGpsState('denied') }} placementEnabled={manualPinMode || gpsState === 'denied'} zoom={13} />
        {(gpsState === 'denied' || manualPinMode) && <Input label="Location or landmark" onChange={(event) => setLocationText(event.target.value)} placeholder="Street, landmark or town" value={locationText} />}
        <div className="field"><span className="field__label">Photos</span><label className="sos-photo-picker"><Camera aria-hidden="true" size={17} /> Add photos<input accept="image/*" capture="environment" multiple onChange={onPhotos} type="file" /></label>{photos.map((photo) => <small key={`${photo.name}-${photo.lastModified}`}>{photo.name}</small>)}</div>
        {vehicleId && <label className="choice"><input checked={immobilising} onChange={(event) => setImmobilising(event.target.checked)} type="checkbox" /><span>Vehicle cannot be driven</span></label>}
        {error && <p className="field__error" role="alert">{error}</p>}
        <div className="confirm-dialog__actions"><Button onClick={() => setOpen(false)} variant="secondary">Cancel</Button><Button disabled={createIncident.isPending || gpsState === 'loading'} type="submit" variant="danger">{createIncident.isPending ? 'Sending…' : 'Send SOS'}</Button></div>
      </form>
    </Modal>}
  </>
}