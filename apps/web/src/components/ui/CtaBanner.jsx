import { Link } from 'react-router-dom'
import { Icon } from '../ui'

export default function CtaBanner() {
  return (
    <section className="cta-banner">
      <div className="container cta-banner__inner">
        <div className="cta-banner__copy">
          <span className="eyebrow eyebrow--light">Ready when you are</span>
          <h2>Your next great drive starts here.</h2>
          <p>
            Book in under two minutes, pick up at the airport or your hotel, and
            keep the keys for as long as the adventure lasts.
          </p>
          <div className="cta-banner__actions">
            <Link to="/contact" className="btn btn--white">
              Book a car <Icon name="arrow" />
            </Link>
            <Link to="/about" className="btn btn--outline-light">
              Why DriveX
            </Link>
          </div>
        </div>
        <div className="cta-banner__media">
          <img
            src="/images/cars/hero-blue-sedan.png"
            alt="Blue sports sedan"
            loading="lazy"
          />
        </div>
      </div>
      <div className="cta-banner__tracks" aria-hidden="true" />
    </section>
  )
}
