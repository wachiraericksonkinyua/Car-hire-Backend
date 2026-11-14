import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, MessageCircle, Phone } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useMyDriverTrips, useUpdateDriverTripStatus } from '../../api/queries'
import type { Booking, DriverTripStatus } from '../../api/types'
import { Button, ConfirmDialog, EmptyState, ErrorState, Skeleton } from '../../components/ui'
import { useAuth } from '../../hooks/AuthContext'
import { formatEat, formatKenyanPhone } from '../../lib'
import { SOSButton } from '../incidents/SOSButton'

const tripTransitions: { status: DriverTripStatus; label: string; previous?: DriverTripStatus }[] = [
  { status: 'en_route_to_pickup', label: 'En Route to Pickup' },
  { status: 'customer_onboard', label: 'Customer Onboard', previous: 'en_route_to_pickup' },
  { status: 'trip_completed', label: 'Trip Completed', previous: 'customer_onboard' },
]

function currentTripStatus(booking: Booking) {
  return booking.driverTripStatus?.replaceAll('_', ' ') ?? 'Assigned'
}

export function MyTripsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const tripsQuery = useMyDriverTrips()
  const updateStatus = useUpdateDriverTripStatus()
  const [pendingTransition, setPendingTransition] = useState<{ booking: Booking; status: DriverTripStatus; label: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function confirmTransition() {
    if (!pendingTransition) return
    setActionError(null)
    try {
      await updateStatus.mutateAsync({ bookingId: pendingTransition.booking.id, status: pendingTransition.status })
      setPendingTransition(null)
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 403 ? 'This trip is no longer assigned to your account.' : 'Trip status could not be updated. Try again.')
      setPendingTransition(null)
    }
  }

  async function signOut() {
    await logout().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  if (tripsQuery.isLoading) return <main className="driver-app"><Skeleton rows={4} /></main>
  if (tripsQuery.isError) return <main className="driver-app"><ErrorState onRetry={() => void tripsQuery.refetch()} retryLabel="Retry" title="Trips could not be loaded" /></main>

  const trips = (tripsQuery.data ?? []).filter((booking) => booking.driver?.id === user?.id)
  return (
    <main className="driver-app">
      <header className="driver-app-header">
        <div><p>AutoHire KE</p><h1>My trips</h1><span>{user?.name}</span></div>
        <Button aria-label="Sign out" onClick={() => void signOut()} variant="ghost"><LogOut aria-hidden="true" size={18} /></Button>
      </header>
      {actionError && <p className="driver-trip-error" role="alert">{actionError}</p>}
      {trips.length === 0 ? <EmptyState description="Assigned trips will appear here." title="No trips assigned" /> : <div className="driver-trip-list">
        {trips.map((booking) => {
          const currentIndex = tripTransitions.findIndex((transition) => transition.status === booking.driverTripStatus)
          const nextTransition = tripTransitions[currentIndex + 1] ?? (currentIndex === -1 ? tripTransitions[0] : undefined)
          const nextButton = nextTransition && (nextTransition.previous === undefined
            ? !booking.driverTripStatus
            : booking.driverTripStatus === nextTransition.previous)
            ? nextTransition
            : undefined
          const phone = booking.customerPhone ?? ''
          const handoverPath = booking.status === 'confirmed'
            ? `/admin/bookings/${booking.id}/check-out`
            : `/admin/bookings/${booking.id}/check-in`
          return <article className="driver-trip-card" key={booking.id}>
            <header><div><span className="driver-trip-card__reference">{booking.reference}</span><strong>{formatEat(booking.pickupAt)}</strong></div><span className="driver-trip-card__status">{currentTripStatus(booking)}</span></header>
            <div className="driver-trip-card__vehicle"><span>Vehicle plate</span><strong>{booking.vehicleRegistration ?? booking.vehicleId}</strong></div>
            <div className="driver-trip-card__contact">
              {phone && <>
                <a aria-label={`Call ${formatKenyanPhone(phone)}`} href={`tel:${phone}`}><Phone aria-hidden="true" size={17} />Call customer</a>
                <a aria-label={`WhatsApp ${formatKenyanPhone(phone)}`} href={`https://wa.me/${phone.replace(/\D/g, '')}`} rel="noreferrer" target="_blank"><MessageCircle aria-hidden="true" size={17} />WhatsApp</a>
              </>}
            </div>
            <Link className="driver-trip-handover" to={handoverPath}>Open handover inspection</Link>
            <div aria-label={`Status actions for ${booking.reference}`} className="driver-trip-actions">
              <SOSButton source="driver" vehicleId={booking.vehicleId} />
              {tripTransitions.map((transition) => <Button
                disabled={transition !== nextButton || updateStatus.isPending || booking.driverTripStatus === 'trip_completed'}
                key={transition.status}
                onClick={() => setPendingTransition({ booking, status: transition.status, label: transition.label })}
                size="sm"
                variant={transition === nextButton ? 'primary' : 'secondary'}
              >{transition.label}</Button>)}
            </div>
          </article>
        })}
      </div>}
      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Confirm status"
        description={pendingTransition ? `Update ${pendingTransition.booking.reference} to ${pendingTransition.label}?` : 'Confirm this trip status update.'}
        onCancel={() => setPendingTransition(null)}
        onConfirm={() => void confirmTransition()}
        open={Boolean(pendingTransition)}
        title="Confirm trip update"
      />
    </main>
  )
}