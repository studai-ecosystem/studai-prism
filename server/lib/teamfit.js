// Track 5.2 — team-fit simulation (flag PRISM_TEAMFIT, default OFF).
//
// Composes avatar "behavioral twins" from REAL assessed profiles of an
// existing team — ONLY for members whose sessions carry the explicit
// teamfit_profile_use consent scope (verified at registration; registration
// refuses otherwise).
//
// HARD RESTRAINT (spec 5.2): there is NO team-fit score. No number, no
// ranking, no hire/no-hire signal exists anywhere in this module's output —
// there is no validation basis for one, and a single fabricated number here
// would poison the glass-box position. Output = qualitative observations,
// each anchored to a transcript quote, plus an unconditional disclaimer.

import { getConsent, getReport } from './store.js'

export function isTeamfitEnabled() {
  return process.env.PRISM_TEAMFIT === 'true'
}

// The explicit, OPTIONAL consent scope a team member must have granted on
// their own session before their profile may seed a twin. It is NOT in
// REQUIRED_CONSENT_SCOPES — taking the assessment never implies this.
export const TEAMFIT_CONSENT_SCOPE = 'teamfit_profile_use'

// Verify every member has granted the scope. Returns { ok, missing: [...] }.
// getConsentFn is injectable for tests.
export async function verifyTeamConsent(memberSessionIds, getConsentFn = getConsent) {
  const missing = []
  for (const sid of memberSessionIds) {
    const consent = await getConsentFn(sid).catch(() => null)
    if (!consent || !Array.isArray(consent.scopes) || !consent.scopes.includes(TEAMFIT_CONSENT_SCOPE)) {
      missing.push(sid)
    }
  }
  return { ok: missing.length === 0, missing }
}

// ── qualitative persona composition ──────────────────────────────────────────
// Maps a member's report to BEHAVIORAL DESCRIPTORS — bands of tendency, never
// numbers. The twin prompt receives only these strings.
const TRAIT_BANDS = {
  criticalThinking: [
    [75, 'questions assumptions quickly and asks for evidence before agreeing'],
    [55, 'reasons carefully when prompted, but rarely challenges first'],
    [0, 'tends to accept framings as given and focus on execution'],
  ],
  communication: [
    [75, 'speaks in short, structured points and summarises decisions'],
    [55, 'communicates adequately but can be vague under pressure'],
    [0, 'often terse or meandering; others must ask follow-ups'],
  ],
  collaboration: [
    [75, 'actively acknowledges others\u2019 views and builds on them'],
    [55, 'cooperates when aligned, disengages in disagreement'],
    [0, 'pushes their own line and rarely references teammates\u2019 input'],
  ],
  problemSolving: [
    [75, 'offers multiple options with explicit trade-offs'],
    [55, 'proposes one workable plan and sticks with it'],
    [0, 'waits for direction rather than proposing approaches'],
  ],
  aiDigitalFluency: [
    [75, 'reaches for data or tooling naturally and questions its reliability'],
    [55, 'uses tools when suggested'],
    [0, 'prefers manual, familiar methods'],
  ],
}

export function personaFromReport(report, alias) {
  const scores = report?.scores || {}
  const traits = []
  for (const [dim, bands] of Object.entries(TRAIT_BANDS)) {
    const v = Number(scores[dim])
    if (!Number.isFinite(v)) continue
    const band = bands.find(([min]) => v >= min)
    if (band) traits.push(band[1])
  }
  // Descriptors only — the persona string must carry NO score, and the alias
  // must carry no identity (twins are anonymous by construction).
  return {
    name: alias,
    role: 'Team member (behavioral twin from a consented profile)',
    personality: traits.join('; ') || 'balanced, professional collaborator',
  }
}

// ── output discipline ────────────────────────────────────────────────────────
// Keys that would smuggle a fit verdict — banned in team-fit output at any
// depth (schema check + this defensive strip).
export const FORBIDDEN_FIT_KEYS = /score|rating|rank|percent|fit(Index|Score|Level)|match(Score|Percent)|hire|recommend/i

export function sanitizeObservations(raw) {
  const observations = []
  for (const o of Array.isArray(raw?.observations) ? raw.observations : []) {
    const pattern = typeof o?.pattern === 'string' ? o.pattern.slice(0, 500) : null
    const evidence = typeof o?.transcriptEvidence === 'string' ? o.transcriptEvidence.slice(0, 500) : null
    const skillContext = typeof o?.skillContext === 'string' ? o.skillContext.slice(0, 200) : null
    if (pattern && evidence) observations.push({ pattern, transcriptEvidence: evidence, skillContext })
  }
  return {
    observations,
    disclaimer:
      'Qualitative observations with transcript evidence only. Prism produces no team-fit score, no ranking, and no hire/no-hire signal — no validation basis exists for such a claim.',
  }
}

// Structural guard used by tests AND the route: throws if any key at any
// depth smells like a fit verdict or any observation field is numeric.
export function assertNoNumericFit(obj, path = '') {
  if (!obj || typeof obj !== 'object') return
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_FIT_KEYS.test(k)) throw new Error(`team-fit output carries forbidden key at ${path}${k}`)
    if (typeof v === 'number') throw new Error(`team-fit output carries a numeric value at ${path}${k}`)
    if (v && typeof v === 'object') assertNoNumericFit(v, `${path}${k}.`)
  }
}

// Fetch member reports and compose the twin panel (max 2 twins speak; a third
// member becomes the mostly-silent observer, mirroring scenario structure).
export async function composeTwins(memberSessionIds, getReportFn = getReport) {
  const twins = []
  const aliases = ['Twin A', 'Twin B', 'Twin C']
  for (let i = 0; i < Math.min(memberSessionIds.length, 3); i++) {
    const report = await getReportFn(memberSessionIds[i]).catch(() => null)
    if (!report) continue
    twins.push(personaFromReport(report, aliases[twins.length]))
  }
  return twins
}
