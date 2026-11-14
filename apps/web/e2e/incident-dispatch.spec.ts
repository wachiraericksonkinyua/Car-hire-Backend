import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD, users } from '../src/mocks/fixtures'

test('staff logs an SOS and dispatches the nearest partner mechanic', async ({ page }) => {
  const manager = users.find((user) => user.role === 'manager')!
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Work email').fill(manager.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.goto('/admin/incidents')

  await expect(page.getByRole('link', { name: /Open breakdown incidents/ })).toBeVisible()
  await page.getByRole('button', { name: 'Log phone SOS' }).click()
  await page.getByLabel('Location or landmark').fill('Nairobi CBD, Kencom')
  await page.getByLabel('Describe the issue').fill('Customer reports a flat tyre and cannot continue.')
  await page.getByRole('button', { name: 'Send SOS' }).click()

  const newIncident = page.getByRole('button').filter({ hasText: 'SOS-104' })
  await expect(newIncident).toBeVisible()
  await expect(page.getByRole('link', { name: /Open breakdown incidents.*2/ })).toBeVisible()
  await newIncident.click()
  await expect(page.getByRole('heading', { name: /SOS-104/ })).toBeVisible()
  await expect(page.getByText('Ngara Roadside Assist')).toBeVisible()

  await page.getByRole('button', { name: 'Dispatch closest partner' }).click()
  await expect(page.getByRole('dialog', { name: 'Confirm dispatch' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm dispatch' }).click()
  await expect(page.getByText('dispatched', { exact: true })).toBeVisible()
})
