// PROD-READY Phase 9 — the employer development-use (L&D) workspace in a real
// browser (synthetic data only). Campus harness (flags on in the test process
// only, K2) with PRISM_AUDIT_EMPLOYER_LND=true for the flag-on journey, and a
// throwaway campus store (PRISM_E2E_DATABASE_URL).
//   ON: an employer L&D lead opens the workspace, creates a group within the
//   job-family scope, invites a new colleague, sponsors an in-scope
//   assessment and reads suppressed group summaries; the pages carry no
//   ranking, sort-by-level, bulk-selection or individual-export control, and
//   the API refuses ranking / level / score / cut-off parameters and campus
//   routes for the employer organization. The employee sees the employer
//   disclosure (prohibited uses included) on the briefing and the
//   acknowledgement is stored as an EMPLOYER consent. axe: 0 serious/critical.
//   OFF (every other harness run): every employer route is 404 and
//   /employer/* never renders.
// Shared-report reads need a published V3 report; they are covered by
// server/test/employerLnd.test.js and src/features/employer/employer.test.jsx.
import { test, expect } from '@playwright/test'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'
import { seedEmployerOrganization, listConsentRecords } from '../fixtures/campusSeed.mjs'

const DB = process.env.PRISM_E2E_DATABASE_URL
const EMPLOYER_ON = process.env.PRISM_AUDIT_EMPLOYER_LND === 'true'
const SELECTION = /\bhir(e|ed|ing)\b|\bfit\b|\bsuitab(le|ility)\b|recommend(ed)? for (the |a )?role|\bshortlist|\bleaderboard|\bpass\s*\/\s*fail\b|\btop (performer|candidate|talent)/i

async function visibleTextOutsideRules(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true)
    for (const el of clone.querySelectorAll('[data-testid="employer-usage-rules"], [data-testid="employer-prohibited-uses"], script, style')) el.remove()
    return clone.innerText || clone.textContent
  })
}

async function expectNoSelectionUi(page) {
  await expect(page.locator('[aria-sort]')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /select all/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /sort|rank|order by/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /export (people|students|individual|results)/i })).toHaveCount(0)
  expect(await visibleTextOutsideRules(page)).not.toMatch(SELECTION)
}

test.describe('@campus PROD P09 employer workspace OFF (default harness)', () => {
  test.skip(EMPLOYER_ON, 'The flag-on journey below covers this server.')

  test('PROD-P09-OFF: employer and Hire hand-off routes are 404; /employer never renders', async ({ page }) => {
    const owner = await signInSynthetic(page, CAMPUS_BASE_URL, 'p09-off')
    const org = '55555555-5555-4555-8555-555555555555'
    for (const path of [`/api/v1/employer/organizations/${org}`, `/api/v1/employer/organizations/${org}/people`, '/api/v1/integrations/hire/handoff']) {
      const r = await api(page, path, { token: owner.token })
      expect(r.status, path).toBe(404)
    }
    const me = await api(page, '/api/v1/me', { token: owner.token })
    expect(me.body.data.flags.PRISM_EMPLOYER_LND).toBe(false)
    await page.goto(`${CAMPUS_BASE_URL}/employer/${org}/overview`)
    await expect(page).toHaveURL(`${CAMPUS_BASE_URL}/`)
  })
})

