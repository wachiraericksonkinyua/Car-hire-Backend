import type { Driver } from '../../api/types'

export function getDriverExpiryReason(driver: Driver, now = Date.now()): string | null {
  const expiredLicence = Date.parse(driver.licenceExpiresAt) < now
  const expiredPsv = Date.parse(driver.psvExpiresAt) < now
  if (expiredLicence && expiredPsv) return 'Driving licence and PSV badge expired'
  if (expiredLicence) return 'Driving licence expired'
  if (expiredPsv) return 'PSV badge expired'
  return null
}

export function getDriverEligibilityReason(driver: Driver, returnAt: string, now = Date.now()): string | null {
  if (driver.status !== 'available') return 'Driver is not available'
  const requiredUntil = Math.max(now, Date.parse(returnAt))
  if (Date.parse(driver.licenceExpiresAt) < requiredUntil) return 'Driving licence expires before this trip ends'
  if (Date.parse(driver.psvExpiresAt) < requiredUntil) return 'PSV badge expires before this trip ends'
  return null
}