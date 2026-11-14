import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, RotateCw, Upload } from 'lucide-react'
import { ApiError, apiClient } from '../../api/client'
import { useBookingDetail } from '../../api/queries'
import type { Booking, BookingInspection, HandoverRequest, HandoverSettlement } from '../../api/types'
import { Button, ErrorState, Input, Select, Skeleton } from '../../components/ui'
import { useAuth } from '../../hooks/AuthContext'
import { formatEat, formatKes } from '../../lib'
import { compressImage } from '../../lib/image'

type UploadedPhoto = {
  id: string
  file: File
  status: 'uploading' | 'uploaded' | 'failed'
  progress: number
  url?: string
  error?: string
}

const fuelOptions = [
  { value: '', label: 'Select fuel level' },
  { value: 'empty', label: 'Empty' },
  { value: 'quarter', label: '1/4 tank' },
  { value: 'half', label: '1/2 tank' },
  { value: 'three_quarters', label: '3/4 tank' },
  { value: 'full', label: 'Full' },
]

function inspectionLabel(inspection?: BookingInspection) {
  if (!inspection) return 'Not recorded'
  return `${inspection.fuelLevel.replaceAll('_', ' ')} fuel · ${new Intl.NumberFormat('en-KE').format(inspection.odometer)} km`
}

