// Candidate personalization (cohort feedback 2026-08): the Briefing name and
// chosen character now reach the avatar system prompt. These tests pin the
// security boundary (the name is candidate-authored text landing inside a
// SYSTEM prompt) and the display-only scenario role line.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVE_SCENARIOS,
  buildAvatarSystemPrompt,
  sanitizeCandidateName,
} from '../routes/assessment.js'

const scenario = ACTIVE_SCENARIOS[0]

test('sanitizeCandidateName: keeps real names, strips everything else', () => {
  assert.equal(sanitizeCandidateName('Sneha'), 'Sneha')
  assert.equal(sanitizeCandidateName("  D'Souza-Iyer Jr.  "), "D'Souza-Iyer Jr.")
  assert.equal(sanitizeCandidateName('प्रिया शर्मा'), 'प्रिया शर्मा', 'unicode letters survive')
  // Injection / structure characters can never reach the system prompt.
  assert.equal(sanitizeCandidateName('a{{P1_NAME}}b'), 'a P NAME b', 'template braces stripped')
  assert.ok(!/[{}<>:;"\d]/.test(sanitizeCandidateName('x</candidate_turn>{{X}}: "system:" 42') || ''))
  // Length cap.
  assert.ok((sanitizeCandidateName('a'.repeat(200)) || '').length <= 40)
  // Empty / all-garbage input resolves to null (no personalization).
  assert.equal(sanitizeCandidateName(''), null)
  assert.equal(sanitizeCandidateName('12345 !!! ###'), null)
  assert.equal(sanitizeCandidateName(undefined), null)
  assert.equal(sanitizeCandidateName({ evil: true }), null)
})

test('avatar prompt: personalization block appears only when provided', () => {
  const plain = buildAvatarSystemPrompt(scenario, 1, 'en')
  assert.ok(!plain.includes('THE CANDIDATE YOU ARE TALKING TO'), 'no block without personalization')
  assert.ok(!plain.includes('{{'), 'no unfilled placeholders')

  const personal = buildAvatarSystemPrompt(scenario, 1, 'en', { candidateName: 'Sneha', characterId: 'priya' })
  assert.ok(personal.includes('THE CANDIDATE YOU ARE TALKING TO'))
  assert.ok(personal.includes('Their name is Sneha'))
  assert.ok(personal.includes('The Creator'), 'server-side character trait is used')
  assert.ok(!personal.includes('{{'), 'no unfilled placeholders')
})

test('avatar prompt: unknown or hostile characterId is ignored', () => {
  for (const evil of ['__proto__', 'constructor', 'hacker', '', null, 42]) {
    const p = buildAvatarSystemPrompt(scenario, 1, 'en', { candidateName: null, characterId: evil })
    assert.ok(!p.includes('THE CANDIDATE YOU ARE TALKING TO'), `characterId ${String(evil)} must be ignored`)
    assert.ok(!p.includes('undefined'), 'no undefined leaks into the prompt')
  }
})

test('avatar prompt: continuity rules present in v2', () => {
  const p = buildAvatarSystemPrompt(scenario, 1, 'en')
  assert.ok(p.includes('RE-READ the entire conversation'))
  assert.ok(p.includes('NEVER ask about anything the candidate has already answered'))
})

test('every active scenario carries a display-only yourRole line', () => {
  for (const s of ACTIVE_SCENARIOS) {
    assert.equal(typeof s.yourRole, 'string', `${s.id} missing yourRole`)
    assert.ok(s.yourRole.length >= 20, `${s.id} yourRole too short`)
    // Display-only: the avatar prompt must NOT contain it (stimulus unchanged).
    const p = buildAvatarSystemPrompt(s, 1, 'en')
    assert.ok(!p.includes(s.yourRole), `${s.id} yourRole leaked into the prompt`)
  }
})
