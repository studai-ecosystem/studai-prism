// Charter MASTER-2026-08-04 §5 — identity-isolation regression suite.
//
// The invariant under test: no conversational, judging, micro-rating,
// director, estimator or calibration model payload may contain the
// candidate's actual name, email or other direct identity signal.
//
//   1. Prompt-side: the avatar system prompt (all languages) carries the
//      neutral token, never the name.
//   2. Post-generation: token → display-name substitution is deterministic
//      and candidate-facing only.
//   3. Scoring-side: judge transcripts, rater material and dual-scorer turns
//      are scrubbed of token AND literal names (legacy histories included).
//   4. Structural: source scans pin the call sites so a refactor cannot
//      silently reconnect identity to a model payload.
//   5. Invariance: candidate name/avatar choice changes ONLY the
//      personalization block — never scenario stimulus or rubric wording.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CANDIDATE_TOKEN,
  renderCandidateText,
  renderParsedTurn,
  scrubCandidateIdentity,
  tokenizeForModel,
} from '../lib/identityIsolation.js'
import {
  ACTIVE_SCENARIOS,
  buildAvatarSystemPrompt,
  buildScoringPrompt,
  buildJudgeTranscript,
} from '../routes/assessment.js'
import { microRateTurn } from '../engine/microRater.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scenario = ACTIVE_SCENARIOS[0]
const NAMES = ['Sneha', "D'Souza-Iyer Jr.", 'प्रिया शर्मा', 'Mohammed Al Farsi']
const LANGS = ['en', 'hi', 'hi-en', 'ta']

// ── 1. Prompt-side: no name in any avatar system prompt ─────────────────────
// Scenario casts use common Indian names, so a candidate can legitimately
// share a name with a CHARACTER. The invariant is therefore: personalization
// must never ADD the candidate's name to the prompt — any name part absent
// from the plain prompt stays absent from the personalized one.
test('§5: avatar system prompt never contains the candidate name (all languages)', () => {
  for (const name of NAMES) {
    for (const lang of LANGS) {
      const plain = buildAvatarSystemPrompt(scenario, 1, lang)
      const p = buildAvatarSystemPrompt(scenario, 1, lang, { candidateName: name, characterId: 'priya' })
      for (const part of name.split(/[\s.'-]+/).filter((x) => x.length >= 2)) {
        const re = new RegExp(`(?<![\\p{L}\\p{M}])${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`, 'iu')
        if (re.test(plain)) continue // pre-existing cast/scenario word — not identity leakage
        assert.ok(!re.test(p), `${lang}: name part "${part}" leaked into avatar prompt`)
      }
      assert.ok(p.includes(CANDIDATE_TOKEN), `${lang}: neutral token missing when name provided`)
    }
  }
})

test('§5: judge scoring prompt is personalization-blind by construction', () => {
  const t = 'CANDIDATE: I would talk to the vendor first.'
  const a = buildScoringPrompt(scenario, t)
  // buildScoringPrompt takes no personalization input at all — same transcript
  // in, byte-identical rubric/prompt out. (Names in transcripts are killed by
  // buildJudgeTranscript before this point.)
  assert.equal(a, buildScoringPrompt(scenario, t))
  assert.ok(!a.includes(CANDIDATE_TOKEN))
})

// ── 2. Post-generation substitution ──────────────────────────────────────────
test('§5: renderCandidateText substitutes deterministically, strips when no name', () => {
  assert.equal(renderCandidateText(`Nice point, ${CANDIDATE_TOKEN}. What next?`, 'Sneha'), 'Nice point, Sneha. What next?')
  assert.equal(
    renderCandidateText(`${CANDIDATE_TOKEN}, welcome. ${CANDIDATE_TOKEN} — your view?`, 'Ravi'),
    'Ravi, welcome. Ravi — your view?',
  )
  // No name known → the token disappears cleanly, never surfaces to a candidate.
  const stripped = renderCandidateText(`Nice point, ${CANDIDATE_TOKEN}. What next?`, null)
  assert.ok(!stripped.includes('{{'), 'token must not survive rendering')
  assert.ok(stripped.includes('Nice point'))
  // Deterministic and non-mutating for parsed turns.
  const parsed = { messages: [{ speaker: 'Latha', role: 'PM', content: `Hi ${CANDIDATE_TOKEN}!` }] }
  const rendered = renderParsedTurn(parsed, 'Sneha')
  assert.equal(rendered.messages[0].content, 'Hi Sneha!')
  assert.equal(parsed.messages[0].content, `Hi ${CANDIDATE_TOKEN}!`, 'stored history object stays tokenized')
})

// ── 3. Scoring-side scrubbing ────────────────────────────────────────────────
test('§5: scrubCandidateIdentity removes token, full names and name parts', () => {
  for (const name of NAMES) {
    const scrubbed = scrubCandidateIdentity(`Well said, ${name}. Also ${CANDIDATE_TOKEN} agreed.`, name)
    for (const part of name.split(/[\s.'-]+/).filter((x) => x.length >= 2)) {
      const re = new RegExp(`(?<![\\p{L}\\p{M}])${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`, 'iu')
      assert.ok(!re.test(scrubbed), `"${part}" survived scrubbing`)
    }
    assert.ok(!scrubbed.includes('{{'), 'token survived scrubbing')
    assert.ok(scrubbed.includes('CANDIDATE'), 'neutral label substituted')
  }
  // Word-boundary safety: short name parts never mangle ordinary words.
  assert.equal(scrubCandidateIdentity('The program ran.', 'Ram'), 'The program ran.')
})

test('§5: judge transcript carries no identity — token-native AND legacy histories', () => {
  const name = 'Sneha Kulkarni'
  const history = [
    { role: 'user', content: '[Candidate]: opening prompt' },
    // Token-native (v3) avatar line:
    { role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'Latha', role: 'PM', content: `Good point, ${CANDIDATE_TOKEN}. Costs?` }] }) },
    // Candidate self-identifying in their own words:
    { role: 'user', content: `[Candidate]: I'm Sneha and I would phone the supplier.` },
    // LEGACY (pre-v3) avatar line carrying the real name verbatim:
    { role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'Joshi', role: 'Finance', content: 'Sneha Kulkarni, the budget is fixed.' }] }) },
  ]
  const t = buildJudgeTranscript(history, name)
  assert.ok(!t.includes('Sneha'), 'name leaked into judge transcript')
  assert.ok(!t.includes('Kulkarni'), 'surname leaked into judge transcript')
  assert.ok(!t.includes('{{'), 'token leaked into judge transcript')
  assert.ok(t.includes('CANDIDATE:'), 'candidate turns keep the neutral label')
  assert.ok(t.includes('LATHA (PM)'), 'avatar structure preserved')
})

