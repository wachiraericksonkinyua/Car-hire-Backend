import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Booking, PaymentMethod } from '../../api/types'
import { useBookingList, useUpdateBooking, useVehicles } from '../../api/queries'
import { Button, DataTable, EmptyState, ErrorState, PillTabs, Select, Skeleton, StatusChip } from '../../components/ui'
import { useCan } from '../../hooks/useCan'
import { t } from '../../i18n'
import { formatEat, formatKes } from '../../lib'
import { HoldCountdown } from './HoldCountdown'

const paymentLabels: Record<PaymentMethod, string> = {
  mpesa_online: 'booking.mpesaOnline',
  mpesa_manual: 'booking.mpesaManual',
  cash: 'booking.cash',
  bank: 'booking.bank',
  corporate: 'booking.corporate',
}

const tabDefinitions: { value: string; label: string }[] = [
  { value: 'all', label: 'booking.all' },
  { value: 'reserved', label: 'booking.reserved' },
  { value: 'confirmed', label: 'booking.confirmed' },
  { value: 'checked_out', label: 'booking.checkedOut' },
  { value: 'overdue', label: 'booking.overdue' },
  { value: 'completed', label: 'booking.completed' },
  { value: 'cancelled', label: 'booking.cancelledExpired' },
]

function BookingActions({ booking }: { booking: Booking }) {
  const canApprove = useCan('approvals:offline')
  const canHandover = useCan('handover:manage')
  const canCreateBookings = useCan('bookings:create')
  const updateBooking = useUpdateBooking(booking.id)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const actions = [<Link className="button button--ghost button--sm" key="view" to={`/admin/bookings/${booking.id}`}>{t('booking.view')}</Link>]

  if (booking.status === 'reserved' && canApprove) {
    actions.push(<Button key="approve" onClick={() => void updateBooking.mutateAsync({ status: 'confirmed', pendingApproval: false })} size="sm" variant="secondary">{t('booking.approve')}</Button>)
  }
  if (booking.status === 'confirmed' && canHandover) {
    actions.push(<Link className="button button--secondary button--sm" key="checkout" to={`/admin/bookings/${booking.id}/check-out`}>{t('booking.checkOut')}</Link>)
  }
  if (['checked_out', 'overdue'].includes(booking.status) && canHandover) {
    actions.push(<Link className="button button--secondary button--sm" key="checkin" to={`/admin/bookings/${booking.id}/check-in`}>{t('booking.checkIn')}</Link>)
  }
  return (
    <div className="booking-row-actions">
      {actions}
      {canCreateBookings && ['reserved', 'confirmed'].includes(booking.status) && <>
        <Button onClick={() => setConfirmCancel(true)} size="sm" variant="ghost">{t('booking.cancel')}</Button>
        {confirmCancel && <div className="booking-cancel-confirm" role="group"><span>{t('booking.cancelConfirm')}</span><Button onClick={() => void updateBooking.mutateAsync({ status: 'cancelled' }).then(() => setConfirmCancel(false))} size="sm" variant="danger">{t('booking.confirmAction')}</Button><Button onClick={() => setConfirmCancel(false)} size="sm" variant="secondary">{t('booking.back')}</Button></div>}
      </>}
    </div>
  )
}

