import { Link } from 'react-router-dom'
import { useDrivers } from '../../api/queries'
import type { Driver } from '../../api/types'
import { ErrorState, Skeleton } from '../../components/ui'
import { formatEat } from '../../lib'
import { getDriverExpiryReason } from './driverRules'

const driverStatusLabels: Record<Driver['status'], string> = {
  available: 'Available',
  assigned: 'Assigned',
  off_duty: 'Off duty',
}

export function DriversPage() {
  const driversQuery = useDrivers()
  if (driversQuery.isLoading) return <Skeleton rows={5} />
  if (driversQuery.isError) return <ErrorState onRetry={() => void driversQuery.refetch()} retryLabel="Retry" title="Driver roster could not be loaded" />

  const drivers = driversQuery.data ?? []
  return (
    <section className="driver-roster-page">
      <header className="driver-roster-heading"><div><p className="eyebrow">Operations</p><h2>Driver roster</h2></div><span>{drivers.length} drivers</span></header>
      <div className="driver-roster-table-wrap">
        <table className="driver-roster-table">
          <thead><tr>
            <th scope="col">Driver</th><th scope="col">Status</th><th scope="col">Languages</th><th scope="col">Licence class</th>
            <th scope="col">Licence expiry</th><th scope="col">PSV expiry</th><th scope="col">Rating</th><th scope="col">Current trip</th>
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
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>
  )
}