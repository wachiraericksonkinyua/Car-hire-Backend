import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  calculatePublicQuote,
  createPublicBooking,
  fetchPublicVehicle,
  fetchPublicVehicles,
  lookupPublicBooking,
  pollPublicPayment,
  startPublicStk,
  type PublicExtra,
} from '../api/public'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { formatEat, formatKes, normalisePhone, toUtc } from '../lib'

const EAT = 'Africa/Nairobi'
const categories = ['Economy', 'Compact SUV', '4x4', 'Minivan', 'Luxury']
const extraOptions: { value: PublicExtra; label: string }[] = [
  { value: 'baby_seat', label: 'Baby seat' },
  { value: 'rooftop_tent', label: 'Rooftop tent' },
  { value: 'cooler_box', label: 'Cooler box' },
  { value: 'airport_pickup', label: 'Airport pickup' },
]

function eatInput(value: Date | string): string {
  return formatInTimeZone(value, EAT, "yyyy-MM-dd'T'HH:mm")
}

function defaultPickup(): string {
  return eatInput(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

function defaultReturn(): string {
  return eatInput(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000))
}

function statusClass(status: string): string {
  return status.toLowerCase().replace(/\s+/g, '-')
}

function VehicleCard({ vehicle, from, to }: { vehicle: { id: string; brand: string; model: string; year: number; category: string; seats: number; transmission: string; daily_rate_kes: number; status: string; plate_number: string; photos?: { url: string }[] }, from: string, to: string }) {
  return (
    <article className="customer-vehicle-card">
      <div className="customer-vehicle-card__photo" aria-hidden="true">
        {vehicle.photos?.[0] ? <img alt="" src={vehicle.photos[0].url} /> : vehicle.brand.slice(0, 1)}
      </div>
      <div className="customer-vehicle-card__body">
        <div className="customer-vehicle-card__heading">
          <div>
            <h3>{vehicle.brand} {vehicle.model}</h3>
            <p>{vehicle.year} · {vehicle.category} · {vehicle.plate_number}</p>
          </div>
          <strong>{formatKes(vehicle.daily_rate_kes)}<small>/day</small></strong>
        </div>
        <p className="customer-vehicle-card__meta">{vehicle.seats} seats · {vehicle.transmission} · <span className={`customer-status customer-status--${statusClass(vehicle.status)}`}>{vehicle.status}</span></p>
        <Link className="button button--primary button--sm" to={`/vehicles/${vehicle.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}>View & book</Link>
      </div>
    </article>
  )
}

export function VehiclesPage() {
  const [searchParams] = useSearchParams()
  const [from, setFrom] = useState(searchParams.get('from') ? eatInput(searchParams.get('from')!) : defaultPickup())
  const [to, setTo] = useState(searchParams.get('to') ? eatInput(searchParams.get('to')!) : defaultReturn())
  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [brand, setBrand] = useState('')
  const [availableOnly, setAvailableOnly] = useState(true)

  const filters = useMemo(() => ({
    from: toUtc(from),
    to: toUtc(to),
    category: category || undefined,
    brand: brand || undefined,
    available_only: availableOnly,
    limit: 100,
  }), [from, to, category, brand, availableOnly])

  const vehicles = useQuery({
    queryKey: ['public-vehicles', filters],
    queryFn: () => fetchPublicVehicles(filters),
  })

  return (
    <section className="customer-page">
      <header className="customer-page__header">
        <p className="customer-eyebrow">Our fleet</p>
        <h1>Find your next car</h1>
        <p>Choose your dates, compare the fleet and book online.</p>
      </header>

      <p className="customer-inventory-count" role="status">
        {vehicles.isLoading ? 'Checking availability…' : `${vehicles.data?.items.length ?? 0} cars available for these dates`}
      </p>

      <div className="customer-filter-bar">
        <label>Pickup<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Return<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Brand<input placeholder="Toyota" value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
        <label className="customer-check"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available only</label>
      </div>

      {vehicles.isLoading && <Skeleton rows={4} />}
      {vehicles.isError && <ErrorState title="Could not load vehicles" onRetry={() => void vehicles.refetch()} retryLabel="Retry" />}
      {vehicles.data?.items.length === 0 && <EmptyState title="No vehicles match those dates" description="Try a different date range or category." />}
      <div className="customer-vehicle-grid">
        {vehicles.data?.items.map((vehicle) => <VehicleCard from={toUtc(from)} key={vehicle.id} to={toUtc(to)} vehicle={vehicle} />)}
      </div>
    </section>
  )
}

export function VehicleDetailsPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [from, setFrom] = useState(searchParams.get('from') ? eatInput(searchParams.get('from')!) : defaultPickup())
  const [to, setTo] = useState(searchParams.get('to') ? eatInput(searchParams.get('to')!) : defaultReturn())
  const [withChauffeur, setWithChauffeur] = useState(false)
  const [zone, setZone] = useState<'in_town' | 'upcountry'>('in_town')
  const [extras, setExtras] = useState<PublicExtra[]>([])

  const pickup = toUtc(from)
  const returnAt = toUtc(to)
  const vehicle = useQuery({
    queryKey: ['public-vehicle', id, pickup, returnAt],
    queryFn: () => fetchPublicVehicle(id, pickup, returnAt),
    enabled: Boolean(id),
  })
  const quote = useQuery({
    queryKey: ['public-quote', id, pickup, returnAt, withChauffeur, zone, extras],
    queryFn: () => calculatePublicQuote({ vehicle_id: id, pickup_at: pickup, return_at: returnAt, with_chauffeur: withChauffeur, chauffeur_zone: withChauffeur ? zone : undefined, extras }),
    enabled: Boolean(id),
  })

  if (vehicle.isLoading) return <section className="customer-page"><Skeleton rows={5} /></section>
  if (vehicle.isError || !vehicle.data) return <section className="customer-page"><ErrorState title="Vehicle not found" onRetry={() => void vehicle.refetch()} retryLabel="Retry" /></section>
  const car = vehicle.data

  function toggleExtra(code: PublicExtra) {
    setExtras((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  }

  return (
    <section className="customer-page customer-detail">
      <Link className="customer-back" to={`/vehicles?from=${encodeURIComponent(pickup)}&to=${encodeURIComponent(returnAt)}`}>← Back to fleet</Link>
      <div className="customer-detail__grid">
        <div>
          <div className="customer-detail__photo" aria-hidden="true">{car.brand.slice(0, 1)}</div>
          <h1>{car.brand} {car.model}</h1>
          <p className="customer-eyebrow">{car.year} · {car.category} · {car.plate_number}</p>
          <p><span className={`customer-status customer-status--${statusClass(car.status)}`}>{car.status}</span>{car.insurance_expired && <span className="customer-warning"> Insurance expired — cannot be booked</span>}</p>
          <dl className="customer-specs">
            <div><dt>Seats</dt><dd>{car.seats}</dd></div>
            <div><dt>Bags</dt><dd>{car.bags}</dd></div>
            <div><dt>Transmission</dt><dd>{car.transmission}</dd></div>
            <div><dt>Fuel</dt><dd>{car.fuel}</dd></div>
            <div><dt>Daily rate</dt><dd>{formatKes(car.daily_rate_kes)}</dd></div>
            <div><dt>Deposit</dt><dd>{formatKes(car.deposit_kes)}</dd></div>
          </dl>
          <h2>Next 30 days</h2>
          {car.booked_ranges.length === 0 ? <p>No bookings in the next 30 days.</p> : <ul className="customer-ranges">{car.booked_ranges.map((range) => <li key={range.booking_id}>{formatEat(range.pickup_at)} → {formatEat(range.return_at)} <span>{range.status}</span></li>)}</ul>}
        </div>

        <aside className="customer-book-panel">
          <h2>Build your quote</h2>
          <label>Pickup<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Return<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label className="customer-check"><input type="checkbox" checked={withChauffeur} onChange={(event) => setWithChauffeur(event.target.checked)} /> Add a chauffeur</label>
          {withChauffeur && <label>Zone<select value={zone} onChange={(event) => setZone(event.target.value as 'in_town' | 'upcountry')}><option value="in_town">In town</option><option value="upcountry">Upcountry</option></select></label>}
          <fieldset className="customer-extras"><legend>Extras</legend>{extraOptions.map((extra) => <label key={extra.value}><input type="checkbox" checked={extras.includes(extra.value)} onChange={() => toggleExtra(extra.value)} /> {extra.label}</label>)}</fieldset>
          {quote.isLoading && <Skeleton rows={2} />}
          {quote.data && <dl className="customer-quote">
            <div><dt>Base ({quote.data.days} days)</dt><dd>{formatKes(quote.data.base_rental_kes)}</dd></div>
            {quote.data.chauffeur_fee_kes > 0 && <div><dt>Chauffeur</dt><dd>{formatKes(quote.data.chauffeur_fee_kes)}</dd></div>}
            {quote.data.extras.map((line) => <div key={line.code}><dt>{line.label}</dt><dd>{formatKes(line.amount_kes)}</dd></div>)}
            <div><dt>VAT ({quote.data.vat_percent}%)</dt><dd>{formatKes(quote.data.vat_kes)}</dd></div>
            <div><dt>Refundable deposit</dt><dd>{formatKes(quote.data.deposit_kes)}</dd></div>
            <div className="customer-quote__total"><dt>Total due</dt><dd>{formatKes(quote.data.total_due_kes)}</dd></div>
          </dl>}
          <Button disabled={!quote.data || car.insurance_expired} onClick={() => navigate(`/checkout?${new URLSearchParams({ vehicleId: id, pickup, return: returnAt, chauffeur: String(withChauffeur), zone, extras: extras.join(',') })}`)}>Book this car</Button>
        </aside>
      </div>
    </section>
  )
}

export function CheckoutPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const vehicleId = searchParams.get('vehicleId') ?? ''
  const pickup = searchParams.get('pickup') ?? ''
  const returnAt = searchParams.get('return') ?? ''
  const withChauffeur = searchParams.get('chauffeur') === 'true'
  const zone = (searchParams.get('zone') as 'in_town' | 'upcountry') || 'in_town'
  const extras = (searchParams.get('extras')?.split(',').filter(Boolean) ?? []) as PublicExtra[]
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', idNumber: '', pickupLocation: '' })
  const [booking, setBooking] = useState<Awaited<ReturnType<typeof createPublicBooking>> | null>(null)
  const [payPhone, setPayPhone] = useState('')
  const [payMessage, setPayMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const quote = useQuery({
    queryKey: ['checkout-quote', vehicleId, pickup, returnAt, withChauffeur, zone, extras],
    queryFn: () => calculatePublicQuote({ vehicle_id: vehicleId, pickup_at: pickup, return_at: returnAt, with_chauffeur: withChauffeur, chauffeur_zone: withChauffeur ? zone : undefined, extras }),
    enabled: Boolean(vehicleId && pickup && returnAt),
  })

  if (!vehicleId || !pickup || !returnAt) return <section className="customer-page"><EmptyState title="Start from a vehicle" description="Choose a car and dates first." /></section>

  async function submit() {
    setError(null)
    if (!customer.name.trim() || !customer.phone.trim()) {
      setError('Name and phone are required.')
      return
    }
    setCreating(true)
    try {
      const result = await createPublicBooking({
        vehicle_id: vehicleId,
        pickup_at: pickup,
        return_at: returnAt,
        customer_name: customer.name.trim(),
        customer_phone: normalisePhone(customer.phone),
        customer_email: customer.email || null,
        customer_id_type: customer.idNumber ? 'national_id' : null,
        customer_id_number: customer.idNumber || null,
        pickup_location: customer.pickupLocation || null,
        with_chauffeur: withChauffeur,
        chauffeur_zone: withChauffeur ? zone : undefined,
        extras,
      })
      setBooking(result)
      setPayPhone(normalisePhone(customer.phone))
      // Refresh the catalogue immediately so the reserved car disappears
      // from the "available" list without a manual reload.
      await queryClient.invalidateQueries({ queryKey: ['public-vehicles'] })
      await queryClient.invalidateQueries({ queryKey: ['public-vehicle'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create booking')
    } finally {
      setCreating(false)
    }
  }

  async function pay() {
    if (!booking) return
    setPayMessage(null)
    try {
      const result = await startPublicStk(booking.reference, normalisePhone(payPhone))
      setPayMessage(`STK sent. Check your phone. Reference: ${result.checkout_request_id}`)
    } catch (err) {
      setPayMessage(err instanceof Error ? err.message : 'Payment could not be started')
    }
  }

  return (
    <section className="customer-page customer-checkout">
      <h1>Complete your booking</h1>
      <div className="customer-checkout__grid">
        <div className="customer-panel">
          {!booking ? <>
            <label>Full name<input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
            <label>Phone<input placeholder="0712 345 678" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label>
            <label>Email<input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
            <label>National ID / Passport<input value={customer.idNumber} onChange={(event) => setCustomer({ ...customer, idNumber: event.target.value })} /></label>
            <label>Pickup location<input value={customer.pickupLocation} onChange={(event) => setCustomer({ ...customer, pickupLocation: event.target.value })} /></label>
            {error && <p className="customer-error" role="alert">{error}</p>}
            <Button disabled={creating} onClick={() => void submit()}>{creating ? 'Creating…' : 'Reserve now'}</Button>
          </> : <>
            <h2>Reservation {booking.reference}</h2>
            <p>Status: <strong>{booking.status}</strong></p>
            <p>Hold expires: {formatEat(booking.hold_expires_at)}</p>
            <p>Total: {formatKes(booking.total_kes)}</p>
            <label>M-Pesa phone<input value={payPhone} onChange={(event) => setPayPhone(event.target.value)} /></label>
            <Button onClick={() => void pay()}>Pay with M-Pesa</Button>
            {payMessage && <p>{payMessage}</p>}
            <p><Link to={`/booking/${encodeURIComponent(booking.reference)}?phone=${encodeURIComponent(payPhone)}`}>View booking status</Link></p>
          </>}
        </div>
        <aside className="customer-panel customer-panel--summary">
          <h2>Price summary</h2>
          {quote.isLoading && <Skeleton rows={3} />}
          {quote.data && <dl className="customer-quote">
            <div><dt>Base ({quote.data.days} days)</dt><dd>{formatKes(quote.data.base_rental_kes)}</dd></div>
            {quote.data.chauffeur_fee_kes > 0 && <div><dt>Chauffeur</dt><dd>{formatKes(quote.data.chauffeur_fee_kes)}</dd></div>}
            {quote.data.extras.map((line) => <div key={line.code}><dt>{line.label}</dt><dd>{formatKes(line.amount_kes)}</dd></div>)}
            <div><dt>VAT</dt><dd>{formatKes(quote.data.vat_kes)}</dd></div>
            <div><dt>Refundable deposit</dt><dd>{formatKes(quote.data.deposit_kes)}</dd></div>
            <div className="customer-quote__total"><dt>Total</dt><dd>{formatKes(quote.data.total_due_kes)}</dd></div>
          </dl>}
        </aside>
      </div>
    </section>
  )
}

export function BookingPage() {
  const { ref = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [phone, setPhone] = useState(searchParams.get('phone') ? normalisePhone(searchParams.get('phone')!) : '')
  const [submittedPhone, setSubmittedPhone] = useState(searchParams.get('phone') ? normalisePhone(searchParams.get('phone')!) : '')
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  const booking = useQuery({
    queryKey: ['public-booking', ref, submittedPhone],
    queryFn: () => lookupPublicBooking(ref, submittedPhone),
    enabled: Boolean(ref && submittedPhone),
    refetchInterval: checkoutId ? 3000 : false,
  })
  const payment = useQuery({
    queryKey: ['public-payment', checkoutId, ref, submittedPhone],
    queryFn: () => pollPublicPayment(checkoutId!, ref, submittedPhone),
    enabled: Boolean(checkoutId && submittedPhone),
    refetchInterval: 3000,
  })

  async function pay() {
    setPayError(null)
    try {
      const result = await startPublicStk(ref, normalisePhone(phone))
      setCheckoutId(result.checkout_request_id)
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Payment could not be started')
    }
  }

  return (
    <section className="customer-page customer-booking-status">
      <h1>Booking status</h1>
      <div className="customer-panel">
        <label>Booking reference<input value={ref} readOnly /></label>
        <label>Phone used for booking<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <Button onClick={() => setSubmittedPhone(normalisePhone(phone))}>Check booking</Button>
        {booking.isLoading && <Skeleton rows={3} />}
        {booking.isError && <p className="customer-error">{booking.error instanceof Error ? booking.error.message : 'Booking not found'}</p>}
        {booking.data && <>
          <h2>{booking.data.reference}</h2>
          <p>Status: <strong>{payment.data?.booking_status ?? booking.data.status}</strong></p>
          <p>Vehicle: {booking.data.vehicle_id}</p>
          <p>Pickup: {formatEat(booking.data.pickup_at)}</p>
          <p>Return: {formatEat(booking.data.return_at)}</p>
          <p>Total: {formatKes(booking.data.total_kes)}</p>
          <p>Payment: {payment.data?.status ?? booking.data.payment_status ?? 'Not started'}</p>
          {payment.data?.mpesa_receipt && <p>Receipt: {payment.data.mpesa_receipt}</p>}
          {payment.data?.amount_mismatch && <p className="customer-warning">Payment amount mismatch — staff review required.</p>}
          {payment.data?.refund_required && <p className="customer-warning">Payment received but requires manual refund review.</p>}
          {booking.data.status === 'Reserved' && !booking.data.payment_status && !checkoutId && <>
            <Button onClick={() => void pay()}>Pay with M-Pesa</Button>
            {payError && <p className="customer-error">{payError}</p>}
          </>}
          {checkoutId && <p>Waiting for confirmation…</p>}
        </>}
      </div>
    </section>
  )
}

export function AboutPage() {
  return <section className="customer-page"><h1>About AutoHire KE</h1><p>Reliable car hire for business, safari and everyday travel across Kenya.</p></section>
}

export function ContactPage() {
  return <section className="customer-page"><h1>Contact us</h1><p>Call our desk or email us and we will help with your booking.</p></section>
}
