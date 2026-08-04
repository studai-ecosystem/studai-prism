// Charter MASTER-2026-08-04 Phase 2 — trust & reporting regression suite.
//
//   §2  pilot positioning: notice + not-sole-basis policy on marketing, report,
//       verification and email surfaces;
//   §3  job-family scope: governed doc exists and the shared-constant mapping
//       covers exactly the frozen scenario bank;
//   §6  composite removal: profile-first issuance, every serving boundary
//       strips the internal composite, ordinary admin views carry none,
//       legacy artifacts render byte-identical as issued;
//   §7.1 Collaborative Behaviour label + public definition;
//   §7.2 Insufficient evidence is a first-class result end to end;
//   §7.4 the mailer carries no composite and no banned wording.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  DIMENSION_PUBLIC_DEFINITIONS,
  INSUFFICIENT_EVIDENCE_LABEL,
  PILOT_NOTICE,
  NOT_SOLE_BASIS_POLICY,
  JOB_FAMILY_SCOPE,
} from '../lib/sharedConstants.js'
import {
  REPORT_POLICY_VERSION,
  compositeOf,
  isProfileFirstReport,
  computeInternalComposite,
  finalizeReportForIssuance,
  toExternalReport,
  toOperationalReport,
} from '../lib/reportPolicy.js'
import { buildBundleScores } from '../lib/credentials.js'
import { sanitizeCorrectionScores } from '../lib/adminProduct.js'
import { thetaFromReport } from '../lib/velocity.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const read = (rel) => readFile(join(ROOT, rel), 'utf-8')

// A freshly aggregated report the way runEvaluation builds one (pre-policy).
function freshReport() {
  return {
    scores: { criticalThinking: 80, communication: 60, collaboration: 70, problemSolving: 50, aiDigitalFluency: 90, overall: 68 },
    feedback: {}, evidence: {}, highlights: [], growthAreas: [],
    reliability: { label: 'high', agreement: 0.9 },
    percentile: 62,
  }
}

// A LEGACY report exactly as stored before the charter (frozen blob shape).
function legacyReport() {
  return {
    sessionId: 'legacy-1',
    scores: { criticalThinking: 80, communication: 60, collaboration: 70, problemSolving: 50, aiDigitalFluency: 90, overall: 68 },
    percentile: 40,
    reliability: { label: 'moderate' },
    issuedAt: '2026-07-01T00:00:00.000Z',
  }
}

const NO_INSUFFICIENCY = { insufficient: [], perDimension: {}, policyVersion: 'anchor-probes-v1' }

// ── §6 profile-first issuance ────────────────────────────────────────────────

test('§6: a newly issued report carries NO scores.overall — the composite moves to the internal research namespace', () => {
  const report = finalizeReportForIssuance(freshReport(), NO_INSUFFICIENCY)
  assert.ok(!('overall' in report.scores), 'scores.overall is gone')
  assert.ok(!('percentile' in report), 'composite-derived percentile is gone from the external body')
  assert.ok(!('confidenceInterval' in report), 'composite-level CI is internal')
  assert.equal(report.composite.value, 68, 'the composite is still computed internally (research/calibration)')
  assert.equal(report.composite.access, 'research')
  assert.equal(report.reportPolicy, REPORT_POLICY_VERSION)
  assert.equal(compositeOf(report), 68)
  assert.ok(isProfileFirstReport(report))
})

test('§6: the external serving boundary strips the internal composite from profile-first reports', () => {
  const report = finalizeReportForIssuance(freshReport(), NO_INSUFFICIENCY)
  const external = toExternalReport(report)
  assert.ok(!('composite' in external), 'no composite namespace externally')
  assert.ok(!('overall' in (external.scores || {})))
  assert.equal(JSON.stringify(external).includes('"overall"'), false, 'no overall key anywhere in the external body')
  // The per-dimension profile survives intact.
  for (const dim of DIMENSION_KEYS) assert.equal(external.scores[dim], report.scores[dim])
})

