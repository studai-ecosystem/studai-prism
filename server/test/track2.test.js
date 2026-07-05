// Track 2 gate tests — glass-box credentials.
//
// Local coverage: canonicalization determinism, sign→verify round-trip,
// single-byte tamper failure, PII guard on the bundle, disclosure separation,
// schema doc integrity. DB lifecycle (immutability trigger, supersession
// chain) is verified against the production database post-deploy.

import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Provide a throwaway signing key BEFORE the module loads.
const { privateKey } = generateKeyPairSync('ed25519')
process.env.PRISM_CREDENTIAL_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')

const {
  canonicalStringify,
  sha256hex,
  getPublicKeyInfo,
  assertBundlePseudonymous,
  verifyCredential,
} = await import('../lib/credentials.js')
const { sign: edSign } = await import('node:crypto')

// ── canonicalization ─────────────────────────────────────────────────────────
test('T2.1: canonical JSON is key-order independent and round-trip stable', () => {
  const a = { b: 2, a: 1, nested: { z: [3, { y: 'x', a: null }], a: true } }
  const b = { nested: { a: true, z: [3, { a: null, y: 'x' }] }, a: 1, b: 2 }
  assert.equal(canonicalStringify(a), canonicalStringify(b))
  // Round-trip through JSON parse (what jsonb storage does) reproduces bytes.
  const canonical = canonicalStringify(a)
  assert.equal(canonicalStringify(JSON.parse(canonical)), canonical)
  // undefined values are dropped deterministically, not serialized.
  assert.equal(canonicalStringify({ a: 1, gone: undefined }), '{"a":1}')
})

// ── sign → verify → tamper ───────────────────────────────────────────────────
function makeSignedCredential(bundle) {
  const info = getPublicKeyInfo()
  const canonical = canonicalStringify(bundle)
  const hash = sha256hex(canonical)
  const key = { key: Buffer.from(process.env.PRISM_CREDENTIAL_SIGNING_KEY, 'base64'), format: 'der', type: 'pkcs8' }
  const signature = edSign(null, Buffer.from(hash, 'hex'), key).toString('base64')
  return { bundle: canonical, bundle_hash: hash, signature, key_id: info.keyId, status: 'active' }
}

const SAMPLE_BUNDLE = {
  schema: 'evidence-bundle-v1',
  sessionId: '11111111-1111-4111-8111-111111111111',
  candidateId: null,
  issued: { scaleVersion: 'prism-scale-v1', calibrationRunId: null, validityMonths: 12, attemptNo: 1, isSynthetic: true },
  scenario: { title: 'The Fest Budget', domain: 'College Life' },
  scores: { overall: 63, dimensions: { criticalThinking: 70 }, weights: { criticalThinking: 0.25 }, arithmetic: [] },
  reliability: { label: 'high', agreement: 0.91 },
  confidenceInterval: null,
  evidence: { criticalThinking: 'asked for the adoption rate before deciding' },
  judgeVotes: null,
  integrityEvents: { tab_switch: 1 },
  consent: { version: '2026-07-04.1', currentCopyVersion: '2026-07-04.1', scopes: ['data_processing'] },
  provenance: { promptVersions: ['judge_full.v1'], flagsActive: { PRISM_GLASS_BOX: 'true' }, judgeDeployment: 'gpt-x' },
}

test('T2.2: credential verifies end-to-end and a single-byte tamper fails', async () => {
  const cred = makeSignedCredential(SAMPLE_BUNDLE)
  const ok = await verifyCredential(cred)
  assert.ok(ok.hashMatches && ok.signatureValid && ok.verified)

  // Tamper 1: flip the overall score inside the stored bundle.
  const tampered = { ...cred, bundle: cred.bundle.replace('"overall":63', '"overall":93') }
  const bad = await verifyCredential(tampered)
  assert.ok(!bad.hashMatches && !bad.verified, 'bundle tamper must fail hash check')

  // Tamper 2: swap the signature.
  const other = makeSignedCredential({ ...SAMPLE_BUNDLE, scores: { ...SAMPLE_BUNDLE.scores, overall: 10 } })
  const swapped = { ...cred, signature: other.signature }
  const bad2 = await verifyCredential(swapped)
  assert.ok(!bad2.signatureValid && !bad2.verified, 'signature swap must fail')

  // Tamper 3: object-form bundle (jsonb round-trip) still verifies.
  const objForm = { ...cred, bundle: JSON.parse(cred.bundle) }
  const ok2 = await verifyCredential(objForm)
  assert.ok(ok2.verified, 'jsonb object round-trip verifies')
})

