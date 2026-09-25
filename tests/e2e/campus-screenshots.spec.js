// Prism Campus C0.09 — baseline screenshots (not @critical). Run on demand:
//   npx playwright test tests/e2e/campus-screenshots.spec.js --project=chromium --project=mobile-chromium
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join('audit-results', 'campus-baseline')

async function api(page, path, { method = 'GET', token, body } = {}) {
  return page.evaluate(async ({ path, method, token, body }) => {
    const r = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, { path, method, token, body })
}

async function signedIn(page) {
  await page.goto('/')
  const email = `campus-shots-${Date.now()}@test.local`
  const reg = await api(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Synthetic Screenshot User', email, college: 'Synthetic College', year: 'Final Year', password: 'candidate-pass-1!', ageConfirmed: true },
  })
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('prism_token', token)
    localStorage.setItem('prism_user', JSON.stringify(user))
  }, { token: reg.body.token, user: reg.body.user })
  const ent = await api(page, '/api/payment/dev-session', { method: 'POST', token: reg.body.token })
  return { token: reg.body.token, sessionId: ent.body?.sessionId }
}

test('CAMPUS-SCREENS @campus-screens baseline key UI', async ({ page }, info) => {
  const tag = info.project.name
  mkdirSync(OUT, { recursive: true })
  if (!info.project.use.isMobile) await page.setViewportSize({ width: 1440, height: 900 })
  const shot = (name) => page.screenshot({ path: join(OUT, `${tag}-${name}.png`), fullPage: true })

  await page.goto('/'); await page.waitForLoadState('networkidle'); await shot('landing')
  await page.goto('/login'); await shot('login')
  const { sessionId } = await signedIn(page)
  await page.goto('/app'); await page.waitForLoadState('networkidle'); await shot('app')
  await page.goto(`/briefing?session=${sessionId}`); await page.waitForLoadState('networkidle'); await shot('briefing')
  await page.goto(`/report/${sessionId}/v2`); await page.waitForLoadState('networkidle'); await shot('report-v2')
  await page.goto('/explore'); await page.waitForLoadState('networkidle'); await shot('explore')
  await page.goto('/missions/MIS-MKT-EXP-01'); await page.waitForLoadState('networkidle'); await shot('mission')
})
