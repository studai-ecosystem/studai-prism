#!/usr/bin/env node
// PROD-READY Phase 7 (P78) — post-deploy smoke battery.
//
// Codifies the read-only part of the §21 post-deploy battery that was run by
// hand for the 2026-08-05 release (RELEASE_RECORDS.md, FINAL_REPORT §H) and
// extends it for this release line: /api/ready, the bundle served, every
// campus / V3 flag still dark (unauthenticated requests to its routes answer
// 404), the owner-only legacy report and erasure guards, and — with a
// read-only admin token — the live state of every registered flag, the dark
// job-queue view and the dark accommodation-request plane.
//
// Safe against production by construction:
//   * GET only, except ONE guard probe: an unauthenticated DELETE of a freshly
//     generated random UUID on the legacy erasure route. No session can have
//     that id, the owner guard answers 404 before anything runs, and the probe
//     can be switched off with --no-guard-probes.
//   * No credentials are sent except the optional admin token, read from the
//     environment (PRISM_SMOKE_ADMIN_TOKEN, never argv / shell history) and
//     sent only on the GET /api/admin/* checks.
//   * https only, except loopback hosts (local rehearsal and tests).
//   * Nothing is created: no account, no session, no invite.
//
// Usage:
//   node scripts/post-deploy-smoke.mjs --base-url https://prism.studai.one --dry-run
//   node scripts/post-deploy-smoke.mjs --base-url https://prism.studai.one \
//     [--expect-bundle index-XXXX.js] [--no-guard-probes] [--timeout-ms 10000]
//     [--allow-on PRISM_X[,PRISM_Y]]   (only flags a human flipped with recorded
//                                      evidence, e.g. HA-021; named in the release record)
//   PRISM_SMOKE_ADMIN_TOKEN=<console access token> node scripts/post-deploy-smoke.mjs ...
// Exit code 0 only when no check FAILs. UNVERIFIED (no admin token, flag not
// yet in the registry) is reported, never counted as PASS.
import { randomUUID, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Every flag that must still be OFF after this release (registered OFF in
// server/lib/flagRegistry.js). The release flips nothing (charter law 1).
export const EXPECTED_DARK_FLAGS = Object.freeze([
  'PRISM_V2_EXECUTIVE', 'PRISM_V2_DUAL_SCORER', 'PRISM_V2_EQUATING', 'PRISM_V2_EARLY_STOP',
  'PRISM_PRESSURE', 'PRISM_STANDARDIZED_CORE', 'PRISM_IDENTITY_L3', 'PRISM_UNDER18_PATH',
  'PRISM_PROCTOR_PHONE_CAM', 'PRISM_PROCTOR_GAZE', 'PRISM_DEMOGRAPHICS', 'PRISM_RETENTION_ENFORCEMENT',
  'PRISM_LANG', 'PRISM_VELOCITY', 'PRISM_REPLAY', 'PRISM_TEAMFIT',
  'PRISM_ADMIN_PROMPT_REGISTRY', 'PRISM_DUMMY_PAYMENTS', 'PRISM_DRIFT_HARD', 'PRISM_STUDY_STEERING_AB',
  'PRISM_APP_SHELL_V3', 'PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_STUDENT_REPORT_V3', 'PRISM_ASSESSMENT_WORKSPACE_V3',
  'PRISM_CAMPUS_ENABLED', 'PRISM_CAMPUS_ANALYTICS', 'PRISM_DEVELOPMENT_V2', 'PRISM_GROWTH_ENABLED',
  'PRISM_ROLE_EXPLORATION_V2', 'PRISM_PREPARATION_V1', 'PRISM_V3_SUPPORT_ROUTES', 'PRISM_JOB_WORKER',
  'PRISM_ANALYTICS_DECISION_CACHE', 'PRISM_V3_RATING_QUEUE',
])

// Must be ON in production for this image to have started at all (DEF-07).
export const EXPECTED_ON_FLAGS = Object.freeze(['PRISM_PG_STORE'])

// Operational switches whose production value is an existing operator setting
// this release does not change (telemetry, credential signing, the admin
// console itself, the CMS source, neural voices, the trial verification
// bypass). The battery reports nothing about them; a test fails if a newly
// registered flag is in none of the three lists, so every flag is classified.
export const OPERATIONAL_FLAGS_NOT_ASSERTED = Object.freeze([
  'PRISM_V2_TELEMETRY', 'PRISM_GLASS_BOX', 'PRISM_ADMIN_CONSOLE', 'PRISM_CMS_DB',
  'PRISM_TTS_NEURAL', 'PRISM_SKIP_VERIFICATION',
])

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const token = () => randomBytes(24).toString('base64url')

// A check: { id, title, kind: public|dark|guard|admin, method, path, expect,
// flags: dark flags it demonstrates, enableWith: the env flags that make the
// route live (used by the tests to prove the check discriminates) }.
export function buildChecks({ id = randomUUID } = {}) {
  const dark = (checkId, title, path, flags, enableWith = flags) => ({
    id: checkId, title, kind: 'dark', method: 'GET', path, flags, enableWith, expect: { status: 404 },
  })
  return [
    { id: 'health', title: 'Liveness /api/health', kind: 'public', method: 'GET', path: '/api/health', expect: { status: 200, json: (b) => b?.status === 'ok' || 'status is not ok' } },
    { id: 'ready', title: 'Readiness /api/ready (database reachable)', kind: 'public', method: 'GET', path: '/api/ready', expect: { status: 200, ready: true } },
    { id: 'spa', title: 'SPA shell served with its bundle', kind: 'public', method: 'GET', path: '/', expect: { status: 200, html: true } },
    { id: 'v1-health', title: '/api/v1/health', kind: 'public', method: 'GET', path: '/api/v1/health', expect: { status: 200 } },

    dark('shell-v3', 'App shell V3 student routes dark', '/api/v1/me/home', ['PRISM_APP_SHELL_V3']),
    dark('workspace-v3', 'Assessment workspace V3 dark', `/api/v1/assessment-sessions/${id()}`, ['PRISM_ASSESSMENT_WORKSPACE_V3'], ['PRISM_APP_SHELL_V3', 'PRISM_ASSESSMENT_WORKSPACE_V3']),
    dark('report-v3', 'Student report V3 share route dark', `/api/v1/shared/${token()}`, ['PRISM_STUDENT_REPORT_V3'], ['PRISM_APP_SHELL_V3', 'PRISM_STUDENT_REPORT_V3']),
    dark('campus-org', 'Campus organization routes dark', `/api/v1/organizations/${id()}`, ['PRISM_CAMPUS_ENABLED']),
    dark('campus-invite', 'Campus invite redemption dark', `/api/v1/org-invites/${token()}`, ['PRISM_CAMPUS_ENABLED']),
    dark('campus-analytics', 'Campus analytics dark', `/api/v1/organizations/${id()}/analytics/capabilities`, ['PRISM_CAMPUS_ANALYTICS'], ['PRISM_CAMPUS_ENABLED', 'PRISM_CAMPUS_ANALYTICS']),
    dark('campus-growth', 'Reassessment and growth dark', `/api/v1/organizations/${id()}/reassessments`, ['PRISM_GROWTH_ENABLED'], ['PRISM_CAMPUS_ENABLED', 'PRISM_GROWTH_ENABLED']),
    dark('development-v2', 'Development V2 missions dark', '/api/v1/missions', ['PRISM_DEVELOPMENT_V2'], ['PRISM_APP_SHELL_V3', 'PRISM_DEVELOPMENT_V2']),
    dark('preparation-v1', 'Private preparation dark', '/api/v1/preparation', ['PRISM_PREPARATION_V1'], ['PRISM_APP_SHELL_V3', 'PRISM_PREPARATION_V1']),
    dark('support-human-review', 'V3 human review route dark (Phase 4)', `/api/v1/assessment-sessions/${id()}/human-review`, ['PRISM_V3_SUPPORT_ROUTES'], ['PRISM_APP_SHELL_V3', 'PRISM_V3_SUPPORT_ROUTES']),
    dark('support-identity-check', 'V3 identity check route dark (Phase 4)', `/api/v1/assessment-sessions/${id()}/identity-check`, ['PRISM_V3_SUPPORT_ROUTES'], ['PRISM_APP_SHELL_V3', 'PRISM_V3_SUPPORT_ROUTES']),
    dark('support-accommodation', 'V3 pre-start accommodation route dark (Phase 4)', `/api/v1/assessment-assignments/${id()}/accommodation`, ['PRISM_V3_SUPPORT_ROUTES'], ['PRISM_APP_SHELL_V3', 'PRISM_V3_SUPPORT_ROUTES']),
    dark('support-requests', 'V3 support request list dark (Phase 4)', '/api/v1/me/support-requests', ['PRISM_V3_SUPPORT_ROUTES'], ['PRISM_APP_SHELL_V3', 'PRISM_V3_SUPPORT_ROUTES']),
    dark('rating-queue', 'Evidence rating queue dark', '/api/validation/rater/next', ['PRISM_V3_RATING_QUEUE']),

    { id: 'legacy-report-owner-only', title: 'Legacy report is owner-only (K103): unknown id signed out → 404', kind: 'guard', method: 'GET', path: `/api/assessment/report/${id()}`, expect: { status: 404 } },
    { id: 'legacy-erasure-guard', title: 'Legacy erasure needs the signed-in owner (Phase 1S N1): random id signed out → 404', kind: 'guard', method: 'DELETE', probe: true, path: `/api/assessment/data/${id()}`, expect: { status: 404 } },

    { id: 'admin-flags', title: 'Live flag states (admin, read-only): every dark flag off, PRISM_PG_STORE on', kind: 'admin', method: 'GET', path: '/api/admin/flags', expect: { status: 200, flags: true } },
    { id: 'admin-job-queue', title: 'Job-queue admin view dark (PRISM_JOB_WORKER off)', kind: 'admin', method: 'GET', path: '/api/admin/job-queue', flags: ['PRISM_JOB_WORKER'], enableWith: ['PRISM_JOB_WORKER'], expect: { status: 404 } },
    { id: 'admin-accommodation-requests', title: 'Accommodation-request admin plane dark (PRISM_V3_SUPPORT_ROUTES off)', kind: 'admin', method: 'GET', path: '/api/admin/accommodation-requests', flags: ['PRISM_V3_SUPPORT_ROUTES'], enableWith: ['PRISM_V3_SUPPORT_ROUTES'], expect: { status: 404 } },
  ]
}

export function assertSafeCheck(check) {
  if (check.method === 'GET') return
  // The only non-GET request allowed: an unauthenticated guard probe.
  if (check.kind === 'guard' && check.probe === true && check.method === 'DELETE') return
  throw new Error(`SMOKE_UNSAFE_CHECK:${check.id}:${check.method}`)
}

export function assertSafeBaseUrl(baseUrl) {
  let url
  try { url = new URL(baseUrl) } catch { throw new Error('SMOKE_BAD_BASE_URL') }
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) return url
  throw new Error('SMOKE_HTTPS_REQUIRED')
}

export function planSmoke({ baseUrl, includeGuardProbes = true, adminToken = '' } = {}) {
  const base = assertSafeBaseUrl(baseUrl)
  return buildChecks().map((check) => {
    assertSafeCheck(check)
    const skipped = (check.kind === 'admin' && !adminToken) ? 'no admin token (PRISM_SMOKE_ADMIN_TOKEN)'
      : (check.probe && !includeGuardProbes) ? '--no-guard-probes' : null
    return { id: check.id, kind: check.kind, method: check.method, url: new URL(check.path, base).href, expect: check.expect.status, flags: check.flags || [], skipped }
  })
}

async function request(fetchImpl, url, { method, headers, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { method, headers, redirect: 'manual', signal: controller.signal })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* html or empty */ }
    return { status: res.status, contentType: res.headers.get('content-type') || '', text, json }
  } finally {
    clearTimeout(timer)
  }
}

