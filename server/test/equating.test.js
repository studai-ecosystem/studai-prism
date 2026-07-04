// Prism v2 (MASA-2) Phase 3 — equating helper tests.
// Covers flag-off reproducibility (kappa=0 passthrough) and 0–100 clamping.
// No DB: with PRISM_V2_EQUATING unset, equateScore never touches Postgres.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { equateScore, isEquatingEnabled, _clearEquatingCache } from '../scoring/equating.js'

test('equating is off by default (v1 reproducible)', () => {
  delete process.env.PRISM_V2_EQUATING
  assert.equal(isEquatingEnabled(), false)
})

test('flag off: score passes through but is still clamped 0-100', async () => {
  delete process.env.PRISM_V2_EQUATING
  _clearEquatingCache()
  assert.equal(await equateScore('the-fest-budget', 73), 73)
  assert.equal(await equateScore('the-fest-budget', 140), 100)
  assert.equal(await equateScore('the-fest-budget', -5), 0)
})

test('flag off: missing scenario key still clamps', async () => {
  delete process.env.PRISM_V2_EQUATING
  _clearEquatingCache()
  assert.equal(await equateScore(null, 55), 55)
  assert.equal(await equateScore(undefined, 200), 100)
})

test('isEquatingEnabled requires both the flag AND a DB', () => {
  process.env.PRISM_V2_EQUATING = 'true'
  const prevUrl = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  // No DATABASE_URL → isDbConfigured() false → equating disabled even with flag.
  assert.equal(isEquatingEnabled(), false)
  if (prevUrl) process.env.DATABASE_URL = prevUrl
  delete process.env.PRISM_V2_EQUATING
})
