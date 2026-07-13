// Control Centre Phase 5 — unit tests (no database).
//
// Flag-catalogue invariants (science-gated flags are HIGH risk and every
// FLAG_MAP entry is in the registry), CMS runtime defaults (public content
// serves content.json byte-identically while PRISM_CMS_DB is off), ONE-LAW
// source scan over the new routers, dark gates.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.PRISM_ADMIN_CONSOLE
delete process.env.PRISM_CMS_DB

const { FLAG_CATALOGUE } = await import('../lib/flagRegistry.js')
const { FLAG_MAP } = await import('../lib/flagMap.js')
const { isCmsDbEnabled } = await import('../lib/contentCms.js')
const { getPosts } = await import('../lib/content.js')
const { buildApp } = await import('../app.js')

test('flag catalogue: every science-gated flag is registered and HIGH risk', () => {
  const byKey = new Map(FLAG_CATALOGUE.map((f) => [f.key, f]))
  // FLAG_MAP also carries claim/capability gates (CONFORMAL_CI,
  // CERTIFIED_LANGUAGE) that are not environment flags — only PRISM_* entries
  // belong in the env-flag registry.
  for (const flag of Object.keys(FLAG_MAP).filter((k) => k.startsWith('PRISM_'))) {
    const entry = byKey.get(flag)
    assert.ok(entry, `science-gated flag ${flag} missing from the registry catalogue`)
    assert.equal(entry.risk, 'high', `${flag} must be high risk (its data gate is scientific)`)
  }
  // Registry basics.
  for (const f of FLAG_CATALOGUE) {
    assert.match(f.key, /^PRISM_[A-Z0-9_]+$/, f.key)
    assert.ok(f.description && f.owner && f.dataGate, `${f.key} incomplete`)
    assert.ok(['low', 'medium', 'high'].includes(f.risk))
  }
})

test('CMS runtime is OFF by default and the JSON store keeps serving content', async () => {
  assert.equal(isCmsDbEnabled(), false)
  const app = buildApp()
  const server = app.listen(0)
  const port = server.address().port
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/content/blog`)
    assert.equal(res.status, 200)
    const { posts } = await res.json()
    const direct = await getPosts()
    assert.equal(posts.length, direct.length, 'flag off → JSON store shapes, unchanged')
    if (posts.length) {
      assert.ok(posts[0].slug && posts[0].title, 'public meta shape intact')
      assert.ok(!('body' in posts[0]), 'list view still strips body')
      assert.ok(!('published' in posts[0]), 'list view still strips published')
    }
  } finally {
    server.close()
  }
})

test('ONE LAW: Phase 5 routers never assign PRISM_* env at runtime', async () => {
  const { readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const base = dirname(fileURLToPath(import.meta.url))
  for (const rel of [
    ['..', 'routes', 'admin', 'flags.js'],
    ['..', 'routes', 'admin', 'system.js'],
    ['..', 'routes', 'admin', 'content.js'],
    ['..', 'lib', 'flagRegistry.js'],
    ['..', 'lib', 'contentCms.js'],
  ]) {
    const file = join(base, ...rel)
    const src = readFileSync(file, 'utf8')
    assert.ok(
      !/process\.env\.PRISM_[A-Z_]+\s*=[^=]/.test(src),
      `${rel.join('/')} must not assign PRISM_* env vars at runtime`,
    )
  }
})

test('Phase 5 namespaces are dark without PRISM_ADMIN_CONSOLE', async () => {
  const app = buildApp()
  const server = app.listen(0)
  const port = server.address().port
  try {
    for (const path of [
      '/api/admin/content/posts', '/api/admin/flags',
      '/api/admin/system/health', '/api/admin/system/models', '/api/admin/system/jobs',
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      assert.equal(res.status, 404, `${path} must be dark`)
    }
  } finally {
    server.close()
  }
})
