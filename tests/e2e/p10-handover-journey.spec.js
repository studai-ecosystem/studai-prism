import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic } from './campusHelpers.js'

const RESULT_FILE = join(process.cwd(), 'audit-results', 'p10-route-results.json')
const results = []

async function visit(page, id, path) {
  const response = await page.goto(`${CAMPUS_BASE_URL}${path}`)
  expect(response?.status(), `${id} HTTP status`).toBeLessThan(500)
  await expect(page.locator('body')).not.toBeEmpty()
  await expect(page.locator('main').first()).toBeVisible()
  results.push({ id, resolvedPath: path, status: 'PASS', httpStatus: response?.status() || null })
}

test.afterAll(async () => {
  await mkdir(dirname(RESULT_FILE), { recursive: true })
  await writeFile(RESULT_FILE, `${JSON.stringify({
    kind: 'P10_LOCAL_ROUTE_RESULTS',
    environment: 'LOCAL_CI_SYNTHETIC',
    credentialsIncluded: false,
    tokensIncluded: false,
    results,
  }, null, 2)}\n`)
})

test('P10 handover manifest: public entry, shell, history, owned assignment, player and honest optional routes', async ({ page }) => {
  test.setTimeout(180_000)
  await visit(page, 'LOGIN', '/login')
  await visit(page, 'REGISTER', '/register')

  const learner = await signInSynthetic(page, CAMPUS_BASE_URL, 'p10-handover')
  const dev = await api(page, '/api/payment/dev-session', { method: 'POST', token: learner.token, body: {} })
  expect(dev.status, JSON.stringify(dev.body)).toBe(200)
  const assessments = await api(page, '/api/v1/me/assessments', { token: learner.token })
  expect(assessments.status, JSON.stringify(assessments.body)).toBe(200)
  const assignment = assessments.body.data.active
    .find((candidate) => candidate.definitionId === 'draft-core-teamready-a' && candidate.status === 'NOT_STARTED')
  expect(assignment).toBeTruthy()

  await visit(page, 'APP_ROOT', '/app')
  await visit(page, 'HOME', '/app/home')
  await visit(page, 'DASHBOARD_ALIAS', '/dashboard')
  await visit(page, 'PROFILE_ALIAS', '/profile')
  await visit(page, 'ASSESSMENT_HISTORY', '/app/assessments')
  await visit(page, 'ASSIGNMENT_DETAIL', `/app/assessments/${assignment.id}`)
  await visit(page, 'ASSIGNMENT_BRIEFING', `/app/assessments/${assignment.id}/briefing`)
  await visit(page, 'ASSIGNMENT_SYSTEM_CHECK', `/app/assessments/${assignment.id}/system-check`)
  await visit(page, 'OWNED_PLAYER', `/app/assessment/${dev.body.sessionId}`)
  await visit(page, 'OWNED_LEGACY_REPORT_READER', `/report/${dev.body.sessionId}/v2`)
  await visit(page, 'REPORT_SELECTED_VERSION', `/app/reports/${dev.body.sessionId}?version=1`)
  await visit(page, 'CAPABILITY_MAP', '/app/capabilities')
  await visit(page, 'CAPABILITY_DETAIL', '/app/capabilities/communication')
  await visit(page, 'DEVELOPMENT', '/app/development')
  await visit(page, 'MISSION', '/app/development/missions/M09')
  await visit(page, 'PREPARATION', '/app/prepare')
  await visit(page, 'PREPARATION_ATTEMPT_HONEST_STATE', '/app/prepare/synthetic-missing-attempt')
  await visit(page, 'GROWTH_NOT_COMPARABLE', '/app/growth')
})
