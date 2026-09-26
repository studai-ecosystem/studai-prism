// C12.02 — the campus claims register matches the actual validation state:
// every campus claim is PENDING, each names an OPEN human action, the public
// claims endpoint carries them as PENDING, the register document lists them,
// and no campus or student surface states them as fact.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { CAMPUS_CLAIMS } from '../domain/claims/campusClaims.js'
import evidenceRouter from '../routes/evidence.js'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

test('every campus claim is PENDING and tied to an OPEN human action', () => {
  const ids = CAMPUS_CLAIMS.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  const register = read('docs/campus/CAMPUS_HUMAN_ACTIONS.md')
  for (const c of CAMPUS_CLAIMS) {
    assert.equal(c.status, 'PENDING', c.id)
    const row = register.split('\n').find((l) => l.startsWith(`| ${c.humanAction} |`))
    assert.ok(row, `${c.id}: ${c.humanAction} exists`)
    assert.match(row, /\| OPEN \|/, `${c.id}: ${c.humanAction} is still open, so the claim cannot be earned`)
  }
  const doc = read('docs/campus/CAMPUS_CLAIMS_REGISTER.md')
  for (const c of CAMPUS_CLAIMS) assert.ok(doc.includes(c.id) && doc.includes('PENDING'), `${c.id} documented`)
})

test('the public claims endpoint serves campus claims as PENDING', async () => {
  const app = express()
  app.use('/api/evidence', evidenceRouter)
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/evidence/claims`)
    const body = await r.json()
    assert.equal(r.status, 200)
    assert.deepEqual(body.campusClaims.map((c) => c.id), CAMPUS_CLAIMS.map((c) => c.id))
    assert.ok(body.campusClaims.every((c) => c.status === 'PENDING'))
  } finally { server.close() }
})

test('campus and student surfaces never state a pending claim as fact', () => {
  const files = []
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(jsx?|md)$/.test(f) && !/\.test\.jsx?$/.test(f)) files.push(p)
    }
  }
  for (const d of ['src/features', 'src/lib/copy', 'src/components/campus']) walk(fileURLToPath(new URL(d, root)))
  const banned = [
    /\b(scientifically )?validated (assessment|measure|capability|level|result)s?\b/i,
    /\bproven to\b/i,
    /\bpredicts? (placement|job|workplace|employ)/i,
    /\bbias[- ]free\b/i,
    /\bguaranteed? (anonymity|privacy)\b/i,
    /\bmeasures? (real|true) growth\b/i,
    /\bhuman[- ]expert[- ]level\b/i,
  ]
  const hits = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const re of banned) if (re.test(text)) hits.push(`${f}: ${re}`)
  }
  assert.deepEqual(hits, [])
})
