import { test, expect } from '@playwright/test'

test('app loads and canvas is visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#main-canvas')).toBeVisible()
})

test('toolbar is visible', async ({ page }) => {
  await page.goto('/')
  // The toolbar should render on load
  await expect(page.locator('.toolbar, [class*="toolbar"]').first()).toBeVisible()
})
