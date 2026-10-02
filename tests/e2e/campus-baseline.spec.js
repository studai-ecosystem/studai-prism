// Prism Campus C0.07 — baseline smoke of the current direct (B2C) flow.
// Runs against the isolated audit server (scripts/start-audit-server.mjs):
// temp JSON store, PRISM_DUMMY_PAYMENTS=true, no production URLs.
import { test, expect } from '@playwright/test'

const PASSWORD = 'candidate-pass-1!'

test('CAMPUS-BASELINE-01 @critical @campus-baseline register (age confirm) → login → /app → start path reachable', async ({ page }) => {
  const email = `campus-baseline-${Date.now()}@test.local`

  await page.goto('/register')
  await page.getByLabel('Full Name').fill('Campus Baseline Candidate')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('College').fill('Synthetic College')
  await page.getByLabel('Year of Study').selectOption({ label: '4th Year' })
  await page.getByLabel('Password').fill(PASSWORD)
  await page.locator('input[type="checkbox"]').check()
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/payment/)

  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/app(\/home)?$/)

  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Prism Assessment' })).toBeVisible()
  const start = page.getByRole('button', { name: /Start an assessment/ })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page).toHaveURL(/\/payment/)

  // Dummy entitlement (PRISM_DUMMY_PAYMENTS=true in the audit server) → the start path.
  await page.getByRole('button', { name: /Continue \(free preview\)/ }).click()
  await expect(page).toHaveURL(/\/(briefing|verify-identity)\?session=/)
})

test('CAMPUS-BASELINE-02 @critical @campus-baseline legacy /app without a session shows the sign-in state', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Prism Assessment' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
