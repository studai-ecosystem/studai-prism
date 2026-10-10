#!/usr/bin/env node
// Synthetic JSON store generator for the JSON → PostgreSQL migration
// rehearsal (PG_MIGRATION_RUNBOOK_v1.md; PROD-READY Phase 3, HA-023 prep).
//
// Writes `assessments.json` and `users.json` in the exact shapes the JSON
// store (server/lib/storeJson.js, server/lib/dbJson.js) writes, filled with
// SYNTHETIC records only: generated ids, `@synthetic.invalid` emails, fake
// password hashes, lorem-style text. Nothing here is, or is derived from,
// real user data. Output goes to the directory you name — use a scratch
// directory, never the repository (`/data/` is git-ignored, and generated
// stores must never be committed).
//
// Usage:
//   node scripts/generate-synthetic-store.mjs --out <dir> [--users 5000]
//        [--sessions 8000] [--report-share 0.75] [--seed 20261010]
// Then, against a THROWAWAY database only:
//   DATA_DIR=<dir> DATABASE_URL=<throwaway> node server/db/migrateStore.js
//   DATA_DIR=<dir> DATABASE_URL=<throwaway> node server/db/migrateStore.js --enforce
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function args(argv) {
  const out = { users: 5000, sessions: 8000, reportShare: 0.75, seed: 20261010, out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const [k, v] = [argv[i], argv[i + 1]]
    if (k === '--out') { out.out = v; i += 1 } else if (k === '--users') { out.users = Number(v); i += 1 } else if (k === '--sessions') { out.sessions = Number(v); i += 1 } else if (k === '--report-share') { out.reportShare = Number(v); i += 1 } else if (k === '--seed') { out.seed = Number(v); i += 1 } else throw new Error(`Unknown argument ${k}`)
  }
  if (!out.out) throw new Error('--out <dir> is required (use a scratch directory)')
  for (const key of ['users', 'sessions', 'seed']) if (!Number.isInteger(out[key]) || out[key] < 0) throw new Error(`--${key} must be a non-negative integer`)
  if (!(out.reportShare >= 0 && out.reportShare <= 1)) throw new Error('--report-share must be between 0 and 1')
  return out
}

// Deterministic PRNG (mulberry32) so a rehearsal can be repeated exactly.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SCENARIOS = ['group-project', 'design-sprint', 'customer-escalation', 'clinic-triage', 'launch-delay', 'budget-cut']
const DIMENSIONS = ['criticalThinking', 'communication', 'collaboration', 'adaptability', 'execution']
const WORDS = 'plan team deadline client update risk owner draft review schedule budget follow agree priority handover note check'.split(' ')

