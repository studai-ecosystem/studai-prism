// Admin Control Centre — Phase 1 unit + integration tests (no database).
//
// Covers: RFC 6238 TOTP correctness, base32 codec, MFA-secret encryption,
// password policy, RBAC catalogue invariants (auditor is structurally
// read-only; every role grant resolves to a real permission), cookie/CSRF
// primitives, and the ship-dark contract (the whole /api/admin plane 404s
// without PRISM_ADMIN_CONSOLE, and 503s without a database).
//
// Full login→MFA→session→audit flows live in adminConsole.db.test.js
// (TEST_DATABASE_URL-gated, like storePg.db.test.js).

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.PRISM_ADMIN_CONSOLE

const {
  base32Encode, base32Decode, hotpCode, totpCode, verifyTotp,
  encryptSecret, decryptSecret, generateTotpSecret, otpauthUri,
  validatePasswordPolicy, readCookie, hasPermission,
} = await import('../lib/adminAuth.js')
const { PERMISSIONS, ROLES, READ_ONLY_PERMISSIONS } = await import('../lib/adminRbac.js')
const { buildApp } = await import('../app.js')

// ── TOTP: RFC 4226 / RFC 6238 test vectors ──────────────────────────────────
// RFC 6238 Appendix B vectors use the ASCII seed "12345678901234567890"
// (SHA-1). The published 8-digit codes truncate to these 6-digit codes.
const RFC_SECRET_B32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'))
const RFC_VECTORS = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
]

test('TOTP matches RFC 6238 SHA-1 test vectors', () => {
  for (const [seconds, expected] of RFC_VECTORS) {
    assert.equal(totpCode(RFC_SECRET_B32, seconds * 1000), expected, `T=${seconds}`)
  }
})

test('HOTP dynamic truncation matches RFC 4226 vector (counter 0..2)', () => {
  // RFC 4226 Appendix D, 6-digit codes for the same ASCII seed.
  assert.equal(hotpCode(RFC_SECRET_B32, 0), '755224')
  assert.equal(hotpCode(RFC_SECRET_B32, 1), '287082')
  assert.equal(hotpCode(RFC_SECRET_B32, 2), '359152')
})

test('verifyTotp accepts ±1 step skew and rejects garbage', () => {
  const now = 1111111109 * 1000
  const current = totpCode(RFC_SECRET_B32, now)
  const prev = totpCode(RFC_SECRET_B32, now - 30_000)
  const next = totpCode(RFC_SECRET_B32, now + 30_000)
  const old = totpCode(RFC_SECRET_B32, now - 90_000)
  assert.ok(verifyTotp(RFC_SECRET_B32, current, now))
  assert.ok(verifyTotp(RFC_SECRET_B32, prev, now))
  assert.ok(verifyTotp(RFC_SECRET_B32, next, now))
  assert.ok(!verifyTotp(RFC_SECRET_B32, old, now), 'codes older than one step are rejected')
  assert.ok(!verifyTotp(RFC_SECRET_B32, '000000', now) || totpCode(RFC_SECRET_B32, now) === '000000')
  assert.ok(!verifyTotp(RFC_SECRET_B32, 'abcdef', now))
  assert.ok(!verifyTotp(RFC_SECRET_B32, '', now))
  assert.ok(!verifyTotp(RFC_SECRET_B32, '28708', now), 'five digits rejected')
})

test('base32 round-trips arbitrary bytes and rejects invalid characters', () => {
  for (const len of [1, 2, 3, 4, 5, 19, 20, 32]) {
    const buf = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + len) % 256))
    assert.deepEqual(base32Decode(base32Encode(buf)), buf, `len=${len}`)
  }
  assert.throws(() => base32Decode('AB1!'), /invalid base32/)
})

test('TOTP secrets encrypt/decrypt round-trip; ciphertexts are unique per call', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-admin-console'
  const secret = generateTotpSecret()
  assert.equal(secret.length, 32, '160-bit secret = 32 base32 chars')
  const a = encryptSecret(secret)
  const b = encryptSecret(secret)
  assert.notEqual(a, b, 'fresh IV per encryption')
  assert.equal(decryptSecret(a), secret)
  assert.equal(decryptSecret(b), secret)
  assert.ok(!a.includes(secret), 'ciphertext does not embed the plaintext')
  // Tampering must fail closed (GCM auth tag).
  const [iv, tag, data] = a.split('.')
  const flipped = Buffer.from(data, 'base64')
  flipped[0] ^= 0xff
  assert.throws(() => decryptSecret(`${iv}.${tag}.${flipped.toString('base64')}`))
})

test('otpauth URI carries issuer, account and secret', () => {
  const uri = otpauthUri('ABCDEF234567', 'ops@studai.one')
  assert.ok(uri.startsWith('otpauth://totp/'))
  assert.ok(uri.includes('secret=ABCDEF234567'))
  assert.ok(uri.includes('issuer=StudAI%20Prism%20Admin'))
  assert.ok(uri.includes(encodeURIComponent('ops@studai.one')))
})

test('admin password policy: length 12+ and no email-name reuse', () => {
  assert.ok(validatePasswordPolicy('short', 'a@b.com'))
  assert.ok(validatePasswordPolicy('elevenchars', 'a@b.com'))
  assert.equal(validatePasswordPolicy('a-long-enough-password', 'ops@studai.one'), null)
  assert.ok(validatePasswordPolicy('xx-ops-long-password', 'ops@studai.one'), 'email local part banned')
})

