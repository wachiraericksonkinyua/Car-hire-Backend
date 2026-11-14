import { Link } from 'react-router-dom'
import type { DashboardCardKey } from '../../api/types'
import { Badge, ErrorState, KpiCard, Skeleton } from '../../components/ui'
import { t } from '../../i18n'
import { DASHBOARD_KPI_ROUTES } from './dashboardConfig'

export function DashboardKpiCard({
  metricKey,
  title,
  value,
  loading = false,
  error,
  danger = false,
  onRetry,
}: {
  metricKey: DashboardCardKey
  title: string
  value: string
  loading?: boolean
  error?: string
  danger?: boolean
  onRetry: () => void
}) {
  if (loading) {
    return <article aria-label={title} className="dashboard-kpi dashboard-kpi--loading"><p>{title}</p><Skeleton rows={2} /></article>
  }

  if (error) {
    return (
      <article className="dashboard-kpi dashboard-kpi--error">
        <p>{title}</p>
        <ErrorState onRetry={onRetry} retryLabel={t('styleguide.retry')} title={error} />
      </article>
    )
  }

  return (
    <Link aria-label={`${title}, ${value}`} className={`dashboard-kpi-link${danger ? ' dashboard-kpi-link--danger' : ''}`} to={DASHBOARD_KPI_ROUTES[metricKey]}>
      <KpiCard label={title} value={value} />
      {danger && <Badge tone="danger">{t('dashboard.overdueLabel')}</Badge>}
    </Link>
  )
}