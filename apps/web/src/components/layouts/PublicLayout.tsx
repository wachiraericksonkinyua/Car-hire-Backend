import { useState } from 'react'
import { AtSign, Camera, CarFront, Mail, MapPin, Menu, Phone, Smartphone, X } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { t } from '../../i18n'
import { APP_PROMO } from '../../features/home/homeConfig'

const publicLinks = [
  { to: '/', label: 'nav.home', end: true },
  { to: '/vehicles', label: 'nav.vehicles' },
  { to: '/about', label: 'nav.about' },
  { to: '/contact', label: 'nav.contact' },
]

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="public-layout">
      <header className="public-header">
        <div className="public-header__inner">
          <Link aria-label={t('admin.brand')} className="brand" to="/">
            <span className="brand__mark"><CarFront aria-hidden="true" size={25} /></span>
            <span className="brand__name">AutoHire <b>KE</b></span>
          </Link>
          <nav aria-label={t('nav.primary')} className={menuOpen ? 'public-nav is-open' : 'public-nav'}>
            {publicLinks.map(({ to, label, end }) => (
              <NavLink end={end} key={to} onClick={() => setMenuOpen(false)} to={to}>
                {t(label)}
              </NavLink>
            ))}
          </nav>
          <a className="header-help" href={`tel:${t('footer.phoneValue').replace(/\D/g, '')}`}>
            <span className="header-help__icon"><Phone aria-hidden="true" size={18} /></span>
            <span><small>{t('nav.help')}</small><strong>{t('footer.phoneValue')}</strong></span>
          </a>
          <button aria-expanded={menuOpen} aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')} className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} type="button">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main className="public-main"><Outlet /></main>

      <footer className="public-footer">
        <div className={APP_PROMO ? 'public-footer__main' : 'public-footer__main public-footer__main--no-app'}>
          <section className="footer-about">
            <Link aria-label={t('admin.brand')} className="brand brand--footer" to="/">
              <span className="brand__mark"><CarFront aria-hidden="true" size={24} /></span>
              <span className="brand__name">AutoHire <b>KE</b></span>
            </Link>
            <p>{t('footer.tagline')}</p>
            <div className="footer-social" aria-label={t('footer.social')}>
              <a aria-label={t('footer.instagram')} href="https://instagram.com"><Camera size={18} /></a>
              <a aria-label={t('footer.facebook')} href="https://facebook.com"><AtSign size={18} /></a>
              <a aria-label={t('footer.email')} href={`mailto:${t('footer.emailValue')}`}><Mail size={18} /></a>
            </div>
          </section>
          <section className="footer-contact">
            <h2>{t('footer.address')}</h2>
            <p><span className="footer-icon"><MapPin size={17} /></span>{t('footer.location')}</p>
            <p><span className="footer-icon"><Mail size={17} /></span><a href={`mailto:${t('footer.emailValue')}`}>{t('footer.emailValue')}</a></p>
            <p><span className="footer-icon"><Phone size={17} /></span><a href={`tel:${t('footer.phoneValue').replace(/\D/g, '')}`}>{t('footer.phoneValue')}</a></p>
          </section>
          <section className="footer-links">
            <h2>{t('footer.links')}</h2>
            {publicLinks.map(({ to, label }) => <Link key={to} to={to}>{t(label)}</Link>)}
          </section>
          <section className="footer-vehicles">
            <h2>{t('footer.vehicleList')}</h2>
            <Link to="/vehicles">{t('footer.suvs')}</Link>
            <Link to="/vehicles">{t('footer.sedans')}</Link>
            <Link to="/vehicles">{t('footer.vans')}</Link>
          </section>
          {APP_PROMO && <section className="footer-download">
            <h2>{t('footer.download')}</h2>
            <a className="app-badge" href="#download"><Smartphone size={19} /><span><small>{t('footer.availableOn')}</small><b>{t('footer.appStore')}</b></span></a>
            <a className="app-badge" href="#download"><Smartphone size={19} /><span><small>{t('footer.getItOn')}</small><b>{t('footer.googlePlay')}</b></span></a>
          </section>}
        </div>
        <div className="public-footer__bottom"><span>© {new Date().getFullYear()} {t('footer.copyright')}</span><span>{t('footer.tagline')}</span></div>
      </footer>
    </div>
  )
}