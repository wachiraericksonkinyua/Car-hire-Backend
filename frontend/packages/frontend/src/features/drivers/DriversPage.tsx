import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Camera, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { apiClient } from '../../api/client'
import { useDrivers } from '../../api/queries'
import type { Driver } from '../../api/types'
import { Button, ConfirmDialog, ErrorState, Input, Modal, ProfileAvatar, Select, Skeleton } from '../../components/ui'
import { useAuth } from '../../hooks/AuthContext'
import { formatEat } from '../../lib'
import { getDriverExpiryReason } from './driverRules'

const driverStatusLabels: Record<Driver['status'], string> = {
  available: 'Available',
  assigned: 'Assigned',
  off_duty: 'Off duty',
}

const backendStatus: Record<Driver['status'], string> = {
  available: 'Available',
  assigned: 'Assigned',
  off_duty: 'OffDuty',
}

const emptyForm = {
  userId: '',
  licenceClass: 'D1',
  licenceExpiry: '2030-01-01',
  psvExpiry: '2030-01-01',
  languages: 'English, Kiswahili',
  rating: '4.5',
}

type EditForm = {
  licenceClass: string
  licenceExpiry: string
  psvExpiry: string
  status: string
  languages: string
  rating: string
}

export function DriversPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = user?.role === 'owner' || user?.role === 'manager'
  const driversQuery = useDrivers()
  const staffDrivers = useQuery({
    queryKey: ['staff', 'driver-users'],
    queryFn: () => apiClient.get<{ id: string; full_name: string; email: string; role: string }[]>('/staff?role=driver&limit=200'),
    enabled: canManage,
  })
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [deleting, setDeleting] = useState<Driver | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ licenceClass: '', licenceExpiry: '', psvExpiry: '', status: 'Available', languages: '', rating: '' })

  if (driversQuery.isLoading) return <Skeleton rows={5} />
  if (driversQuery.isError) return <ErrorState onRetry={() => void driversQuery.refetch()} retryLabel="Retry" title="Driver roster could not be loaded" />

  const drivers = driversQuery.data ?? []
  const withProfiles = new Set(drivers.map((driver) => driver.userId))
  const availableUsers = (staffDrivers.data ?? []).filter((staff) => !withProfiles.has(staff.id))

  async function refresh() {
    setNotice(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['drivers'] }),
      queryClient.invalidateQueries({ queryKey: ['staff', 'driver-users'] }),
      queryClient.invalidateQueries({ queryKey: ['available-drivers'] }),
    ])
  }

  function languagesFrom(value: string) {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }

  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.userId) {
      setNotice('Select a driver account first.')
      return
    }
    try {
      await apiClient.post('/drivers', {
        user_id: form.userId,
        licence_class: form.licenceClass,
        licence_expiry: form.licenceExpiry,
        psv_expiry: form.psvExpiry,
        languages: languagesFrom(form.languages),
        rating: form.rating ? Number(form.rating) : null,
      })
      setForm(emptyForm)
      setAdding(false)
      setNotice('Driver profile created.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create driver profile.')
    }
  }

  function openEdit(driver: Driver) {
    setEditing(driver)
    setEditForm({
      licenceClass: driver.licenceClass,
      licenceExpiry: driver.licenceExpiresAt.slice(0, 10),
      psvExpiry: driver.psvExpiresAt.slice(0, 10),
      status: backendStatus[driver.status],
      languages: driver.languages.join(', '),
      rating: driver.rating ? String(driver.rating) : '',
    })
  }

  async function saveEdit() {
    if (!editing) return
    try {
      await apiClient.patch(`/drivers/${encodeURIComponent(editing.id)}`, {
        licence_class: editForm.licenceClass,
        licence_expiry: editForm.licenceExpiry,
        psv_expiry: editForm.psvExpiry,
        status: editForm.status,
        languages: languagesFrom(editForm.languages),
        rating: editForm.rating ? Number(editForm.rating) : null,
      })
      setEditing(null)
      setNotice('Driver profile updated.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update driver.')
    }
  }

  async function toggleStatus(driver: Driver) {
    try {
      await apiClient.patch(`/drivers/${encodeURIComponent(driver.id)}`, {
        status: driver.status === 'off_duty' ? 'Available' : 'OffDuty',
      })
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not change driver status.')
    }
  }

  async function uploadPhoto(driver: Driver, file: File) {
    setNotice(null)
    try {
      const body = new FormData()
      body.append('file', file)
      await apiClient.upload(`/drivers/${encodeURIComponent(driver.id)}/photo`, body, () => undefined)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not upload the driver photo.')
    }
  }

  async function deleteDriver() {
    if (!deleting) return
    try {
      await apiClient.delete(`/drivers/${encodeURIComponent(deleting.id)}`)
      setDeleting(null)
      setNotice('Driver profile deleted.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete driver.')
    }
  }

  return (
    <section className="driver-roster-page">
      <header className="driver-roster-heading">
        <div><p className="eyebrow">Operations</p><h1>Drivers</h1><p>Licence, PSV and availability for every driver.</p></div>
        {canManage && <Button onClick={() => setAdding(true)}><Plus aria-hidden="true" size={16} /> Add a Driver</Button>}
      </header>
      {notice && <p className="field__hint" role="status">{notice}</p>}
      <div className="driver-card-grid">
        {drivers.length === 0 && <div className="empty-state">No driver profiles yet.</div>}
        {drivers.map((driver) => {
          const expiryReason = getDriverExpiryReason(driver)
          return (
            <article className={`driver-card${expiryReason ? ' driver-card--expired' : ''}`} key={driver.id}>
              <div className="driver-card__header">
                <ProfileAvatar
                  className="driver-card__photo"
                  fallback={<UserRound size={26} />}
                  fallbackClassName="driver-card__photo driver-card__photo--placeholder"
                  name={driver.name}
                  src={driver.photoUrl}
                />
                <div className="driver-card__identity">
                  <h2>{driver.name}</h2>
                  <p>{driver.phone || 'No phone'}</p>
                  <span className={`driver-status-chip driver-status-chip--${driver.status}`}>{driverStatusLabels[driver.status]}</span>
                </div>
                <span className="driver-card__rating">{driver.rating.toFixed(1)} / 5</span>
              </div>
              <dl className="driver-card__details">
                <div><dt>Licence class</dt><dd>{driver.licenceClass}</dd></div>
                <div><dt>Licence expiry</dt><dd>{formatEat(driver.licenceExpiresAt).split(',')[0]}</dd></div>
                <div><dt>PSV expiry</dt><dd>{formatEat(driver.psvExpiresAt).split(',')[0]}</dd></div>
                <div><dt>Languages</dt><dd>{driver.languages.join(', ') || '—'}</dd></div>
                <div><dt>Current trip</dt><dd>{driver.currentTrip ? <Link to={`/admin/bookings/${driver.currentTrip.bookingId}`}>{driver.currentTrip.reference}</Link> : '—'}</dd></div>
              </dl>
              {expiryReason && <p className="driver-expiry-reason">{expiryReason}</p>}
              {canManage && <div className="driver-card__actions">
                <label className="button button--secondary button--sm"><Camera aria-hidden="true" size={15} /> Photo
                  <input accept="image/*" hidden onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ''
                    if (file) void uploadPhoto(driver, file)
                  }} type="file" />
                </label>
                <Button onClick={() => openEdit(driver)} size="sm" variant="secondary"><Pencil aria-hidden="true" size={15} /> Edit</Button>
                <Button onClick={() => void toggleStatus(driver)} size="sm" variant="ghost">{driver.status === 'off_duty' ? 'Mark available' : 'Off duty'}</Button>
                <Button onClick={() => setDeleting(driver)} size="sm" variant="ghost"><Trash2 aria-hidden="true" size={15} /> Delete</Button>
              </div>}
            </article>
          )
        })}
      </div>

      {canManage && <Modal open={adding} title="Add a driver" onClose={() => setAdding(false)}>
        <form className="stack stack--md" onSubmit={(event) => void createProfile(event)}>
          <p className="field__hint">Create the driver user in Staff first, then link a profile here.</p>
          <Select
            label="Driver account"
            onChange={(event) => setForm({ ...form, userId: event.target.value })}
            options={[{ value: '', label: 'Select driver account' }, ...availableUsers.map((staff) => ({ value: staff.id, label: `${staff.full_name} (${staff.email})` }))]}
            value={form.userId}
          />
          <Input label="Licence class" onChange={(event) => setForm({ ...form, licenceClass: event.target.value })} value={form.licenceClass} />
          <Input label="Licence expiry" onChange={(event) => setForm({ ...form, licenceExpiry: event.target.value })} type="date" value={form.licenceExpiry} />
          <Input label="PSV expiry" onChange={(event) => setForm({ ...form, psvExpiry: event.target.value })} type="date" value={form.psvExpiry} />
          <Input label="Languages (comma separated)" onChange={(event) => setForm({ ...form, languages: event.target.value })} value={form.languages} />
          <Input label="Rating (0–5)" max={5} min={0} onChange={(event) => setForm({ ...form, rating: event.target.value })} step="0.1" type="number" value={form.rating} />
          <div className="confirm-dialog__actions">
            <Button onClick={() => setAdding(false)} type="button" variant="secondary">Cancel</Button>
            <Button type="submit">Add driver</Button>
          </div>
        </form>
      </Modal>}

      {editing && <Modal open title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
        <div className="stack stack--md">
          <Input label="Licence class" onChange={(event) => setEditForm({ ...editForm, licenceClass: event.target.value })} value={editForm.licenceClass} />
          <Input label="Licence expiry" onChange={(event) => setEditForm({ ...editForm, licenceExpiry: event.target.value })} type="date" value={editForm.licenceExpiry} />
          <Input label="PSV expiry" onChange={(event) => setEditForm({ ...editForm, psvExpiry: event.target.value })} type="date" value={editForm.psvExpiry} />
          <Select label="Status" onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} options={[{ value: 'Available', label: 'Available' }, { value: 'OffDuty', label: 'Off duty' }]} value={editForm.status} />
          <Input label="Languages (comma separated)" onChange={(event) => setEditForm({ ...editForm, languages: event.target.value })} value={editForm.languages} />
          <Input label="Rating" onChange={(event) => setEditForm({ ...editForm, rating: event.target.value })} type="number" value={editForm.rating} />
          <label className="button button--secondary button--sm"><Camera aria-hidden="true" size={15} /> {editing.photoUrl ? 'Change photo' : 'Upload photo'}
            <input accept="image/*" hidden onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void uploadPhoto(editing, file)
            }} type="file" />
          </label>
          <div className="confirm-dialog__actions">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void saveEdit()}>Save driver</Button>
          </div>
        </div>
      </Modal>}

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete driver"
        description={deleting ? `Delete ${deleting.name}'s driver profile? Drivers with trip history cannot be deleted.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void deleteDriver()}
        open={Boolean(deleting)}
        title="Delete driver profile"
      />
    </section>
  )
}
