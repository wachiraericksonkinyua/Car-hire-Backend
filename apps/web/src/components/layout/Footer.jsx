import { Link } from 'react-router-dom'

const columns = [
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About us' },
      { to: '/blog', label: 'Blog & news' },
      { to: '/contact', label: 'Contact' },
      { to: '/vehicles/mercedes-c-class', label: 'Our fleet' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/contact', label: 'Help center' },
      { to: '/contact', label: 'Booking policy' },
      { to: '/contact', label: 'Insurance' },
      { to: '/contact', label: 'FAQs' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Link to="/" className="brand brand--footer">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 14.5 4.7 9a3 3 0 0 1 2.9-2h8.8a3 3 0 0 1 2.9 2L21 14.5v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V17H6.5v1.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z"
                  fill="currentColor"
                />
                <circle cx="7" cy="14" r="1.4" fill="#14121f" />
                <circle cx="17" cy="14" r="1.4" fill="#14121f" />
              </svg>
            </span>
            <span className="brand__name">
              Drive<span>X</span>
            </span>
          </Link>
          <p>
            Premium cars, transparent prices and a team that answers. Hit the road
            with DriveX in over 40 cities.
          </p>
          <div className="footer__stores">
            <a href="#app" aria-label="Download on the App Store">
              <img src="/images/ui/app-store-badge.svg" alt="Download on the App Store" />
            </a>
            <a href="#app" aria-label="Get it on Google Play">
              <img src="/images/ui/google-play-badge.svg" alt="Get it on Google Play" />
            </a>
          </div>
        </div>

        {columns.map((column) => (
          <div key={column.title} className="footer__column">
            <h4>{column.title}</h4>
            {column.links.map((link) => (
              <Link key={link.label} to={link.to}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="footer__column footer__contact">
          <h4>Get in touch</h4>
          <a href="mailto:hello@drivex.cars">hello@drivex.cars</a>
          <a href="tel:+15550142299">+1 (555) 014-2299</a>
          <p>24 Harbor Street, Suite 400<br />San Francisco, CA 94111</p>
          <div className="footer__socials">
            <a href="#instagram" aria-label="Instagram">IG</a>
            <a href="#x" aria-label="X">X</a>
            <a href="#facebook" aria-label="Facebook">FB</a>
          </div>
        </div>
      </div>

      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} DriveX Car Hire. All rights reserved.</span>
        <div>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#cookies">Cookies</a>
        </div>
      </div>
    </footer>
  )
}
