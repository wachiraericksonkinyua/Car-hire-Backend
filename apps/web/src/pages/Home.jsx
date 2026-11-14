import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import BrandStrip from '../components/ui/BrandStrip'
import CarCard from '../components/ui/CarCard'
import CtaBanner from '../components/ui/CtaBanner'
import SearchBar from '../components/ui/SearchBar'
import { Icon, SectionHeading, Stars } from '../components/ui'
import { cars, categories } from '../data/cars'
import { reviews } from '../data/site'

const steps = [
  {
    number: '01',
    title: 'Find your car',
    text: 'Filter by size, gearbox and budget. Real photos, real availability — no surprises.',
  },
  {
    number: '02',
    title: 'Book in minutes',
    text: 'Pick your dates and extras. Pay securely online or when you collect the keys.',
  },
  {
    number: '03',
    title: 'Pick up & go',
    text: 'Skip the queue with express handover at the airport, your hotel or our downtown hub.',
  },
  {
    number: '04',
    title: 'Return & relax',
    text: 'Drop the keys, keep the memories. Every booking includes free cancellation.',
  },
]

const benefits = [
  {
    icon: 'shield',
    title: 'Fully insured, always',
    text: 'Comprehensive cover and 24/7 roadside assistance on every single rental.',
  },
  {
    icon: 'card',
    title: 'No hidden fees',
    text: 'The price you see at checkout is the price you pay at the counter. Full stop.',
  },
  {
    icon: 'clock',
    title: 'Free cancellation',
    text: 'Plans change. Cancel up to 24 hours before pick-up for a full refund.',
  },
  {
    icon: 'pin',
    title: '40+ pick-up points',
    text: 'Airports, train stations and city hubs — usually within a 10-minute walk.',
  },
]

