// Control Centre Phase 3 — unit tests (no database).
//
// Prompt-file parsing (every real file in server/prompts must parse), variable
// extraction, the prompt lifecycle machine, and the ship-dark contract for the
// Phase 3 namespaces. (The permission-key source scan in adminPhase2.test.js
// automatically covers the new routers too.)

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.PRISM_ADMIN_CONSOLE
delete process.env.PRISM_ADMIN_PROMPT_REGISTRY

const {
  parsePromptFilename, extractVariables, listPromptFiles,
  PROMPT_STATUSES, PROMPT_TRANSITIONS, canTransitionPrompt, isPromptRegistryRuntime,
} = await import('../lib/promptRegistry.js')
const { buildApp } = await import('../app.js')

test('parsePromptFilename handles base, language-variant and json fragments', () => {
  assert.deepEqual(parsePromptFilename('avatar_system.v1.md'), {
    name: 'avatar_system', language: 'en', version: 'v1', kind: 'md',
  })
  assert.deepEqual(parsePromptFilename('avatar_system.hi.v1.md'), {
    name: 'avatar_system', language: 'hi', version: 'v1', kind: 'md',
  })
  assert.deepEqual(parsePromptFilename('opening_turn.hi-en.v1.md'), {
    name: 'opening_turn', language: 'hi-en', version: 'v1', kind: 'md',
  })
  assert.deepEqual(parsePromptFilename('dimension_rubric.v1.json'), {
    name: 'dimension_rubric', language: 'en', version: 'v1', kind: 'json',
  })
  assert.equal(parsePromptFilename('README.md'), null, 'non-versioned files are ignored')
  assert.equal(parsePromptFilename('notes.txt'), null)
})

test('every real prompt file parses and the registry seed set is non-trivial', () => {
  const files = listPromptFiles()
  assert.ok(files.length >= 10, `expected the full prompt bank, found ${files.length}`)
  for (const f of files) {
    assert.ok(f.name && f.version && f.kind, `${f.file} parsed incompletely`)
    assert.ok(f.template.length > 0, `${f.file} is empty`)
    if (f.kind === 'json') assert.doesNotThrow(() => JSON.parse(f.template), `${f.file} is not valid JSON`)
  }
  // The canonical judge prompt must be in the set (scoring depends on it).
  assert.ok(files.some((f) => f.name === 'judge_full'), 'judge_full missing from the bank')
})

test('extractVariables finds {{PLACEHOLDERS}}, deduped and sorted', () => {
  const vars = extractVariables('Hello {{NAME}}, {{SCENARIO_CONTEXT}} and {{NAME}} again; not {{lower}} or {plain}')
  assert.deepEqual(vars, ['NAME', 'SCENARIO_CONTEXT'])
  assert.deepEqual(extractVariables('no vars'), [])
})

test('prompt lifecycle machine: production is reachable only through approval path', () => {
  assert.ok(canTransitionPrompt('draft', 'testing'))
  assert.ok(canTransitionPrompt('testing', 'approved'))
  assert.ok(canTransitionPrompt('approved', 'production'))
  assert.ok(canTransitionPrompt('production', 'rolled_back'))
  assert.ok(canTransitionPrompt('deprecated', 'production'), 'rollback re-promotion')
  assert.ok(!canTransitionPrompt('draft', 'production'), 'no draft→production shortcut')
  assert.ok(!canTransitionPrompt('draft', 'approved'), 'testing cannot be skipped')
  assert.ok(!canTransitionPrompt('rolled_back', 'production'), 'rolled-back versions stay dead')
  for (const [from, targets] of Object.entries(PROMPT_TRANSITIONS)) {
    assert.ok(PROMPT_STATUSES.includes(from))
    for (const to of targets) assert.ok(PROMPT_STATUSES.includes(to), `${from}→${to}`)
  }
})

test('prompt registry runtime is OFF by default (files stay the source of truth)', () => {
  assert.equal(isPromptRegistryRuntime(), false)
})

test('Phase 3 namespaces are dark without PRISM_ADMIN_CONSOLE', async () => {
  const app = buildApp()
  const server = app.listen(0)
  const port = server.address().port
  try {
    for (const path of [
      '/api/admin/bank/scenarios', '/api/admin/calibrations', '/api/admin/raters',
      '/api/admin/studies', '/api/admin/prompts', '/api/admin/psychometrics',
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      assert.equal(res.status, 404, `${path} must be dark`)
    }
  } finally {
    server.close()
  }
})