test('§6 LEGACY IMMUTABILITY: an as-issued legacy report passes the external boundary byte-identical', () => {
  const legacy = legacyReport()
  const external = toExternalReport(legacy)
  assert.deepEqual(external, legacy, 'legacy artifacts render exactly as originally issued')
  assert.equal(external.scores.overall, 68, 'the legacy composite stays visible — history is never rewritten')
})

test('§6: ordinary operational-admin serving strips the composite from EVERY report shape', () => {
  const opsNew = toOperationalReport(finalizeReportForIssuance(freshReport(), NO_INSUFFICIENCY))
  assert.ok(!('composite' in opsNew))
  const opsLegacy = toOperationalReport(legacyReport())
  assert.ok(!('overall' in opsLegacy.scores), 'legacy composite hidden in live admin views too')
  assert.ok(!('percentile' in opsLegacy))
  for (const dim of DIMENSION_KEYS) assert.equal(opsLegacy.scores[dim], legacyReport().scores[dim], 'per-dimension scores remain for administration')
})

test('§6: every candidate/buyer report route serves through the external boundary', async () => {
  const source = await read('server/routes/assessment.js')
  for (const marker of [
    'if (existing) return res.json(toExternalReport(existing))',
    'if (outcome.saved) return res.json(toExternalReport(outcome.saved))',
    "if (report) return res.json({ status: 'complete', report: toExternalReport(report) })",
  ]) {
    assert.ok(source.includes(marker), `serving boundary present: ${marker.slice(0, 50)}…`)
  }
  // GET /report/:sessionId
  assert.match(source, /report\/:sessionId'[\s\S]{0,400}?res\.json\(toExternalReport\(report\)\)/, '/report/:sessionId serves the external shape')
})

test('§6: ordinary admin routes reference no composite', async () => {
  for (const rel of ['server/routes/admin/invites.js', 'server/routes/admin/sessions.js', 'server/routes/admin/users.js', 'server/routes/admin/disputes.js']) {
    const stripped = (await read(rel)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.ok(!/scores\?\.overall|scores\.overall/.test(stripped), `${rel} exposes no composite`)
  }
  const stores = await Promise.all([read('server/lib/storeJson.js'), read('server/lib/storePg.js')])
  for (const s of stores) {
    assert.ok(!/minOverall|maxOverall/.test(s), 'composite-range filtering removed from report listings')
  }
})

test('§6: the pilot incident file is the audited research surface for the composite', async () => {
  const source = await read('server/routes/pilot.js')
  assert.ok(source.includes("auditLog('composite_accessed'"), 'research access to the composite writes an audit row')
  assert.ok(source.includes('compositeOf(report)'), 'the research surface reads both report shapes')
})

test('§6: new credential bundles are profile-first (v2) — no composite, no derivation arithmetic', () => {
  const newShape = finalizeReportForIssuance(freshReport(), { ...NO_INSUFFICIENCY, insufficient: ['aiDigitalFluency'] })
  const scores = buildBundleScores(newShape)
  assert.ok(!('overall' in scores))
  assert.ok(!('arithmetic' in scores))
  assert.ok(!('weights' in scores))
  assert.deepEqual(scores.insufficientEvidence, ['aiDigitalFluency'])
  assert.equal(scores.dimensions.aiDigitalFluency, null, 'an unscored dimension is null, never fabricated')
  assert.equal(scores.dimensions.criticalThinking, 80)
  // Even a legacy report credentialled TODAY gets a composite-free v2 bundle.
  const legacyScores = buildBundleScores(legacyReport())
  assert.ok(!('overall' in legacyScores))
})

test('§6: the v2 bundle schema doc exists and the v1 schema doc is untouched', async () => {
  await access(join(ROOT, 'docs', 'evidence-bundle-schema-v2.json'))
  const v2 = JSON.parse(await read('docs/evidence-bundle-schema-v2.json'))
  assert.equal(v2.properties.schema.const, 'evidence-bundle-v2')
  assert.ok(!('overall' in (v2.properties.scores.properties || {})), 'v2 scores block has no overall')
  const v1 = JSON.parse(await read('docs/evidence-bundle-schema-v1.json'))
  assert.equal(v1.properties.schema.const, 'evidence-bundle-v1', 'the frozen v1 schema still verifies legacy credentials')
})

test('§6: growth-theta extraction reads the internal composite for profile-first reports', () => {
  const report = finalizeReportForIssuance(freshReport(), NO_INSUFFICIENCY)
  const theta = thetaFromReport(report)
  assert.ok(theta, 'profile-first reports still produce a timeline measurement point')
  assert.equal(theta.overall.theta, +(68 / 25).toFixed(3))
})

// ── §7.2 insufficient evidence end to end ────────────────────────────────────

test('§7.2: an insufficient dimension is null in the issued report and the internal composite renormalizes', () => {
  const report = finalizeReportForIssuance(freshReport(), { ...NO_INSUFFICIENCY, insufficient: ['aiDigitalFluency'] })
  assert.equal(report.scores.aiDigitalFluency, null, 'no fabricated number')
  assert.deepEqual(report.insufficientEvidence, ['aiDigitalFluency'])
  const expected = computeInternalComposite({ criticalThinking: 80, communication: 60, collaboration: 70, problemSolving: 50 })
  assert.equal(report.composite.value, expected.value)
  assert.equal(report.composite.weightsRenormalized, true)
  assert.deepEqual(report.composite.basis, DIMENSION_KEYS.filter((k) => k !== 'aiDigitalFluency'))
})

test('§7.2: computeInternalComposite never invents a value without scored dimensions', () => {
  assert.equal(computeInternalComposite({}).value, null)
  assert.deepEqual(computeInternalComposite({}).basis, [])
})

test('§7.2: a supersession can never give a number to an Insufficient-evidence dimension', () => {
  const input = { criticalThinking: 70, communication: 60, collaboration: 65, problemSolving: 60, aiDigitalFluency: 55 }
  assert.throws(
    () => sanitizeCorrectionScores(input, { nullDimensions: ['aiDigitalFluency'] }),
    /Insufficient evidence/,
    'scoring an unscored dimension is fabrication',
  )
  const clean = sanitizeCorrectionScores({ ...input, aiDigitalFluency: null }, { nullDimensions: ['aiDigitalFluency'] })
  assert.equal(clean.aiDigitalFluency, null)
  const expected = computeInternalComposite({ criticalThinking: 70, communication: 60, collaboration: 65, problemSolving: 60 })
  assert.equal(clean.overall, expected.value, 'the internal recompute renormalizes over the scored dimensions')
})

test('§7.2: the candidate report and verify pages render Insufficient evidence as a first-class result', async () => {
  for (const rel of ['src/pages/ScoreReport.jsx', 'src/pages/Verify.jsx']) {
    const source = await read(rel)
    assert.ok(source.includes('INSUFFICIENT_EVIDENCE_LABEL'), `${rel} renders the governed label`)
    assert.ok(source.includes('hasComposite'), `${rel} gates every composite element on the report shape`)
  }
  assert.equal(INSUFFICIENT_EVIDENCE_LABEL, 'Insufficient evidence')
})

// ── §7.1 construct label ─────────────────────────────────────────────────────

test('§7.1: the public label is Collaborative Behaviour with the charter definition, governed in sharedConstants', () => {
  assert.equal(DIMENSION_LABELS.collaboration, 'Collaborative Behaviour')
  assert.equal(
    DIMENSION_PUBLIC_DEFINITIONS.collaboration,
    'Behaviour demonstrated while responding to other participants in a simulated workplace interaction.',
  )
  for (const dim of DIMENSION_KEYS) {
    assert.ok(DIMENSION_PUBLIC_DEFINITIONS[dim], `${dim} has a public construct definition (§17)`)
  }
})

test('§7.1: no public page hardcodes the retired label', async () => {
  // The dimension label must come from sharedConstants (or match it) — the old
  // bare label may not reappear as a rendered dimension name on public pages.
  for (const rel of ['src/pages/ScoreReport.jsx', 'src/pages/Verify.jsx', 'src/pages/research/ScienceBehindPrism.jsx']) {
    const source = await read(rel)
    assert.ok(!/label:\s*'Collaboration'|name:\s*'Collaboration'/.test(source), `${rel} does not hardcode the retired 'Collaboration' label`)
  }
})

// ── §7.4 mailer ──────────────────────────────────────────────────────────────

test('§7.4/§6: report emails carry no composite, no certification claims, and the §2 notices', async () => {
  const stripped = (await read('server/lib/mailer.js')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!/certif/i.test(stripped), 'no certification family wording in any email')
  assert.ok(!/\/100|overall/i.test(stripped), 'no composite in any email template')
  assert.ok(stripped.includes('PILOT_NOTICE') && stripped.includes('NOT_SOLE_BASIS_POLICY'), 'both §2 notices ride every report email')
  const route = await read('server/routes/assessment.js')
  assert.ok(!/meta:\s*\{[^}]*overall/s.test(route), 'the send-report route passes no composite to the mailer')
})

// ── §2 pilot positioning ─────────────────────────────────────────────────────

test('§2: the pilot notice and not-sole-basis policy are governed strings on every required surface', async () => {
  assert.match(PILOT_NOTICE, /pilot/i)
  assert.match(PILOT_NOTICE, /not automated rejection/i)
  assert.match(NOT_SOLE_BASIS_POLICY, /sole basis for an adverse educational or employment decision/i)
  for (const rel of ['src/components/Footer.jsx', 'src/pages/ScoreReport.jsx', 'src/pages/Verify.jsx']) {
    const source = await read(rel)
    assert.ok(source.includes('PILOT_NOTICE'), `${rel} renders the pilot notice`)
    assert.ok(source.includes('NOT_SOLE_BASIS_POLICY'), `${rel} renders the not-sole-basis policy`)
  }
})

// ── §3 job-family scope ──────────────────────────────────────────────────────

test('§3: the versioned scope document exists and matches the governed constant', async () => {
  const doc = await read(JOB_FAMILY_SCOPE.document)
  assert.ok(doc.includes(JOB_FAMILY_SCOPE.version), 'doc carries the version id')
  assert.ok(doc.includes('must not be used as the sole basis'), 'doc carries the §2 policy')
  assert.ok(doc.includes('provisional pending factor evidence'), 'doc marks the CT/PS distinction provisional (§7.3)')
  for (const family of Object.values(JOB_FAMILY_SCOPE.families)) {
    assert.ok(doc.includes(family), `doc names family ${family}`)
  }
})

test('§3: the governed mapping covers exactly the frozen active scenario bank', async () => {
  const { SCENARIOS } = await import('../routes/assessment.js')
  const activeIds = SCENARIOS.filter((s) => !s.retired).map((s) => s.id).sort()
  assert.deepEqual(Object.keys(JOB_FAMILY_SCOPE.scenarios).sort(), activeIds, 'every active scenario is scoped; nothing beyond the bank')
  for (const [id, entry] of Object.entries(JOB_FAMILY_SCOPE.scenarios)) {
    assert.ok(entry.families.length >= 1, `${id} maps to at least one family`)
    for (const f of entry.families) assert.ok(JOB_FAMILY_SCOPE.families[f], `${id} maps only to defined families`)
    assert.ok(['standard', 'sparing-advanced'].includes(entry.usage))
  }
  // The advanced pair is marked for sparing use (charter §3).
  assert.equal(JOB_FAMILY_SCOPE.scenarios['ethical-ai'].usage, 'sparing-advanced')
  assert.equal(JOB_FAMILY_SCOPE.scenarios['team-restructure'].usage, 'sparing-advanced')
})

test('§3: no scientifically framed job-family weights exist in the mapping', () => {
  for (const entry of Object.values(JOB_FAMILY_SCOPE.scenarios)) {
    assert.ok(!('weight' in entry) && !('weights' in entry), 'content alignment only — weights need job-analysis evidence')
  }
})
