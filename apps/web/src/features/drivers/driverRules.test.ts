import { describe, expect, it } from 'vitest'
import { drivers } from '../../mocks/fixtures'
import { getDriverEligibilityReason, getDriverExpiryReason } from './driverRules'

describe('driver eligibility', () => {
  it('explains expired licence and PSV records and never considers them assignable', () => {
    const expiredLicence = drivers.find((driver) => driver.id === 'drv-04')!
    const expiredPsv = drivers.find((driver) => driver.id === 'drv-05')!
    const licenceMarkedAvailable = { ...expiredLicence, status: 'available' as const }
    const psvMarkedAvailable = { ...expiredPsv, status: 'available' as const }

    expect(getDriverExpiryReason(expiredLicence)).toMatch(/licence expired/i)
    expect(getDriverExpiryReason(expiredPsv)).toMatch(/PSV badge expired/i)
    expect(getDriverEligibilityReason(licenceMarkedAvailable, '2026-12-01T00:00:00.000Z')).toMatch(/licence expires/i)
    expect(getDriverEligibilityReason(psvMarkedAvailable, '2026-12-01T00:00:00.000Z')).toMatch(/PSV badge expires/i)
  })
})