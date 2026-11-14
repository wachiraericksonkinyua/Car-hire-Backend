import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

const EAT = 'Africa/Nairobi'

export function formatKes(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError('KES amounts must be safe integers')
  }
  return `KES ${new Intl.NumberFormat('en-KE').format(amount)}`
}

export function formatEat(value: Date | string): string {
  return formatInTimeZone(value, EAT, 'dd MMM yyyy, HH:mm')
}

export function toUtc(eatDateTime: string): string {
  const date = fromZonedTime(eatDateTime, EAT)
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid EAT date-time')
  return date.toISOString()
}