test('§5: micro-rater payload contains no identity when given scrubbed input', async () => {
  const name = 'Sneha'
  const capture = []
  const fakeCompletion = async (payload) => {
    capture.push(JSON.stringify(payload))
    return { choices: [{ message: { content: '{"criticalThinking":2}' } }] }
  }
  await microRateTurn(scrubCandidateIdentity(`I'm ${name}; I would escalate.`, name), {
    createCompletion: fakeCompletion,
    model: 'test-model',
  })
  assert.equal(capture.length, 1)
  assert.ok(!capture[0].includes(name), 'name reached the micro-rater payload')
})

// ── 4. Structural source scans (refactor-proofing) ──────────────────────────
function source(rel) {
  return readFileSync(join(__dirname, '..', rel), 'utf8')
}

test('§5: call sites stay wired — source scan', () => {
  const route = source('routes/assessment.js')
  assert.ok(/microRateTurn\(scrubCandidateIdentity\(message,\s*candidateName\)/.test(route), 'micro-rater input must be scrubbed')
  assert.ok(/buildJudgeTranscript\(history,\s*candidateName\)/.test(route), 'judge transcript must be built via the scrubbing helper')
  assert.ok(/renderParsedTurn\(parsed,\s*candidateName\)/.test(route), 'candidate-facing turns must be rendered app-side')
  assert.ok(/tokenizeForModel\(m\.content,\s*candidateName\)/.test(route), 'conversation context must be tokenized')
  assert.ok(!/Their name is \$\{/.test(route), 'the old name-injecting candidate line must not return')
  // /calibrate (entry estimator) runs BEFORE a name exists: the handler must
  // not reference candidate identity at all.
  const calibrate = route.slice(route.indexOf("router.post('/calibrate'"), route.indexOf("router.post('/consent'"))
  assert.ok(!/candidateName|userEmail/.test(calibrate), 'entry-estimator path must not touch identity')
})

test('§5: prompt files carry the token convention, never a name slot', () => {
  for (const f of ['avatar_system.v3.md', 'avatar_system.hi.v3.md', 'avatar_system.hi-en.v3.md', 'avatar_system.ta.v3.md']) {
    const text = readFileSync(join(__dirname, '..', 'prompts', f), 'utf8')
    if (!f.includes('.hi') && !f.includes('.ta')) {
      assert.ok(text.includes('{{candidate}}'), `${f}: token rule missing`)
      assert.ok(text.includes('NEVER invent or guess'), `${f}: anti-fabrication rule missing`)
    } else {
      assert.ok(text.startsWith('@extends avatar_system.v3'), `${f}: must extend the v3 base`)
    }
  }
})

// ── 5. Invariance: personalization changes ONLY the candidate block ─────────
test('§5: name/avatar choice cannot alter scenario stimulus or any other prompt line', () => {
  for (const s of ACTIVE_SCENARIOS) {
    const plain = buildAvatarSystemPrompt(s, 1, 'en')
    const plainLines = new Set(plain.split('\n'))
    for (const [name, char] of [['Sneha', 'priya'], ['Mohammed Al Farsi', 'ravi']]) {
      const personal = buildAvatarSystemPrompt(s, 1, 'en', { candidateName: name, characterId: char })
      const extra = personal.split('\n').filter((line) => !plainLines.has(line))
      // Every added line belongs to the personalization block — nothing else moved.
      for (const line of extra) {
        assert.ok(
          line.includes('THE CANDIDATE YOU ARE TALKING TO')
            || line.includes(CANDIDATE_TOKEN)
            || line.includes('represented in this room'),
          `${s.id}: unexpected prompt change outside the personalization block: "${line}"`,
        )
      }
      // The scenario stimulus is byte-identical in both prompts.
      assert.ok(personal.includes(s.context), `${s.id}: stimulus altered by personalization`)
    }
  }
})
