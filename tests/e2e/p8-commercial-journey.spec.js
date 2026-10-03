// P8 real-browser commercial journey (CH-42, CH-43; T07, T53, T55, T59) on
// the isolated campus audit server (4174: campus flags on, DRAFT content via
// PRISM_AUDIT_DRAFT_CONTENT, dummy payments = provider TEST mode, throwaway
// PostgreSQL, deterministic audit AI provider).
//   public page (headline, illustration label, CTAs, keyboard FAQ)
//   → /try preview scene → observation visible UNAUTHENTICATED → one retry
//   → end-of-preview package explanation (exact allowance; status from config)
//   → onboarding intent step (minimal fields, disclosure, separate research box)
//   → checkout page (test mode, tax label, price status, policy, blockers,
//     purchase disabled because content is draft)
//   → saved preview readable in the account with no active package (T55 slice)
// Screenshots: audit-results/ui/p8/<step>-<width>.png (chromium only).
// Run: node scripts/run-experience-baseline-tests.mjs p8
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPUS_BASE_URL, api, signInSynthetic, expectNoSeriousAxe, expectNoHorizontalOverflow } from './campusHelpers.js'

const WIDTHS = [1440, 390]
const SHOTS = join('audit-results', 'ui', 'p8')
const WEAK = 'Good luck with the event, I am sure it will be fine.'
const GOOD = 'Nia, can you take the invitation list by Tuesday and the printed handouts by Thursday? Dev, please hand the invitation list to Nia before you leave tomorrow. What else do we still need to know?'

test.skip(process.env.PRISM_AUDIT_DRAFT_CONTENT !== 'true' || !process.env.PRISM_E2E_DATABASE_URL,
  'Needs the p8 runner mode: node scripts/run-experience-baseline-tests.mjs p8 (draft content + throwaway PostgreSQL for the 4174 audit server).')

async function shoot(page, testInfo, name) {
  if (testInfo.project.name !== 'chromium') return
  mkdirSync(SHOTS, { recursive: true })
  const original = page.viewportSize()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(250)
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true })
    await expectNoSeriousAxe(page)
  }
  await page.setViewportSize(original)
}

// Banned public claims (claimsCeiling + P8.1): no employability %, placement
// guarantee, "verified skills", layoff pitch, subscription, invented prices.
const noBannedClaims = async (page) => {
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/employab|guaranteed? (placement|job)|verified skills|layoff|job-ready|subscri|\d\s*%\s*(match|placement|hired)/i)
  expect(text).not.toMatch(/75,?000|1,?50,?000|₹\s?349|₹\s?399/)
}