function evaluateFlags(json, allowOn = []) {
  const rows = Array.isArray(json?.flags) ? json.flags : null
  if (!rows) return { status: 'FAIL', detail: 'response has no flags list' }
  const live = new Map(rows.map((r) => [r.flag_key, r.liveState]))
  const on = EXPECTED_DARK_FLAGS.filter((k) => live.get(k) === 'on' && !allowOn.includes(k))
  const missing = EXPECTED_DARK_FLAGS.filter((k) => !live.has(k))
  const notOn = EXPECTED_ON_FLAGS.filter((k) => live.get(k) !== 'on')
  if (on.length || notOn.length) {
    return { status: 'FAIL', detail: [on.length ? `unexpectedly ON: ${on.join(', ')}` : null, notOn.length ? `expected ON: ${notOn.join(', ')}` : null].filter(Boolean).join('; ') }
  }
  if (missing.length) return { status: 'UNVERIFIED', detail: `not in the flag registry yet: ${missing.join(', ')}` }
  const allowed = allowOn.filter((k) => live.get(k) === 'on')
  return { status: 'PASS', detail: `${EXPECTED_DARK_FLAGS.length - allowed.length} flags off, ${EXPECTED_ON_FLAGS.join(', ')} on${allowed.length ? `; on by a recorded human decision: ${allowed.join(', ')}` : ''}` }
}

