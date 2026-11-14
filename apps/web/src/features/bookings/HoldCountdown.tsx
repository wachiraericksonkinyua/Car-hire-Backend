import { useCountdown } from '../../hooks/useCountdown'
import { t } from '../../i18n'

function renderTime(secondsLeft: number) {
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function HoldCountdown({ holdExpiresAt, onExpire }: { holdExpiresAt?: string; onExpire?: () => void }) {
  const { secondsLeft, expired } = useCountdown(holdExpiresAt, onExpire)
  if (!holdExpiresAt) return null
  return (
    <span aria-live="polite" className={`hold-countdown${expired ? ' is-expired' : secondsLeft < 300 ? ' is-urgent' : ''}`} role="status">
      {expired ? t('booking.holdExpired') : `${t('booking.holdExpires')} ${renderTime(secondsLeft)}`}
    </span>
  )
}