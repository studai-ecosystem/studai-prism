// Track 4 gate tests — multilingual equity + transferability scaffolding.
//
// T4.1: language resolution is flag-gated and untrusted-input-safe; prompt
//       variants exist, version correctly, and extend the canonical base;
//       no language string is hardcoded into scoring logic; provisional
//       marking is structural.
// T4.2: demographic collection is off by default (nothing writes it).
// T4.4: manual renders from data only (vocabulary check at the doc level;
//       generation is exercised by the python tests + prod run).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SUPPORTED_LANGUAGES, resolveLanguage, scoringStatusFor, asrHintFor, languageOptions, isLangEnabled,
} from '../lib/lang.js'
import { loadPrompt, variantName, renderPrompt } from '../engine/prompts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS = join(__dirname, '..', 'prompts')

const NON_ENGLISH = ['hi-en', 'hi', 'ta']
const VARIANT_BASES = ['avatar_system.v1', 'opening_turn.v1', 'judge_full.v1', 'micro_rater.v1']

// ── T4.1: flag-gated, untrusted-safe resolution ──────────────────────────────
test('T4.1: language resolves to en unless PRISM_LANG is on and code is supported', () => {
  delete process.env.PRISM_LANG
  assert.equal(isLangEnabled(), false)
  assert.equal(resolveLanguage('hi'), 'en', 'flag off => always en')
  process.env.PRISM_LANG = 'true'
  try {
    assert.equal(resolveLanguage('hi'), 'hi')
    assert.equal(resolveLanguage('TA '), 'ta', 'normalises case/whitespace')
    assert.equal(resolveLanguage('hi-en'), 'hi-en')
    // Hostile / unsupported input can never escape the whitelist.
    for (const evil of ['fr', 'xx', '../../etc/passwd', 'hi.v1', '__proto__', 42, null, { a: 1 }]) {
      assert.equal(resolveLanguage(evil), 'en', `rejects ${String(evil)}`)
    }
  } finally {
    delete process.env.PRISM_LANG
  }
})

test('T4.1: every non-English language is provisional; English is calibrated', () => {
  assert.equal(scoringStatusFor('en'), 'calibrated')
  for (const lang of NON_ENGLISH) {
    assert.equal(scoringStatusFor(lang), 'provisional_uncalibrated', lang)
  }
  // Unknown codes fail CLOSED to provisional (never silently calibrated).
  assert.equal(scoringStatusFor('xx'), 'provisional_uncalibrated')
  // ASR hints: real ISO codes for hi/ta, auto-detect (null) for code-switched Hinglish.
  assert.equal(asrHintFor('hi'), 'hi')
  assert.equal(asrHintFor('ta'), 'ta')
  assert.equal(asrHintFor('hi-en'), null)
  assert.equal(asrHintFor('en'), 'en')
  // Selector options mark provisional languages for the UI.
  const opts = languageOptions()
  assert.equal(opts.find((o) => o.code === 'en').provisional, false)
  assert.ok(opts.filter((o) => o.provisional).length === 3)
})

// ── T4.1: prompt variants versioned + extending the canonical base ───────────
test('T4.1: all 12 language-variant prompt files exist under the versioning discipline', async () => {
  const files = await readdir(PROMPTS)
  for (const base of VARIANT_BASES) {
    for (const lang of NON_ENGLISH) {
      const expected = `${variantName(base, lang)}.md`
      assert.ok(files.includes(expected), `missing ${expected}`)
    }
  }
  assert.equal(variantName('avatar_system.v1', 'hi'), 'avatar_system.hi.v1')
  assert.equal(variantName('avatar_system.v1', 'en'), 'avatar_system.v1')
})

test('T4.1: variants prepend a language directive and inherit the FULL canonical base', () => {
  for (const base of VARIANT_BASES) {
    const canonical = loadPrompt(base, 'en')
    for (const lang of NON_ENGLISH) {
      const variant = loadPrompt(base, lang)
      assert.ok(variant.includes(canonical.trim().slice(0, 400)), `${base}.${lang} embeds the canonical base`)
      assert.ok(variant.length > canonical.length, `${base}.${lang} adds a directive`)
      assert.notEqual(variant.slice(0, 200), canonical.slice(0, 200), 'directive comes first')
    }
  }
  // A language with no variant file falls back to the base silently.
  assert.equal(loadPrompt('entry_estimator.v1', 'hi'), loadPrompt('entry_estimator.v1'))
})