export async function runSmoke({
  baseUrl,
  fetchImpl = globalThis.fetch,
  adminToken = '',
  expectDatabase = true,
  expectBundle = null,
  includeGuardProbes = true,
  timeoutMs = 10000,
  only = null,
  allowOn = [],
} = {}) {
  for (const k of allowOn) if (!EXPECTED_DARK_FLAGS.includes(k)) throw new Error(`SMOKE_UNKNOWN_FLAG:${k}`)
  const base = assertSafeBaseUrl(baseUrl)
  const results = []
  for (const check of buildChecks()) {
    if (only && !only.includes(check.id)) continue
    assertSafeCheck(check)
    const out = { id: check.id, title: check.title, kind: check.kind, method: check.method, path: check.path }
    if (check.kind === 'admin' && !adminToken) { results.push({ ...out, status: 'UNVERIFIED', detail: 'no admin token (set PRISM_SMOKE_ADMIN_TOKEN to verify)' }); continue }
    if (check.probe && !includeGuardProbes) { results.push({ ...out, status: 'SKIP', detail: '--no-guard-probes' }); continue }
    const headers = { Accept: check.id === 'spa' ? 'text/html' : 'application/json' }
    if (check.kind === 'admin') headers.Authorization = `Bearer ${adminToken}`
    let res
    try {
      res = await request(fetchImpl, new URL(check.path, base).href, { method: check.method, headers, timeoutMs })
    } catch (err) {
      results.push({ ...out, status: 'FAIL', detail: `request failed: ${err?.name === 'AbortError' ? 'timeout' : (err?.code || err?.message || 'error')}` })
      continue
    }
    const r = { ...out, httpStatus: res.status }
    if (res.status !== check.expect.status) {
      results.push({ ...r, status: 'FAIL', detail: `expected HTTP ${check.expect.status}, got ${res.status}` })
      continue
    }
    if (check.expect.json) {
      const verdict = check.expect.json(res.json)
      if (verdict !== true) { results.push({ ...r, status: 'FAIL', detail: String(verdict) }); continue }
    }
    if (check.expect.ready) {
      const db = res.json?.checks?.database
      if (res.json?.status !== 'ready') { results.push({ ...r, status: 'FAIL', detail: `status ${res.json?.status}` }); continue }
      if (expectDatabase && db !== 'ok') { results.push({ ...r, status: 'FAIL', detail: `database check is ${db}; production must report ok` }); continue }
      results.push({ ...r, status: 'PASS', detail: `database: ${db}` })
      continue
    }
    if (check.expect.html) {
      const bundle = (res.text.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/) || [])[1] || null
      if (!/text\/html/i.test(res.contentType) || !bundle) { results.push({ ...r, status: 'FAIL', detail: 'no HTML shell with an index-*.js bundle' }); continue }
      if (expectBundle && bundle !== expectBundle) { results.push({ ...r, status: 'FAIL', detail: `bundle ${bundle}, expected ${expectBundle}` }); continue }
      results.push({ ...r, status: 'PASS', detail: `bundle ${bundle}`, bundle })
      continue
    }
    if (check.expect.flags) { results.push({ ...r, ...evaluateFlags(res.json, allowOn) }); continue }
    results.push({ ...r, status: 'PASS' })
  }
  const count = (s) => results.filter((x) => x.status === s).length
  return {
    validator: 'PRISM_POST_DEPLOY_SMOKE',
    baseUrl: base.origin,
    ok: count('FAIL') === 0,
    summary: { PASS: count('PASS'), FAIL: count('FAIL'), UNVERIFIED: count('UNVERIFIED'), SKIP: count('SKIP') },
    results,
  }
}