// ── RBAC catalogue invariants ────────────────────────────────────────────────
test('every role grant resolves to a defined permission key', () => {
  const known = new Set([...Object.keys(PERMISSIONS), '*'])
  for (const [roleKey, def] of Object.entries(ROLES)) {
    for (const p of def.permissions) {
      assert.ok(known.has(p), `${roleKey} grants unknown permission ${p}`)
    }
  }
})

test('auditor is structurally read-only — no write/lifecycle permission, ever', () => {
  const auditor = new Set(ROLES.auditor.permissions)
  assert.ok(!auditor.has('*'))
  for (const p of auditor) {
    assert.ok(
      p.endsWith(':read') || p.endsWith(':read_pii'),
      `auditor must not hold non-read permission ${p}`,
    )
  }
})

test('only super_admin and break_glass hold the wildcard', () => {
  for (const [roleKey, def] of Object.entries(ROLES)) {
    const hasStar = def.permissions.includes('*')
    if (roleKey === 'super_admin' || roleKey === 'break_glass') assert.ok(hasStar)
    else assert.ok(!hasStar, `${roleKey} must not hold '*'`)
  }
})

test('support_admin never sees PII or research/evidence surfaces', () => {
  const support = new Set(ROLES.support_admin.permissions)
  for (const banned of ['users:read_pii', 'verifications:read_pii', 'sessions:read', 'studies:read', 'audit:read']) {
    assert.ok(!support.has(banned), `support_admin must not hold ${banned}`)
  }
})

test('READ_ONLY_PERMISSIONS derivation only contains read keys', () => {
  for (const p of READ_ONLY_PERMISSIONS) {
    assert.ok(/:(read|read_pii)$/.test(p), p)
  }
})

test('hasPermission honours wildcard and exact keys only', () => {
  assert.ok(hasPermission({ permissions: new Set(['*']) }, 'anything:at_all'))
  assert.ok(hasPermission({ permissions: new Set(['users:read']) }, 'users:read'))
  assert.ok(!hasPermission({ permissions: new Set(['users:read']) }, 'users:write'))
  assert.ok(!hasPermission({ permissions: new Set() }, 'users:read'))
  assert.ok(!hasPermission(null, 'users:read'))
})

// ── Cookie parsing ───────────────────────────────────────────────────────────
test('readCookie parses standard Cookie headers', () => {
  const req = { headers: { cookie: 'a=1; prism_admin_rt=tok%20en; b=2' } }
  assert.equal(readCookie(req, 'prism_admin_rt'), 'tok en')
  assert.equal(readCookie(req, 'a'), '1')
  assert.equal(readCookie(req, 'missing'), null)
  assert.equal(readCookie({ headers: {} }, 'x'), null)
})

// ── Ship-dark contract ───────────────────────────────────────────────────────
async function request(app, method, path, { body, headers = {} } = {}) {
  const server = app.listen(0)
  const port = server.address().port
  const canHaveBody = !['GET', 'HEAD'].includes(method)
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: canHaveBody && body ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* non-JSON */ }
    return { status: res.status, json, headers: res.headers }
  } finally {
    server.close()
  }
}

test('without PRISM_ADMIN_CONSOLE the entire /api/admin plane is dark (404)', async () => {
  delete process.env.PRISM_ADMIN_CONSOLE
  const app = buildApp()
  for (const [method, path] of [
    ['POST', '/api/admin/auth/login'],
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/admins'],
    ['POST', '/api/admin/auth/refresh'],
  ]) {
    const r = await request(app, method, path, { body: {} })
    assert.equal(r.status, 404, `${method} ${path} must be dark`)
  }
})

test('with the flag on but no database, /api/admin answers 503 (never a silent fallback)', async (t) => {
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  const hadDb = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  t.after(() => {
    delete process.env.PRISM_ADMIN_CONSOLE
    if (hadDb) process.env.DATABASE_URL = hadDb
  })
  const app = buildApp()
  const r = await request(app, 'POST', '/api/admin/auth/login', { body: { email: 'a@b.c', password: 'x'.repeat(12) } })
  assert.equal(r.status, 503)
  assert.equal(r.json.code, 'NO_DB')
})

test('no ADMIN_TOKEN semantics anywhere in the new plane (identity-based only)', async () => {
  // The new console must never accept the legacy shared token as
  // authentication. Comment-stripped scan (claimsCeiling.test.js convention)
  // so prose ABOUT the legacy mechanism doesn't trip the gate.
  const { readFileSync, readdirSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'routes', 'admin')
  for (const f of readdirSync(dir)) {
    const src = stripComments(readFileSync(join(dir, f), 'utf8'))
    assert.ok(!/x-admin-token/.test(src), `${f} must not read x-admin-token`)
    assert.ok(!/process\.env\.ADMIN_TOKEN/.test(src), `${f} must not use ADMIN_TOKEN`)
  }
})

test('admin routers never assign PRISM_* env at runtime (ONE LAW)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const base = dirname(fileURLToPath(import.meta.url))
  const files = [
    ...readdirSync(join(base, '..', 'routes', 'admin')).map((f) => join(base, '..', 'routes', 'admin', f)),
    join(base, '..', 'lib', 'adminAuth.js'),
    join(base, '..', 'lib', 'adminRbac.js'),
    join(base, '..', 'lib', 'adminAudit.js'),
  ]
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    // Assignment (=) but not comparison (=== / ==) or !==.
    assert.ok(
      !/process\.env\.PRISM_[A-Z_]+\s*=[^=]/.test(src),
      `${file} must not assign PRISM_* env vars at runtime`,
    )
  }
})
