import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD, users } from '../src/mocks/fixtures'

const destinations = {
  owner: { path: '/admin', heading: 'Dashboard' },
  manager: { path: '/admin', heading: 'Dashboard' },
  agent: { path: '/admin', heading: 'Dashboard' },
  driver: { path: '/admin/my-trips', heading: 'My trips' },
  mechanic: { path: '/admin/incidents', heading: 'Incidents' },
}

for (const user of users) {
  const destination = destinations[user.role]
  test(`${user.role} lands on the correct staff page`, async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Work email').fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(new RegExp(`${destination.path.replaceAll('/', '\\/')}$`))
    await expect(page.getByRole('heading', { name: destination.heading })).toBeVisible()
  })
}

test('login page has no Axe accessibility violations', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Run your fleet from one place' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('an agent sees 403 on a manager-only route', async ({ page }) => {
  const agent = users.find((user) => user.role === 'agent')!
  await page.goto('/admin/staff')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Work email').fill(agent.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/403$/)
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
})

test('refresh cookie restores the session after a reload', async ({ page }) => {
  const owner = users.find((user) => user.role === 'owner')!
  await page.goto('/login')
  await page.getByLabel('Work email').fill(owner.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.context().addCookies([{
    name: 'autohire_refresh',
    value: 'mock-owner',
    url: 'http://127.0.0.1:4173',
    httpOnly: true,
    sameSite: 'Lax',
  }])
  const cookieNames = (await page.context().cookies()).map((cookie) => cookie.name)
  expect(cookieNames).toContain('autohire_refresh')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})