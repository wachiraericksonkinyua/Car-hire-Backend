import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon, Stars } from '../components/ui'
import CarCard from '../components/ui/CarCard'
import { cars, getCarBySlug } from '../data/cars'
import { formatPrice } from '../lib/format'

const extras = [
  { id: 'insurance', label: 'Zero-excess insurance', price: 18 },
  { id: 'driver', label: 'Additional driver', price: 9 },
  { id: 'child', label: 'Child seat', price: 7 },
]

const iso = (date) => date.toISOString().slice(0, 10)
const addDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return iso(date)
}

const gallery = [
  { src: '/images/cars/car-sedan.png', label: 'Exterior', contain: true },
  { src: '/images/media/detail-thumb-1.jpg', label: 'Dashboard' },
  { src: '/images/media/detail-thumb-2.jpg', label: 'Leather seats' },
  { src: '/images/media/detail-thumb-3.jpg', label: 'Wheels' },
]

export default function VehicleDetails() {
  const { slug } = useParams()
  const car = getCarBySlug(slug)
  const [activeImage, setActiveImage] = useState(0)
  const [selectedExtras, setSelectedExtras] = useState([])
  const [pickup, setPickup] = useState(addDays(1))
  const [dropoff, setDropoff] = useState(addDays(4))

  const days = useMemo(() => {
    const start = new Date(pickup)
    const end = new Date(dropoff)
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    return Number.isFinite(diff) && diff > 0 ? diff : 1
  }, [pickup, dropoff])

  if (!car) {
    return (
      <section className="section empty-state">
        <div className="container">
          <h1>We couldn’t find that car.</h1>
          <p>It may have been retired from the fleet. Browse the current line-up instead.</p>
          <Link to="/" className="btn btn--primary">Back to the fleet</Link>
        </div>
      </section>
    )
  }

  const extraTotal = selectedExtras.reduce((total, id) => {
    const extra = extras.find((item) => item.id === id)
    return total + (extra ? extra.price * days : 0)
  }, 0)
  const total = car.pricePerDay * days + extraTotal

  const toggleExtra = (id) => {
    setSelectedExtras((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const similarCars = cars.filter((item) => item.slug !== car.slug).slice(0, 3)

  return (
    <>
      <section className="detail">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/#fleet">Fleet</Link>
            <span>/</span>
            <span>{car.name}</span>
          </nav>

          <div className="detail__top">
            <div>
              <span className="eyebrow">{car.category} · {car.year}</span>
              <h1>{car.name}</h1>
              <div className="detail__meta">
                <Stars rating={car.rating} />
                <span><strong>{car.rating}</strong> ({car.reviews} reviews)</span>
                <span className="detail__dot">·</span>
                <span><Icon name="pin" /> Free airport delivery</span>
              </div>
            </div>
            <div className="detail__price-top">
              <strong>{formatPrice(car.pricePerDay)}</strong>
              <span>/ day</span>
            </div>
          </div>

          <div className="detail__grid">
            <div className="detail__main">
              <div className={`detail__gallery ${gallery[activeImage].contain ? 'is-contain' : ''}`}>
                <img src={gallery[activeImage].src} alt={`${car.name} — ${gallery[activeImage].label}`} />
                <span className="detail__gallery-label">{gallery[activeImage].label}</span>
                <span className="detail__gallery-count">{activeImage + 1} / {gallery.length}</span>
              </div>
              <div className="detail__thumbs">
                {gallery.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    className={index === activeImage ? 'is-active' : ''}
                    onClick={() => setActiveImage(index)}
                    aria-label={`Show ${item.label}`}
                  >
                    <img src={item.src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>

              <div className="detail__section">
                <h2>About this car</h2>
                <p>{car.description}</p>
                <div className="spec-grid">
                  <div><Icon name="users" /><span>Seats</span><strong>{car.seats}</strong></div>
                  <div><Icon name="gear" /><span>Gearbox</span><strong>{car.transmission}</strong></div>
                  <div><Icon name="fuel" /><span>Fuel</span><strong>{car.fuel}</strong></div>
                  <div><Icon name="bag" /><span>Luggage</span><strong>{car.bags} bags</strong></div>
                  <div><Icon name="seat" /><span>Doors</span><strong>{car.doors}</strong></div>
                  <div><Icon name="pin" /><span>Power</span><strong>{car.power}</strong></div>
                </div>
              </div>

              <div className="detail__section">
                <h2>What’s included</h2>
                <ul className="feature-list">
                  {car.features.map((feature) => (
                    <li key={feature}><Icon name="check" /> {feature}</li>
                  ))}
                </ul>
              </div>

              <div className="detail__section detail__rules">
                <h2>Good to know</h2>
                <div className="detail__rules-grid">
                  <div>
                    <h3>Mileage</h3>
                    <p>Unlimited kilometres on rentals of 3+ days. 250 km/day otherwise.</p>
                  </div>
                  <div>
                    <h3>Fuel policy</h3>
                    <p>Collect full, return full. A fuel station is 400m from the hub.</p>
                  </div>
                  <div>
                    <h3>Minimum age</h3>
                    <p>23 years old with a licence held for at least 12 months.</p>
                  </div>
                  <div>
                    <h3>Cancellation</h3>
                    <p>Free until 24 hours before pick-up. No fee, no phone calls.</p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="booking-panel">
              <div className="booking-panel__head">
                <div>
                  <span>From</span>
                  <strong>{formatPrice(car.pricePerDay)} <small>/ day</small></strong>
                </div>
                <span className="booking-panel__tag">Free cancellation</span>
              </div>

              <div className="booking-panel__dates">
                <label>
                  Pick-up
                  <input type="date" value={pickup} min={addDays(0)} onChange={(event) => setPickup(event.target.value)} />
                </label>
                <label>
                  Return
                  <input type="date" value={dropoff} min={pickup} onChange={(event) => setDropoff(event.target.value)} />
                </label>
              </div>

              <div className="booking-panel__extras">
                <span className="booking-panel__label">Add extras</span>
                {extras.map((extra) => (
                  <label key={extra.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={selectedExtras.includes(extra.id)}
                      onChange={() => toggleExtra(extra.id)}
                    />
                    <span>{extra.label}</span>
                    <strong>+{formatPrice(extra.price)}/day</strong>
                  </label>
                ))}
              </div>

              <div className="booking-panel__summary">
                <div>
                  <span>{formatPrice(car.pricePerDay)} × {days} day{days > 1 ? 's' : ''}</span>
                  <strong>{formatPrice(car.pricePerDay * days)}</strong>
                </div>
                {extraTotal > 0 && (
                  <div>
                    <span>Extras</span>
                    <strong>{formatPrice(extraTotal)}</strong>
                  </div>
                )}
                <div className="booking-panel__total">
                  <span>Total</span>
                  <strong>{formatPrice(total)}</strong>
                </div>
              </div>

              <button type="button" className="btn btn--primary btn--block">
                Reserve this car <Icon name="arrow" />
              </button>
              <p className="booking-panel__note">
                You won’t be charged yet. We hold the car for 15 minutes while you
                complete the details.
              </p>
              <div className="booking-panel__assurance">
                <span><Icon name="shield" /> Fully insured</span>
                <span><Icon name="clock" /> 24/7 support</span>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section similar">
        <div className="container">
          <div className="fleet__head">
            <div>
              <span className="eyebrow">You might also like</span>
              <h2>More cars for the same kind of trip</h2>
            </div>
            <Link to="/" className="btn btn--ghost">Browse all <Icon name="arrow" /></Link>
          </div>
          <div className="fleet__grid">
            {similarCars.map((item) => (
              <CarCard key={item.slug} car={item} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