export default function Home() {
  const [activeCategory, setActiveCategory] = useState('All')

  const visibleCars = useMemo(
    () =>
      activeCategory === 'All'
        ? cars
        : cars.filter((car) => car.category === activeCategory),
    [activeCategory],
  )

  return (
    <>
      <section className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__tracks" aria-hidden="true" />
        <div className="container hero__inner">
          <div className="hero__copy">
            <span className="pill">
              <span className="pill__dot" /> Now live in 40+ cities
            </span>
            <h1>
              Premium car hire,
              <br />
              <span className="text-gradient">without the friction.</span>
            </h1>
            <p>
              From city runarounds to coastal escapes — choose the keys, we handle
              the rest. Transparent pricing, instant booking and cars that turn up
              exactly as promised.
            </p>
            <div className="hero__actions">
              <Link to="/vehicles/mercedes-c-class" className="btn btn--primary">
                Explore the fleet <Icon name="arrow" />
              </Link>
              <Link to="/about" className="btn btn--ghost">
                How it works
              </Link>
            </div>
            <div className="hero__proof">
              <div className="hero__avatars">
                <img src="/images/media/avatar-1.jpg" alt="" />
                <img src="/images/media/avatar-2.jpg" alt="" />
                <img src="/images/media/avatar-3.jpg" alt="" />
              </div>
              <div>
                <Stars rating={4.9} />
                <p><strong>4.9 / 5</strong> from 12,400+ happy drivers</p>
              </div>
            </div>
          </div>

          <div className="hero__media">
            <div className="hero__ring" aria-hidden="true" />
            <div className="hero__price-card">
              <span>Sedan · from</span>
              <strong>$79 <small>/ day</small></strong>
              <span className="hero__price-meta">Free cancellation</span>
            </div>
            <img
              className="hero__car"
              src="/images/cars/hero-blue-sedan.png"
              alt="Blue sports sedan available for hire"
            />
            <div className="hero__badge">
              <span className="hero__badge-icon"><Icon name="shield" /></span>
              <div>
                <strong>Fully insured</strong>
                <span>Zero-excess options</span>
              </div>
            </div>
          </div>
        </div>

      </section>

      <div className="container hero-search">
        <SearchBar />
      </div>

      <BrandStrip />

      <section className="section fleet" id="fleet">
        <div className="container">
          <div className="fleet__head">
            <SectionHeading
              align="left"
              eyebrow="The fleet"
              title="Pick the shape of your next trip"
              text="Six categories, one standard: spotless cars, full tanks and keys handed over with a smile."
            />
            <Link to="/vehicles/mercedes-c-class" className="btn btn--ghost">
              View all cars <Icon name="arrow" />
            </Link>
          </div>

          <div className="filters" role="tablist" aria-label="Filter cars by category">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                className={`filter ${activeCategory === category ? 'is-active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="fleet__grid">
            {visibleCars.map((car) => (
              <CarCard key={car.slug} car={car} />
            ))}
          </div>
        </div>
      </section>

      <section className="section steps">
        <div className="container steps__inner">
          <div className="steps__media">
            <div className="steps__photo">
              <img
                src="/images/media/home-feature-driver.jpg"
                alt="Happy driver behind the wheel"
                loading="lazy"
              />
            </div>
            <div className="steps__float steps__float--top">
              <span className="steps__float-icon"><Icon name="clock" /></span>
              <div>
                <strong>2 min</strong>
                <span>average checkout</span>
              </div>
            </div>
            <div className="steps__float steps__float--bottom">
              <div className="hero__avatars">
                <img src="/images/media/avatar-2.jpg" alt="" />
                <img src="/images/media/avatar-3.jpg" alt="" />
              </div>
              <div>
                <strong>12.4k drivers</strong>
                <span>on the road this year</span>
              </div>
            </div>
          </div>

          <div className="steps__copy">
            <SectionHeading
              align="left"
              eyebrow="How it works"
              title="Four steps between you and the open road"
              text="No paperwork marathons, no mystery charges. Just a simple booking flow built around your schedule."
            />
            <div className="steps__list">
              {steps.map((step) => (
                <div key={step.number} className="step">
                  <span className="step__number">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/contact" className="btn btn--primary">
              Start your booking <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section benefits">
        <div className="container">
          <SectionHeading
            eyebrow="Why DriveX"
            title="Rental basics, done properly"
            text="The small print matters. Here is what is included every time you take the keys."
          />
          <div className="benefits__grid">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="benefit">
                <span className="benefit__icon"><Icon name={benefit.icon} /></span>
                <h3>{benefit.title}</h3>
                <p>{benefit.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section reviews">
        <div className="container">
          <div className="reviews__head">
            <SectionHeading
              align="left"
              eyebrow="Reviews"
              title="Drivers who came back for the keys"
              text="Over 12,000 trips rated 4.8 or higher. Here is what that looks like in words."
            />
            <div className="reviews__score">
              <strong>4.9</strong>
              <div>
                <Stars rating={5} />
                <span>Google · 3,120 reviews</span>
              </div>
            </div>
          </div>
          <div className="reviews__grid">
            {reviews.map((review) => (
              <article key={review.name} className="review">
                <Stars rating={review.rating} />
                <p>“{review.quote}”</p>
                <div className="review__author">
                  <img src={review.avatar} alt={review.name} loading="lazy" />
                  <div>
                    <strong>{review.name}</strong>
                    <span>{review.role}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section app-section" id="app">
        <div className="container app-section__inner">
          <div className="app-section__copy">
            <SectionHeading
              align="left"
              eyebrow="DriveX app"
              title="Keys in your pocket, support in your ear"
              text="Manage your booking, extend a trip, find your car in the airport car park and reach a human in seconds."
            />
            <ul className="app-section__list">
              {['Digital check-in and key handover', 'Live trip support, 24/7', 'One-tap extension and roadside help'].map((item) => (
                <li key={item}><Icon name="check" /> {item}</li>
              ))}
            </ul>
            <div className="app-section__badges">
              <a href="#app-store" aria-label="Download on the App Store">
                <img src="/images/ui/app-store-badge.svg" alt="Download on the App Store" />
              </a>
              <a href="#google-play" aria-label="Get it on Google Play">
                <img src="/images/ui/google-play-badge.svg" alt="Get it on Google Play" />
              </a>
            </div>
          </div>
          <div className="app-section__media">
            <div className="app-section__phone">
              <div className="app-section__phone-top">
                <span>Good morning, Amara</span>
                <strong>Trip · in 2 days</strong>
              </div>
              <div className="app-section__phone-car">
                <img src="/images/cars/car-suv.png" alt="Booked SUV" />
              </div>
              <div className="app-section__phone-row">
                <span>San Francisco</span>
                <Icon name="arrow" />
                <span>Big Sur</span>
              </div>
              <div className="app-section__phone-meta">
                <span>Thu 14 · 09:00</span>
                <span>4 days</span>
              </div>
            </div>
            <div className="app-section__glow" aria-hidden="true" />
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  )
}
