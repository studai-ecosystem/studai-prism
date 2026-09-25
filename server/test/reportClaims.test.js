// Prism Campus C2.08 — report claim registry.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClaim, validateClaims, candidateTurnsFrom } from '../domain/reports/claims.js'

const units = new Map([
  ['evid-1', { evidence_id: 'evid-1', capability_id: 'CAP-L1-REASONING' }],
  ['evid-2', { evidence_id: 'evid-2', capability_id: 'CAP-L1-COMMUNICATION' }],
])
const turns = candidateTurnsFrom([
  { role: 'user', content: 'Open the conversation as the manager and describe the situation in three sentences.' },
  { role: 'assistant', content: 'What do you see?' },
  { role: 'user', content: '[Candidate]: I separated the complaints   from the channel metrics before deciding.' },
])

test('claims: only [Candidate]-prefixed turns count as the candidate\'s words', () => {
  assert.deepEqual(turns, ['I separated the complaints   from the channel metrics before deciding.'])
  const fromPrompt = buildClaim({ claimType: 'OBSERVED_BEHAVIOR', capabilityId: 'CAP-L1-REASONING', text: 'p', evidenceIds: ['evid-1'], status: 'PROVISIONAL', quote: 'describe the situation in three sentences' })
  const { accepted, rejected } = validateClaims([fromPrompt], units, { turns })
  assert.equal(accepted.length, 0)
  assert.equal(rejected[0].reason, 'QUOTE_NOT_VERBATIM')
})

test('claims: stable ids and normalised evidence ids', () => {
  const a = buildClaim({ claimType: 'STRENGTH', capabilityId: 'CAP-L1-REASONING', text: 'Reasoning: Demonstrated.', evidenceIds: ['evid-1', 'evid-1'], status: 'PROVISIONAL' })
  const b = buildClaim({ claimType: 'STRENGTH', capabilityId: 'CAP-L1-REASONING', text: 'Reasoning: Demonstrated.', evidenceIds: ['evid-1'], status: 'PROVISIONAL' })
  assert.equal(a.claim_id, b.claim_id)
  assert.deepEqual(a.evidence_ids, ['evid-1'])
  assert.throws(() => buildClaim({ claimType: 'MAGIC', text: 'x', status: 'SUPPORTED' }))
  assert.throws(() => buildClaim({ claimType: 'STRENGTH', text: ' ', status: 'SUPPORTED' }))
})

test('claims: supported claims need existing evidence of the same capability', () => {
  const ok = buildClaim({ claimType: 'STRENGTH', capabilityId: 'CAP-L1-REASONING', text: 't', evidenceIds: ['evid-1'], status: 'SUPPORTED' })
  const none = buildClaim({ claimType: 'STRENGTH', capabilityId: 'CAP-L1-REASONING', text: 'no ids', status: 'SUPPORTED' })
  const unknown = buildClaim({ claimType: 'STRENGTH', capabilityId: 'CAP-L1-REASONING', text: 'ghost', evidenceIds: ['evid-9'], status: 'SUPPORTED' })
  const mismatch = buildClaim({ claimType: 'STRENGTH', capabilityId: 'CAP-L1-REASONING', text: 'wrong cap', evidenceIds: ['evid-2'], status: 'PROVISIONAL' })
  const { accepted, rejected } = validateClaims([ok, none, unknown, mismatch], units, { turns })
  assert.deepEqual(accepted.map((c) => c.text), ['t'])
  assert.deepEqual(rejected.map((r) => r.reason), ['NO_EVIDENCE_IDS', 'UNKNOWN_EVIDENCE_ID', 'EVIDENCE_CAPABILITY_MISMATCH'])
})

test('claims: an invented quote is rejected; a verbatim quote (whitespace-normalised) passes', () => {
  const real = buildClaim({ claimType: 'OBSERVED_BEHAVIOR', capabilityId: 'CAP-L1-REASONING', text: 'r', evidenceIds: ['evid-1'], status: 'PROVISIONAL', quote: 'separated the complaints from the channel metrics' })
  const invented = buildClaim({ claimType: 'OBSERVED_BEHAVIOR', capabilityId: 'CAP-L1-REASONING', text: 'i', evidenceIds: ['evid-1'], status: 'PROVISIONAL', quote: 'We need to balance short-term ad spend adjustments with our core unit economics.' })
  const { accepted, rejected } = validateClaims([real, invented], units, { turns })
  assert.deepEqual(accepted.map((c) => c.text), ['r'])
  assert.equal(rejected[0].reason, 'QUOTE_NOT_VERBATIM')
})

test('claims: INSUFFICIENT claims need no evidence but may never quote', () => {
  const ins = buildClaim({ claimType: 'INSUFFICIENT', capabilityId: 'CAP-L1-REASONING', text: 'Not enough evidence yet.', status: 'INSUFFICIENT' })
  const insQuote = buildClaim({ claimType: 'INSUFFICIENT', capabilityId: 'CAP-L1-REASONING', text: 'q', status: 'INSUFFICIENT', quote: 'x' })
  const { accepted, rejected } = validateClaims([ins, insQuote], units, { turns })
  assert.equal(accepted.length, 1)
  assert.equal(rejected[0].reason, 'QUOTE_ON_INSUFFICIENT_CLAIM')
})

test('claims: malformed objects are rejected', () => {
  const { rejected } = validateClaims([{ claim_type: 'STRENGTH', status: 'MAYBE' }, null], units)
  assert.deepEqual(rejected.map((r) => r.reason), ['MALFORMED', 'MALFORMED'])
})
