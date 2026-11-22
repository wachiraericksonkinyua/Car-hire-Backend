import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, DataTable, Input, Modal, Select, Toast } from '../components/ui'
import { useAuth } from '../hooks/AuthContext'
import { canApproveBooking } from '../hooks/useCan'
import { useTranslation } from '../i18n'
import type { AuditEntry, Booking, PaymentMethod, StaffMember, User, UserRole, Vehicle } from '../api/types'
import { apiClient } from '../api/client'
import { publicVehiclePhotoUrl } from '../api/public'
import { useBookingList, useDeleteVehiclePhoto, useStorage, useUpdateVehiclePhotoCaption, useUploadVehiclePhoto, useVehicles } from '../api/queries'
import { formatKes } from '../lib'
import { PagePlaceholder } from './PagePlaceholder'

interface BackendStaff {
  id: string
  email: string
  full_name: string
  phone: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  last_login_at: string | null
  photo_url?: string | null
}

interface BackendAudit {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa_manual', label: 'M-Pesa Manual' },
  { value: 'bank', label: 'Bank EFT' },
  { value: 'corporate', label: 'Corporate Credit' },
] as const

const backendPaymentMethod: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank: 'Bank EFT',
  corporate: 'Corporate Credit',
  mpesa_manual: 'M-Pesa Manual',
  mpesa_online: 'M-Pesa Manual',
}

const roleOptions = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'driver', label: 'Driver' },
  { value: 'mechanic', label: 'Mechanic' },
] as const

function formatBytes(bytes: number | undefined) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatTime(value: string | undefined, showDate = true) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    dateStyle: showDate ? 'medium' : undefined,
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatAge(value: string | undefined) {
  if (!value) return '—'
  const diffMs = Date.now() - new Date(value).getTime()
  const hours = Math.max(0, Math.floor(diffMs / (60 * 60 * 1000)))
  const minutes = Math.max(0, Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000)))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatHoldRemaining(value: string | undefined) {
  if (!value) return '—'
  const diffMs = new Date(value).getTime() - Date.now()
  if (diffMs <= 0) return 'Expired'
  const minutes = Math.max(0, Math.ceil(diffMs / (60 * 1000)))
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  return `${minutes}m`
}

function DashboardPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.dashboard')} /> }
function BookingsPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.bookings')} /> }

const emptyVehicle = {
  plate_number: '',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  category: 'SUV',
  transmission: 'Automatic',
  fuel: 'Petrol',
  seats: 5,
  bags: 2,
  daily_rate_kes: 8000,
  deposit_kes: 20000,
  mileage_cap_km: 300,
  insurance_expiry: '2030-12-31',
}