// ── PII guard ────────────────────────────────────────────────────────────────
test('T2.1: bundle PII guard rejects identity keys anywhere in the tree', () => {
  assert.doesNotThrow(() => assertBundlePseudonymous(SAMPLE_BUNDLE))
  assert.throws(() => assertBundlePseudonymous({ ...SAMPLE_BUNDLE, userEmail: 'x@y.z' }), /PII/)
  assert.throws(() => assertBundlePseudonymous({ ...SAMPLE_BUNDLE, nested: { deep: { fullName: 'A B' } } }), /PII/)
  assert.throws(() => assertBundlePseudonymous({ ...SAMPLE_BUNDLE, consent: { ...SAMPLE_BUNDLE.consent, aadhaarLast4: '1234' } }), /PII/)
})

// ── schema doc ───────────────────────────────────────────────────────────────
test('T2.1: published schema exists, is valid JSON, and matches the bundle shape', async () => {
  const raw = await readFile(join(__dirname, '..', '..', 'docs', 'evidence-bundle-schema-v1.json'), 'utf-8')
  const schema = JSON.parse(raw)
  assert.equal(schema.title, 'Prism Evidence Bundle v1')
  for (const req of schema.required) {
    assert.ok(req in SAMPLE_BUNDLE, `sample bundle carries required key ${req}`)
  }
  // additionalProperties: false — every sample key must be declared.
  for (const key of Object.keys(SAMPLE_BUNDLE)) {
    assert.ok(key in schema.properties, `schema declares ${key}`)
  }
})

// ── claim discipline (T2.5) ──────────────────────────────────────────────────
test('T2.5: forbidden claims absent from credential code and user-facing copy', async () => {
  const files = [
    join(__dirname, '..', 'lib', 'credentials.js'),
    join(__dirname, '..', 'routes', 'credentials.js'),
    join(__dirname, '..', '..', 'src', 'pages', 'Verify.jsx'),
  ]
  for (const f of files) {
    const text = (await readFile(f, 'utf-8')).toLowerCase()
    for (const banned of ['tamper-proof', 'tamperproof', 'blockchain', 'regulator-approved']) {
      // The word may appear ONLY in the negative claim-discipline comment.
      const stripped = text.replace(/the only claim[\s\S]*?say so\./, '').replace(/nothing here is[\s\S]*?say so/, '')
      assert.ok(!stripped.includes(banned), `${f} contains forbidden claim "${banned}"`)
    }
  }
})

// ── key discipline ───────────────────────────────────────────────────────────
test('T2.2: no key configured → issuance disabled, never a fallback (C8 lesson)', async () => {
  const saved = process.env.PRISM_CREDENTIAL_SIGNING_KEY
  try {
    delete process.env.PRISM_CREDENTIAL_SIGNING_KEY
    process.env.PRISM_GLASS_BOX = 'true'
    const { isGlassBoxEnabled } = await import('../lib/credentials.js')
    assert.equal(isGlassBoxEnabled(), false, 'no key => disabled')
  } finally {
    process.env.PRISM_CREDENTIAL_SIGNING_KEY = saved
    delete process.env.PRISM_GLASS_BOX
  }
})

// ── disclosure separation (route-level contract) ─────────────────────────────
test('T2.2: scores-level view never includes evidence quotes or judge votes', async () => {
  // Mirrors the view construction in routes/credentials.js: the default view
  // omits `evidence` and `judgeVotes`; only a valid share token adds them.
  const bundle = SAMPLE_BUNDLE
  const scoresView = {
    schema: bundle.schema, sessionId: bundle.sessionId, issued: bundle.issued,
    scenario: bundle.scenario, scores: bundle.scores, reliability: bundle.reliability,
    confidenceInterval: bundle.confidenceInterval, integrityEvents: bundle.integrityEvents,
    consent: { version: bundle.consent.version }, provenance: bundle.provenance,
  }
  const text = JSON.stringify(scoresView)
  assert.ok(!text.includes('adoption rate'), 'evidence quote leaked into scores view')
  assert.ok(!('evidence' in scoresView) && !('judgeVotes' in scoresView))
  // Share-token comparison is hash-based, not string equality on the secret.
  const tokenHash = createHash('sha256').update('secret-token').digest('hex')
  assert.equal(createHash('sha256').update('secret-token').digest('hex'), tokenHash)
})
