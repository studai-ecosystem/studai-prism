// P6.2 — the ten starter missions: two fully authored DRAFT missions per
// family, original content, unique ids and display codes, behaviour ids from
// the universal-form catalogue, exposure tags that name real form
// opportunities, three scaffold hints and a reflection prompt each; every
// published/stored version is immutable and the handover v1 content is
// byte-identical to what was shipped in P2.8.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MISSION_LIBRARY, P6_LIBRARY } from '../domain/development/missionLibrary.js'
import { parseMission } from '../domain/development/missionSchema.js'
import { initialWork, runDeterministicChecks, candidateTextFor } from '../domain/development/validators.js'
import { BEHAVIOUR_IDS, CORE_TEAMREADY_A, FAMILY } from '../domain/assessments/universalForm.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createDevelopmentService } from '../domain/development/service.js'

const FORM_OPPS = new Set(CORE_TEAMREADY_A.opportunities.map((o) => o.id))

test('P6.2: ten DRAFT original missions, two per family, every one parses and starts empty', () => {
  assert.equal(P6_LIBRARY.length, 10)
  const codes = P6_LIBRARY.map((m) => m.display_code)
  assert.deepEqual(codes, ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10'])
  assert.equal(new Set(P6_LIBRARY.map((m) => m.mission_id)).size, 10, 'mission ids are unique')
  const perFamily = new Map(PRIMARY_CAPABILITY_IDS.map((id) => [id, 0]))
  for (const raw of P6_LIBRARY) {
    const m = parseMission(raw)
    assert.equal(m.status, 'DRAFT', `${m.display_code} is DRAFT until a human approves it`)
    assert.equal(m.source, 'ORIGINAL')
    assert.ok(perFamily.has(m.target_capability_id), `${m.display_code} targets a primary family`)
    perFamily.set(m.target_capability_id, perFamily.get(m.target_capability_id) + 1)
    // Behaviour ids come from the form catalogue (1–2 per mission).
    assert.ok(m.form_behaviour_ids.length >= 1 && m.form_behaviour_ids.length <= 2)
    for (const b of m.form_behaviour_ids) assert.ok(BEHAVIOUR_IDS.includes(b), `${m.display_code}: ${b} is a form behaviour`)
    // Exposure tags name real form opportunities.
    assert.ok(m.exposure_tags.length >= 1)
    for (const t of m.exposure_tags) assert.ok(FORM_OPPS.has(t), `${m.display_code}: exposure tag ${t} is a form opportunity`)
    // Authoring completeness.
    assert.ok(m.why_it_matters && m.reflection_prompt && m.retry_variation, `${m.display_code} has why/reflection/variation`)
    assert.ok(m.rubric.criteria.length >= 3 && m.rubric.criteria.length <= 4, `${m.display_code} has 3–4 criteria`)
    assert.equal(m.scaffolding_policy.hints.length, 3, `${m.display_code} has three scaffold hints`)
    assert.ok(m.estimated_duration.minutes >= 5)
    assert.ok(m.accessibility_mode.untimed)
    // P6.8: every claim is checked by a method that can establish it. Every
    // mission has a MEANING check; a deterministic rule exists only where the
    // claim is structural (see missionMeaning.test.js for the reviewed list).
    const kinds = new Set(m.rubric.criteria.map((c) => c.check))
    assert.ok(kinds.has('MEANING'), `${m.display_code} has at least one meaning check`)
    for (const c of m.rubric.criteria) if (c.check === 'MEANING') assert.ok(c.meaning.synonyms.length >= 3 && c.evaluator_guidance)
    // Starting state demonstrates nothing and nothing is quotable.
    const start = initialWork(m)
    assert.ok([...runDeterministicChecks(m, start).values()].every((r) => !r.observed), `${m.display_code}: untouched work passes no rule`)
    assert.equal(candidateTextFor(m, start, m.artifacts.map((a) => a.artifact_id)).length, 0)
    // No percentages, levels or scores in learner-facing copy.
    const text = JSON.stringify([m.title, m.scenario_context, m.instructions, m.why_it_matters, m.reflection_prompt, m.scaffolding_policy.hints, m.rubric.criteria.map((c) => c.description)])
    assert.ok(!/\d+\s*%|\blevel\s*\d|\bscore\b|readiness|verified skills/i.test(text), `${m.display_code} copy stays under the claims ceiling`)
  }
  assert.deepEqual([...perFamily.values()], [2, 2, 2, 2, 2], 'two missions per family')
  assert.equal(perFamily.get(FAMILY.COMMUNICATION), 2)
})

test('P6.2: (mission, version) pairs are unique and the handover v1 is unchanged by its v2 metadata revision', () => {
  const pairs = MISSION_LIBRARY.map((m) => `${m.mission_id}:${m.version}`)
  assert.equal(new Set(pairs).size, pairs.length)
  const v1 = MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-CORE-HANDOVER-01' && m.version === 1)
  const v2 = MISSION_LIBRARY.find((m) => m.mission_id === 'MIS-CORE-HANDOVER-01' && m.version === 2)
  assert.ok(v1 && v2)
  assert.equal(v1.display_code, undefined, 'v1 carries no P6 field')
  assert.equal(v2.display_code, 'M04')
  for (const k of ['title', 'scenario_context', 'instructions', 'artifacts', 'deterministic_validation_rules', 'rubric', 'scaffolding_policy']) {
    assert.deepEqual(v2[k], v1[k], `${k} is identical in v2`)
  }
  assert.ok(Object.isFrozen(MISSION_LIBRARY))
  assert.ok(Object.isFrozen(v2))
  // The published legacy mission keeps its original content/version.
  const mkt = MISSION_LIBRARY.filter((m) => m.mission_id === 'MIS-MKT-EXP-01')
  assert.equal(mkt.length, 1)
  assert.equal(mkt[0].version, 1)
  assert.equal(mkt[0].status, 'PUBLISHED')
})

test('P6.2: a stored version is immutable (same version, different body is refused); drafts are dark by default and never recommended', async () => {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T09:00:00Z') })
  const svc = createDevelopmentService({ repos })
  await svc.ensureSeeded()
  const stored = await repos.development.getMissionVersion('MIS-CORE-MISSING-FACT-01', 1)
  assert.equal(stored.status, 'DRAFT')
  assert.equal(stored.publishedAt, null)
  await assert.rejects(
    repos.development.seedMissionVersion({ ...stored, content: { ...stored.content, title: 'Edited' }, contentHash: 'different' }),
    (e) => e.code === 'CONFLICT',
  )
  // Without PRISM_DRAFT_CONTENT nothing but the published mission is reachable; with it, drafts open but are never recommended.
  const user = { id: 'u-lib', name: 'Lib' }
  const ws = { id: 'personal', type: 'PERSONAL' }
  const prior = process.env.PRISM_DRAFT_CONTENT
  delete process.env.PRISM_DRAFT_CONTENT
  try {
    const dark = await svc.listMissions(user, ws)
    assert.deepEqual(dark.items.map((m) => m.id), ['MIS-MKT-EXP-01'])
    assert.deepEqual(dark.allowance, { kind: 'UNLIMITED' })
    process.env.PRISM_DRAFT_CONTENT = 'true'
    const lit = await svc.listMissions(user, ws)
    assert.equal(lit.items.length, 11)
    assert.equal(lit.items.filter((m) => m.status === 'DRAFT').length, 10)
    assert.deepEqual(lit.items.find((m) => m.id === 'MIS-CORE-HANDOVER-01').version, 3, 'the latest draft version is served')
    const plan = await svc.planFor(user, ws, PRIMARY_CAPABILITY_IDS.map((capabilityId) => ({ capabilityId })))
    assert.deepEqual(plan.recommended.map((m) => m.id), [], 'DRAFT missions are never recommended, even for matching priorities')
    assert.equal(plan.catalogue.length, 11)
    assert.ok(plan.catalogue.every((c) => Array.isArray(c.modes) && c.modes.includes('GUIDED')))
  } finally {
    if (prior === undefined) delete process.env.PRISM_DRAFT_CONTENT; else process.env.PRISM_DRAFT_CONTENT = prior
  }
})