test('T4.1: judge variants enforce language fairness and keep rubric semantics', () => {
  for (const lang of NON_ENGLISH) {
    const judge = loadPrompt('judge_full.v1', lang)
    assert.ok(/never penalise or reward language/i.test(judge), `${lang}: fairness rule present`)
    assert.ok(judge.toLowerCase().includes('provisional'), `${lang}: provisional stated`)
    assert.ok(judge.includes('{{RUBRIC_BLOCKS}}'), `${lang}: rubric placeholder inherited (semantics unchanged)`)
    assert.ok(judge.includes('{{INJECTION_GUARD}}'), `${lang}: injection guard inherited`)
  }
})

test('T4.1: renderPrompt resolves variants with identical placeholder discipline', () => {
  const vars = {
    PERSONA_BLOCK: '', SCENARIO_TITLE: 't', SCENARIO_DOMAIN: 'd', SCENARIO_CONTEXT: 'c',
    INJECTION_GUARD: 'guard', TRANSCRIPT: 'x', RUBRIC_BLOCKS: 'rubric',
  }
  const en = renderPrompt('judge_full.v1', vars, 'en')
  const hi = renderPrompt('judge_full.v1', vars, 'hi')
  assert.ok(hi.includes('rubric') && en.includes('rubric'))
  assert.ok(hi.includes('CANDIDATE LANGUAGE — HINDI'))
  assert.ok(!en.includes('CANDIDATE LANGUAGE'))
  // Missing placeholder still throws for variants (no silent scoring holes).
  assert.throws(() => renderPrompt('judge_full.v1', { ...vars, TRANSCRIPT: undefined }, 'ta'))
})

// ── T4.1: no language hardcoded into scoring logic ───────────────────────────
test('T4.1: scoring logic contains no hardcoded language directives', async () => {
  // Scoring semantics live in scoreAggregator + judgePanel + sharedConstants.
  // Language is a rendering concern (prompt variants) — these files must not
  // branch on language codes at all.
  for (const f of ['lib/scoreAggregator.js', 'lib/judgePanel.js', 'lib/sharedConstants.js']) {
    const text = await readFile(join(__dirname, '..', f), 'utf-8')
    assert.ok(!/['"](hi|ta|hi-en)['"]/.test(text), `${f} has no language branching`)
    assert.ok(!text.includes('resolveLanguage'), `${f} does not consume language`)
  }
})

// ── T4.2: demographic collection off by default ──────────────────────────────
test('T4.2: nothing in the app writes candidate_demographics (legal-gated, default OFF)', async () => {
  const dirs = ['routes', 'lib', 'engine', 'scoring']
  for (const d of dirs) {
    for (const f of await readdir(join(__dirname, '..', d))) {
      if (!f.endsWith('.js')) continue
      const text = await readFile(join(__dirname, '..', d, f), 'utf-8')
      assert.ok(!/INSERT INTO candidate_demographics/i.test(text), `${d}/${f} must not write demographics`)
    }
  }
  // And the legal flag is documented where an operator will see it.
  const env = await readFile(join(__dirname, '..', '.env.example'), 'utf-8')
  assert.ok(env.includes('LEGAL REVIEW FLAG'))
  assert.ok(/default-off/i.test(env))
})

// ── T4.1: provisional marking is structural in artifacts ─────────────────────
test('T4.1: report + credential schema carry the provisional marking fields', async () => {
  const route = await readFile(join(__dirname, '..', 'routes', 'assessment.js'), 'utf-8')
  assert.ok(route.includes('report.scoring = { language: evalLanguage, status: scoringStatusFor(evalLanguage) }'))
  assert.ok(route.includes('report.percentile = null'), 'English norms are suppressed for uncalibrated languages')
  const schema = JSON.parse(await readFile(join(__dirname, '..', '..', 'docs', 'evidence-bundle-schema-v1.json'), 'utf-8'))
  assert.deepEqual(schema.properties.issued.properties.scoringStatus.enum, ['calibrated', 'provisional_uncalibrated'])
  assert.ok(schema.properties.issued.properties.language)
})