test.describe('@campus @a11y PROD P09 employer workspace ON', () => {
  test.skip(!EMPLOYER_ON || !DB, 'Needs PRISM_AUDIT_EMPLOYER_LND=true on the 4174 campus audit server and the throwaway campus store (PRISM_E2E_DATABASE_URL).')

  test('PROD-P09: development-use journey with prohibited-use checks (chromium)', async ({ page, browser }) => {
    test.setTimeout(240_000)
    // Two synthetic people: the employee first (their own browser context), then the L&D lead.
    const employeeContext = await browser.newContext()
    const employeePage = await employeeContext.newPage()
    const employee = await signInSynthetic(employeePage, CAMPUS_BASE_URL, 'p09-employee')
    const owner = await signInSynthetic(page, CAMPUS_BASE_URL, 'p09-owner')
    const seeded = await seedEmployerOrganization({ databaseUrl: DB, ownerUserId: owner.user.id, employeeUserIds: [employee.user.id] })
    const orgId = seeded.organizationId
    const E = (p = '') => `/api/v1/employer/organizations/${orgId}${p}`

    // ── API: prohibited by design ──────────────────────────────────────────
    for (const q of ['sort=level', 'orderBy=score', 'minLevel=DEMONSTRATED', 'rank=1', 'threshold=3']) {
      const r = await api(page, `${E('/people')}?${q}`, { token: owner.token })
      expect(r.status, q).toBe(422)
      expect(r.body.error.code).toBe('PROHIBITED_USE')
    }
    for (const view of ['students', 'people', 'comparison']) {
      expect((await api(page, E('/insights/exports'), { method: 'POST', token: owner.token, body: { view } })).status, view).toBe(422)
    }
    for (const p of ['', '/students', '/students/export', '/analytics/capabilities']) {
      expect((await api(page, `/api/v1/organizations/${orgId}${p}`, { token: owner.token })).status, `campus route ${p}`).toBe(404)
    }
    const handoff = await api(page, '/api/v1/integrations/hire/handoff', { method: 'POST', token: employee.token, body: {} })
    expect(handoff.status).toBe(501)
    expect(handoff.body.error.code).toBe('NOT_IMPLEMENTED')

    // ── Overview ────────────────────────────────────────────────────────────
    await page.goto(`${CAMPUS_BASE_URL}/employer/${orgId}/overview`)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible({ timeout: 30_000 })
    const rules = page.getByTestId('employer-usage-rules')
    await expect(rules).toContainText('sole or primary basis for any selection, employment, promotion or termination decision')
    await expect(rules).toContainText('no export of individual results')
    await expect(page.getByRole('navigation', { name: 'Employer development workspace' }).first()).toBeVisible()
    await expectNoSelectionUi(page)
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // ── People: a group within the scope, an invitation, the roster ───────
    await page.goto(`${CAMPUS_BASE_URL}/employer/${orgId}/people`)
    await expect(page.getByRole('table', { name: 'People' })).toBeVisible({ timeout: 30_000 })
    const groupForm = page.getByRole('form', { name: 'Create group' })
    await groupForm.getByLabel('Group name').fill('Synthetic customer success freshers')
    await groupForm.getByLabel(/Job family/).selectOption('customer-facing-growth')
    await groupForm.getByRole('button', { name: 'Create group' }).click()
    await expect(page.getByRole('list', { name: 'Groups' }).getByText('Synthetic customer success freshers')).toBeVisible()
    const inviteForm = page.getByRole('form', { name: 'Invite people' })
    await inviteForm.getByLabel(/Email addresses/).fill(`p09-newhire-${Date.now()}@test.local`)
    await inviteForm.getByRole('button', { name: 'Send invitations' }).click()
    await expect(page.getByText(/1 invitation created/)).toBeVisible()
    const table = page.getByRole('table', { name: 'People' })
    await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Group', 'Membership', 'Latest assessment'])
    await expect(table).toContainText('Synthetic Campus User')
    await expectNoSelectionUi(page)
    await expectNoSeriousAxe(page)

    // ── Assessments: only in-scope definitions; sponsor one ──────────────
    await page.goto(`${CAMPUS_BASE_URL}/employer/${orgId}/assessments`)
    const sponsor = page.getByRole('form', { name: 'Sponsor an assessment' })
    await expect(sponsor).toBeVisible({ timeout: 30_000 })
    const catalog = await api(page, E('/assessment-catalog'), { token: owner.token })
    expect(catalog.status).toBe(200)
    for (const d of catalog.body.data.items) for (const f of d.families) expect(['graduate-business-operations', 'customer-facing-growth']).toContain(f.id)
    await expect(sponsor.getByLabel(/integrity|proctor|minimum|threshold/i)).toHaveCount(0)
    const fmt = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    await sponsor.getByLabel('Opens').fill(fmt(new Date(Date.now() - 3600_000)))
    await sponsor.getByLabel('Closes').fill(fmt(new Date(Date.now() + 7 * 86400_000)))
    await sponsor.getByLabel('Synthetic fresher group').check()
    await sponsor.getByRole('button', { name: 'Sponsor assessment' }).click()
    await expect(page.getByText(/Assessment sponsored for 1 person/)).toBeVisible()
    await expectNoSelectionUi(page)
    await expectNoSeriousAxe(page)

    // ── Group summaries: suppressed below the minimum; aggregate export only
    await page.goto(`${CAMPUS_BASE_URL}/employer/${orgId}/insights`)
    await expect(page.getByRole('heading', { level: 1, name: 'Group summaries' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Hidden: this group is too small to report without singling someone out.')).toBeVisible()
    const exportForm = page.getByRole('form', { name: 'Export group summaries' })
    await expect(exportForm.getByRole('option')).toHaveText(['Capabilities', 'Participation', 'Practice'])
    const exported = await api(page, E('/insights/exports'), { method: 'POST', token: owner.token, body: { view: 'capabilities' } })
    expect(exported.status).toBe(200)
    expect(exported.body.data.csv).not.toContain(employee.email)
    expect(exported.body.data.csv).not.toContain(employee.user.id)
    await expectNoSelectionUi(page)
    await expectNoSeriousAxe(page)
    await expectNoHorizontalOverflow(page)

    // ── Employee: aggregate-only workspace and the employer disclosure ────
    const me = await api(employeePage, '/api/v1/me', { token: employee.token })
    const ws = me.body.data.workspaces.find((w) => w.organizationId === orgId)
    expect(ws.type).toBe('CAMPUS_STUDENT')
    expect(ws.visibilityPolicy).toBe('OWNER_AND_SPONSOR_AGGREGATE_ONLY')
    const assignments = await api(employeePage, '/api/v1/me/assessments', { token: employee.token, headers: { 'X-Prism-Workspace': ws.id } })
    const card = assignments.body.data.active[0]
    expect(card, JSON.stringify(assignments.body)).toBeTruthy()
    await employeePage.goto(`${CAMPUS_BASE_URL}/app/campus/${orgId}/assignments/${card.id}/briefing`)
    const disclosure = employeePage.getByTestId('sponsored-disclosure')
    await expect(disclosure).toBeVisible({ timeout: 30_000 })
    await expect(disclosure).toContainText('cannot see your report unless you choose to share it')
    await expect(disclosure.getByTestId('employer-prohibited-uses')).toContainText('may not rank people by their Prism results or set cut-off scores')
    await employeePage.getByLabel(/I understand what .* can and cannot see/).check()
    await employeePage.getByRole('button', { name: 'Confirm' }).click()
    await expect(employeePage.getByText('You confirmed you have read this.')).toBeVisible()
    const consents = await listConsentRecords({ databaseUrl: DB, userId: employee.user.id })
    expect(consents.some((c) => c.consentType === 'EMPLOYER_ASSESSMENT_DISCLOSURE' && c.organizationId === orgId)).toBe(true)
    expect(consents.some((c) => c.consentType === 'CAMPUS_ASSESSMENT_DISCLOSURE')).toBe(false)
    await expectNoSeriousAxe(employeePage)
    await employeePage.goto(`${CAMPUS_BASE_URL}/app/campus/${orgId}/home`)
    await expect(employeePage.getByText(/sees group summaries only/).first()).toBeVisible({ timeout: 30_000 })
    await employeeContext.close()
  })
})
