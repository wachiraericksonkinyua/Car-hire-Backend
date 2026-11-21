import {
  Activity, Bell, CarFront, ChevronLeft, ChevronRight, ClipboardList, Gauge, LogOut,
  Menu, Moon, Sun, Users, Wrench,
} from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useShellNotifications } from '../../api/queries'
import type { UserRole } from '../../api/types'
import { useAuth } from '../../hooks/AuthContext'
import { getRoleLandingPath } from '../../hooks/roleLanding'
import { useCan, type Permission } from '../../hooks/useCan'
import { t } from '../../i18n'
import { IconButton } from '../ui'
import { RouteErrorBoundary } from '../RouteErrorBoundary'
import { GlobalSearch } from '../../features/dashboard/GlobalSearch'

type StaffLink = {
  to: string
  key: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  permission: Permission
  end?: boolean
}

const staffLinks: StaffLink[] = [
  { to: '/admin', key: 'page.dashboard', icon: Gauge, permission: 'dashboard:view', end: true },
  { to: '/admin/vehicles', key: 'page.fleet', icon: CarFront, permission: 'vehicles:read' },
  { to: '/admin/bookings', key: 'page.bookings', icon: ClipboardList, permission: 'bookings:create' },
  { to: '/admin/approvals', key: 'page.approvals', icon: ClipboardList, permission: 'approvals:offline' },
  { to: '/admin/handover', key: 'page.handover', icon: CarFront, permission: 'handover:manage' },
  { to: '/admin/timeline', key: 'page.timeline', icon: Activity, permission: 'timeline:view' },
  { to: '/admin/drivers', key: 'page.drivers', icon: Users, permission: 'drivers:assign' },
  { to: '/admin/mechanics', key: 'page.mechanics', icon: Wrench, permission: 'mechanics:read' },
  { to: '/admin/my-trips', key: 'page.myTrips', icon: CarFront, permission: 'trips:read-own' },
  { to: '/admin/incidents', key: 'page.incidents', icon: Wrench, permission: 'incidents:manage' },
  { to: '/admin/staff', key: 'page.staff', icon: Users, permission: 'staff:manage' },
  { to: '/admin/audit', key: 'page.audit', icon: Activity, permission: 'audit:read' },
]

function StaffNavItem({ item, collapsed, onNavigate }: { item: StaffLink; collapsed: boolean; onNavigate: () => void }) {
  const allowed = useCan(item.permission)
  if (!allowed) return null
  const Icon = item.icon
  const label = t(item.key)
  return (
    <NavLink aria-label={collapsed ? label : undefined} end={item.end} onClick={onNavigate} title={collapsed ? label : undefined} to={item.to}>
      <Icon aria-hidden size={18} /><span>{label}</span>
    </NavLink>
  )
}

function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const online = () => setOffline(false)
    const offlineEvent = () => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', offlineEvent)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offlineEvent)
    }
  })

  return offline ? <div className="offline-banner" role="status">{t('admin.offline')}</div> : null
}

function NotificationsMenu({ pendingApprovals, openIncidents }: { pendingApprovals: number; openIncidents: number }) {
  const [open, setOpen] = useState(false)
  const total = pendingApprovals + openIncidents
  return (
    <div className="staff-popover-wrap">
      <IconButton aria-expanded={open} aria-haspopup="true" icon={<Bell size={18} />} label={`${t('admin.notifications')} ${total}`} onClick={() => setOpen(!open)} />
      {total > 0 && <span aria-label={`${total}`} className="notification-count">{total}</span>}
      {open && <div className="staff-popover" role="group">
        {pendingApprovals > 0 && <Link onClick={() => setOpen(false)} to="/admin/approvals">{t('admin.approvalAlerts')} <b>{pendingApprovals}</b></Link>}
        {openIncidents > 0 && <Link onClick={() => setOpen(false)} to="/admin/incidents">{t('admin.sosAlerts')} <b>{openIncidents}</b></Link>}
        {total === 0 && <span>{t('admin.noNotifications')}</span>}
      </div>}
    </div>
  )
}

