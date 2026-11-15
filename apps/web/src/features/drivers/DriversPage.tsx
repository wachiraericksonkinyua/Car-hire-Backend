import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { useDrivers } from '../../api/queries'
import type { Driver } from '../../api/types'
import { Button, ErrorState, Input, Modal, Select, Skeleton } from '../../components/ui'
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
  const [form, setForm] = useState(emptyForm)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [editForm, setEditForm] = useState({ licenceClass: '', licenceExpiry: '', psvExpiry: '', status: 'Available', rating: '' })

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
    ])
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
      })
      setForm(emptyForm)
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

  return (
    <section className="driver-roster-page">
      <header className="driver-roster-heading"><div><p className="eyebrow">Operations</p><h2>Driver roster</h2></div><span>{drivers.length} drivers</span></header>
      {notice && <p className="field__hint" role="status">{notice}</p>}
      <div className="driver-roster-table-wrap">
        <table className="driver-roster-table">
          <thead><tr>
            <th scope="col">Driver</th><th scope="col">Status</th><th scope="col">Languages</th><th scope="col">Licence class</th>
            <th scope="col">Licence expiry</th><th scope="col">PSV expiry</th><th scope="col">Rating</th><th scope="col">Current trip</th><th scope="col">Actions</th>
          </tr></thead>
          <tbody>{drivers.map((driver) => {
            const expiryReason = getDriverExpiryReason(driver)
            return <tr className={expiryReason ? 'driver-roster-row driver-roster-row--expired' : 'driver-roster-row'} key={driver.id}>
              <td data-label="Driver"><strong>{driver.name}</strong><small>{driver.phone}</small>{expiryReason && <span className="driver-expiry-reason">{expiryReason}</span>}</td>
              <td data-label="Status"><span className={`driver-status-chip driver-status-chip--${driver.status}`}>{driverStatusLabels[driver.status]}</span></td>
              <td data-label="Languages">{driver.languages.join(', ')}</td>
              <td data-label="Licence class">{driver.licenceClass}</td>
              <td data-label="Licence expiry">{formatEat(driver.licenceExpiresAt).split(',')[0]}</td>
              <td data-label="PSV expiry">{formatEat(driver.psvExpiresAt).split(',')[0]}</td>
              <td data-label="Rating"><span className="driver-rating">{driver.rating.toFixed(1)} / 5</span></td>
              <td data-label="Current trip">{driver.currentTrip
                ? <Link to={`/admin/bookings/${driver.currentTrip.bookingId}`}>{driver.currentTrip.reference}</Link>
                : '—'}</td>
              <td data-label="Actions">{canManage ? <div className="inline-actions">
                <Button size="sm" variant="secondary" onClick={() => openEdit(driver)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleStatus(driver)}>{driver.status === 'off_duty' ? 'Mark available' : 'Off duty'}</Button>
              </div> : '—'}</td>
            </tr>
          })}</tbody>
        </table>
      </div>

      {canManage && <form className="card-panel stack stack--md driver-create-panel" onSubmit={(event) => void createProfile(event)}>
        <h3>Add driver profile</h3>
        <p className="field__hint">Create the driver user in Staff first, then link a profile here.</p>
        <div className="filter-grid">
          <Select
            label="Driver account"
            onChange={(event) => setForm({ ...form, userId: event.target.value })}
            options={[{ value: '', label: 'Select driver account' }, ...availableUsers.map((staff) => ({ value: staff.id, label: `${staff.full_name} (${staff.email})` }))]}
            value={form.userId}
          />
          <Input label="Licence class" onChange={(event) => setForm({ ...form, licenceClass: event.target.value })} value={form.licenceClass} />
          <Input label="Licence expiry" onChange={(event) => setForm({ ...form, licenceExpiry: event.target.value })} type="date" value={form.licenceExpiry} />
          <Input label="PSV expiry" onChange={(event) => setForm({ ...form, psvExpiry: event.target.value })} type="date" value={form.psvExpiry} />
        </div>
        <Button type="submit">Create profile</Button>
      </form>}

      {editing && <Modal open title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
        <div className="stack stack--md">
          <Input label="Licence class" onChange={(event) => setEditForm({ ...editForm, licenceClass: event.target.value })} value={editForm.licenceClass} />
          <Input label="Licence expiry" onChange={(event) => setEditForm({ ...editForm, licenceExpiry: event.target.value })} type="date" value={editForm.licenceExpiry} />
          <Input label="PSV expiry" onChange={(event) => setEditForm({ ...editForm, psvExpiry: event.target.value })} type="date" value={editForm.psvExpiry} />
          <Select label="Status" onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} options={[{ value: 'Available', label: 'Available' }, { value: 'OffDuty', label: 'Off duty' }]} value={editForm.status} />
          <Input label="Rating" onChange={(event) => setEditForm({ ...editForm, rating: event.target.value })} type="number" value={editForm.rating} />
          <div className="confirm-dialog__actions">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void saveEdit()}>Save driver</Button>
          </div>
        </div>
      </Modal>}
    </section>
  )
}
