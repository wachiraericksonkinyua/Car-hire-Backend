import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

const links = [
  { to: '/', label: 'Home' },
  { to: '/vehicles/mercedes-c-class', label: 'Vehicles' },
  { to: '/about', label: 'About Us' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="brand" aria-label="DriveX home">
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

        <nav className="navbar__links" aria-label="Main navigation">
          {links.map((link) => {
            const active =
              link.to === '/'
                ? pathname === '/'
                : pathname.startsWith(link.to.replace(/\/vehicles.*/, '/vehicles'))
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`navbar__link ${active ? 'is-active' : ''}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="navbar__actions">
          <Link to="/contact" className="navbar__phone">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1l-2.23 2.2Z"
                fill="currentColor"
              />
            </svg>
            +1 (555) 014-2299
          </Link>
          <Link to="/contact" className="btn btn--primary btn--sm">
            Book a car
          </Link>
          <button
            type="button"
            className="navbar__toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className={`navbar__mobile ${open ? 'is-open' : ''}`}>
        {links.map((link) => (
          <Link key={link.to} to={link.to} className="navbar__mobile-link">
            {link.label}
          </Link>
        ))}
        <Link to="/contact" className="btn btn--primary">
          Book a car
        </Link>
      </div>
    </header>
  )
}
