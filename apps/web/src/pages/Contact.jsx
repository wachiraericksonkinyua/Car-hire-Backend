import { useState } from 'react'
import { Icon, SectionHeading } from '../components/ui'

const faqs = [
  {
    q: 'What do I need to collect the car?',
    a: 'A valid driving licence held for at least one year, your passport or national ID, and the payment card used for the booking. International drivers may also need an IDP.',
  },
  {
    q: 'Is the deposit blocked on my card?',
    a: 'We place a refundable hold of $250–$600 depending on the vehicle. It is released automatically within 3–5 working days of the car being returned.',
  },
  {
    q: 'Can I add a second driver?',
    a: 'Yes. Add an additional driver at checkout or at the counter. They need to present a valid licence and be at least 23 years old.',
  },
  {
    q: 'What happens if I return the car late?',
    a: 'We give you a 29-minute grace period. After that, we charge an hourly rate capped at one extra day. Call us if you are running late — we are flexible when we know.',
  },
  {
    q: 'Do you offer airport delivery?',
    a: 'We meet you in the arrivals hall or the short-stay car park at all major airports. The exact meeting point is sent by text 24 hours before pick-up.',
  },
]

export default function Contact() {
  const [openFaq, setOpenFaq] = useState(0)
  const [sent, setSent] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <>
      <section className="contact-hero">
        <div className="container">
          <div className="contact-hero__grid">
            <div className="contact-hero__media">
              <span className="eyebrow">Contact us</span>
              <h1>Let’s get you on the road.</h1>
              <p>
                Questions about a booking, a long-term hire or a one-way trip?
                Send a note and a real person will reply within one working hour.
              </p>
              <div className="contact-hero__image">
                <img
                  src="/images/media/contact-hero-car.jpg"
                  alt="Teal car parked on a city street"
                  loading="lazy"
                />
                <div className="contact-hero__chip">
                  <Icon name="phone" />
                  <div>
                    <strong>24/7 support</strong>
                    <span>+1 (555) 014-2299</span>
                  </div>
                </div>
              </div>
            </div>

            <form className="booking-form" onSubmit={handleSubmit}>
              <div className="booking-form__head">
                <span className="eyebrow eyebrow--light">Booking request</span>
                <h2>Reserve your car</h2>
                <p>No payment now. We confirm availability first.</p>
              </div>

              <div className="booking-form__row">
                <label>
                  First name
                  <input type="text" name="firstName" placeholder="Amara" required />
                </label>
                <label>
                  Last name
                  <input type="text" name="lastName" placeholder="Lewis" required />
                </label>
              </div>
              <label>
                Email address
                <input type="email" name="email" placeholder="you@example.com" required />
              </label>
              <div className="booking-form__row">
                <label>
                  Pick-up location
                  <select name="location" defaultValue="San Francisco">
                    <option>San Francisco</option>
                    <option>Los Angeles</option>
                    <option>New York</option>
                    <option>Lisbon</option>
                    <option>Nairobi</option>
                  </select>
                </label>
                <label>
                  Car category
                  <select name="category" defaultValue="Sedan">
                    <option>Sedan</option>
                    <option>SUV</option>
                    <option>Sport</option>
                    <option>Van</option>
                    <option>Pickup</option>
                  </select>
                </label>
              </div>
              <div className="booking-form__row">
                <label>
                  Pick-up date
                  <input type="date" name="pickup" required />
                </label>
                <label>
                  Return date
                  <input type="date" name="dropoff" required />
                </label>
              </div>
              <label>
                Anything we should know?
                <textarea
                  name="message"
                  rows="3"
                  placeholder="Child seat, airport delivery, extra driver…"
                />
              </label>

              <button type="submit" className="btn btn--white btn--block">
                {sent ? 'Request sent — we’ll be in touch' : 'Send booking request'}
                {!sent && <Icon name="arrow" />}
              </button>
              <p className="booking-form__note">
                By sending this you agree to our booking terms and privacy policy.
              </p>
            </form>
          </div>
        </div>
      </section>

      <section className="section contact-cards">
        <div className="container contact-cards__grid">
          <article className="contact-card">
            <span className="benefit__icon"><Icon name="mail" /></span>
            <h3>Email us</h3>
            <p>For bookings, changes and invoices.</p>
            <a href="mailto:hello@drivex.cars">hello@drivex.cars</a>
          </article>
          <article className="contact-card">
            <span className="benefit__icon"><Icon name="phone" /></span>
            <h3>Call us</h3>
            <p>Every day, 7am – 11pm local time.</p>
            <a href="tel:+15550142299">+1 (555) 014-2299</a>
          </article>
          <article className="contact-card">
            <span className="benefit__icon"><Icon name="pin" /></span>
            <h3>Visit a hub</h3>
            <p>24 Harbor Street, Suite 400<br />San Francisco, CA 94111</p>
            <a href="#map">Get directions</a>
          </article>
        </div>
      </section>

      <section className="section map-section" id="map">
        <div className="container map-section__inner">
          <div className="map-section__map">
            <div className="map-section__pin"><Icon name="pin" /></div>
            <span>DriveX San Francisco hub</span>
            <small>Map placeholder — drop in Google Maps or Mapbox here</small>
          </div>
          <div className="map-section__copy">
            <SectionHeading
              align="left"
              eyebrow="Find us"
              title="Right where the city meets the bay"
              text="Our flagship hub is a five-minute walk from the Embarcadero. Airport handovers run from 5am to midnight."
            />
            <ul className="map-section__list">
              <li><Icon name="check" /> Free customer parking during handover</li>
              <li><Icon name="check" /> Express return key-drop, 24/7</li>
              <li><Icon name="check" /> EV chargers on site</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section faq">
        <div className="container faq__inner">
          <SectionHeading
            align="left"
            eyebrow="FAQs"
            title="Answers before you ask"
            text="Still unsure? The team is one message away."
          />
          <div className="faq__list">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index
              return (
                <div key={faq.q} className={`faq__item ${isOpen ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <span className="faq__sign">{isOpen ? '−' : '+'}</span>
                  </button>
                  <div className="faq__answer">
                    <p>{faq.a}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
