import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowUpDown, CalendarDays, Check, Clock3, Eye, Mail, MapPin, Map, Phone, Building2, MessageSquare } from 'lucide-react'
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

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ')
}

function StatusPill({ status }: { status: string }) {
  return <span className={`cat-status cat-status--${statusClass(status)}`}><span className="cat-status__dot" />{formatStatus(status)}</span>
}

function VehicleCard({ vehicle, from, to }: { vehicle: { id: string; brand: string; model: string; year: number; category: string; seats: number; transmission: string; daily_rate_kes: number; status: string; plate_number: string; photos?: { url: string }[] }, from: string, to: string }) {
  const photos = vehicle.photos?.slice(0, 3) ?? []
  return (
    <article className="cat-card" data-testid={`vehicle-card-${vehicle.id}`}>
      <a className="cat-card__link" href={`/vehicles/${vehicle.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}>
        <figure className={`cat-card__media photo-grid ${photos.length === 0 ? 'photo-grid--empty' : photos.length === 1 ? 'photo-grid--single' : photos.length === 2 ? 'photo-grid--double' : ''}`}>
          {photos.length > 0
            ? photos.map((photo, index) => <img alt={`${vehicle.brand} ${vehicle.model} photo ${index + 1}`} className="cat-card__photo" key={`${photo.url}-${index}`} src={photo.url} />)
            : <div className="cat-card__placeholder"><span><PlaceholderIcon /></span></div>}
          <figcaption className="sr-only">{vehicle.brand} {vehicle.model} photos</figcaption>
        </figure>
        <div className="cat-card__body">
          <div className="cat-card__head">
            <div>
              <p className="cat-card__cat">{vehicle.category || 'Vehicle'}</p>
              <h3 className="cat-card__title">{vehicle.brand} {vehicle.model}</h3>
              <p className="cat-card__sub">{vehicle.year} · {vehicle.plate_number}</p>
            </div>
            <StatusPill status={vehicle.status} />
          </div>
          <div className="cat-card__meta">
            <span><MapPin aria-hidden="true" size={15} /> {vehicle.seats} seats · {vehicle.transmission}</span>
            <strong className="cat-price">{formatKes(vehicle.daily_rate_kes)}/day</strong>
          </div>
          <div className="cat-card__action"><span>Details →</span></div>
        </div>
      </a>
    </article>
  )
}

function PlaceholderIcon() {
  return <CarIconPreview />
}
function CarIconPreview() {
  return <span aria-hidden="true" style={{ fontSize: 40 }}>🚗</span>
}

export function VehiclesPage() {
  const [searchParams] = useSearchParams()
  const [from, setFrom] = useState(searchParams.get('from') ? eatInput(searchParams.get('from')!) : defaultPickup())
  const [to, setTo] = useState(searchParams.get('to') ? eatInput(searchParams.get('to')!) : defaultReturn())
  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [brand, setBrand] = useState(searchParams.get('brand') ?? '')
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

  const items = vehicles.data?.items ?? []
  const availableCount = items.filter((v) => v.status === 'Available').length

  return (
    <section className="page catalogue">
      <header className="page__header">
        <p className="eyebrow">Our fleet</p>
        <h1>Choose your car</h1>
        <p>Search the fleet, filter by type and pick a car for your dates.</p>
      </header>

      <div className="filter-bar">
        <input aria-label="Pickup date" placeholder="Pickup (EAT)" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="Return date" placeholder="Return (EAT)" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input aria-label="Brand" placeholder="Toyota" value={brand} onChange={(e) => setBrand(e.target.value)} />
        <button aria-label="Search fleet" className="filter-bar__search" type="button"><ArrowUpDown aria-hidden="true" size={16} /> Filter</button>
        <label className="filter-bar__check"><input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} /> Available only</label>
      </div>

      {vehicles.isLoading && <Skeleton rows={4} />}
      {vehicles.isError && <ErrorState title="Could not load vehicles" onRetry={() => void vehicles.refetch()} retryLabel="Retry" />}
      {items.length === 0 && !vehicles.isLoading && !vehicles.isError && <EmptyState description="Try different dates or category." title="No vehicles match those dates" />}

      <div className="cat-grid">
        {vehicles.data?.items.map((vehicle) => <VehicleCard from={toUtc(from)} key={vehicle.id} to={toUtc(to)} vehicle={vehicle} />)}
      </div>
      {!vehicles.isLoading && !vehicles.isError && items.length > 0 && (
        <p className="results-note">{availableCount} cars available for those dates</p>
      )}
    </section>
  )
}

function PhotoCarousel({ photos }: { photos: { id: string; url: string }[] }) {
  const [hero, setHero] = useState(0)
  return (
    <div className="detail-gallery" role="group" aria-label="Vehicle photos">
      <img alt="Vehicle" className="detail-gallery__main" src={photos[hero]?.url} />
      <div className="detail-gallery__thumbs">
        {photos.map((photo, index) => (
          <button className={`detail-thumb ${index === hero ? 'is-active' : ''}`} key={photo.id} onClick={() => setHero(index)} type="button">
            <img alt={`Photo ${index + 1}`} src={photo.url} />
          </button>
        ))}
        {photos.length === 1 && <span className="detail-gallery__count">1 photo</span>}
      </div>
    </div>
  )
}

export function VehicleDetailsPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [from] = useState(searchParams.get('from') ? eatInput(searchParams.get('from')!) : defaultPickup())
  const [to] = useState(searchParams.get('to') ? eatInput(searchParams.get('to')!) : defaultReturn())
  const pickup = toUtc(from)
  const returnAt = toUtc(to)
  const vehicle = useQuery({
    queryKey: ['public-vehicle', id, pickup, returnAt],
    queryFn: () => fetchPublicVehicle(id, pickup, returnAt),
    enabled: Boolean(id),
  })
  const quote = useQuery({
    queryKey: ['public-quote', id, pickup, returnAt],
    queryFn: () => calculatePublicQuote({ vehicle_id: id, pickup_at: pickup, return_at: returnAt, with_chauffeur: false, extras: [] }),
    enabled: Boolean(id),
  })

  if (vehicle.isLoading) return <section className="page"><Skeleton rows={5} /></section>
  if (vehicle.isError || !vehicle.data) return <section className="page"><ErrorState title="Vehicle not found" onRetry={() => void vehicle.refetch()} retryLabel="Retry" /></section>
  const car = vehicle.data
  const photos = car.photos ?? []

  return (
    <section className="page detail">
      <Link className="back-link" to={`/vehicles?from=${encodeURIComponent(pickup)}&to=${encodeURIComponent(returnAt)}`}>← Back to fleet</Link>
      <div className="detail-layout">
        <div className="detail-left">
          {photos.length > 0 && <PhotoCarousel photos={photos} />}
          <div className="detail-summary">
            <p className="eyebrow">{car.category}</p>
            <h1 className="detail-title">{car.brand} {car.model}</h1>
            <p className="detail-sub">{car.year} · {car.plate_number} · {car.seats} seats · {car.transmission}</p>
            <div className="detail-features">
              <div className="detail-feature"><MapPin aria-hidden="true" /><span>Pickup at destination</span></div>
              <div className="detail-feature"><Clock3 aria-hidden="true" /><span>Flexible holds</span></div>
              <div className="detail-feature"><Check aria-hidden="true" /><span>Self drive or chauffeur</span></div>
            </div>
          </div>
        </div>
        <aside className="detail-right">
          <div className="card">
            <div className="card__head"><h3>Details & rates</h3><StatusPill status={car.status} /></div>
            <div className="detail-specs">
              <div className="detail-stat"><span>Year</span><strong>{car.year}</strong></div>
              <div className="detail-stat"><span>Seats</span><strong>{car.seats}</strong></div>
              <div className="detail-stat"><span>Bags</span><strong>{car.bags}</strong></div>
              <div className="detail-stat"><span>Fuel</span><strong>{car.fuel}</strong></div>
              <div className="detail-stat"><span>Mileage cap</span><strong>{car.mileage_cap_km?.toLocaleString()} km</strong></div>
              <div className="detail-stat"><span>Deposit (refundable)</span><strong>{formatKes(car.deposit_kes)}</strong></div>
              <div className="detail-stat"><span>Daily rate</span><strong>{formatKes(car.daily_rate_kes)}</strong></div>
            </div>
          </div>
          {car.booked_ranges.length > 0 && (
            <div className="card">
              <h3>Outstanding rental</h3>
              <ul className="booked-ranges">{car.booked_ranges.map((range) => <li key={range.booking_id}>{formatEat(range.pickup_at)} – {formatEat(range.return_at)} <StatusPill status={range.status} /></li>)}</ul>
            </div>
          )}
        </aside>
      </div>
      <div className="detail-cta-row">
        <Button className="detail-cta" disabled={!quote.data || car.insurance_expired} onClick={() => navigate(`/checkout?${new URLSearchParams({ vehicleId: id, pickup, return: returnAt })}`)}><ArrowUpDown aria-hidden="true" size={16} /> Book this car</Button>
      </div>
    </section>
  )
}

function LabelInput({ label, ...rest }: any) {
  return (
    <label className="form-field">
      <span className="form-field__label">{label}</span>
      <input className="control" {...rest} />
    </label>
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

  if (!vehicleId || !pickup || !returnAt) return <section className="page"><EmptyState title="Start from a vehicle" description="Choose a car and dates first." /></section>

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
    <section className="page checkout">
      <div className="checkout-layout">
        <div className="card">
          <div className="card__head"><h2>Booking summary</h2><StatusPill status={booking?.status ?? 'Reserved'} /></div>
          {!booking && (
            <>
              <LabelInput label="Full name" value={customer.name} onChange={(e: any) => setCustomer({ ...customer, name: e.target.value })} />
              <LabelInput label="Phone" placeholder="0712 345 678" value={customer.phone} onChange={(e: any) => setCustomer({ ...customer, phone: e.target.value })} />
              <LabelInput type="email" label="Email" value={customer.email} onChange={(e: any) => setCustomer({ ...customer, email: e.target.value })} />
              <LabelInput label="National ID / Passport" value={customer.idNumber} onChange={(e: any) => setCustomer({ ...customer, idNumber: e.target.value })} />
              <LabelInput label="Pickup location" value={customer.pickupLocation} onChange={(e: any) => setCustomer({ ...customer, pickupLocation: e.target.value })} />
              {error && <p className="error" role="alert">{error}</p>}
              <Button disabled={creating} onClick={() => void submit()}><ArrowRight aria-hidden="true" size={16} /> {creating ? 'Creating…' : 'Reserve now'}</Button>
            </>
          )}
          {booking && (
            <div className="booking-summary">
              <h2>Reservation {booking.reference}</h2>
              <dl className="summary-rows"><div><dt>Status</dt><dd><StatusPill status={booking.status} /></dd></div><div><dt>Hold expires</dt><dd>{formatEat(booking.hold_expires_at)}</dd></div><div><dt>Total</dt><dd>{formatKes(booking.total_kes)}</dd></div></dl>
              <LabelInput label="M-Pesa phone" value={payPhone} onChange={(e: any) => setPayPhone(e.target.value)} />
              <Button onClick={() => void pay()}>Pay with M-Pesa</Button>
              {payMessage && <p className="pay-message"><Check aria-hidden="true" size={16} /> {payMessage}</p>}
              <Link className="secondary-link" to={`/booking/${encodeURIComponent(booking.reference)}?phone=${encodeURIComponent(payPhone)}`}>View booking status</Link>
            </div>
          )}
        </div>
        <div className="card sidebar">
          <div className="card__head"><h2>Price summary</h2><span className="chip">{pickup} · {returnAt}</span></div>
          {quote.isLoading && <Skeleton rows={3} />}
          {quote.data && <div className="quote-summary">
            <div className="summary-row"><dt>Base ({quote.data.days} days)</dt><dd>{formatKes(quote.data.base_rental_kes)}</dd></div>
            {quote.data.chauffeur_fee_kes > 0 && <div className="summary-row"><dt>Chauffeur</dt><dd>{formatKes(quote.data.chauffeur_fee_kes)}</dd></div>}
            {quote.data.extras.map((line) => <div className="summary-row" key={line.code}><dt>{line.label}</dt><dd>{formatKes(line.amount_kes)}</dd></div>)}
            <div className="summary-row"><dt>VAT ({quote.data.vat_percent}%)</dt><dd>{formatKes(quote.data.vat_kes)}</dd></div>
            <div className="summary-row"><dt>Refundable deposit</dt><dd>{formatKes(quote.data.deposit_kes)}</dd></div>
            <div className="summary-total"><dt>Total due</dt><dd>{formatKes(quote.data.total_due_kes)}</dd></div>
          </div>}
        </div>
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

  const canPay = booking.data?.status === 'Reserved' && !checkoutId

  return (
    <section className="page status-page">
      <div className="status-hero">
        <div className="status-icon"><Eye aria-hidden="true" size={22} /></div>
        <div><h1>Booking status</h1><p>Check how your reservation is doing.</p></div>
      </div>
      {!ref && !submittedPhone && (
        <div className="card lookup">
          <h2>Look up your booking</h2>
          <p>Enter the booking reference and phone number you used.</p>
          <LabelInput label="Booking reference" value={ref} onChange={() => setSubmittedPhone('')} />
          <LabelInput label="Phone" value={phone} onChange={(e: any) => setPhone(e.target.value)} />
          <Button onClick={() => setSubmittedPhone(normalisePhone(phone))}><Map aria-hidden="true" size={16} /> Check booking</Button>
        </div>
      )}
      {booking.isLoading && <Skeleton rows={3} />}
      {booking.isError && <p className="error">{booking.error instanceof Error ? booking.error.message : 'Booking not found'}</p>}
      {booking.data && (
        <div className="status-grid">
          <div className="card"><div className="label-row"><Map aria-hidden="true" size={18} /><p>Booking reference</p><h3>{booking.data.reference}</h3></div><div className="label-row"><h3>Status</h3><StatusPill status={payment.data?.booking_status ?? booking.data.status} /></div></div>
          <div className="card"><div className="label-row"><Phone aria-hidden="true" size={18} /><p>Phone</p><h3>{submittedPhone}</h3></div><div className="label-row"><h3>Vehicle</h3><h3>{booking.data.vehicle_id.slice(0, 8)}</h3></div></div>
          <div className="card"><div className="label-row"><CalendarDays aria-hidden="true" size={18} /><p>Pickup</p><h3>{formatEat(booking.data.pickup_at)}</h3></div><div className="label-row"><h3>Return</h3><h3>{formatEat(booking.data.return_at)}</h3></div></div>
          <div className="card"><div className="label-row"><DollarLabel /></div><div className="label-row"><h3>Total</h3><h3>{formatKes(booking.data.total_kes)}</h3></div></div>
        </div>
      )}
      {payment.data && <div className="status-card payment"><div className="label-row"><Check aria-hidden="true" size={16} /><span>Payment</span><StatusPill status={payment.data.status} /></div>{payment.data.mpesa_receipt && <div className="label-row"><span>Receipt</span><span>{payment.data.mpesa_receipt}</span></div>}</div>}
      {canPay && <div className="card"><Button className="full-button" onClick={() => void pay()}><ArrowRight aria-hidden="true" size={16} /> Pay with M-Pesa</Button></div>}
      {payError && <p className="error" role="alert">{payError}</p>}
    </section>
  )
}

function DollarLabel() {
  return <span><span>Money</span><IconOnly /></span>
}
function IconOnly() {
  return <svg style={{ fontSize: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><line x1="12" x2="12" y1="5" y2="19" /><line x1="3" x2="21" y1="12" y2="12" /></svg>
}

export function AboutPage() {
  return (
    <section className="page">
      <header className="page__header">
        <p className="eyebrow">About Gari Poa</p>
        <h1>Rent a car that moves with you</h1>
        <p className="lead">Gari Poa combines a modern fleet with reliable gear transport and clear pay-as-you-go rates.</p>
      </header>
      <div className="about-grid">
        <div className="card">
          <div className="card__head"><h2>Our promise</h2><Building2 aria-hidden="true" size={22} /></div>
          <ul className="about-points"><li>Modern fleets with colour-coded trim features.</li><li>Transparent, shock-free rates in KES.</li><li>Professional photo-proven mileage terms.</li><li>Instant dispatch via phone or app.</li></ul>
        </div>
        <div className="card">
          <div className="card__head"><h2>How we work</h2><Clock3 aria-hidden="true" size={22} /></div>
          <ul className="about-points"><li>Secure your booking with a timed free hold.</li><li>M-Pesa, bank transfer or pay at pickup.</li><li>Inspection photos captured on arrival and return.</li></ul>
        </div>
        <div className="card">
          <div className="card__head"><h2>What you get</h2><Eye aria-hidden="true" size={22} /></div>
          <ul className="about-points"><li>Customer support on call from 8am to 7pm.</li><li>24/7 emergency recovery coordination.</li><li>Water bottle, tissues and internet hotspots.</li></ul>
        </div>
      </div>
    </section>
  )
}

function openMailto() {
  window.location.href = 'mailto:hello@autohire.ke'
}

export function ContactPage() {
  return (
    <section className="page">
      <header className="page__header">
        <p className="eyebrow">Contact us</p>
        <h1>Need help? Our team is ready to meet you.</h1>
        <p className="lead">Send a message or visit our desk — we’ll help you pick a car and plan your trip.</p>
      </header>
      <div className="contact-grid">
        <div className="card">
          <div className="card__head"><h2>Send us a message</h2><MessageSquare aria-hidden="true" size={22} /></div>
          <form className="form-column">
            <LabelInput label="Name" />
            <LabelInput label="Phone" placeholder="0712 345 678" />
            <LabelInput label="Email" type="email" />
            <textarea aria-label="Message" className="control" placeholder="What would you like to know?" rows={4} />
            <Button className="full-button" onClick={openMailto}>Send message</Button>
          </form>
        </div>
        <div className="card">
          <div className="card__head"><h2>Visit our desk</h2><MapPin aria-hidden="true" size={22} /></div>
          <ul className="contact-list"><li><MapPin aria-hidden="true" size={18} />{' '}Mombasa Road, Nairobi, Kenya</li><li><Phone aria-hidden="true" size={18} />{' '}+254 700 123 456</li><li><Mail aria-hidden="true" size={18} /><span>{' '}Email: hello@autohire.ke</span></li></ul>
          <p className="lead">Office hours: 8:00 am – 7:00 pm, Monday to Saturday.</p>
        </div>
        <div className="card wide">
          <div className="card__head"><h2>How we get you there</h2><Check aria-hidden="true" size={22} /></div>
          <ul className="about-points"><li>Pickup on time with security photo guarantee.</li><li>Inter-fleet transfers via taxi or rideshare.</li><li>Productible tracking and booking alerts via SMS.</li></ul>
        </div>
      </div>
    </section>
  )
}
