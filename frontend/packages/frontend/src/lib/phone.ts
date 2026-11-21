export function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (/^[17]/.test(digits)) return `254${digits}`
  return digits
}

export function isKenyanPhone(value: string): boolean {
  return /^254[17]\d{8}$/.test(normalisePhone(value))
}

export function formatKenyanPhone(value: string): string {
  const normalized = normalisePhone(value)
  if (!/^254[17]\d{8}$/.test(normalized)) return value
  return `0${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`
}

export function maskKenyanPhone(value: string): string {
  const normalized = normalisePhone(value)
  if (!/^254[17]\d{8}$/.test(normalized)) return '254XX XXX XXX'
  return `${normalized.slice(0, 4)}XX XXX ${normalized.slice(-3)}`
}