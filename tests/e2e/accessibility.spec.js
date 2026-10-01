import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const path of ['/', '/register', '/login', '/invite/synthetic-token', '/research/science', '/research/validity', '/research/ai-evaluation', '/privacy', '/terms', '/refund-policy', '/security', '/contact']) {
  test(`accessibility baseline ${path}`, async ({ page }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((item) => (item.impact === 'critical' || item.impact === 'serious'))).toEqual([])
  })
}
