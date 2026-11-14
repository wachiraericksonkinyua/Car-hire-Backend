import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO_PASSWORD, users } from '../src/mocks/fixtures'

test('public shell fits desktop width and shows primary routes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Vehicles', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  const dimensions = await page.locator('body').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
})

test('mobile navigation opens and footer remains within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'About Us' }).click()
  await expect(page.getByRole('heading', { name: 'About Us' })).toBeVisible()
  const dimensions = await page.locator('body').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
})

test('styleguide exposes all primitives and switches to dark theme', async ({ page }) => {
  await page.goto('/styleguide')
  await expect(page.getByRole('heading', { name: 'Component styleguide' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Form controls' })).toBeVisible()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('staff shell and dashboard have no Axe accessibility violations', async ({ page }) => {
  const owner = users.find((user) => user.role === 'owner')!
  await page.goto('/login')
  await page.getByLabel('Work email').fill(owner.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Vehicles out today/ })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('driver navigation hides office-only links and exposes assigned trips', async ({ page }) => {
  const driver = users.find((user) => user.role === 'driver')!
  await page.goto('/login')
  await page.getByLabel('Work email').fill(driver.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin\/my-trips$/)
  await expect(page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'My trips' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Staff navigation' }).getByRole('link', { name: 'Dashboard' })).toHaveCount(0)
})

test('Ctrl+K searches vehicle plates', async ({ page }) => {
  const owner = users.find((user) => user.role === 'owner')!
  await page.goto('/login')
  await page.getByLabel('Work email').fill(owner.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: /Search fleet, bookings and customers/ })).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search fleet, bookings and customers' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search fleet, bookings and customers' }).fill('KDA 101A')
  await expect(page.getByRole('link', { name: /Toyota Prado TX/ })).toBeVisible()
})