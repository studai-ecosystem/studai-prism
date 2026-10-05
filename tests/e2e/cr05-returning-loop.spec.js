import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow, completeLegacyAssessment } from './campusHelpers.js'
import { ASSESSMENT_CONSENT_ITEMS } from '../../src/lib/copy/assessmentConsent.js'
import { readAcceptedRun } from '../fixtures/campusSeed.mjs'
import { MISSION_FIXTURES } from '../../server/test/fixtures/p6Missions.js'

const FORM = 'draft-core-teamready-a:0.2.0-draft'
const MISSION = 'MIS-CORE-USABLE-HANDOVER-01'
const ROWS = ['Confirm the venue setup', 'Prepare participant materials', 'Confirm the participant list and needs']
const ANSWERS = [
  'Is 24 the confirmed attendance or only the sign-ups? What is the room capacity?',
  'One session reaches all participants together. Two sessions allow more support but double the setup. With two days I choose one session and a short agenda.',
  'Plan: Sam sets up the room Day 1 morning, I confirm the list today, Priya does materials Day 2. Sam, I need the seat count from you first.',
  'I hear that the room matters most and I agree it comes first. I still think a one-page agenda is worth it; let us do that instead of a full pack.',
  'Sam is out Day 1 afternoon, so room setup stays in the morning and I keep the list myself. Priya, please cover the agenda if I run short.',
  'The brief states 24 participants, not 40, and the venue has one screen. I will not rely on a projector until Sam has tested it; I remain unsure it works with a laptop.',
  'A one-page agenda is enough at this scope, rather than the full pack. Priya prepares that one page for Day 2 morning; Sam reviews it today. Both should use that interpretation.',
  'The board fits the two days as written. The room and participant needs come first on Day 1, then the agenda Day 2 morning. No responsibility moves; keep those due points.',
  'Ade, the workshop goes ahead for the expected 24 participants with a one-page agenda. We need the programme office to confirm attendance today; we will keep the room and printed fallback ready.',
]
const SHOTS = join('audit-results', 'ui', 'cr05')

async function pane(page, name) {
  const notice = page.getByRole('button', { name: 'Continue on this device' })
  if (await notice.isVisible()) await notice.click()
  const radio = page.getByRole('radio', { name })
  if (await radio.count() && !(await radio.isChecked())) await page.locator('label').filter({ has: radio }).click()
}

async function answer(page, text) {
  await pane(page, 'Conversation')
  const response = page.waitForResponse((r) => /\/assessment-sessions\/[^/]+\/messages$/.test(r.url()) && r.request().method() === 'POST')
  await page.getByLabel('Your answer').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
  const received = await response
  expect([200, 201]).toContain(received.status())
  await expect(page.getByLabel('Your answer')).toHaveValue('')
  await expect(page.getByTestId('conversation').locator('[data-role="candidate"]').filter({ hasText: text })).toHaveCount(1)
}

async function saved(page) {
  await expect(page.locator('[data-save-state="SAVED"]')).toBeVisible({ timeout: 15_000 })
}

