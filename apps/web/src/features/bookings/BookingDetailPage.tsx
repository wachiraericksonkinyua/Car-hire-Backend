import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAssignDriver, useAvailableDrivers, useBookingDetail, useUpdateBooking } from '../../api/queries'
import { ApiError } from '../../api/client'
import type { BookingStatus } from '../../api/types'
import { Button, Checkbox, DataTable, EmptyState, ErrorState, Modal, Select, Skeleton, StatusChip } from '../../components/ui'
import { useCan } from '../../hooks/useCan'
import { t } from '../../i18n'
import { formatEat, formatKenyanPhone, formatKes } from '../../lib'
import { vehicles } from '../../mocks/fixtures'
import { HoldCountdown } from './HoldCountdown'
import { QuoteBreakdown } from './QuoteBuilder'
import { PaymentStatus } from './PaymentStatus'
import { getDriverEligibilityReason } from '../drivers/driverRules'

export function BookingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const bookingQuery = useBookingDetail(id)
  const updateBooking = useUpdateBooking(id)
  const assignDriver = useAssignDriver(id)
  const canApprove = useCan('approvals:offline')
  const canHandover = useCan('handover:manage')
  const canAssignDriver = useCan('drivers:assign')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [assignDriverOpen, setAssignDriverOpen] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [autoAssign, setAutoAssign] = useState(false)
  const [assignDriverError, setAssignDriverError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [actionError, setActionError] = useState(false)
  const booking = bookingQuery.data
  const vehicle = booking ? vehicles.find((item) => item.id === booking.vehicleId) : undefined
  const availableDriversQuery = useAvailableDrivers(booking?.pickupAt ?? '', booking?.returnAt ?? '', booking?.vehicleId ?? '', assignDriverOpen)
  const assignableDrivers = (availableDriversQuery.data?.drivers ?? []).filter((driver) => booking
    && !getDriverEligibilityReason(driver, booking.returnAt)
    && (!vehicle || vehicle.seats <= 8 || driver.licenceClass === 'C1'))
  const suggestedDriverId = assignableDrivers.some((driver) => driver.id === availableDriversQuery.data?.autoAssignDriverId)
    ? availableDriversQuery.data?.autoAssignDriverId ?? null
    : null

  async function updateStatus(status: BookingStatus) {
    setActionError(false)
    try {
      await updateBooking.mutateAsync({ status, pendingApproval: status === 'confirmed' ? false : booking?.pendingApproval })
    } catch {
      setActionError(true)
      return
    }
  }

  if (bookingQuery.isLoading) return <Skeleton rows={5} />
  if (bookingQuery.isError || !booking) return <ErrorState onRetry={() => void bookingQuery.refetch()} retryLabel={t('styleguide.retry')} title={t('booking.actionError')} />

  const visibleStatus: BookingStatus = expired && booking.status === 'reserved' ? 'expired' : booking.status

  return (
    <div className="booking-detail-page">
      <header className="booking-detail-header">
        <div><Link className="booking-back-link" to="/admin/bookings">{t('booking.listTitle')}</Link><h2>{booking.reference}</h2></div>
        <div className="booking-detail-header__status"><StatusChip status={visibleStatus} variant="booking" />{booking.status === 'reserved' && <HoldCountdown holdExpiresAt={booking.holdExpiresAt} onExpire={() => { setExpired(true); void bookingQuery.refetch() }} />}</div>
      </header>

      <section className="booking-detail-actions">
        {booking.status === 'reserved' && canApprove && booking.pendingApproval && <Button disabled={updateBooking.isPending} onClick={() => void updateStatus('confirmed')} variant="primary">{t('booking.approveOffline')}</Button>}
        {booking.status === 'confirmed' && canHandover && <Link className="button button--primary" to={`/admin/bookings/${booking.id}/check-out`}>{t('booking.checkOut')}</Link>}
        {booking.status === 'confirmed' && canAssignDriver && booking.mode === 'chauffeur' && <>
          <Button onClick={() => { setAssignDriverOpen(true); setAssignDriverError(null); setSelectedDriverId(''); setAutoAssign(false) }} variant="secondary">{t('booking.assignDriver')}</Button>
        </>}
        {booking.status === 'checked_out' && canHandover && <Link className="button button--primary" to={`/admin/bookings/${booking.id}/check-in`}>{t('booking.checkIn')}</Link>}
        {booking.status === 'overdue' && canHandover && <Link className="button button--danger" to={`/admin/bookings/${booking.id}/check-in`}>{t('booking.checkIn')}</Link>}
        {['reserved', 'confirmed'].includes(booking.status) && <Button onClick={() => setCancelOpen(true)} variant="danger">{t('booking.cancel')}</Button>}
        {booking.status === 'overdue' && <span className="booking-late-fee">{t('booking.accruedLateFee')}: {formatKes(booking.accruedLateFeeKes ?? 0)}</span>}
      </section>

      {assignDriverOpen && <Modal open title="Assign driver" onClose={() => setAssignDriverOpen(false)}>
        <div className="driver-assignment-modal stack stack--md">
          <Checkbox checked={autoAssign} label="Auto-assign next available driver by rotation" onChange={(checked) => { setAutoAssign(checked); setSelectedDriverId('') }} />
          {availableDriversQuery.isLoading && <Skeleton rows={2} />}
          {availableDriversQuery.isError && <ErrorState onRetry={() => void availableDriversQuery.refetch()} retryLabel="Retry" title="Available drivers could not be loaded" />}
          {availableDriversQuery.data && assignableDrivers.length === 0 && <p className="empty-state">No available, licence-valid drivers match this vehicle and trip window.</p>}
          {availableDriversQuery.data && assignableDrivers.length > 0 && <>
            <Select
              disabled={autoAssign}
              label="Available drivers"
              onChange={(event) => setSelectedDriverId(event.target.value)}
              options={[{ value: '', label: 'Choose a driver' }, ...assignableDrivers.map((driver) => ({ value: driver.id, label: `${driver.name} · ${driver.licenceClass} · ${driver.rating.toFixed(1)} / 5` }))]}
              value={autoAssign ? suggestedDriverId ?? '' : selectedDriverId}
            />
            {assignDriverError && <p className="field__error" role="alert">{assignDriverError}</p>}
            <div className="confirm-dialog__actions">
              <Button onClick={() => setAssignDriverOpen(false)} variant="secondary">Cancel</Button>
              <Button disabled={assignDriver.isPending || !(autoAssign ? suggestedDriverId : selectedDriverId)} onClick={() => {
                const driverId = autoAssign ? suggestedDriverId : selectedDriverId
                if (!driverId) return
                setAssignDriverError(null)
                void assignDriver.mutateAsync(driverId).then(() => setAssignDriverOpen(false)).catch((error: unknown) => {
                  setAssignDriverError(error instanceof ApiError && error.status === 409
                    ? 'This driver was just assigned to another booking. Refresh the available drivers and choose again.'
                    : 'The driver could not be assigned. Try again.')
                  void availableDriversQuery.refetch()
                })
              }} variant="primary">{assignDriver.isPending ? 'Assigning…' : 'Assign driver'}</Button>
            </div>
          </>}
        </div>
      </Modal>}

      {booking.status === 'reserved' && booking.paymentMethod === 'mpesa_online' && <section className="booking-detail-payment">
        <PaymentStatus amountDueKes={booking.totalKes} bookingId={booking.id} initialPhone={booking.customerPhone} onConfirmed={() => void bookingQuery.refetch()} />
      </section>}

      <div className="booking-detail-grid">
        <section className="booking-detail-panel"><h3>{t('booking.customer')}</h3><dl className="booking-details-list">
          <div><dt>{t('booking.customerName')}</dt><dd>{booking.customerName ?? '—'}</dd></div>
          <div><dt>{t('booking.customerPhone')}</dt><dd>{booking.customerPhone ? formatKenyanPhone(booking.customerPhone) : '—'}</dd></div>
          <div><dt>{t('booking.pickupAt')}</dt><dd>{formatEat(booking.pickupAt)}</dd></div>
          <div><dt>{t('booking.returnAt')}</dt><dd>{formatEat(booking.returnAt)}</dd></div>
        </dl></section>

        <section className="booking-detail-panel"><h3>{t('booking.vehicle')}</h3><dl className="booking-details-list">
          <div><dt>{t('booking.vehicle')}</dt><dd>{vehicle ? `${vehicle.make} ${vehicle.model}` : booking.vehicleId}</dd></div>
          <div><dt>{t('booking.reference')}</dt><dd>{vehicle?.registration ?? '—'}</dd></div>
          <div><dt>{t('booking.mode')}</dt><dd>{t(booking.mode === 'chauffeur' ? 'booking.chauffeur' : 'booking.selfDrive')}</dd></div>
          <div><dt>{t('booking.payment')}</dt><dd>{t(`booking.${booking.paymentMethod === 'mpesa_online' ? 'mpesaOnline' : booking.paymentMethod === 'mpesa_manual' ? 'mpesaManual' : booking.paymentMethod ?? 'cash'}`)}</dd></div>
        </dl></section>

        <section className="booking-detail-panel booking-detail-panel--wide"><h3>{t('booking.quoteSnapshot')}</h3>
          {booking.pricingSnapshot ? <QuoteBreakdown quote={{ currency: 'KES', pricingSnapshot: booking.pricingSnapshot }} /> : <p>{t('booking.noQuoteSnapshot')}</p>}
        </section>

        <section className="booking-detail-panel"><h3>{t('booking.payments')}</h3>
          {booking.payments?.length ? <DataTable columns={[
            { key: 'method', header: t('booking.payment'), render: (payment) => t(`booking.${payment.method === 'mpesa_online' ? 'mpesaOnline' : payment.method === 'mpesa_manual' ? 'mpesaManual' : payment.method}`) },
            { key: 'amount', header: t('booking.total'), render: (payment) => formatKes(payment.amountKes) },
            { key: 'status', header: t('booking.status'), render: (payment) => payment.status },
          ]} empty={<></>} rowKey={(payment) => payment.id} rows={booking.payments} /> : <EmptyState description={t('booking.noPayments')} title={t('booking.payments')} />}
        </section>

        <section className="booking-detail-panel"><h3>{t('booking.driver')}</h3><p>{booking.driver?.name ?? '—'}</p></section>
        <section className="booking-detail-panel"><h3>{t('booking.inspections')}</h3>
          {booking.inspections?.length ? <ul className="booking-event-list">{booking.inspections.map((inspection) => <li key={inspection.id}><b>{t(inspection.type === 'check_out' ? 'booking.checkOut' : 'booking.checkIn')}</b><span>{inspection.odometer} km</span><time>{formatEat(inspection.createdAt)}</time></li>)}</ul> : <EmptyState description={t('booking.noInspections')} title={t('booking.inspections')} />}
        </section>
        <section className="booking-detail-panel"><h3>{t('booking.eventTimeline')}</h3>
          {booking.events?.length ? <ul className="booking-event-list">{booking.events.map((event) => <li key={event.id}><b>{event.type}</b><span>{event.note}</span><small>{event.actor}</small><time>{formatEat(event.createdAt)}</time></li>)}</ul> : <EmptyState description={t('booking.noEvents')} title={t('booking.eventTimeline')} />}
        </section>
        <section className="booking-detail-panel"><h3>{t('booking.audit')}</h3>
          {booking.auditEntries?.length ? <ul className="booking-event-list">{booking.auditEntries.map((event) => <li key={event.id}><b>{event.type}</b><span>{event.note}</span><small>{event.actor}</small><time>{formatEat(event.createdAt)}</time></li>)}</ul> : <EmptyState description={t('booking.noAudit')} title={t('booking.audit')} />}
        </section>
      </div>
      {actionError && <p className="quote-conflict" role="alert">{t('booking.actionError')}</p>}
      {cancelOpen && <div className="booking-cancel-confirm" role="group"><span>{t('booking.cancelConfirm')}</span><Button onClick={() => void updateStatus('cancelled').then(() => { setCancelOpen(false); navigate('/admin/bookings') })} variant="danger">{t('booking.confirmAction')}</Button><Button onClick={() => setCancelOpen(false)} variant="secondary">{t('booking.back')}</Button></div>}
    </div>
  )
}