import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BookingStatus, VehicleStatus } from '../../api/types'
import { t } from '../../i18n'

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function StatusChip({ status, variant }: { status: BookingStatus | VehicleStatus; variant: 'booking' | 'vehicle' }) {
  return <span className={`status-chip status-chip--${status}`}><span aria-hidden="true" />{t(`status.${variant}.${status}`)}</span>
}

export function Skeleton({ rows = 1, className = '' }: { rows?: number; className?: string }) {
  return <div aria-hidden="true" className={`skeleton-stack ${className}`}>{Array.from({ length: rows }, (_, index) => <span className="skeleton" key={index} />)}</div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="state-panel"><Info aria-hidden="true" /><h3>{title}</h3><p>{description}</p>{action}</section>
}

export function ErrorState({ title, retryLabel, onRetry }: { title: string; retryLabel: string; onRetry: () => void }) {
  return <section className="state-panel state-panel--error"><AlertCircle aria-hidden="true" /><h3>{title}</h3><button className="text-button" onClick={onRetry} type="button">{retryLabel}</button></section>
}

export function Toast({ message, tone = 'success', onClose }: { message: string; tone?: 'success' | 'info' | 'danger'; onClose: () => void }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : Info
  return <div aria-live="polite" className={`toast toast--${tone}`} role="status"><Icon aria-hidden="true" /><span>{message}</span><button aria-label={t('styleguide.cancel')} onClick={onClose} type="button"><X size={16} /></button></div>
}