async function capture(page, testInfo, state) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const viewport = page.viewportSize()
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expectNoHorizontalOverflow(page)
    await expectNoSeriousAxe(page)
    await page.screenshot({ path: join(SHOTS, `${state}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize(viewport)
}

test('@critical @cr05 returning learner → universal accepted work → worker → immutable report → practice → owned history (no final-result fixtures)', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  expect(process.env.PRISM_AUDIT_DRAFT_CONTENT).toBe('true')
  expect(process.env.PRISM_E2E_DATABASE_URL).toBeTruthy()
  const learner = await signInSynthetic(page, CAMPUS_BASE_URL, `cr05-loop-${testInfo.project.name}`)
  const oldEntitlement = await api(page, '/api/payment/dev-session', { method: 'POST', token: learner.token })
  expect(oldEntitlement.status).toBe(200)
  const oldSessionId = oldEntitlement.body.sessionId
  const oldConsent = await api(page, '/api/assessment/consent', {
    method: 'POST', token: learner.token,
    body: { sessionId: oldSessionId, scopes: ASSESSMENT_CONSENT_ITEMS.map((item) => item.scope), consentVersion: 'synthetic-cr05-original' },
  })
  expect(oldConsent.status).toBe(200)
  expect((await api(page, '/api/assessment/start', { method: 'POST', token: learner.token, body: { sessionId: oldSessionId } })).status).toBe(200)
  expect((await api(page, '/api/assessment/message', {
    method: 'POST', token: learner.token,
    body: { sessionId: oldSessionId, text: 'I would check the affected customers and compare the available options before making a decision.' },
  })).status).toBe(200)
  await completeLegacyAssessment(page, learner.token, oldSessionId)
  const originalReport = await api(page, `/api/assessment/report/${oldSessionId}`, { token: learner.token })
  expect(originalReport.status).toBe(200)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${CAMPUS_BASE_URL}/login`)
  await page.getByLabel('Email').fill(learner.email)
  await page.getByLabel('Password').fill('candidate-pass-1!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/app(\/home)?$/)
  const initial = await api(page, '/api/v1/me/history', { token: learner.token })
  expect(initial.status).toBe(200)
  expect(initial.body.data.items.filter((item) => item.mode === 'FORMAL')).toHaveLength(1)
  expect((await api(page, '/api/payment/dev-session', { method: 'POST', token: learner.token })).status).toBe(200)
  await page.goto(`${CAMPUS_BASE_URL}/app/assessments`)
  await page.getByTestId('assignment-card').getByRole('link', { name: /Open briefing/ }).click()
  await page.getByRole('link', { name: 'Continue to system check' }).click()
  for (const item of ASSESSMENT_CONSENT_ITEMS) await page.getByLabel(item.label).check()
  await page.getByRole('button', { name: 'Begin assessment' }).click()
  await expect(page).toHaveURL(/\/app\/assessment\/[^/?]+$/)
  const sessionId = new URL(page.url()).pathname.split('/').pop()
  const before = await readAcceptedRun({ databaseUrl: process.env.PRISM_E2E_DATABASE_URL, sessionId })
  expect(before.start.response.runPin.formId).toBe(FORM)
  expect(before.start.response.runPin.methodHash).toMatch(/^[a-f0-9]{64}$/)
  expect(before.job).toBeNull()
  expect(before.version).toBeNull()
  await page.getByRole('dialog').getByRole('button', { name: 'Begin timed assessment' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await answer(page, ANSWERS[0])
  await answer(page, ANSWERS[1])

  // Real board changes, not a message claiming that the board was edited.
  await pane(page, /^Workspace/)
  await page.getByLabel(`Due for ${ROWS[1]}`).fill('Day 2 morning')
  await saved(page)
  await page.getByLabel(`Owner for ${ROWS[1]}`).selectOption('Priya')
  await saved(page)
  await page.getByLabel(`Due for ${ROWS[2]}`).fill('Day 1 morning')
  await saved(page)
  await page.getByLabel(`Owner for ${ROWS[2]}`).selectOption('You')
  await saved(page)
  await pane(page, 'Conversation')
  await expect(page.getByTestId('conversation')).toContainText('I have seen the board change.')
  await answer(page, ANSWERS[2])
  await answer(page, ANSWERS[3])
  await expect(page.getByTestId('conversation')).toContainText('What changed')
  await answer(page, ANSWERS[4])
  await expect(page.getByTestId('ai-generated-label')).toBeVisible()
  await answer(page, ANSWERS[5])
  await answer(page, ANSWERS[6])
  await answer(page, ANSWERS[7])

  await pane(page, /^Workspace/)
  const definitions = ['Room seating and screen checked', 'One-page agenda ready for printing', 'Attendance and participant needs confirmed']
  for (let i = 0; i < ROWS.length; i += 1) {
    await page.getByLabel(`Status for ${ROWS[i]}`).selectOption('IN_PROGRESS')
    await saved(page)
    await page.getByLabel(`Why for ${ROWS[i]}`).fill(definitions[i])
    await saved(page)
  }
  await pane(page, 'Conversation')
  await expect(page.getByTestId('conversation')).toContainText('Message from Ade')
  await answer(page, ANSWERS[8])
  await page.getByRole('button', { name: 'Finish assessment' }).click()
  const submitted = page.waitForResponse((r) => /\/assessment-sessions\/[^/]+\/finish$/.test(r.url()) && r.request().method() === 'POST')
  await page.getByRole('dialog', { name: /Finish/ }).getByRole('button', { name: /^Finish( anyway)?$/ }).click()
  expect([200, 202]).toContain((await submitted).status())
  await expect(page).toHaveURL(new RegExp(`/app/reports/${sessionId}$`), { timeout: 60_000 })
  await expect(page.getByTestId('report-header')).toBeVisible()
  const run = await readAcceptedRun({ databaseUrl: process.env.PRISM_E2E_DATABASE_URL, sessionId })
  expect(run.job.state).toBe('DONE')
  expect(run.accepted.response.methodHash).toBe(before.start.response.runPin.methodHash)
  expect(run.accepted.response.evidenceIds.length).toBeGreaterThan(0)
  expect(run.actions.filter((action) => action.kind === 'MESSAGE')).toHaveLength(ANSWERS.length)
  expect(run.actions.every((action) => action.state === 'APPLIED')).toBe(true)
  expect(run.opportunities.filter((opportunity) => opportunity.required !== false && opportunity.state === 'EVALUATED').length).toBeGreaterThanOrEqual(11)
  expect(run.version.version).toBe(1)
  const report = await api(page, `/api/v1/assessment-sessions/${sessionId}/report`, { token: learner.token })
  expect(report.status).toBe(200)
  expect(report.body.data.report.methodology.formId).toBe(FORM)
  for (const item of [...report.body.data.report.moments, ...report.body.data.report.boundedObservations]) {
    expect([...ANSWERS, ...definitions, 'Day 1 morning', 'Day 2 morning', 'Priya', 'You', 'IN_PROGRESS'].some((source) => source.includes(item.quote))).toBe(true)
  }
  await capture(page, testInfo, 'report')

  // Practice is a separate real attempt; it must not alter the formal snapshot.
  await page.getByRole('link', { name: /^Practise this/ }).first().click()
  await expect(page).toHaveURL(/\/app\/development\?source=/)
  await page.getByLabel('Choose a different goal').selectOption({ label: 'Execution & Ownership' })
  await page.getByRole('article').filter({ hasText: 'Make the handover usable' }).getByRole('link', { name: /^Open mission/ }).click()
  await expect(page).toHaveURL(new RegExp(`/app/development/missions/${MISSION}\\?source=`))
  expect(new URL(page.url()).searchParams.get('source')).toBe(sessionId)
  expect(new URL(page.url()).searchParams.get('moment')).toBeTruthy()
  await page.getByRole('button', { name: 'Start mission' }).click()
  const work = MISSION_FIXTURES[MISSION].missingOwner
  const labels = { slides: 'Prepare the demo slides', room: 'Book the demo room', projector: 'Test the projector', visitors: 'Confirm the visitor list' }
  for (const row of work.BOARD.rows) {
    if (row.owner != null) await page.getByLabel(`Owner for ${labels[row.id]}`).fill(row.owner)
    if (row.done_when != null) await page.getByLabel(`Done when for ${labels[row.id]}`).fill(row.done_when)
  }
  await page.getByLabel('Handover to Lea and Tom', { exact: true }).fill(work.HANDOVER.text)
  await expect(page.getByText('All changes saved')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for feedback' }).click()
  const reviewed = page.waitForResponse((r) => /\/mission-attempts\/[^/]+\/submit$/.test(r.url()) && r.request().method() === 'POST')
  await page.getByRole('dialog', { name: 'Submit this attempt?' }).getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByTestId('feedback-focus')).toBeVisible()
  const attemptResponse = await reviewed
  expect(attemptResponse.status()).toBe(201)
  const attempt = (await attemptResponse.json()).data
  expect(attempt.status).toBe('EVALUATED')
  expect(attempt.result.focus.reviewIncomplete).toBe(false)
  await expect(page.getByTestId('focus-next')).toContainText('Every task names Lea or Tom as owner')
  await capture(page, testInfo, 'practice-feedback')
  await page.goto(`${CAMPUS_BASE_URL}/app/assessments?tab=history`)
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('region', { name: 'Formal assessment' }).getByTestId('history-item')).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'Practice' }).getByTestId('history-item')).toHaveCount(1)
  await capture(page, testInfo, 'history')
  const afterPractice = await api(page, `/api/v1/assessment-sessions/${sessionId}/report?version=1`, { token: learner.token })
  expect(afterPractice.status).toBe(200)
  expect(afterPractice.body.data.report).toEqual(report.body.data.report)
  expect(afterPractice.body.data.version).toEqual(report.body.data.version)
  const history = await api(page, '/api/v1/me/history', { token: learner.token })
  expect(history.body.data.items.filter((item) => item.mode === 'FORMAL')).toHaveLength(2)
  expect(history.body.data.items.filter((item) => item.mode === 'PRACTICE')).toHaveLength(1)
  const stillOriginal = await api(page, `/api/assessment/report/${oldSessionId}`, { token: learner.token })
  expect(stillOriginal.status).toBe(200)
  expect(stillOriginal.body).toEqual(originalReport.body)
})
