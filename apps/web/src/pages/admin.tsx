import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, DataTable, Input, Modal, Select, Toast } from '../components/ui'
import { useAuth } from '../hooks/AuthContext'
import { canApproveBooking } from '../hooks/useCan'
import { useTranslation } from '../i18n'
import type { AuditEntry, Booking, PaymentMethod, StaffMember, UserRole } from '../api/types'
import { auditEntries as initialAuditEntries, bookings as initialBookings, staffMembers as initialStaffMembers } from '../mocks/fixtures'
import { PagePlaceholder } from './PagePlaceholder'

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa_manual', label: 'M-Pesa Manual' },
  { value: 'bank', label: 'Bank EFT' },
  { value: 'corporate', label: 'Corporate Credit' },
] as const

const roleOptions = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'driver', label: 'Driver' },
  { value: 'mechanic', label: 'Mechanic' },
] as const

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
function FleetPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.fleet')} /> }
function BookingsPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.bookings')} /> }
function ProfilePage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.profile')} /> }

export function ApprovalsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [approvals, setApprovals] = useState(() => initialBookings
    .filter((booking) => booking.status === 'reserved' && booking.pendingApproval !== false)
    .sort((left, right) => (left.holdExpiresAt ?? left.pickupAt).localeCompare(right.holdExpiresAt ?? right.pickupAt)))
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

    setApprovals((current) => current.filter((booking) => booking.id !== selectedBooking.id))
    setToast('Offline approval recorded successfully.')
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    closeApproval()
  }

  const approvalRows = approvals
    .map((booking) => ({
      ...booking,
      canApprove: canApproveBooking(user?.id ?? '', booking.createdById ?? ''),
    }))

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">AutoHire KE</p><h1>Approvals</h1></div></header>
      <div className="stack stack--lg">
        <div className="card-panel">
          <DataTable
            columns={[
              { key: 'booking', header: 'Booking', render: (row: Booking) => <><strong>{row.reference}</strong><div className="muted">{row.customerName}</div></> },
              { key: 'vehicle', header: 'Vehicle', render: (row: Booking) => {
                const vehicle = initialBookings.find((item) => item.id === row.id)
                return <span>{vehicle ? vehicle.reference : row.vehicleId}</span>
              } },
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
  const { user } = useAuth()
  const [staff, setStaff] = useState<StaffMember[]>(initialStaffMembers)
  const [invite, setInvite] = useState({ name: '', email: '', phone: '', role: 'agent', branch: 'Nairobi HQ' })
  const [memberToDeactivate, setMemberToDeactivate] = useState<StaffMember | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const roleChoices = user?.role === 'manager'
    ? roleOptions.filter((option) => option.value !== 'owner')
    : roleOptions

  function applyInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invite.name.trim() || !invite.email.trim() || !invite.phone.trim()) {
      setNotice('Name, email and phone are required.')
      return
    }
    if (user?.role === 'manager' && invite.role === 'owner') {
      setNotice('Managers cannot create owner accounts.')
      return
    }

    const newMember: StaffMember = {
      id: `usr-${Date.now()}`,
      name: invite.name.trim(),
      email: invite.email.trim(),
      phone: invite.phone.trim(),
      role: invite.role as UserRole,
      branch: invite.branch || 'Nairobi HQ',
      active: true,
      lastLogin: 'Never',
    }
    setStaff((current) => [newMember, ...current])
    setInvite({ name: '', email: '', phone: '', role: 'agent', branch: 'Nairobi HQ' })
    setNotice('Staff invite added successfully.')
  }

  function updateRole(member: StaffMember, role: UserRole) {
    if (user?.role === 'manager' && member.role === 'owner') {
      setNotice('Managers cannot demote an owner.')
      return
    }
    if (member.id === user?.id) {
      setNotice('You cannot change your own role.')
      return
    }
    setStaff((current) => current.map((person) => person.id === member.id ? { ...person, role } : person))
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

  function deactivateConfirmed() {
    if (!memberToDeactivate) return
    setStaff((current) => current.map((person) => person.id === memberToDeactivate.id ? { ...person, active: false } : person))
    setMemberToDeactivate(null)
    setNotice('The staff member has been deactivated and will be logged out immediately.')
  }

  function reactivateMember(member: StaffMember) {
    setStaff((current) => current.map((person) => person.id === member.id ? { ...person, active: true } : person))
  }

  return (
    <section className="page-shell">
      <header className="page-header"><div><p className="eyebrow">AutoHire KE</p><h1>Staff</h1></div></header>
      <div className="split-layout">
        <div className="card-panel">
          <DataTable
            columns={[
              { key: 'name', header: 'Name', render: (row: StaffMember) => <><strong>{row.name}</strong><div className="muted">{row.email}</div></> },
              { key: 'phone', header: 'Phone', render: (row: StaffMember) => row.phone },
              { key: 'role', header: 'Role', render: (row: StaffMember) => (
                <Select
                  label="Role"
                  onChange={(event) => updateRole(row, event.target.value as UserRole)}
                  options={roleChoices.map((option) => ({ value: option.value, label: option.label }))}
                  value={row.role}
                />
              ) },
              { key: 'branch', header: 'Branch', render: (row: StaffMember) => row.branch },
              { key: 'status', header: 'Active', render: (row: StaffMember) => row.active ? 'Yes' : 'No' },
              { key: 'last', header: 'Last login', render: (row: StaffMember) => row.lastLogin === 'Never' ? 'Never' : formatTime(row.lastLogin) },
              { key: 'toggle', header: 'Actions', render: (row: StaffMember) => (
                <div className="inline-actions">
                  {row.active
                    ? <Button disabled={row.id === user?.id || (row.role === 'owner' && staff.filter((member) => member.role === 'owner' && member.active).length <= 1)} onClick={() => deactivateMember(row)} size="sm" variant="secondary">Deactivate</Button>
                    : <Button onClick={() => reactivateMember(row)} size="sm" variant="primary">Reactivate</Button>}
                </div>
              ) },
            ]}
            empty={<div className="empty-state">No staff records found.</div>}
            rowKey={(row) => row.id}
            rows={staff}
          />
        </div>
        <aside className="card-panel">
          <h2>Invite staff</h2>
          <form className="stack stack--md" onSubmit={applyInvite}>
            <Input label="Full name" onChange={(event) => setInvite((current) => ({ ...current, name: event.target.value }))} value={invite.name} />
            <Input label="Email" onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} type="email" value={invite.email} />
            <Input label="Phone" onChange={(event) => setInvite((current) => ({ ...current, phone: event.target.value }))} type="tel" value={invite.phone} />
            <Select label="Role" onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value }))} options={roleChoices.map((option) => ({ value: option.value, label: option.label }))} value={invite.role} />
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
  const [actorFilter, setActorFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!user || user.role !== 'owner') {
    return <section className="page-shell"><div className="card-panel"><h1>Access denied</h1><p>You must be an owner to view the audit log.</p></div></section>
  }

  const actorOptions = ['all', ...new Set((initialAuditEntries as AuditEntry[]).map((entry) => entry.actor))]
  const actionOptions = ['all', ...new Set((initialAuditEntries as AuditEntry[]).map((entry) => entry.action))]
  const entityOptions = ['all', ...new Set((initialAuditEntries as AuditEntry[]).map((entry) => entry.entity))]

  const filtered = (initialAuditEntries as AuditEntry[]).filter((entry) => {
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
      <header className="page-header"><div><p className="eyebrow">AutoHire KE</p><h1>Audit log</h1></div></header>
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

export { DashboardPage, FleetPage, BookingsPage, ProfilePage }