function UserMenu({ name, role, onLogout }: { name: string; role: UserRole; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="staff-popover-wrap">
      <button aria-expanded={open} aria-haspopup="true" className="staff-user-menu" onClick={() => setOpen(!open)} type="button">
        <span aria-hidden="true" className="staff-avatar">{name.slice(0, 1).toUpperCase()}</span>
        <span className="staff-user-menu__name">{name}</span>
      </button>
      {open && <div className="staff-popover staff-popover--user" role="group">
        <span className="staff-user-role">{t(`role.${role}`)}</span>
        <Link onClick={() => setOpen(false)} to="/admin/profile">{t('admin.profile')}</Link>
        <button onClick={onLogout} type="button"><LogOut aria-hidden="true" size={16} />{t('admin.logout')}</button>
      </div>}
    </div>
  )
}

function titleForPath(pathname: string) {
  const item = [...staffLinks].sort((a, b) => b.to.length - a.to.length).find(({ to, end }) => end ? pathname === to : pathname.startsWith(to))
  if (item) return t(item.key)
  if (pathname.startsWith('/admin/profile')) return t('admin.profile')
  return t('admin.overview')
}

export function StaffLayout() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const notifications = useShellNotifications()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const pendingApprovals = notifications.data?.pendingApprovals ?? 0
  const openIncidents = notifications.data?.openIncidents ?? 0

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
  }

  async function signOut() {
    await logout().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  return (
    <div className="staff-shell">
      <div aria-label={t('admin.systemAlerts')} className="staff-alert-stack" role="region">
        <OfflineBanner />
        {openIncidents > 0 && <Link className="incident-strip" to="/admin/incidents"><Bell aria-hidden="true" size={17} />{t('admin.incidentAlert')}<b>{openIncidents}</b><span>{t('admin.openIncident')}</span></Link>}
      </div>
      {mobileOpen && <button aria-label={t('admin.closeNavigation')} className="staff-mobile-backdrop" onClick={() => setMobileOpen(false)} type="button" />}
      <div className={`staff-layout${collapsed ? ' is-collapsed' : ''}`}>
      <aside className={`staff-sidebar${mobileOpen ? ' is-mobile-open' : ''}`}>
        <Link aria-label={t('admin.brand')} className="brand" to={role ? getRoleLandingPath(role) : '/admin'}>
          <span className="brand__mark"><CarFront aria-hidden="true" size={23} /></span>
          <span className="brand__name">AutoHire <b>KE</b></span>
        </Link>
        <nav aria-label={t('admin.navigation')} className="staff-nav">
          {staffLinks.map((item) => <StaffNavItem collapsed={collapsed} item={item} key={item.to} onNavigate={() => setMobileOpen(false)} />)}
        </nav>
        <button className="staff-logout" onClick={() => void signOut()} title={collapsed ? t('admin.logout') : undefined} type="button"><LogOut aria-hidden="true" size={18} /><span>{t('admin.logout')}</span></button>
      </aside>
      <div className="staff-main">
        <header className="staff-topbar">
          <div className="staff-topbar__left">
            <IconButton className="staff-mobile-menu" icon={<Menu size={19} />} label={t('admin.openNavigation')} onClick={() => setMobileOpen(true)} />
            <IconButton className="staff-collapse" icon={collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />} label={t(collapsed ? 'admin.expandSidebar' : 'admin.collapseSidebar')} onClick={() => setCollapsed(!collapsed)} />
            <h1>{titleForPath(location.pathname)}</h1>
          </div>
          <div className="staff-topbar__tools">
            <GlobalSearch />
            <NotificationsMenu openIncidents={openIncidents} pendingApprovals={pendingApprovals} />
            <IconButton icon={theme === 'light' ? <Moon size={18} /> : <Sun size={18} />} label={t(theme === 'light' ? 'styleguide.dark' : 'styleguide.light')} onClick={toggleTheme} />
            {user && <UserMenu name={user.name} onLogout={() => void signOut()} role={user.role} />}
          </div>
        </header>
        <main className="staff-content">
          <RouteErrorBoundary key={location.pathname}><Outlet /></RouteErrorBoundary>
        </main>
      </div>
      </div>
    </div>
  )
}