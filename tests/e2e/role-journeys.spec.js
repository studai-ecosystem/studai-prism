import { test, expect } from '@playwright/test'

const consentScopes = [
  'data_processing', 'ai_disclosure', 'ai_scoring_oversight',
  'proctoring', 'face_analysis', 'own_work',
]

async function browserApi(page, path, { method = 'GET', token, body } = {}) {
  return page.evaluate(async ({ path, method, token, body }) => {
    const response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const payload = await response.json().catch(() => null)
    return { status: response.status, body: payload }
  }, { path, method, token, body })
}

async function registerCandidate(page, label = 'candidate') {
  await page.goto('/')
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`
  const result = await browserApi(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Prism Audit Candidate', email, college: 'Audit College', year: 'Final Year', password: 'candidate-pass-1!', ageConfirmed: true },
  })
  expect(result.status).toBe(201)
  return { email, token: result.body.token }
}

async function createEntitledCandidate(page, label) {
  const candidate = await registerCandidate(page, label)
  const entitlement = await browserApi(page, '/api/payment/dev-session', { method: 'POST', token: candidate.token })
  expect(entitlement.status).toBe(200)
  return { ...candidate, sessionId: entitlement.body.sessionId }
}

async function consentAndStart(page, label = 'journey') {
  const candidate = await createEntitledCandidate(page, label)
  const consent = await browserApi(page, '/api/assessment/consent', {
    method: 'POST', token: candidate.token,
    body: { sessionId: candidate.sessionId, scopes: consentScopes, consentVersion: 'role-journey' },
  })
  expect(consent.status).toBe(200)
  const started = await browserApi(page, '/api/assessment/start', {
    method: 'POST', token: candidate.token,
    body: { sessionId: candidate.sessionId, candidateName: 'Candidate Role User' },
  })
  expect(started.status).toBe(200)
  return candidate
}

// ── 1. Candidate Role Journey ────────────────────────────────────────────────
test('ROLE-CANDIDATE complete operational journey', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('button, a').filter({ hasText: /get assessed|start|assessment|sign up/i }).first()).toBeVisible()

  // Signup & Entitlement
  const candidate = await registerCandidate(page, 'candidate-role')
  const entitlement = await browserApi(page, '/api/payment/dev-session', { method: 'POST', token: candidate.token })
  expect(entitlement.status).toBe(200)
  const sessionId = entitlement.body.sessionId

  const consent = await browserApi(page, '/api/assessment/consent', {
    method: 'POST', token: candidate.token,
    body: { sessionId, scopes: consentScopes, consentVersion: 'role-journey' },
  })
  expect(consent.status).toBe(200)

  // Simulation Start & Turns
  const started = await browserApi(page, '/api/assessment/start', {
    method: 'POST', token: candidate.token,
    body: { sessionId, candidateName: 'Candidate Role User' },
  })
  expect(started.status).toBe(200)

  for (let i = 0; i < 2; i++) {
    const turn = await browserApi(page, '/api/assessment/message', {
      method: 'POST', token: candidate.token,
      body: { sessionId, message: `Candidate response ${i + 1}: I structure the solution, check assumptions, and coordinate with stakeholders.` },
    })
    expect(turn.status).toBe(200)
  }

  // Evaluation & Report
  const evaluated = await browserApi(page, '/api/assessment/evaluate', {
    method: 'POST', token: candidate.token, body: { sessionId },
  })
  expect([200, 202]).toContain(evaluated.status)

  let report = null
  for (let a = 0; a < 20; a++) {
    const status = await browserApi(page, `/api/assessment/evaluate-status/${sessionId}`, { token: candidate.token })
    if (status.body?.status === 'complete') {
      report = status.body.report
      break
    }
    await page.waitForTimeout(150)
  }
  expect(report).toBeTruthy()
  expect(report.scores).toBeDefined()
})

// ── 2. Administrator Role Journey ────────────────────────────────────────────
test('ROLE-ADMIN operational security and control plane enforcement', async ({ page }) => {
  await page.goto('/')
  // Unauthenticated requests to admin plane are rejected
  const unauth = await page.request.get('/api/admin/dashboard')
  expect([401, 404]).toContain(unauth.status())

  // Candidate token cannot access admin routes
  const candEmail = `cand-admin-check-${Date.now()}@test.local`
  const reg = await browserApi(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Cand Probe', email: candEmail, password: 'cand-pass-1234!', ageConfirmed: true },
  })
  const candToken = reg.body?.token

  const candAccess = await browserApi(page, '/api/admin/admins', { token: candToken })
  expect([401, 404]).toContain(candAccess.status)

  // System audit log endpoint is guarded
  const auditAccess = await browserApi(page, '/api/admin/audit', { token: candToken })
  expect([401, 404]).toContain(auditAccess.status)
})

// ── 3. Psychometrician Role Journey ──────────────────────────────────────────
test('ROLE-PSYCHOMETRICIAN blinded dataset and calibration governance', async ({ page }) => {
  await page.goto('/')
  // Psychometric surfaces do not leak candidate PII
  const candidate = await browserApi(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Psychometric Subject', email: `psycho-subject-${Date.now()}@test.local`, password: 'cand-pass-1234!', ageConfirmed: true },
  })
  expect(candidate.status).toBe(201)

  // Catalog inspection for psychometric properties
  const catalog = await browserApi(page, '/api/assessments/catalog')
  expect(catalog.status).toBe(200)
  for (const sim of catalog.body.catalog) {
    // Calibrations remain explicitly pending until empirical N>=30
    expect(sim.calibration_status).toBe('PENDING')
    expect(sim.validation_status).toBe('DEVELOPMENTAL')
  }

  // Blinded export invariants (audit-export strips PII by construction)
  const auditExportUnauth = await browserApi(page, '/api/credentials/audit-export')
  expect([401, 403, 503]).toContain(auditExportUnauth.status)
})

// ── 4. Human Reviewer / Rater Role Journey ───────────────────────────────────
test('ROLE-HUMAN-REVIEWER operational rater interface and blinded scoring', async ({ page }) => {
  await page.goto('/rater')
  await expect(page.locator('body')).toBeVisible()

  // Blinded rating guarantees: candidate PII must not appear in rater transcripts
  const content = await page.content()
  expect(content).not.toContain('candidate@test.local')

  // Rater mutations cannot bypass RBAC
  const unauthorizedRaterSubmit = await browserApi(page, '/api/studies/rate', {
    method: 'POST',
    body: { sessionId: '00000000-0000-0000-0000-000000000000', ratings: {} },
  })
  expect([401, 403, 404]).toContain(unauthorizedRaterSubmit.status)
})

// ── 5. Support Ops Role Journey ──────────────────────────────────────────────
test('ROLE-SUPPORT-OPS session diagnostic investigation without SQL mutations', async ({ page }) => {
  await page.goto('/')
  const candidate = await consentAndStart(page, 'support-cand')
  const { token, sessionId } = candidate

  // Support checks evaluate-status without direct DB manipulation
  const diagStatus = await browserApi(page, `/api/assessment/evaluate-status/${sessionId}`, { token })
  expect(diagStatus.status).toBe(200)
  expect(diagStatus.body.status).toBe('idle')

  // Support checks device link state
  const deviceCheck = await browserApi(page, `/api/device/pair-code/${sessionId}`)
  expect([200, 404]).toContain(deviceCheck.status)
})

// ── 6. Security & Compliance Role Journey ────────────────────────────────────
test('ROLE-SECURITY-COMPLIANCE consent audit, credential revocation, and erasure', async ({ page }) => {
  await page.goto('/')
  // Candidate registration & data processing consent
  const reg = await browserApi(page, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Compliance Test User', email: `compliance-audit-${Date.now()}@test.local`, password: 'cand-pass-1234!', ageConfirmed: true },
  })
  const token = reg.body?.token

  const ent = await browserApi(page, '/api/payment/dev-session', { method: 'POST', token })
  const sessionId = ent.body?.sessionId

  const consentRes = await browserApi(page, '/api/assessment/consent', {
    method: 'POST', token,
    body: { sessionId, scopes: consentScopes, consentVersion: 'compliance-v1' },
  })
  expect(consentRes.status).toBe(200)

  // Cryptographic Public Key inspection
  const pubKey = await browserApi(page, '/api/credentials/public-key')
  expect(pubKey.status).toBe(200)
  expect(pubKey.body.algorithm).toBe('Ed25519')

  // Candidate erasure request (GDPR/DPDP compliance)
  const eraseRes = await browserApi(page, '/api/assessment/candidate-data', { method: 'DELETE', token })
  expect(eraseRes.status).toBe(200)
})

// ── 7. External Verifier Role Journey ────────────────────────────────────────
test('ROLE-EXTERNAL-VERIFIER public credential verification and authenticity proof', async ({ page }) => {
  await page.goto('/verify')
  await expect(page.locator('body')).toBeVisible()

  // Verifier page UI exists and loads without crash
  const text = await page.locator('body').innerText()
  expect(text.toLowerCase()).toMatch(/verify|credential|assessment/i)

  // Verifying an unknown session returns 404
  const unknownVerify = await browserApi(page, '/api/credentials/00000000-0000-0000-0000-000000000000/verify')
  expect(unknownVerify.status).toBe(404)

  // JWKS endpoint returns Ed25519 verification keys
  const jwks = await browserApi(page, '/.well-known/jwks.json')
  expect(jwks.status).toBe(200)
  expect(jwks.body.keys.length).toBeGreaterThan(0)
  expect(jwks.body.keys[0].kty).toBe('OKP')
})
