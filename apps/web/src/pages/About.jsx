import { Link } from 'react-router-dom'
import CtaBanner from '../components/ui/CtaBanner'
import { Icon, SectionHeading, Stars } from '../components/ui'
import { reviews } from '../data/site'

const stats = [
  { value: '40+', label: 'Cities served' },
  { value: '12.4k', label: 'Happy drivers' },
  { value: '4.9/5', label: 'Average rating' },
  { value: '6', label: 'Car categories' },
]

const values = [
  {
    icon: 'shield',
    title: 'Care over paperwork',
    text: 'Every car is cleaned, checked and photographed before handover. If something is not right, we fix it before you drive away.',
  },
  {
    icon: 'card',
    title: 'Honest by default',
    text: 'One clear price, optional extras you can decline, and a deposit released the moment the car comes back.',
  },
  {
    icon: 'pin',
    title: 'Local where it matters',
    text: 'City teams who know the shortcuts, the best coffee stops and the fastest way to the airport at 6am.',
  },
]

export default function About() {
  return (
    <>
      <section className="page-hero page-hero--about">
        <div className="container page-hero__inner">
          <span className="eyebrow">About DriveX</span>
          <h1>We make the road trip part of the holiday.</h1>
          <p>
            DriveX started with one van, two friends and a stubborn belief that
            renting a car should feel as good as the drive itself. Ten years later,
            we are in 40+ cities with the same rule: look after the driver.
          </p>
          <div className="page-hero__actions">
            <Link to="/contact" className="btn btn--primary">
              Talk to our team <Icon name="arrow" />
            </Link>
            <Link to="/vehicles/mercedes-c-class" className="btn btn--ghost">
              Meet the fleet
            </Link>
          </div>
        </div>
      </section>

      <section className="about-story">
        <div className="container about-story__grid">
          <div className="about-story__media">
            <img
              src="/images/media/about-memories.jpg"
              alt="Coastal road winding along the ocean"
              loading="lazy"
            />
            <div className="about-story__stamp">
              <strong>10</strong>
              <span>years on the road</span>
            </div>
          </div>
          <div className="about-story__copy">
            <SectionHeading
              align="left"
              eyebrow="Our story"
              title="Unlock unforgettable memories"
              text="Some journeys deserve a better car. We built DriveX for the weekend that starts with a playlist and ends with sand in the floor mats."
            />
            <p>
              From a single downtown desk to airport counters, hotel deliveries and
              a fleet that spans sedans to double-cab pickups, our job has stayed
              the same: remove the friction between you and the road.
            </p>
            <div className="about-story__stats">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section video-section">
        <div className="container">
          <SectionHeading
            eyebrow="On the road"
            title="A fleet built for the view"
            text="Coastlines, mountain passes, school runs and airport dashes. Here is a 90-second look at where our cars take people."
          />
          <div className="video-cover">
            <img
              src="/images/media/about-video-cover.jpg"
              alt="Open highway on a road trip"
              loading="lazy"
            />
            <button type="button" className="video-cover__play" aria-label="Play the DriveX film">
              <Icon name="play" />
            </button>
            <div className="video-cover__caption">
              <span>DriveX film · 2026</span>
              <strong>90 seconds of open road</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section values">
        <div className="container">
          <SectionHeading
            eyebrow="What we stand for"
            title="Three promises we do not bend"
            text="They are printed on the wall of every DriveX hub and built into every booking."
          />
          <div className="values__grid">
            {values.map((value) => (
              <article key={value.title} className="value-card">
                <span className="benefit__icon"><Icon name={value.icon} /></span>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section about-reviews">
        <div className="container">
          <SectionHeading
            eyebrow="In their words"
            title="The people who keep coming back"
          />
          <div className="reviews__grid">
            {reviews.map((review) => (
              <article key={review.name} className="review review--about">
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

      <CtaBanner />
    </>
  )
}
