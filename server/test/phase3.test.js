// Phase 3 Stage 1/6 gate tests — pilot instrument panel + model-drift guard.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { modelDriftStatus, assertJudgeAnchoredForIssuance, judgeFingerprint } from '../lib/modelDrift.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Stage 6.1: drift detection + escalation semantics ────────────────────────
test('S6.1: drift is anchored/detected/blocking exactly per the escalation rule', () => {
  const saved = process.env.BEDROCK_PRIMARY_MODEL
  const savedProvider = process.env.AI_PROVIDER
  const savedHard = process.env.PRISM_DRIFT_HARD
  try {
    const fp = judgeFingerprint()
    assert.ok(fp.provider === 'aws-bedrock' && fp.modelId && fp.escalationRule, 'fingerprint pins provider + model + rule')
    process.env.AI_PROVIDER = fp.provider
    process.env.BEDROCK_PRIMARY_MODEL = fp.modelId
    delete process.env.PRISM_DRIFT_HARD
    assert.equal(modelDriftStatus().status, 'anchored')
    assert.doesNotThrow(assertJudgeAnchoredForIssuance)
    // Drifted, soft era: detected, surfaced, NOT blocking.
    process.env.BEDROCK_PRIMARY_MODEL = 'test.new-judge-model'
    assert.equal(modelDriftStatus().status, 'DRIFT_DETECTED')
    assert.doesNotThrow(assertJudgeAnchoredForIssuance, 'pre-calibration: surface, never block')
    // Drifted, hard gate (post-calibration-v1): issuance BLOCKS.
    process.env.PRISM_DRIFT_HARD = 'true'
    assert.equal(modelDriftStatus().status, 'DRIFT_BLOCKING')
    assert.throws(assertJudgeAnchoredForIssuance, /issuance blocked/)
  } finally {
    if (saved === undefined) delete process.env.BEDROCK_PRIMARY_MODEL
    else process.env.BEDROCK_PRIMARY_MODEL = saved
    if (savedProvider === undefined) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = savedProvider
    if (savedHard === undefined) delete process.env.PRISM_DRIFT_HARD
    else process.env.PRISM_DRIFT_HARD = savedHard
  }
})

// ── Stage 1: panel is admin-gated and read-only ──────────────────────────────
test('S1: pilot panel requires the admin token (503/401 otherwise)', async () => {
  const savedToken = process.env.ADMIN_TOKEN
  try {
    const { buildApp } = await import('../app.js')
    delete process.env.ADMIN_TOKEN
    const app = buildApp()
    const server = app.listen(0)
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      assert.equal((await fetch(`${base}/api/pilot/dashboard`)).status, 503, 'no ADMIN_TOKEN => disabled')
      process.env.ADMIN_TOKEN = 'test-token-abc'
      assert.equal((await fetch(`${base}/api/pilot/dashboard`)).status, 401, 'wrong/missing token => unauthorized')
    } finally {
      server.close()
    }
  } finally {
    if (savedToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = savedToken
  }
})

test('S1: instrument panel is read-only — no writes to any scoring/consent table', async () => {
  for (const f of ['routes/pilot.js', 'lib/sentinels.js']) {
    const raw = await readFile(join(__dirname, '..', f), 'utf-8')
    const code = raw.replace(/^\s*\/\/.*$/gm, '')
    for (const banned of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'saveReport', 'issueCredential', 'recordItemResponse']) {
      assert.ok(!code.includes(banned), `${f} must be read-only (${banned})`)
    }
    // Sentinels alert, never delete (Stage 1.2 letter).
  }
})

