import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/format'
import { Icon, Stars } from '../ui'

export default function CarCard({ car }) {
  return (
    <article className="car-card">
      <div className="car-card__media">
        {car.badge && <span className="car-card__badge">{car.badge}</span>}
        <img src={car.image} alt={`${car.name} side profile`} loading="lazy" />
      </div>

      <div className="car-card__body">
        <div className="car-card__top">
          <div>
            <span className="car-card__brand">{car.brand}</span>
            <h3>{car.name}</h3>
          </div>
          <div className="car-card__rating">
            <Stars rating={car.rating} />
            <span>{car.rating}</span>
          </div>
        </div>

        <div className="car-card__specs">
          <span><Icon name="users" /> {car.seats} seats</span>
          <span><Icon name="gear" /> {car.transmission}</span>
          <span><Icon name="fuel" /> {car.fuel}</span>
          <span><Icon name="bag" /> {car.bags} bags</span>
        </div>

        <div className="car-card__footer">
          <div className="car-card__price">
            <strong>{formatPrice(car.pricePerDay)}</strong>
            <span>/ day</span>
          </div>
          <Link to={`/vehicles/${car.slug}`} className="btn btn--ghost btn--sm">
            View details <Icon name="arrow" />
          </Link>
        </div>
      </div>
    </article>
  )
}