test.describe('@p8 commercial journey: public → preview → onboarding → checkout → history', () => {
  test('the whole journey in one real browser session', async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

    // 1. Public page: headline direction, labelled illustration, CTAs, keyboard FAQ.
    await page.goto(`${CAMPUS_BASE_URL}/`)
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toContainText('Understand how you work.')
    await expect(h1).toContainText('Practise what matters next.')
    const illustration = page.getByTestId('hero-illustration')
    await expect(illustration).toContainText('Illustration, not a real result')
    expect(await illustration.innerText()).not.toMatch(/\b\d{2,3}\b/)
    const tryCta = page.getByRole('link', { name: /Try a short situation/ }).first()
    await expect(tryCta).toHaveAttribute('href', '/try')
    await expect(page.getByRole('button', { name: 'See how Prism works' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bring Prism to your institution' }).first()).toBeVisible()
    // Offer table: exact allowance, window, limits, policy status, availability from the server.
    const sprintRow = page.getByTestId('offer-sprint')
    await expect(sprintRow).toContainText('Formal assessment ×1 · missions ×4, two attempts each · fresh challenge ×1')
    await expect(sprintRow).toContainText('Test price, pending approval')
    await expect(page.getByTestId('offer-sprint-availability')).toContainText('Not yet purchasable')
    await expect(page.getByTestId('offer-professional')).toContainText('Not yet available')
    await expect(page.getByTestId('offer-privacy')).toContainText('stay private to you')
    await noBannedClaims(page)
    await shoot(page, testInfo, '01-public-landing')

    // FAQ: disclosure buttons, keyboard operable, aria-expanded flips, panel referenced by aria-controls.
    const faq = page.locator('#faq')
    await faq.scrollIntoViewIfNeeded()
    const firstQ = faq.getByRole('button').first()
    await firstQ.focus()
    await expect(firstQ).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Enter')
    await expect(firstQ).toHaveAttribute('aria-expanded', 'true')
    const panelId = await firstQ.getAttribute('aria-controls')
    await expect(page.locator(`[id="${panelId}"]`).first()).toBeVisible()
    await page.keyboard.press('Tab')
    const secondQ = faq.getByRole('button').nth(1)
    await expect(secondQ).toBeFocused()
    await page.keyboard.press('Space')
    await expect(secondQ).toHaveAttribute('aria-expanded', 'true')
    // Let the 300 ms disclosure animation settle so axe reads the final paint.
    await page.waitForTimeout(700)
    await shoot(page, testInfo, '02-public-faq-open')

    // 2. Preview scene, unauthenticated: briefing + prompt, no rubric; weak answer → NOT_FOUND observation visible.
    await tryCta.click()
    await expect(page).toHaveURL(/\/try$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Try a short situation' })).toBeVisible()
    await expect(page.getByText(/This is practice, not a formal assessment/)).toBeVisible()
    await expect(page.getByText(/draft content/i).first()).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(/rubric|level\s*\d|\bscore\b|capability map/i)
    await shoot(page, testInfo, '03-preview-scene')
    await page.getByLabel('Your answer').fill(WEAK)
    await page.getByRole('button', { name: /Send my answer/ }).click()
    const observation = page.getByTestId('preview-observation')
    await expect(observation).toBeVisible()
    await expect(page.getByTestId('preview-not-found')).toContainText('try again')
    await expect(observation).toContainText('not a capability level')
    await expect(page.getByText('1 retry left')).toBeVisible()
    await shoot(page, testInfo, '04-preview-observation-not-found')

    // 3. Retry with a clear handover → OBSERVED with the learner's own sentence quoted; then the package explanation.
    await page.getByLabel('Your revised answer').fill(GOOD)
    await page.getByRole('button', { name: /Retry/ }).click()
    await expect(observation).toContainText('Observed · practice')
    await expect(observation.locator('blockquote')).toContainText(/Nia|Dev|room booking|invitations/)
    await expect(observation).toContainText('One next behaviour')
    const next = page.getByTestId('preview-next')
    await expect(next).toBeVisible()
    await expect(page.getByTestId('preview-package')).toContainText('Formal assessment ×1 · missions ×4 (2 attempts each) · fresh challenge ×1 · 30-day activity window')
    await expect(page.getByTestId('preview-package-status')).toContainText('Not yet purchasable')
    await expect(next).toContainText('Create an account to keep this')
    await expect(next).toContainText('kept for one hour')
    // No raw report URL for the preview: the address bar never carries a token.
    expect(page.url()).not.toMatch(/token|preview\//)
    await shoot(page, testInfo, '05-preview-observed-package')

    // 4. Register (synthetic) and onboarding: the intent step asks only audience/intention/mode; disclosure; separate research box.
    const me = await signInSynthetic(page, CAMPUS_BASE_URL, 'p8-journey')
    await page.goto(`${CAMPUS_BASE_URL}/app/home`)
    const step = page.getByTestId('intent-step')
    await expect(step).toBeVisible()
    await expect(step.getByText(/never used to measure you/)).toBeVisible()
    await expect(step.getByTestId('intent-support')).toContainText('Speaking (speech): not yet available')
    await expect(step.getByTestId('intent-support')).toContainText('No CV, grades, employer, photograph or college is needed')
    for (const forbidden of ['CV', 'Grades', 'Employer', 'Photograph']) expect(await step.getByLabel(forbidden, { exact: false }).count()).toBe(0)
    const research = step.getByRole('checkbox', { name: /research/ })
    await expect(research).not.toBeChecked()
    await shoot(page, testInfo, '06-onboarding-intent')
    await step.getByLabel('Student').check()
    await step.getByLabel(/Practise what matters next/).check()
    await step.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByTestId('intent-chooser')).toBeVisible()
    const prefs = await api(page, '/api/v1/me/preferences', { token: me.token })
    expect(prefs.status).toBe(200)
    expect(prefs.body.data.researchPermission).toBeNull()
    expect(prefs.body.data.displayName).toBeNull()

    // 5. Save the preview explicitly (the token lives in sessionStorage from step 3 in this same tab).
    await page.goto(`${CAMPUS_BASE_URL}/try`)
    await expect(page.getByRole('heading', { level: 1, name: 'Try a short situation' })).toBeVisible()
    const saveBtn = page.getByRole('button', { name: /Save it to my account/ })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()
    await expect(page.getByText('Saved to your account')).toBeVisible()
    const previews = await api(page, '/api/v1/me/previews', { token: me.token })
    expect(previews.status).toBe(200)
    expect(previews.body.data.items).toHaveLength(1)
    expect(previews.body.data.items[0].mode).toBe('PRACTICE')
    // A guessed attempt id is not a capability (404), and another account cannot see it.
    const guessed = await api(page, '/api/v1/preview/attempts/current', { method: 'POST', body: { previewToken: previews.body.data.items[0].id } })
    expect(guessed.status).toBe(404)

    // 6. Checkout: test mode, configured amount labelled PROPOSED, tax label, policy, named blockers, purchase disabled.
    await page.goto(`${CAMPUS_BASE_URL}/payment`)
    await expect(page.getByTestId('checkout-summary')).toBeVisible()
    await expect(page.getByTestId('checkout-tax')).toContainText('Tax: as configured by finance — not yet approved')
    await expect(page.getByTestId('checkout-price-status')).toContainText('Proposed test price, pending finance approval')
    await expect(page.getByTestId('checkout-mode')).toContainText('test mode')
    const terms = page.getByTestId('checkout-terms')
    await expect(terms).toContainText('Formal assessment ×1 · missions ×4 (2 attempts each) · fresh challenge ×1')
    await expect(terms).toContainText('30 days; your report stays readable afterwards')
    await expect(terms).toContainText('Policy proposed, pending approval')
    await expect(terms).toContainText('whole library is not included')
    await expect(page.getByTestId('checkout-unavailable')).toContainText('not available for purchase yet')
    await expect(page.getByTestId('checkout-blockers')).toContainText(/reviewed content|draft/)
    await expect(page.getByRole('button', { name: /Not yet purchasable/ })).toBeDisabled()
    expect(await page.locator('body').innerText()).not.toMatch(/\d\s*%/)
    await noBannedClaims(page)
    const createOrder = await api(page, '/api/payment/create-order', { method: 'POST', token: me.token })
    expect(createOrder.status).toBe(409)
    expect(createOrder.body.code).toBe('OFFER_NOT_PURCHASABLE')
    await shoot(page, testInfo, '07-checkout-blocked')

    // 7. History stays readable with no active package (the expiry-during-run and
    //    expired-grant gates are Layer A/B in server/test/commerceGaps.test.js).
    await page.goto(`${CAMPUS_BASE_URL}/app/assessments?tab=history`)
    await expect(page.getByRole('tab', { name: 'History', selected: true })).toBeVisible()
    const history = await api(page, '/api/v1/me/history', { token: me.token, headers: { 'X-Prism-Workspace': 'personal' } })
    expect(history.status).toBe(200)
    expect(Array.isArray(history.body.data.items)).toBe(true)
    expect(await page.locator('main').innerText()).not.toMatch(/PACKAGE_EXPIRED|ALLOWANCE_EXHAUSTED/)
    await shoot(page, testInfo, '08-history-no-package')

    expect(consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e))).toEqual([])
  })
})