test('S1: sentinels + dashboard honesty — projections never fabricate', async () => {
  const { GATES } = await import('../routes/pilot.js')
  assert.equal(GATES.totalRealSessions, 300)
  assert.equal(GATES.doubleRatedSessions, 100)
  const pilot = await readFile(join(__dirname, '..', 'routes', 'pilot.js'), 'utf-8')
  assert.ok(pilot.includes('NO CURRENT VELOCITY'), 'zero-velocity gates are named, not projected')
  const sentinels = await readFile(join(__dirname, '..', 'lib', 'sentinels.js'), 'utf-8')
  assert.ok(sentinels.includes('never delete') || sentinels.includes('ALERT'), 'alert-only discipline stated')
})

// ── The One Law, encoded ─────────────────────────────────────────────────────
test('ONE LAW: no code path flips a feature flag at runtime', async () => {
  // Flags are environment-owned (humans + deploy). Nothing in the server may
  // assign process.env.PRISM_* — flips happen via app settings, with a human.
  const { readdir } = await import('node:fs/promises')
  const walk = async (dir) => {
    const out = []
    for (const e of await readdir(join(__dirname, '..', dir), { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...(await walk(join(dir, e.name))))
      else if (e.name.endsWith('.js')) out.push(join(dir, e.name))
    }
    return out
  }
  const files = [...(await walk('routes')), ...(await walk('lib')), ...(await walk('engine')), ...(await walk('scoring'))]
  for (const f of files) {
    const code = (await readFile(join(__dirname, '..', f), 'utf-8')).replace(/^\s*\/\/.*$/gm, '')
    assert.ok(!/process\.env\.PRISM_[A-Z0-9_]+\s*=(?!==?)/.test(code), `${f} assigns a PRISM_* flag at runtime`)
  }
})

// ── Stage 3: the map as law ──────────────────────────────────────────────────
test('S3: every Stage-3 flag is on the map with a ceiling and preconditions', async () => {
  const { FLAG_MAP } = await import('../lib/flagMap.js')
  for (const flag of ['PRISM_V2_EXECUTIVE', 'PRISM_V2_DUAL_SCORER', 'CONFORMAL_CI', 'CERTIFIED_LANGUAGE', 'PRISM_VELOCITY', 'PRISM_PRESSURE', 'PRISM_LANG', 'PRISM_REPLAY', 'PRISM_TEAMFIT']) {
    const entry = FLAG_MAP[flag]
    assert.ok(entry, `${flag} missing from the map`)
    assert.ok(entry.claimCeiling?.length > 10, `${flag} has a claim ceiling`)
    assert.ok(entry.preconditions?.length >= 1, `${flag} has registry preconditions`)
  }
})

test('S3: off-map flips ESCALATE; empty registry means NO-GO everywhere', async () => {
  const { checkFlag } = await import('../lib/flagMap.js')
  const rogue = await checkFlag('PRISM_SOMETHING_THE_FOUNDER_ASKED_FOR')
  assert.equal(rogue.verdict, 'ESCALATE')
  assert.ok(rogue.reason.includes('the founder asked'), 'cites the Law verbatim')
  // Without a DB (local test env), preconditions cannot verify => never GO.
  const exec = await checkFlag('PRISM_V2_EXECUTIVE')
  assert.notEqual(exec.verdict, 'GO')
  assert.ok(exec.claimCeiling)
})

// ── Stage 4.3: public benchmark page stays under the ceiling ────────────────
test('S4.3: adversarial benchmark page is public and claims nothing without S4 data', async () => {
  const { buildApp } = await import('../app.js')
  const app = buildApp()
  const server = app.listen(0)
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/evidence/adversarial`)
    assert.equal(res.status, 200, 'public — no auth required')
    const body = await res.json()
    assert.ok(body.status.includes('preregistered'), 'pending state is explicit')
    assert.equal(body.currentEvasionRate, null, 'no number without a registry row')
    assert.ok(body.note.includes('No detection claim is made'))
    assert.ok(body.detectionPolicy.includes('never auto-fail'))
    const text = JSON.stringify(body)
    assert.ok(!/\d+(\.\d+)?%/.test(text), 'no percentage appears anywhere in the pending state')
  } finally {
    server.close()
  }
})
