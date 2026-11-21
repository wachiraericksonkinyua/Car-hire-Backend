import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('homepage matches desktop and mobile layout constraints', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Experience the road like never before', level: 1 })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Book your car', level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Book now' })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    const dimensions = await page.locator('body').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
})