export function parseArgs(argv) {
  const opts = { baseUrl: null, dryRun: false, includeGuardProbes: true, expectBundle: null, timeoutMs: 10000, allowOn: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--base-url') opts.baseUrl = argv[++i]
    else if (a === '--dry-run' || a === '--print') opts.dryRun = true
    else if (a === '--no-guard-probes') opts.includeGuardProbes = false
    else if (a === '--expect-bundle') opts.expectBundle = argv[++i]
    else if (a === '--timeout-ms') opts.timeoutMs = Number(argv[++i])
    else if (a === '--allow-on') opts.allowOn.push(...String(argv[++i] || '').split(',').map((k) => k.trim()).filter(Boolean))
    else throw new Error(`SMOKE_UNKNOWN_ARGUMENT:${a}`)
  }
  if (!opts.baseUrl) throw new Error('SMOKE_BASE_URL_REQUIRED (--base-url https://...)')
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 1000) throw new Error('SMOKE_BAD_TIMEOUT')
  return opts
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    const adminToken = process.env.PRISM_SMOKE_ADMIN_TOKEN || ''
    if (opts.dryRun) {
      console.log(JSON.stringify({ validator: 'PRISM_POST_DEPLOY_SMOKE', dryRun: true, checks: planSmoke({ ...opts, adminToken }) }, null, 2))
    } else {
      const report = await runSmoke({ ...opts, adminToken })
      console.log(JSON.stringify(report, null, 2))
      if (!report.ok) process.exitCode = 1
    }
  } catch (err) {
    console.error(JSON.stringify({ validator: 'PRISM_POST_DEPLOY_SMOKE', error: String(err?.message || err) }))
    process.exitCode = 2
  }
}