export function generateSyntheticStore({ users: userCount, sessions: sessionCount, reportShare, seed }) {
  const r = rng(seed)
  const pick = (list) => list[Math.floor(r() * list.length)]
  const hex = (n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('')
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
  const sentence = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ')
  const base = Date.parse('2026-03-01T00:00:00.000Z')
  const iso = (ms) => new Date(ms).toISOString()

  const users = []
  for (let i = 0; i < userCount; i += 1) {
    users.push({
      id: uuid(),
      email: `synthetic-${String(i).padStart(6, '0')}@synthetic.invalid`,
      name: `Synthetic Candidate ${i}`,
      college: `Synthetic College ${i % 40}`,
      year: String(1 + (i % 4)),
      passwordHash: `$2a$10$synthetic${hex(44)}`,
      ageDeclaration: r() < 0.9 ? { version: 'age-18plus-v1', confirmedAt: iso(base + i * 60000) } : null,
      createdAt: iso(base + i * 60000),
    })
  }

  const store = { sessions: {}, payments: {}, reports: {}, events: [], calibrations: {}, consents: {}, disputes: {}, verifications: {}, deviceLinks: {}, items: [], accommodations: {}, paymentRedemptions: {} }
  for (let i = 0; i < sessionCount; i += 1) {
    const sessionId = uuid()
    const owner = users.length ? users[Math.floor(r() * users.length)] : null
    const started = base + 86400000 + i * 300000
    const paid = r() < 0.6
    const paymentId = paid ? `pay_syn${hex(14)}` : null
    const orderId = paid ? `order_syn${hex(14)}` : null
    store.payments[sessionId] = {
      sessionId, paymentId, orderId, amount: paid ? 49900 : 0, mode: paid ? 'paid' : 'dev',
      userId: owner?.id || null, userEmail: owner?.email || null, consumed: true, createdAt: iso(started - 60000),
    }
    if (paid) store.paymentRedemptions[paymentId] = { paymentId, orderId, sessionId, userId: owner?.id || null, redeemedAt: iso(started - 60000) }
    const completed = r() < reportShare
    const exchanges = 3 + Math.floor(r() * 6)
    const session = {
      sessionId,
      scenarioId: pick(SCENARIOS),
      userId: owner?.id || null,
      userEmail: owner?.email || null,
      exchangeCount: exchanges,
      artifacts: [{ artifactId: 'plan', type: 'table', title: 'Synthetic plan', data: { rows: exchanges, note: sentence(5) } }],
      evidence: { turns: exchanges },
      consentVersion: 'consent-v3',
      tokensUsed: 1000 + Math.floor(r() * 9000),
      startedAt: started,
      completedAt: completed ? started + 1800000 : null,
      updatedAt: started + (completed ? 1800000 : 600000),
    }
    // The JSON store frees the transcript once a report is issued.
    if (!completed) session.history = Array.from({ length: exchanges }, (_, t) => ({ role: t % 2 ? 'assistant' : 'user', content: sentence(12) }))
    store.sessions[sessionId] = session
    store.consents[sessionId] = { sessionId, scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], meta: { consentVersion: 'consent-v3' }, at: iso(started - 30000) }
    store.calibrations[sessionId] = { sessionId, tier: pick(['foundation', 'intermediate', 'advanced']), at: iso(started - 20000) }
    for (let e = 0; e < 3; e += 1) store.events.push({ sessionId, type: pick(['tab_switch', 'looking_away', 'paste']), meta: { n: e }, at: iso(started + e * 60000) })
    if (completed) {
      const scores = Object.fromEntries(DIMENSIONS.map((d) => [d, 30 + Math.floor(r() * 60)]))
      store.reports[sessionId] = {
        sessionId, userId: owner?.id || null, scores,
        composite: { value: Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / DIMENSIONS.length), access: 'research' },
        feedback: { summary: sentence(20) }, highlights: [sentence(8)], growthAreas: [sentence(8)],
        issuedAt: iso(started + 1800000),
      }
      for (const d of DIMENSIONS) store.items.push({ sessionId, dimension: d, level: 1 + Math.floor(r() * 5), at: iso(started + 1700000) })
      if (r() < 0.02) store.disputes[sessionId] = { sessionId, reason: sentence(10), contact: owner?.email || null, status: 'open', at: iso(started + 2000000) }
    }
    if (r() < 0.5) store.verifications[sessionId] = { sessionId, fullName: owner?.name || 'Synthetic', fathersName: '', dob: '', aadhaarLast4: String(1000 + Math.floor(r() * 8999)), college: owner?.college || '', nameMatch: true, matchScore: 0.9, at: iso(started - 10000) }
    if (r() < 0.1) {
      const pairCode = `pair-${hex(10)}`
      store.deviceLinks[pairCode] = { pairCode, sessionId, status: 'linked', phoneUserAgent: 'synthetic-agent', createdAt: iso(started - 5000), updatedAt: iso(started - 4000) }
    }
    if (r() < 0.01) store.accommodations[sessionId] = { sessionId, needs: 'Synthetic accommodation request', modes: null, status: 'requested', material: false, decisionNote: '', decidedBy: null, at: iso(started - 86400000), decidedAt: null }
  }
  return { users: { users }, store }
}

async function main() {
  const opts = args(process.argv.slice(2))
  const out = resolve(opts.out)
  const started = Date.now()
  const { users, store } = generateSyntheticStore(opts)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'users.json'), JSON.stringify(users, null, 2))
  await writeFile(join(out, 'assessments.json'), JSON.stringify(store, null, 2))
  const counts = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length]))
  console.log(JSON.stringify({ msg: 'synthetic_store_written', dir: out, users: users.users.length, ...counts, ms: Date.now() - started }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(err.message); process.exit(1) })
}