export function FleetPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const vehiclesQuery = useVehicles()
  const storageQuery = useStorage()
  const uploadPhoto = useUploadVehiclePhoto()
  const removePhoto = useDeleteVehiclePhoto()
  const updateCaption = useUpdateVehiclePhotoCaption()
  const canManage = user?.role === 'owner' || user?.role === 'manager'
  const [form, setForm] = useState(emptyVehicle)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string | number>>({})
  const [pendingImages, setPendingImages] = useState<{ file: File; caption: string }[]>([])

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['available-vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  function vehiclePayload(values: Record<string, string | number>, includePlate = true) {
    return {
      ...(includePlate ? { plate_number: String(values.plate_number ?? '') } : {}),
      brand: String(values.brand ?? ''),
      model: String(values.model ?? ''),
      year: Number(values.year),
      category: String(values.category ?? ''),
      transmission: String(values.transmission ?? 'Automatic'),
      fuel: String(values.fuel ?? 'Petrol'),
      seats: Number(values.seats),
      bags: Number(values.bags),
      daily_rate_kes: Number(values.daily_rate_kes),
      deposit_kes: Number(values.deposit_kes),
      mileage_cap_km: Number(values.mileage_cap_km),
      insurance_expiry: String(values.insurance_expiry ?? ''),
      ...(values.status ? { status: String(values.status) } : {}),
    }
  }

  async function addVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const created = await apiClient.post<{ id: string }>('/vehicles', vehiclePayload(form))
      const failures: string[] = []
      for (const image of pendingImages) {
        try {
          await uploadPhoto.mutateAsync({ vehicleId: created.id, file: image.file, caption: image.caption })
        } catch (uploadError) {
          failures.push(`${image.file.name} (${uploadError instanceof Error ? uploadError.message : 'upload failed'})`)
        }
      }
      setForm(emptyVehicle)
      setPendingImages([])
      if (failures.length > 0) {
        setNotice(`Vehicle added, but ${failures.length} of ${pendingImages.length} images failed: ${failures.join('; ')}`)
      } else {
        setNotice(pendingImages.length > 0 ? `Vehicle added with ${pendingImages.length} images.` : 'Vehicle added.')
      }
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add vehicle.')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle)
    setEditForm({
      plate_number: vehicle.registration,
      brand: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      category: vehicle.category ?? 'SUV',
      transmission: vehicle.transmission === 'manual' ? 'Manual' : 'Automatic',
      fuel: vehicle.fuel ?? 'Petrol',
      seats: vehicle.seats,
      bags: vehicle.bags ?? 2,
      daily_rate_kes: vehicle.ratePerDay,
      deposit_kes: vehicle.depositKes ?? 20000,
      mileage_cap_km: vehicle.mileageCapKm ?? 300,
      insurance_expiry: (vehicle.insuranceExpiry ?? '2030-12-31').slice(0, 10),
      status: vehicle.status === 'maintenance' ? 'Maintenance' : 'Available',
    })
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    setNotice(null)
    try {
      await apiClient.patch(`/vehicles/${encodeURIComponent(editing.id)}`, vehiclePayload(editForm))
      setEditing(null)
      setNotice('Vehicle updated.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update vehicle.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadEditingImages(files: File[]) {
    if (!editing) return
    setNotice(null)
    let uploaded = 0
    const failures: string[] = []
    for (const file of files) {
      try {
        const photo = await uploadPhoto.mutateAsync({ vehicleId: editing.id, file })
        uploaded += 1
        setEditing((current) => current ? { ...current, photos: [...(current.photos ?? []), photo] } : current)
      } catch (error) {
        failures.push(`${file.name} (${error instanceof Error ? error.message : 'upload failed'})`)
      }
    }
    setNotice(failures.length > 0
      ? `${uploaded} of ${files.length} images uploaded. Failed: ${failures.join('; ')}`
      : `${uploaded} vehicle image(s) uploaded.`)
  }

  async function deleteEditingImage(photoId: string) {
    if (!editing) return
    try {
      await removePhoto.mutateAsync({ vehicleId: editing.id, photoId })
      setEditing((current) => current ? { ...current, photos: (current.photos ?? []).filter((photo) => photo.id !== photoId) } : current)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete the image.')
    }
  }

  async function saveCaption(photoId: string, caption: string) {
    if (!editing) return
    try {
      await updateCaption.mutateAsync({ vehicleId: editing.id, photoId, caption })
      setEditing((current) => current ? {
        ...current,
        photos: (current.photos ?? []).map((photo) => photo.id === photoId ? { ...photo, caption } : photo),
      } : current)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the image caption.')
    }
  }

  async function deleteVehicle() {
    if (!deleting) return
    const target = deleting
    setSaving(true)
    setNotice(null)
    setDeleting(null)
    try {
      await apiClient.delete(`/vehicles/${encodeURIComponent(target.id)}`)
      setNotice(`${target.registration} was deleted.`)
      await refresh()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `${target.registration} could not be deleted: ${error.message}`
          : `${target.registration} could not be deleted.`,
      )
    } finally {
      setSaving(false)
    }
  }

  async function updateVehicle(id: string, patch: Record<string, unknown>) {
    setNotice(null)
    try {
      await apiClient.patch(`/vehicles/${encodeURIComponent(id)}`, patch)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update vehicle.')
    }
  }

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Gari Poa</p><h1>Fleet</h1></div><span>{vehiclesQuery.data?.length ?? 0} vehicles</span></header>
      <div className="stack stack--lg">
        {notice && <p className="field__hint" role="status">{notice}</p>}
        {storageQuery.data && <div className="card-panel stack stack--md">
          <div className="section-heading"><h2>Storage</h2><span className="muted">Updates every minute</span></div>
          <div className="storage-grid">
            <div className="storage-meter">
              <div className="storage-meter__label"><span>Database</span><strong>{formatBytes(storageQuery.data.database.used_bytes)} / {storageQuery.data.database.quota_mb} MB</strong></div>
              <div className="storage-meter__track"><span style={{ width: `${Math.min(100, storageQuery.data.database.percent_used)}%` }} /></div>
              <small>{storageQuery.data.database.percent_used}% of configured quota</small>
            </div>
            <div className="storage-meter">
              <div className="storage-meter__label"><span>Host disk</span><strong>{formatBytes(storageQuery.data.disk.free_bytes)} free</strong></div>
              <div className="storage-meter__track"><span style={{ width: `${Math.min(100, storageQuery.data.disk.percent_used)}%` }} /></div>
              <small>{formatBytes(storageQuery.data.disk.used_bytes)} used of {formatBytes(storageQuery.data.disk.total_bytes)}</small>
            </div>
            <div className="storage-meter">
              <div className="storage-meter__label"><span>Uploaded files</span><strong>{formatBytes(storageQuery.data.uploads.used_bytes)}</strong></div>
              <small>Inspection, staff and driver photos on disk</small>
            </div>
          </div>
          {storageQuery.data.tables.length > 0 && <details>
            <summary className="muted">Largest database tables</summary>
            <ul className="storage-table-list">
              {storageQuery.data.tables.slice(0, 8).map((table) => <li key={table.name}><span>{table.name}</span><strong>{formatBytes(table.bytes)}</strong></li>)}
            </ul>
          </details>}
        </div>}
        <div className="card-panel fleet-table">
          <DataTable
            columns={[
              { key: 'vehicle', header: 'Vehicle', render: (row) => <div className="fleet-vehicle-cell">{row.photos?.[0] && <img alt="" className="fleet-thumb" src={publicVehiclePhotoUrl(row.id, row.photos[0].id)} />}<div><strong>{row.make} {row.model}</strong><div className="muted">{row.registration}</div></div></div> },
              { key: 'year', header: 'Year', render: (row) => row.year },
              { key: 'category', header: 'Category', render: (row) => row.category ?? '—' },
              { key: 'seats', header: 'Seats', render: (row) => row.seats },
              { key: 'rate', header: 'Rate/day', render: (row) => formatKes(row.ratePerDay) },
              { key: 'status', header: 'Status', render: (row) => <span className={`status-pill status-pill--${row.status}`}>{row.status}</span> },
              { key: 'action', header: 'Actions', render: (row) => canManage ? (
                <div className="inline-actions">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                  <Button size="sm" variant="secondary" onClick={() => void updateVehicle(row.id, { status: row.status === 'maintenance' ? 'Available' : 'Maintenance' })}>
                    {row.status === 'maintenance' ? 'Release' : 'Maintenance'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(row)}>Delete</Button>
                </div>
              ) : '—' },
            ]}
            empty={<div className="empty-state">No vehicles yet.</div>}
            rowKey={(row) => row.id}
            rows={vehiclesQuery.data ?? []}
          />
        </div>
        {canManage && <form className="card-panel stack stack--md" onSubmit={(event) => void addVehicle(event)}>
          <h2>Add vehicle</h2>
          <div className="filter-grid">
            <Input label="Plate" onChange={(event) => setForm({ ...form, plate_number: event.target.value })} placeholder="KDA 123A" required value={form.plate_number} />
            <Input label="Brand" onChange={(event) => setForm({ ...form, brand: event.target.value })} value={form.brand} />
            <Input label="Model" onChange={(event) => setForm({ ...form, model: event.target.value })} value={form.model} />
            <Input label="Year" onChange={(event) => setForm({ ...form, year: Number(event.target.value) })} type="number" value={form.year} />
            <Select label="Category" onChange={(event) => setForm({ ...form, category: event.target.value })} options={['Economy', 'Compact SUV', 'SUV', '4x4', 'Minivan', 'Luxury'].map((value) => ({ value, label: value }))} value={form.category} />
            <Select label="Transmission" onChange={(event) => setForm({ ...form, transmission: event.target.value })} options={[{ value: 'Automatic', label: 'Automatic' }, { value: 'Manual', label: 'Manual' }]} value={form.transmission} />
            <Select label="Fuel" onChange={(event) => setForm({ ...form, fuel: event.target.value })} options={[{ value: 'Petrol', label: 'Petrol' }, { value: 'Diesel', label: 'Diesel' }, { value: 'Hybrid', label: 'Hybrid' }, { value: 'Electric', label: 'Electric' }]} value={form.fuel} />
            <Input label="Seats" onChange={(event) => setForm({ ...form, seats: Number(event.target.value) })} type="number" value={form.seats} />
            <Input label="Bags" onChange={(event) => setForm({ ...form, bags: Number(event.target.value) })} type="number" value={form.bags} />
            <Input label="Daily rate (KES)" onChange={(event) => setForm({ ...form, daily_rate_kes: Number(event.target.value) })} type="number" value={form.daily_rate_kes} />
            <Input label="Deposit (KES)" onChange={(event) => setForm({ ...form, deposit_kes: Number(event.target.value) })} type="number" value={form.deposit_kes} />
            <Input label="Mileage cap (km)" onChange={(event) => setForm({ ...form, mileage_cap_km: Number(event.target.value) })} type="number" value={form.mileage_cap_km} />
            <Input label="Insurance expiry" onChange={(event) => setForm({ ...form, insurance_expiry: event.target.value })} type="date" value={form.insurance_expiry} />
          </div>
          <p className="field__hint">Plate must look like <strong>KDA 123A</strong>: three letters, three digits, one letter.</p>
          <label className="button button--secondary button--sm">
            Add vehicle images
            <input accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? [])
              setPendingImages(files.map((file) => ({ file, caption: '' })))
              event.currentTarget.value = ''
            }} type="file" />
          </label>
          {pendingImages.length > 0 && <div className="pending-image-list">
            {pendingImages.map((image, index) => <div className="pending-image" key={`${image.file.name}-${index}`}>
              <span>{image.file.name}</span>
              <Input label="Caption" onChange={(event) => setPendingImages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.target.value } : item))} placeholder="Interior, rear, bumper…" value={image.caption} />
            </div>)}
            <small className="field__hint" role="status">{pendingImages.length} image(s) will be uploaded with the vehicle.</small>
          </div>}
          <Button disabled={saving} type="submit">{saving ? 'Saving…' : 'Add vehicle'}</Button>
        </form>}
      </div>

      {editing && <Modal open title={`Edit ${editing.registration}`} onClose={() => setEditing(null)}>
        <div className="stack stack--md">
          <div className="filter-grid">
            <Input label="Plate" onChange={(event) => setEditForm({ ...editForm, plate_number: event.target.value })} value={String(editForm.plate_number ?? '')} />
            <Input label="Brand" onChange={(event) => setEditForm({ ...editForm, brand: event.target.value })} value={String(editForm.brand ?? '')} />
            <Input label="Model" onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} value={String(editForm.model ?? '')} />
            <Input label="Year" onChange={(event) => setEditForm({ ...editForm, year: Number(event.target.value) })} type="number" value={Number(editForm.year ?? 0)} />
            <Select label="Status" onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} options={[{ value: 'Available', label: 'Available' }, { value: 'Maintenance', label: 'Maintenance' }]} value={String(editForm.status ?? 'Available')} />
            <Input label="Daily rate (KES)" onChange={(event) => setEditForm({ ...editForm, daily_rate_kes: Number(event.target.value) })} type="number" value={Number(editForm.daily_rate_kes ?? 0)} />
            <Input label="Deposit (KES)" onChange={(event) => setEditForm({ ...editForm, deposit_kes: Number(event.target.value) })} type="number" value={Number(editForm.deposit_kes ?? 0)} />
            <Input label="Mileage cap (km)" onChange={(event) => setEditForm({ ...editForm, mileage_cap_km: Number(event.target.value) })} type="number" value={Number(editForm.mileage_cap_km ?? 0)} />
            <Input label="Insurance expiry" onChange={(event) => setEditForm({ ...editForm, insurance_expiry: event.target.value })} type="date" value={String(editForm.insurance_expiry ?? '')} />
          </div>
          <div className="vehicle-photo-editor">
            <div className="section-heading"><h3>Vehicle images</h3><span className="muted">Stored in PostgreSQL</span></div>
            {(editing.photos ?? []).length > 0
              ? <div className="vehicle-photo-grid">{(editing.photos ?? []).map((photo) => <figure key={photo.id}>
                <img alt={photo.caption ?? 'Vehicle'} src={publicVehiclePhotoUrl(editing.id, photo.id)} />
                <Input defaultValue={photo.caption ?? ''} label="Caption" onBlur={(event) => void saveCaption(photo.id, event.target.value)} placeholder="Interior, rear, bumper…" />
                <Button onClick={() => void deleteEditingImage(photo.id)} size="sm" variant="ghost">Remove</Button>
              </figure>)}</div>
              : <p className="field__hint">No images yet. Add the first one below.</p>}
            <label className="button button--secondary button--sm">
              Add images
              <input accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                if (files.length > 0) void uploadEditingImages(files)
              }} type="file" />
            </label>
          </div>
          <div className="confirm-dialog__actions">
            <Button onClick={() => setEditing(null)} variant="secondary">Cancel</Button>
            <Button disabled={saving} onClick={() => void saveEdit()}>{saving ? 'Saving…' : 'Save vehicle'}</Button>
          </div>
        </div>
      </Modal>}

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete vehicle"
        description={deleting ? `Permanently delete ${deleting.registration} and every booking, payment, inspection, incident and image linked to it? This cannot be undone.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void deleteVehicle()}
        open={Boolean(deleting)}
        title="Delete vehicle"
      />
    </section>
  )
}

export function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function uploadAvatar(file: File) {
    setSaving(true)
    setNotice(null)
    try {
      const body = new FormData()
      body.append('file', file)
      await apiClient.upload(`/auth/me/avatar`, body, () => undefined)
      // Refetch the current user so the navbar avatar updates immediately.
      const refreshed = await apiClient.get<BackendUser>('/auth/me')
      updateUser(mapUserToFrontend(refreshed))
      setNotice('Profile picture updated.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not upload the profile picture.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Gari Poa</p><h1>Profile</h1></div></header>
      {notice && <p className="field__hint" role="status">{notice}</p>}
      <div className="card-panel stack stack--md">
        <div><span className="label">Name</span><strong>{user?.name}</strong></div>
        <div><span className="label">Email</span><strong>{user?.email}</strong></div>
        <div><span className="label">Role</span><strong>{user?.role}</strong></div>
        <div className="profile-avatar-upload">
          {user?.avatarUrl
            ? <img alt="Profile picture" className="profile-avatar-photo" src={user.avatarUrl} />
            : <span aria-hidden="true" className="staff-avatar">{user?.name.slice(0, 1).toUpperCase()}</span>}
          <input
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void uploadAvatar(file)
            }}
            type="file"
          />
          <Button disabled={saving} size="sm">Upload profile picture</Button>
        </div>
        <p className="field__hint">Password changes are not available in this MVP yet.</p>
      </div>
    </section>
  )
}

interface BackendUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  avatar_url?: string | null
}

function mapUserToFrontend(user: BackendUser): User {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    phone: '',
    role: user.role,
    active: user.is_active,
    avatarUrl: user.avatar_url ?? undefined,
  }
}

export function ApprovalsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const approvalsQuery = useBookingList('status=reserved&pendingApproval=true')
  const approvals = [...(approvalsQuery.data ?? [])]
    .filter((booking) => booking.pendingApproval !== false)
    .sort((left, right) => (left.holdExpiresAt ?? left.pickupAt).localeCompare(right.holdExpiresAt ?? right.pickupAt))
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmStep, setConfirmStep] = useState(false)

  const availableMethods = user?.role === 'agent'
    ? paymentMethods.filter((option) => option.value !== 'corporate')
    : paymentMethods

  function openApproval(booking: Booking) {
    setSelectedBooking(booking)
    setPaymentMethod('cash')
    setReference('')
    setReason('')
    setError(null)
    setConfirmStep(false)
  }

  function closeApproval() {
    setSelectedBooking(null)
    setConfirmStep(false)
    setError(null)
  }

  async function submitApproval() {
    if (!selectedBooking) return
    if (!user) return

    if (!canApproveBooking(user.id, selectedBooking.createdById ?? '')) {
      setError('This booking was created by the current user and cannot be approved.')
      return
    }

    if (!paymentMethod) {
      setError('Payment method is required.')
      return
    }

    if (!reference.trim()) {
      setError('Payment reference or receipt code is required.')
      return
    }

    if (paymentMethod === 'corporate' && !reason.trim()) {
      setError('Reason is required for corporate override.')
      return
    }

    if (selectedBooking.holdExpiresAt && Date.parse(selectedBooking.holdExpiresAt) <= Date.now()) {
      setError('This booking hold has expired. Recheck availability and reserve the vehicle again.')
      return
    }

    try {
      await apiClient.patch(`/bookings/${encodeURIComponent(selectedBooking.id)}/approve-offline`, {
        payment_method: backendPaymentMethod[paymentMethod],
        payment_reference: reference.trim(),
        reason: reason.trim() || undefined,
      })
      setToast('Offline approval recorded successfully.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['shell-notifications'] }),
      ])
      closeApproval()
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Approval could not be recorded.')
    }
  }

  const approvalRows = approvals
    .map((booking) => ({
      ...booking,
      canApprove: canApproveBooking(user?.id ?? '', booking.createdById ?? ''),
    }))

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Gari Poa</p><h1>Approvals</h1></div></header>
      <div className="stack stack--lg">
        <div className="card-panel">
          <DataTable
            columns={[
              { key: 'booking', header: 'Booking', render: (row: Booking) => <><strong>{row.reference}</strong><div className="muted">{row.customerName}</div></> },
              { key: 'vehicle', header: 'Vehicle', render: (row: Booking) => <span>{row.vehicleRegistration ?? row.vehicleId}</span> },
              { key: 'age', header: 'Age', render: (row: Booking) => <span>{formatAge(row.pickupAt)}</span> },
              { key: 'hold', header: 'Hold', render: (row: Booking) => <span>{formatHoldRemaining(row.holdExpiresAt)}</span> },
              { key: 'amount', header: 'Amount', render: (row: Booking) => <strong>{new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(row.totalKes)}</strong> },
              { key: 'action', header: 'Action', render: (row: Booking & { canApprove: boolean }) => (
                <Button disabled={!row.canApprove} onClick={() => openApproval(row)} size="sm" variant={row.canApprove ? 'primary' : 'secondary'}>
                  {row.canApprove ? 'Approve' : 'Locked'}
                </Button>
              ) },
            ]}
            empty={<div className="empty-state">No bookings are waiting approval.</div>}
            rowKey={(row) => row.id}
            rows={approvalRows}
          />
        </div>
      </div>
      {selectedBooking && (
        <Modal open={Boolean(selectedBooking)} title="Approve offline payment" onClose={closeApproval}>
          {!confirmStep ? (
            <div className="modal-body stack stack--md">
              <div className="field-group">
                <Select
                  error={error ?? undefined}
                  label="Payment method"
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  options={availableMethods.map((method) => ({ value: method.value, label: method.label }))}
                  value={paymentMethod}
                />
                {user?.role === 'agent' && (
                  <p className="field__hint" title="Manager approval required">Corporate Credit is unavailable for agents.</p>
                )}
              </div>
              <Input error={error ? undefined : undefined} label="Payment reference / receipt code" onChange={(event) => setReference(event.target.value)} value={reference} />
              <Input label="Reason" onChange={(event) => setReason(event.target.value)} placeholder={paymentMethod === 'corporate' ? 'Required for corporate override' : 'Optional notes'} value={reason} />
              {error && <p className="field__error" role="alert">{error}</p>}
              <div className="confirm-dialog__actions">
                <Button onClick={closeApproval} variant="secondary">Cancel</Button>
                <Button onClick={() => {
                  if (paymentMethod === 'corporate' && !reason.trim()) {
                    setError('Reason is required for corporate override.')
                    return
                  }
                  if (!reference.trim()) {
                    setError('Payment reference or receipt code is required.')
                    return
                  }
                  setError(null)
                  setConfirmStep(true)
                }} variant="primary">Review</Button>
              </div>
            </div>
          ) : (
            <div className="modal-body stack stack--md">
              <div className="info-grid">
                <div><span className="label">Vehicle</span><strong>{selectedBooking.vehicleId}</strong></div>
                <div><span className="label">Amount</span><strong>{new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(selectedBooking.totalKes)}</strong></div>
                <div><span className="label">Payment</span><strong>{paymentMethods.find((option) => option.value === paymentMethod)?.label}</strong></div>
              </div>
              {error && <p className="field__error" role="alert">{error}</p>}
              <div className="confirm-dialog__actions">
                <Button onClick={() => setConfirmStep(false)} variant="secondary">Back</Button>
                <Button onClick={submitApproval} variant="primary">Confirm approval</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </section>
  )
}

export function StaffPage() {
  const { user, updateUser } = useAuth()
  const queryClient = useQueryClient()
  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const rows = await apiClient.get<BackendStaff[]>('/staff?limit=200')
      return rows.map((row): StaffMember => ({
        id: row.id,
        name: row.full_name,
        email: row.email,
        phone: row.phone ?? '',
        role: row.role,
        branch: 'Nairobi HQ',
        active: row.is_active,
        lastLogin: row.last_login_at ?? 'Never',
        avatarUrl: row.avatar_url ?? undefined,
      }))
    },
  })
  const staff = staffQuery.data ?? []
  const [invite, setInvite] = useState({ name: '', email: '', phone: '', role: 'agent', branch: 'Nairobi HQ', password: '' })
  const [memberToDeactivate, setMemberToDeactivate] = useState<StaffMember | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const roleChoices = user?.role === 'manager'
    ? roleOptions.filter((option) => option.value !== 'owner')
    : roleOptions

  async function refreshStaff() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
      queryClient.invalidateQueries({ queryKey: ['audit'] }),
    ])
  }

  async function applyInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invite.name.trim() || !invite.email.trim() || !invite.phone.trim() || invite.password.length < 8) {
      setNotice('Name, email, phone and an 8+ character password are required.')
      return
    }
    if (user?.role === 'manager' && invite.role === 'owner') {
      setNotice('Managers cannot create owner accounts.')
      return
    }
    try {
      await apiClient.post('/staff', {
        email: invite.email.trim(),
        full_name: invite.name.trim(),
        phone: invite.phone.trim(),
        role: invite.role,
        password: invite.password,
      })
      setInvite({ name: '', email: '', phone: '', role: 'agent', branch: 'Nairobi HQ', password: '' })
      setNotice('Staff account created successfully.')
      await refreshStaff()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create staff account.')
    }
  }

  async function updateRole(member: StaffMember, role: UserRole) {
    if (user?.role === 'manager' && member.role === 'owner') {
      setNotice('Managers cannot demote an owner.')
      return
    }
    if (member.id === user?.id) {
      setNotice('You cannot change your own role.')
      return
    }
    try {
      await apiClient.patch(`/staff/${encodeURIComponent(member.id)}/role`, { role })
      await refreshStaff()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not change role.')
    }
  }

  function deactivateMember(member: StaffMember) {
    if (member.id === user?.id) {
      setNotice('You cannot deactivate your own account.')
      return
    }
    const ownerCount = staff.filter((person) => person.role === 'owner' && person.active).length
    if (member.role === 'owner' && ownerCount <= 1) {
      setNotice('The last owner cannot be removed.')
      return
    }
    setMemberToDeactivate(member)
  }

  async function deactivateConfirmed() {
    if (!memberToDeactivate) return
    try {
      await apiClient.patch(`/staff/${encodeURIComponent(memberToDeactivate.id)}/status`, { is_active: false })
      setMemberToDeactivate(null)
      setNotice('The staff member has been deactivated and logged out immediately.')
      await refreshStaff()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not deactivate staff member.')
    }
  }

  async function reactivateMember(member: StaffMember) {
    try {
      await apiClient.patch(`/staff/${encodeURIComponent(member.id)}/status`, { is_active: true })
      await refreshStaff()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reactivate staff member.')
    }
  }

  async function uploadAvatar(member: StaffMember, file: File) {
    setNotice(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const result = await apiClient.upload<BackendStaff>(`/staff/${encodeURIComponent(member.id)}/photo`, body, () => undefined)
      await refreshStaff()
      // If the current user's photo was updated, refresh the navbar avatar.
      if (user && user.id === result.id && result.avatar_url) {
        updateUser({ ...user, avatarUrl: result.avatar_url })
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not upload the profile image.')
    }
  }

  async function removeAvatar(member: StaffMember) {
    setNotice(null)
    try {
      await apiClient.delete(`/staff/${encodeURIComponent(member.id)}/photo`)
      await refreshStaff()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove the profile image.')
    }
  }

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Gari Poa</p><h1>Staff</h1></div></header>
      <div className="split-layout">
        <div className="stack stack--md">
          <div className="staff-card-grid">
            {staff.length === 0 && <div className="empty-state">No staff records found.</div>}
            {staff.map((member) => (
              <article className="staff-card" key={member.id}>
                <div className="staff-card__identity">
                  {member.avatarUrl
                    ? <img alt={`${member.name} profile`} className="staff-card__avatar" src={member.avatarUrl} />
                    : <span aria-hidden="true" className="staff-card__avatar staff-card__avatar--placeholder">{member.name.slice(0, 1).toUpperCase()}</span>}
                  <div>
                    <strong>{member.name}</strong>
                    <a href={`mailto:${member.email}`}>{member.email}</a>
                    <small>{member.phone || 'No phone'}</small>
                  </div>
                </div>
                <dl className="staff-card__details">
                  <div><dt>Role</dt><dd>
                    <Select
                      label="Role"
                      onChange={(event) => updateRole(member, event.target.value as UserRole)}
                      options={roleChoices.map((option) => ({ value: option.value, label: option.label }))}
                      value={member.role}
                    />
                  </dd></div>
                  <div><dt>Branch</dt><dd>{member.branch}</dd></div>
                  <div><dt>Status</dt><dd>{member.active ? 'Active' : 'Inactive'}</dd></div>
                  <div><dt>Last login</dt><dd>{member.lastLogin === 'Never' ? 'Never' : formatTime(member.lastLogin)}</dd></div>
                </dl>
                <div className="staff-card__actions">
                  <label className="button button--secondary button--sm">
                    {member.avatarUrl ? 'Change photo' : 'Upload photo'}
                    <input accept="image/*" hidden onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      event.currentTarget.value = ''
                      if (file) void uploadAvatar(member, file)
                    }} type="file" />
                  </label>
                  {member.avatarUrl && <Button onClick={() => void removeAvatar(member)} size="sm" variant="ghost">Remove photo</Button>}
                  {member.active
                    ? <Button disabled={member.id === user?.id || (member.role === 'owner' && staff.filter((person) => person.role === 'owner' && person.active).length <= 1)} onClick={() => deactivateMember(member)} size="sm" variant="secondary">Deactivate</Button>
                    : <Button onClick={() => void reactivateMember(member)} size="sm" variant="primary">Reactivate</Button>}
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className="card-panel">
          <h2>Invite staff</h2>
          <form className="stack stack--md" onSubmit={applyInvite}>
            <Input label="Full name" onChange={(event) => setInvite((current) => ({ ...current, name: event.target.value }))} value={invite.name} />
            <Input label="Email" onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} type="email" value={invite.email} />
            <Input label="Phone" onChange={(event) => setInvite((current) => ({ ...current, phone: event.target.value }))} type="tel" value={invite.phone} />
            <Select label="Role" onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value }))} options={roleChoices.map((option) => ({ value: option.value, label: option.label }))} value={invite.role} />
            <Input label="Temporary password" onChange={(event) => setInvite((current) => ({ ...current, password: event.target.value }))} type="password" value={invite.password} />
            <Input label="Branch" onChange={(event) => setInvite((current) => ({ ...current, branch: event.target.value }))} value={invite.branch} />
            {notice && <p className="field__hint" role="status">{notice}</p>}
            <Button type="submit">Invite staff</Button>
          </form>
        </aside>
      </div>
      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Deactivate"
        description={memberToDeactivate ? `This will log out ${memberToDeactivate.name} immediately and lock them out of the workspace.` : 'This will log the user out immediately.'}
        onCancel={() => setMemberToDeactivate(null)}
        onConfirm={memberToDeactivate ? deactivateConfirmed : () => undefined}
        open={Boolean(memberToDeactivate)}
        title="Deactivate staff member"
      />
    </section>
  )
}

export function AuditPage() {
  const { user } = useAuth()

  if (!user || user.role !== 'owner') {
    return <section className="page-shell"><div className="card-panel"><h1>Access denied</h1><p>You must be an owner to view the audit log.</p></div></section>
  }

  return <AuditLogView />
}

function AuditLogView() {
  const [actorFilter, setActorFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const auditQuery = useQuery({
    queryKey: ['audit'],
    queryFn: async () => {
      const rows = await apiClient.get<BackendAudit[]>('/audit?limit=200')
      return rows.map((row): AuditEntry => ({
        id: row.id,
        actor: row.actor_id ?? 'system',
        action: row.action,
        entity: row.entity,
        createdAt: row.created_at,
        before: row.before ?? undefined,
        after: row.after ?? undefined,
      }))
    },
  })
  const auditEntries = auditQuery.data ?? []

  const actorOptions = ['all', ...new Set(auditEntries.map((entry) => entry.actor))]
  const actionOptions = ['all', ...new Set(auditEntries.map((entry) => entry.action))]
  const entityOptions = ['all', ...new Set(auditEntries.map((entry) => entry.entity))]

  const filtered = auditEntries.filter((entry) => {
    const itemTime = new Date(entry.createdAt).getTime()
    const from = fromDate ? new Date(fromDate).getTime() : Number.NEGATIVE_INFINITY
    const to = toDate ? new Date(toDate).getTime() + 86_400_000 : Number.POSITIVE_INFINITY
    const actorMatch = actorFilter === 'all' || entry.actor === actorFilter
    const actionMatch = actionFilter === 'all' || entry.action === actionFilter
    const entityMatch = entityFilter === 'all' || entry.entity === entityFilter
    return itemTime >= from && itemTime <= to && actorMatch && actionMatch && entityMatch
  })

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Gari Poa</p><h1>Audit log</h1></div></header>
      <div className="card-panel stack stack--md">
        <div className="filter-grid">
          <Input label="From date" onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} />
          <Input label="To date" onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} />
          <Select label="Actor" onChange={(event) => setActorFilter(event.target.value)} options={actorOptions.map((value) => ({ value, label: value === 'all' ? 'All actors' : value }))} value={actorFilter} />
          <Select label="Action" onChange={(event) => setActionFilter(event.target.value)} options={actionOptions.map((value) => ({ value, label: value === 'all' ? 'All actions' : value }))} value={actionFilter} />
          <Select label="Entity" onChange={(event) => setEntityFilter(event.target.value)} options={entityOptions.map((value) => ({ value, label: value === 'all' ? 'All entities' : value }))} value={entityFilter} />
        </div>
        <DataTable
          columns={[
            { key: 'time', header: 'Time (EAT)', render: (row: AuditEntry) => <span>{formatTime(row.createdAt)}</span> },
            { key: 'actor', header: 'Actor', render: (row: AuditEntry) => row.actor },
            { key: 'action', header: 'Action', render: (row: AuditEntry) => row.action },
            { key: 'entity', header: 'Entity', render: (row: AuditEntry) => row.entity },
            { key: 'diff', header: 'Diff', render: (row: AuditEntry) => (
              <button onClick={() => setExpanded((current) => ({ ...current, [row.id]: !current[row.id] }))} type="button">
                {expanded[row.id] ? 'Hide diff' : 'View diff'}
              </button>
            ) },
          ]}
          empty={<div className="empty-state">No audit records match the selected filters.</div>}
          rowKey={(row) => row.id}
          rows={filtered}
        />
        {filtered.map((entry) => expanded[entry.id] && (
          <div className="audit-diff" key={`${entry.id}-diff`}>
            <h3>Before</h3><pre>{JSON.stringify(entry.before ?? {}, null, 2)}</pre>
            <h3>After</h3><pre>{JSON.stringify(entry.after ?? {}, null, 2)}</pre>
          </div>
        ))}
      </div>
    </section>
  )
}

export { DashboardPage, BookingsPage }
