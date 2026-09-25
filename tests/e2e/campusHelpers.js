// Shared helpers for campus e2e specs. Campus specs run against the second
// isolated audit server (port 4174) where the campus flags are ON inside the
// test process only (K2); legacy specs keep using the flags-off server.
import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

export const CAMPUS_BASE_URL = process.env.PRISM_AUDIT_CAMPUS_BASE_URL || 'http://127.0.0.1:4174'
export const LEGACY_BASE_URL = process.env.PRISM_AUDIT_BASE_URL || 'http://127.0.0.1:4173'

let seq = 0
export function syntheticEmail(label) {
  seq += 1
  return `${label}-${Date.now()}-${seq}@test.local`
}

export async function api(page, path, { method = 'GET', token, body, headers = {} } = {}) {
  return page.evaluate(async ({ path, method, token, body, headers }) => {
    const r = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, { path, method, token, body, headers })
}

// Registers a synthetic user through the real API and stores the session the
// same way the app does (lib/session.js keys).
export async function signInSynthetic(page, baseURL, label = 'campus') {
  await page.goto(`${baseURL}/`)
  const email = syntheticEmail(label)
  const reg = await api(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Synthetic Campus User', email, college: 'Synthetic College', year: '4th Year', password: 'candidate-pass-1!', ageConfirmed: true },
  })
  expect(reg.status).toBe(201)
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('prism_token', token)
    localStorage.setItem('prism_user', JSON.stringify({ name: user.name, email: user.email, college: user.college, year: user.year }))
  }, { token: reg.body.token, user: reg.body.user })
  return { email, token: reg.body.token, user: reg.body.user }
}

export async function expectNoSeriousAxe(page) {
  const results = await new AxeBuilder({ page }).analyze()
  const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

export async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}
