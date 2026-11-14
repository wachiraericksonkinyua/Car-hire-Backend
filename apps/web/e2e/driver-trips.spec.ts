import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD, users } from '../src/mocks/fixtures'

test('driver completes only their own trip on mobile', async ({ page }) => {
  const driver = users.find((user) => user.role === 'driver')!
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Work email').fill(driver.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/my-trips$/)
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Staff navigation' })).toHaveCount(0)

  const ownTrip = page.locator('.driver-trip-card').filter({ hasText: 'BK-2611-0013' })
  await expect(ownTrip).toBeVisible()
  await expect(page.getByText('BK-2611-0004')).toHaveCount(0)
  await expect(ownTrip.getByRole('link', { name: 'Call customer' })).toHaveAttribute('href', /^tel:/)
  await expect(ownTrip.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\//)
  await expect(ownTrip.getByText('KDA 101A')).toBeVisible()

  for (const label of ['En Route to Pickup', 'Customer Onboard', 'Trip Completed']) {
    await ownTrip.getByRole('button', { name: label }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm status' }).click()
  }
  await expect(ownTrip.getByText('trip completed')).toBeVisible()
})
