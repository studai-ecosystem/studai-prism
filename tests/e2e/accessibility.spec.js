import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const path of ['/', '/register', '/research/science', '/privacy', '/terms']) {
  test(`accessibility baseline ${path}`, async ({ page }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((item) => item.impact === 'critical')).toEqual([])
  })
}