export function BookingsListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const query = searchParams.toString()
  const bookings = useBookingList(query)
  const vehicleQuery = useVehicles()
  const activeTab = searchParams.get('status') ?? 'all'

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const columns = useMemo(() => [
    { key: 'reference', header: t('booking.reference'), render: (booking: Booking) => <Link className="booking-reference" to={`/admin/bookings/${booking.id}`}>{booking.reference}</Link> },
    { key: 'customer', header: t('booking.customer'), render: (booking: Booking) => booking.customerName ?? '—' },
    { key: 'vehicle', header: t('booking.vehicle'), render: (booking: Booking) => {
      const vehicle = vehicleQuery.data?.find((item) => item.id === booking.vehicleId)
      return vehicle ? `${vehicle.make} ${vehicle.model}` : booking.vehicleId
    } },
    { key: 'pickup', header: t('booking.pickupAt'), render: (booking: Booking) => formatEat(booking.pickupAt) },
    { key: 'return', header: t('booking.returnAt'), render: (booking: Booking) => formatEat(booking.returnAt) },
    { key: 'mode', header: t('booking.mode'), render: (booking: Booking) => t(booking.mode === 'chauffeur' ? 'booking.chauffeur' : 'booking.selfDrive') },
    { key: 'payment', header: t('booking.payment'), render: (booking: Booking) => t(paymentLabels[booking.paymentMethod ?? 'cash']) },
    { key: 'status', header: t('booking.status'), render: (booking: Booking) => <div className="booking-status-cell"><StatusChip status={booking.status} variant="booking" />{booking.status === 'reserved' && <HoldCountdown holdExpiresAt={booking.holdExpiresAt} onExpire={() => void queryClient.invalidateQueries({ queryKey: ['bookings'] })} />}</div> },
    { key: 'total', header: t('booking.total'), render: (booking: Booking) => formatKes(booking.totalKes) },
    { key: 'actions', header: t('booking.actions'), render: (booking: Booking) => <BookingActions booking={booking} /> },
  ], [queryClient, vehicleQuery.data])

  return (
    <section className="bookings-list-page">
      <header className="bookings-list-heading"><div><p>{t('booking.referenceHelp')}</p><h2>{t('booking.listTitle')}</h2></div><Link className="button button--primary" to="/admin/bookings/new">{t('booking.createFirst')}</Link></header>
      <PillTabs label={t('booking.listTitle')} onChange={(value) => setFilter('status', value === 'all' ? '' : value)} options={tabDefinitions.map((tab) => ({ value: tab.value, label: t(tab.label) }))} value={activeTab === 'expired' ? 'cancelled' : activeTab} />
      <div className="booking-filters">
        <input aria-label={t('booking.search')} className="control" onChange={(event) => setFilter('search', event.target.value)} placeholder={t('booking.search')} value={searchParams.get('search') ?? ''} />
        <Select label={t('booking.vehicleFilter')} onChange={(event) => setFilter('vehicleId', event.target.value)} options={[{ value: '', label: t('booking.allVehicles') }, ...(vehicleQuery.data ?? []).map((vehicle) => ({ value: vehicle.id, label: `${vehicle.make} ${vehicle.model} (${vehicle.registration})` }))]} value={searchParams.get('vehicleId') ?? ''} />
        <Select label={t('booking.paymentFilter')} onChange={(event) => setFilter('paymentMethod', event.target.value)} options={[{ value: '', label: t('booking.allPayments') }, ...(['mpesa_online', 'mpesa_manual', 'cash', 'bank', 'corporate'] as const).map((method) => ({ value: method, label: t(`booking.${method}`) }))]} value={searchParams.get('paymentMethod') ?? ''} />
        <input aria-label={t('booking.from')} className="control" onChange={(event) => setFilter('from', event.target.value)} type="datetime-local" value={searchParams.get('from') ?? ''} />
        <input aria-label={t('booking.to')} className="control" onChange={(event) => setFilter('to', event.target.value)} type="datetime-local" value={searchParams.get('to') ?? ''} />
      </div>
      {bookings.isLoading && <Skeleton rows={5} />}
      {bookings.isError && <ErrorState onRetry={() => void bookings.refetch()} retryLabel={t('styleguide.retry')} title={t('dashboard.metricError')} />}
      {!bookings.isLoading && !bookings.isError && <DataTable
        columns={columns}
        empty={<EmptyState action={<Link className="button button--primary" to="/admin/bookings/new">{t('booking.createFirst')}</Link>} description={t('booking.noRecords')} title={t('booking.searchNoResults')} />}
        rowKey={(booking) => booking.id}
        rows={bookings.data ?? []}
      />}
    </section>
  )
}