export function HandoverPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isCheckout = location.pathname.endsWith('/check-out')
  const bookingQuery = useBookingDetail(id)
  const [fuelLevel, setFuelLevel] = useState('')
  const [odometerInput, setOdometerInput] = useState('')
  const [notes, setNotes] = useState('')
  const [signatureConfirmed, setSignatureConfirmed] = useState(false)
  const [criticalDefect, setCriticalDefect] = useState(false)
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [settlement, setSettlement] = useState<HandoverSettlement | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const booking = bookingQuery.data
  const checkOutInspection = booking?.inspections?.find((inspection) => inspection.type === 'check_out')

  async function uploadPhoto(photoId: string, file: File) {
    setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, status: 'uploading', progress: 0, error: undefined } : photo))
    try {
      const compressed = await compressImage(file)
      const body = new FormData()
      body.append('file', compressed)
      const result = await apiClient.upload<{ url: string }>(`/bookings/${encodeURIComponent(id)}/inspections/photos`, body, (progress) => {
        setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, progress } : photo))
      })
      setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, status: 'uploaded', progress: 100, url: result.url } : photo))
    } catch (uploadError) {
      setPhotos((current) => current.map((photo) => photo.id === photoId ? {
        ...photo,
        status: 'failed',
        error: uploadError instanceof ApiError ? uploadError.message : 'Upload failed. Retry this photo.',
      } : photo))
    }
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    const additions = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: 'uploading' as const,
      progress: 0,
    }))
    setPhotos((current) => [...current, ...additions])
    event.currentTarget.value = ''
    for (const photo of additions) void uploadPhoto(photo.id, photo.file)
  }

  function makeRequest(): HandoverRequest {
    return {
      odometer: Number(odometerInput),
      fuelLevel,
      notes: notes.trim(),
      photos: photos.flatMap((photo) => photo.status === 'uploaded' && photo.url ? [photo.url] : []),
      signatureConfirmed,
      criticalDefect,
      completedAt: new Date().toISOString(),
    }
  }

  function validateForm() {
    if (!fuelLevel) return 'Select the fuel level.'
    if (!odometerInput || !Number.isFinite(Number(odometerInput)) || Number(odometerInput) < 0) return 'Enter a valid odometer reading.'
    if (!isCheckout && checkOutInspection && Number(odometerInput) < checkOutInspection.odometer) return 'Check-in odometer must be at least the check-out reading.'
    if (!signatureConfirmed) return 'Confirm the inspection before continuing.'
    if (photos.some((photo) => photo.status === 'uploading')) return 'Wait for photo uploads to finish.'
    if (photos.some((photo) => photo.status === 'failed')) return 'Retry or remove each failed photo before continuing.'
    return null
  }

  async function submitInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (isCheckout) {
        await apiClient.post<Booking>(`/bookings/${encodeURIComponent(id)}/check-out`, makeRequest())
        await queryClient.invalidateQueries({ queryKey: ['booking', id] })
        await queryClient.invalidateQueries({ queryKey: ['bookings'] })
        await queryClient.invalidateQueries({ queryKey: ['vehicles'] })
        navigate(`/admin/bookings/${id}`)
      } else {
        const preview = await apiClient.post<HandoverSettlement>(`/bookings/${encodeURIComponent(id)}/check-in/settlement`, {
          odometer: Number(odometerInput),
          completedAt: new Date().toISOString(),
        })
        setSettlement(preview)
        setReviewing(true)
      }
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : 'The inspection could not be saved. Your form is still here.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmCheckIn() {
    setError(null)
    setSaving(true)
    try {
      await apiClient.post<Booking>(`/bookings/${encodeURIComponent(id)}/check-in`, makeRequest())
      await queryClient.invalidateQueries({ queryKey: ['booking', id] })
      await queryClient.invalidateQueries({ queryKey: ['bookings'] })
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(`/admin/bookings/${id}`)
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : 'The inspection could not be saved. Your form is still here.')
    } finally {
      setSaving(false)
    }
  }

  if (bookingQuery.isLoading) return <Skeleton rows={5} />
  if (bookingQuery.isError || !booking) return <ErrorState onRetry={() => void bookingQuery.refetch()} retryLabel="Retry" title="Booking could not be loaded" />
  if (user?.role === 'driver' && booking.driver?.id !== user.id) {
    return <section className="handover-page page-shell"><div className="handover-panel"><h1>Access denied</h1><p>Drivers can only inspect their assigned trips.</p></div></section>
  }
  if (isCheckout && booking.status !== 'confirmed') {
    return <section className="handover-page page-shell"><div className="handover-panel"><h1>Check-out unavailable</h1><p>This booking must be confirmed before check-out.</p><Link className="button button--secondary" to={`/admin/bookings/${id}`}>Back to booking</Link></div></section>
  }
  if (!isCheckout && !['checked_out', 'overdue'].includes(booking.status)) {
    return <section className="handover-page page-shell"><div className="handover-panel"><h1>Check-in unavailable</h1><p>This booking does not have an active check-out.</p><Link className="button button--secondary" to={`/admin/bookings/${id}`}>Back to booking</Link></div></section>
  }

  const title = isCheckout ? 'Vehicle check-out' : 'Vehicle check-in'

  return (
    <section className="handover-page page-shell">
      <header className="handover-header">
        <div><Link className="booking-back-link" to={`/admin/bookings/${id}`}>{booking.reference}</Link><h1>{title}</h1></div>
        <span className="handover-step">{isCheckout ? 'Pickup inspection' : 'Return inspection'}</span>
      </header>
      <form className="handover-panel stack stack--md" onSubmit={(event) => void submitInspection(event)}>
        {!isCheckout && checkOutInspection && <section className="handover-comparison" aria-label="Check-out comparison">
          <h2>Check-out comparison</h2>
          <div className="handover-comparison__columns">
            <div><span>At check-out</span><strong>{inspectionLabel(checkOutInspection)}</strong><small>{formatEat(checkOutInspection.createdAt)}</small></div>
            <div><span>At check-in</span><strong>{fuelLevel ? `${fuelLevel.replaceAll('_', ' ')} fuel` : 'Fuel not recorded'} · {odometerInput ? `${new Intl.NumberFormat('en-KE').format(Number(odometerInput))} km` : 'Odometer not recorded'}</strong></div>
          </div>
        </section>}

        {!reviewing ? <>
          <div className="handover-fields">
            <Select label="Fuel level" onChange={(event) => setFuelLevel(event.target.value)} options={fuelOptions} value={fuelLevel} />
            <Input label="Odometer (km)" min={checkOutInspection?.odometer ?? 0} onChange={(event) => { setOdometerInput(event.target.value); setSettlement(null) }} type="number" value={odometerInput} />
          </div>
          {!isCheckout && checkOutInspection && Number(odometerInput) > 0 && Number(odometerInput) < checkOutInspection.odometer && <p className="field__error" role="alert">Check-in odometer must be at least {new Intl.NumberFormat('en-KE').format(checkOutInspection.odometer)} km.</p>}
          <label className="field"><span className="field__label">Inspection notes</span><textarea className="control handover-notes" maxLength={1000} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
          <div className="field handover-photo-field">
            <span className="field__label">Photos</span>
            <label className="handover-photo-picker"><Camera aria-hidden="true" size={18} /><span>Add photos</span><input accept="image/*" capture="environment" multiple onChange={addPhotos} type="file" /></label>
            {photos.length > 0 && <ul aria-label="Inspection photo uploads" className="handover-upload-list">{photos.map((photo) => <li key={photo.id}>
              <span className="handover-upload-list__name">{photo.file.name}</span>
              {photo.status === 'uploading' && <><progress aria-label={`Uploading ${photo.file.name}`} max={100} value={photo.progress} /><span>{photo.progress}%</span></>}
              {photo.status === 'uploaded' && <span role="status">Uploaded</span>}
              {photo.status === 'failed' && <><span className="field__error">{photo.error}</span><Button onClick={() => void uploadPhoto(photo.id, photo.file)} size="sm" type="button" variant="secondary"><RotateCw aria-hidden="true" size={15} /> Retry</Button></>}
            </li>)}</ul>}
            <small className="field__hint">Images are compressed on this device before upload.</small>
          </div>
          <label className="choice"><input checked={signatureConfirmed} onChange={(event) => setSignatureConfirmed(event.target.checked)} type="checkbox" /><span>I confirm the inspection and the recorded details.</span></label>
          <label className="choice handover-defect"><input checked={criticalDefect} onChange={(event) => setCriticalDefect(event.target.checked)} type="checkbox" /><span>Critical defect found</span></label>
          {criticalDefect && <p className="handover-warning" role="alert"><AlertTriangle aria-hidden="true" size={18} /> This vehicle will be moved to Maintenance instead of Available when check-in is submitted.</p>}
          {error && <p className="field__error" role="alert">{error}</p>}
          <div className="handover-actions">
            <Link className="button button--secondary" to={`/admin/bookings/${id}`}>Cancel</Link>
            <Button disabled={saving || photos.some((photo) => photo.status === 'uploading')} type="submit"><Upload aria-hidden="true" size={17} /> {isCheckout ? 'Complete check-out' : 'Review check-in'}</Button>
          </div>
        </> : <>
          <section aria-label="Settlement summary" className="handover-settlement">
            <h2>Settlement summary</h2>
            <dl>
              <div><dt>Late time (after {settlement?.graceHours}h grace)</dt><dd>{settlement?.lateHours}h</dd></div>
              <div><dt>Late fee</dt><dd>{formatKes(settlement?.lateFeeKes ?? 0)}</dd></div>
              <div><dt>Odometer difference</dt><dd>{new Intl.NumberFormat('en-KE').format(settlement?.odometerDifferenceKm ?? 0)} km</dd></div>
              <div><dt>Excess mileage</dt><dd>{new Intl.NumberFormat('en-KE').format(settlement?.excessMileageKm ?? 0)} km at {formatKes(settlement?.excessMileageRateKes ?? 0)}/km</dd></div>
              <div><dt>Excess mileage charge</dt><dd>{formatKes(settlement?.excessMileageChargeKes ?? 0)}</dd></div>
              <div className="handover-settlement__total"><dt>Total settlement</dt><dd>{formatKes(settlement?.totalKes ?? 0)}</dd></div>
            </dl>
          </section>
          {criticalDefect && <p className="handover-warning" role="alert"><AlertTriangle aria-hidden="true" size={18} /> This vehicle will be moved to Maintenance instead of Available when check-in is submitted.</p>}
          {error && <p className="field__error" role="alert">{error}</p>}
          <div className="handover-actions">
            <Button onClick={() => { setReviewing(false); setSettlement(null) }} variant="secondary">Back to inspection</Button>
            <Button disabled={saving} onClick={() => void confirmCheckIn()}>{saving ? 'Saving…' : 'Confirm check-in'}</Button>
          </div>
        </>}
      </form>
    </section>
  )
}