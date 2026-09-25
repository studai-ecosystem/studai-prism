// Prism Campus C0.06 — the 9 campus flags are registered, default OFF, and no
// non-test code path assigns a PRISM_* env var (ONE LAW, K2).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLAG_CATALOGUE, liveFlagState } from '../lib/flagRegistry.js'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CAMPUS_FLAGS = [
  'PRISM_APP_SHELL_V3',
  'PRISM_EVIDENCE_FAIL_CLOSED',
  'PRISM_STUDENT_REPORT_V3',
  'PRISM_ASSESSMENT_WORKSPACE_V3',
  'PRISM_CAMPUS_ENABLED',
  'PRISM_CAMPUS_ANALYTICS',
  'PRISM_DEVELOPMENT_V2',
  'PRISM_GROWTH_ENABLED',
  'PRISM_ROLE_EXPLORATION_V2',
]

test('campus flags: all 9 are registered with owner, risk and an HA-C001 data gate', () => {
  const byKey = new Map(FLAG_CATALOGUE.map((f) => [f.key, f]))
  for (const key of CAMPUS_FLAGS) {
    const entry = byKey.get(key)
    assert.ok(entry, `${key} registered`)
    assert.ok(['medium', 'high'].includes(entry.risk), `${key} risk`)
    assert.ok(entry.owner && entry.description, `${key} complete`)
    assert.match(entry.dataGate, /HA-C001/, `${key} names the human flip`)
  }
  const high = ['PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_STUDENT_REPORT_V3', 'PRISM_CAMPUS_ENABLED', 'PRISM_CAMPUS_ANALYTICS', 'PRISM_GROWTH_ENABLED', 'PRISM_DEVELOPMENT_V2']
  for (const key of high) assert.equal(byKey.get(key).risk, 'high', `${key} is high risk`)
})

test('campus flags: env unset → off', () => {
  for (const key of CAMPUS_FLAGS) {
    const saved = process.env[key]
    delete process.env[key]
    try {
      assert.equal(liveFlagState(key), 'off', `${key} defaults off`)
    } finally {
      if (saved !== undefined) process.env[key] = saved
    }
  }
})

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'test' || name === 'test-support' || name === 'data') continue
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs, out)
    else if (/\.(m?js|cjs)$/.test(name)) out.push(abs)
  }
  return out
}

test('ONE LAW: no server runtime code assigns a campus flag', () => {
  const offenders = []
  for (const file of walk(SERVER_ROOT)) {
    const src = readFileSync(file, 'utf8')
    for (const key of CAMPUS_FLAGS) {
      if (new RegExp(`process\\.env\\.${key}\\s*=[^=]|process\\.env\\[['"]${key}['"]\\]\\s*=[^=]`).test(src)) {
        offenders.push(`${relative(SERVER_ROOT, file)} assigns ${key}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})
