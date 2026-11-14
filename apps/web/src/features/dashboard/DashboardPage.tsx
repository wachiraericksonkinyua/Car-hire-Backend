import { Activity, AlertTriangle, ArrowUpRight, CarFront, ClipboardCheck, Clock3 } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Booking, DashboardCardKey, DashboardData, UserRole } from '../../api/types'
import { useDashboard } from '../../api/queries'
import { DataTable, EmptyState } from '../../components/ui'
import { t } from '../../i18n'
import { useAuth } from '../../hooks/AuthContext'
import { formatEat, formatKes } from '../../lib'
import { vehicles } from '../../mocks/fixtures'
import { DashboardKpiCard } from './DashboardKpiCard'

const metricLabels: Record<DashboardCardKey, string> = {
  vehiclesOutToday: 'dashboard.vehiclesOut',
  pickupsDueToday: 'dashboard.pickupsDue',
  returnsDueToday: 'dashboard.returnsDue',
  overdueVehicles: 'dashboard.overdue',
  pendingApprovals: 'dashboard.pendingApprovals',
  activeBreakdowns: 'dashboard.activeBreakdowns',
  monthlyRevenue: 'dashboard.monthlyRevenue',
}

const fleetColors = {
  available: '#0f766e',
  rented: '#f97316',
  reserved: '#2563eb',
  maintenance: '#b91c1c',
}

const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))

function BookingTable({ rows, type }: { rows: Booking[]; type: 'pickup' | 'return' }) {
  const isPickup = type === 'pickup'
  const columns = [
    { key: 'time', header: t('dashboard.time'), render: (booking: Booking) => formatEat(isPickup ? booking.pickupAt : booking.returnAt).split(', ')[1] },
    { key: 'customer', header: t('dashboard.customer'), render: (booking: Booking) => booking.customerName ?? '—' },
    { key: 'vehicle', header: t('dashboard.vehicle'), render: (booking: Booking) => {
      const vehicle = vehicleById.get(booking.vehicleId)
      return vehicle ? `${vehicle.make} ${vehicle.model}` : '—'
    } },
    { key: 'action', header: '', render: (booking: Booking) => (
      <Link className="button button--secondary button--sm" to={`/admin/bookings/${booking.id}/${isPickup ? 'check-out' : 'check-in'}`}>
        {t(isPickup ? 'dashboard.checkOut' : 'dashboard.checkIn')}
      </Link>
    ) },
  ]
  const empty = (
    <EmptyState
      action={<Link className="text-button" to="/admin/bookings">{t('dashboard.viewBookings')}</Link>}
      description={t(isPickup ? 'dashboard.noPickups' : 'dashboard.noReturns')}
      title={t(isPickup ? 'dashboard.noPickups' : 'dashboard.noReturns')}
    />
  )
  return <DataTable columns={columns} empty={empty} rowKey={(booking) => booking.id} rows={rows} />
}

function FleetStatus({ data }: { data: DashboardData['fleetStatus'] }) {
  const chartData = Object.entries(data).map(([name, value]) => ({ name: t(`dashboard.${name}`), value, color: fleetColors[name as keyof typeof fleetColors] }))
  return (
    <div className="fleet-status">
      <div aria-label={t('dashboard.fleetStatus')} className="fleet-status__chart" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" innerRadius="62%" isAnimationActive={false} outerRadius="88%" stroke="none">
              {chartData.map((item) => <Cell fill={item.color} key={item.name} />)}
            </Pie>
            <Tooltip formatter={(value) => [value, t('dashboard.vehicleCount')]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="fleet-status__legend">
        {chartData.map((item) => <li key={item.name}><span style={{ backgroundColor: item.color }} />{item.name}<b>{item.value}</b></li>)}
      </ul>
    </div>
  )
}

function DashboardPanel({ title, icon, children, href }: { title: string; icon: ReactNode; children: ReactNode; href?: string }) {
  return (
    <section className="dashboard-panel">
      <header><span className="dashboard-panel__title">{icon}{title}</span>{href && <Link aria-label={`${t('dashboard.viewBookings')}: ${title}`} to={href}><ArrowUpRight size={17} /></Link>}</header>
      {children}
    </section>
  )
}

export function DashboardView({
  data,
  role,
  loading,
  failed,
  onRetry,
}: {
  data?: DashboardData
  role: UserRole
  loading: boolean
  failed: boolean
  onRetry: () => void
}) {
  const keys: DashboardCardKey[] = [
    'vehiclesOutToday', 'pickupsDueToday', 'returnsDueToday', 'overdueVehicles',
    'pendingApprovals', 'activeBreakdowns', 'monthlyRevenue',
  ]
  const visibleKeys = role === 'owner' || role === 'manager' ? keys : keys.filter((key) => key !== 'monthlyRevenue')

  return (
    <div className="dashboard-page">
      <p className="dashboard-subtitle">{t('dashboard.subtitle')}</p>
      <section aria-label={t('dashboard.title')} className="dashboard-kpi-grid">
        {visibleKeys.map((key) => {
          const value = data?.metrics[key]
          const error = data?.cardErrors?.[key] ?? (failed && !data ? t('dashboard.metricError') : undefined)
          return (
            <DashboardKpiCard
              danger={key === 'overdueVehicles'}
              error={error}
              key={key}
              loading={loading && !data}
              metricKey={key}
              onRetry={onRetry}
              title={t(metricLabels[key])}
              value={key === 'monthlyRevenue' ? formatKes(value ?? 0) : String(value ?? 0)}
            />
          )
        })}
      </section>

      <div className="dashboard-panel-grid">
        <DashboardPanel href="/admin/bookings?pickup=due-today" icon={<Clock3 size={18} />} title={t('dashboard.todayPickups')}>
          <BookingTable rows={data?.pickups ?? []} type="pickup" />
        </DashboardPanel>
        <DashboardPanel href="/admin/bookings?return=due-today" icon={<ClipboardCheck size={18} />} title={t('dashboard.todayReturns')}>
          <BookingTable rows={data?.returns ?? []} type="return" />
        </DashboardPanel>
        <DashboardPanel icon={<CarFront size={18} />} title={t('dashboard.fleetStatus')}>
          {data ? <FleetStatus data={data.fleetStatus} /> : <div className="dashboard-panel__skeleton" />}
        </DashboardPanel>
        <DashboardPanel href="/admin/bookings?sort=updatedAt" icon={<ActivityIcon />} title={t('dashboard.recentActivity')}>
          {data?.recentActivity.length ? (
            <ol className="activity-feed">
              {data.recentActivity.map((activity) => (
                <li key={activity.id}>
                  <span className={`activity-feed__icon activity-feed__icon--${activity.kind}`}><AlertTriangle aria-hidden="true" size={15} /></span>
                  <span><b>{t(`dashboard.activity${activity.kind[0].toUpperCase()}${activity.kind.slice(1)}`)}</b><small>{activity.reference}</small></span>
                  <time dateTime={activity.timestamp}>{formatEat(activity.timestamp)}</time>
                </li>
              ))}
            </ol>
          ) : <EmptyState description={t('dashboard.noActivity')} title={t('dashboard.recentActivity')} />}
        </DashboardPanel>
      </div>
    </div>
  )
}

function ActivityIcon() {
  return <Activity aria-hidden="true" size={18} />
}

export function DashboardPage() {
  const { data, isLoading, isError, refetch } = useDashboard()
  const { role } = useAuth()
  return <DashboardView data={data} failed={isError} loading={isLoading} onRetry={() => void refetch()} role={role ?? 'agent'} />
}