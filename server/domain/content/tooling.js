// P4.8 — content review tooling for authored assessment forms: structured
// version diff, synthetic preview (Director + fact boundary over a canned
// learner script; NO session, NO evidence writes), opportunity coverage
// matrix, exemplar/counterexample attachments, comments, reviewer decisions
// and draft edits that always create a NEW version. Pure where possible;
// persistence sits behind a small store (memory or PostgreSQL).
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '../http/errors.js'
import { selectNext, coverageFrom, appliedWorldChanges, ANSWERED_STATES } from '../assessments/director.js'
import { worldStateFor } from '../assessments/universalForm.js'
import { REVIEW_DECISIONS, REVIEWER_ROLES } from './versions.js'

export const ATTACHMENT_KINDS = Object.freeze(['EXEMPLAR', 'COUNTEREXAMPLE', 'NOTE'])
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

// --- form package schema (draft edit body) --------------------------------------
const Fact = z.object({ id: z.string().min(1), text: z.string().min(1), triggers: z.array(z.string()).optional() }).passthrough()
const Stage = z.object({ id: z.string().min(1), label: z.string().min(1), activity: z.string().min(1), budgetMinutes: z.tuple([z.number(), z.number()]).optional(), worldChangeId: z.string().nullable().optional() }).passthrough()
const Stimulus = z.object({ speaker: z.string().min(1), role: z.string().nullable().optional(), actorKind: z.string().optional(), label: z.string().nullable().optional(), factIds: z.array(z.string()), template: z.string().min(1) }).passthrough()
const Opportunity = z.object({
  id: z.string().min(1), stageId: z.string().min(1), groupId: z.string().min(1), capabilityId: z.string().min(1), behaviourIds: z.array(z.string().min(1)).min(1),
  description: z.string().min(1), required: z.boolean(), accepts: z.array(z.enum(['MESSAGE', 'ARTIFACT'])).min(1), dependsOn: z.array(z.string()), paraphraseOf: z.string().nullable(),
  clarification: z.object({ template: z.string().min(1) }).passthrough().nullable(), aiGenerated: z.boolean(), stimulus: Stimulus,
}).passthrough()
const Behaviour = z.object({ id: z.string().min(1), capabilityId: z.string().min(1), label: z.string().min(1), anchors: z.record(z.string(), z.string()) }).passthrough()
const WorldChange = z.object({ id: z.string().min(1), stageId: z.string().min(1), description: z.string().min(1), setFacts: z.array(Fact), preservesBoard: z.boolean() }).passthrough()
const BoardRow = z.object({ rowId: z.string().min(1), task: z.string().min(1), owner: z.string().nullable(), due: z.string().nullable(), dependency: z.string().nullable(), status: z.string(), rationale: z.string().nullable(), actorKind: z.literal('TEMPLATE') }).passthrough()
const Board = z.object({ artifactId: z.string().min(1), type: z.literal('PLAN_BOARD'), title: z.string().min(1), fields: z.array(z.string()), editable: z.array(z.string()), statuses: z.array(z.string()), owners: z.array(z.string()), rows: z.array(BoardRow) }).passthrough()
export const FormPackageSchema = z.object({
  id: z.string().min(1), version: z.string().regex(VERSION_RE, 'semver-like version required'), status: z.literal('DRAFT'), title: z.string().min(1), blueprintId: z.string().min(1).optional(),
  briefing: z.object({ role: z.string(), background: z.string(), objective: z.string(), responseModes: z.array(z.string()) }).passthrough(),
  publicFacts: z.array(Fact).min(1), conditionalFacts: z.array(Fact), participants: z.array(z.object({ name: z.string().min(1), role: z.string(), actorKind: z.string() }).passthrough()).min(1),
  stages: z.array(Stage).min(1), worldChanges: z.array(WorldChange), opportunities: z.array(Opportunity).min(1), behaviours: z.array(Behaviour).min(1), board: Board,
  rubric: z.object({ ref: z.string().min(1), anchorsByBehaviour: z.record(z.string(), z.record(z.string(), z.string())) }).passthrough(),
  exemplars: z.array(z.object({ kind: z.string(), behaviourId: z.string(), text: z.string(), note: z.string() }).passthrough()),
  director: z.object({ coverageFloorPerFamily: z.number().int().min(1), maxPresentedOpportunities: z.number().int().min(1), maxClarificationsPerOpportunity: z.number().int().min(0) }).passthrough(),
}).passthrough()

// Referential checks the schema alone cannot express.
export function validateFormPackage(body) {
  const parsed = FormPackageSchema.safeParse(body)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '$'}: ${i.message}`)
    throw new ApiError('VALIDATION_FAILED', `Form package is not valid: ${issues.join('; ')}`, { details: { issues } })
  }
  const pkg = parsed.data
  const errors = []
  const stageIds = new Set(pkg.stages.map((s) => s.id))
  const factIds = new Set([...pkg.publicFacts, ...pkg.conditionalFacts, ...pkg.worldChanges.flatMap((w) => w.setFacts)].map((f) => f.id))
  const behaviourIds = new Set(pkg.behaviours.map((b) => b.id))
  const oppIds = new Set(pkg.opportunities.map((o) => o.id))
  for (const o of pkg.opportunities) {
    if (!stageIds.has(o.stageId)) errors.push(`${o.id}: unknown stage ${o.stageId}`)
    for (const b of o.behaviourIds) if (!behaviourIds.has(b)) errors.push(`${o.id}: unknown behaviour ${b}`)
    for (const f of o.stimulus.factIds) if (!factIds.has(f)) errors.push(`${o.id}: unknown fact ${f}`)
    for (const d of o.dependsOn) if (!oppIds.has(d)) errors.push(`${o.id}: dependsOn unknown opportunity ${d}`)
    if (o.paraphraseOf && !oppIds.has(o.paraphraseOf)) errors.push(`${o.id}: paraphraseOf unknown opportunity ${o.paraphraseOf}`)
  }
  for (const s of pkg.stages) if (s.worldChangeId && !pkg.worldChanges.some((w) => w.id === s.worldChangeId)) errors.push(`${s.id}: unknown world change ${s.worldChangeId}`)
  for (const w of pkg.worldChanges) if (!stageIds.has(w.stageId)) errors.push(`${w.id}: unknown stage ${w.stageId}`)
  for (const b of pkg.behaviours) if (!pkg.rubric.anchorsByBehaviour[b.id]) errors.push(`${b.id}: no rubric anchors`)
  if (errors.length) throw new ApiError('VALIDATION_FAILED', `Form package has unresolved references: ${errors.slice(0, 20).join('; ')}`, { details: { issues: errors } })
  return pkg
}

// --- structured diff ------------------------------------------------------------
const byId = (list = [], key = 'id') => new Map(list.map((x) => [x[key], x]))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function diffCollection(from = [], to = [], { key = 'id', fields } = {}) {
  const a = byId(from, key)
  const b = byId(to, key)
  const pick = (x) => (fields ? Object.fromEntries(fields.map((f) => [f, x[f]])) : x)
  const added = [...b.keys()].filter((k) => !a.has(k))
  const removed = [...a.keys()].filter((k) => !b.has(k))
  const changed = [...b.keys()].filter((k) => a.has(k) && !same(pick(a.get(k)), pick(b.get(k)))).map((k) => {
    const before = pick(a.get(k))
    const after = pick(b.get(k))
    const fieldsChanged = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => !same(before[f], after[f]))
    return { id: k, fields: fieldsChanged, before: Object.fromEntries(fieldsChanged.map((f) => [f, before[f] ?? null])), after: Object.fromEntries(fieldsChanged.map((f) => [f, after[f] ?? null])) }
  })
  return { added, removed, changed, unchanged: [...b.keys()].filter((k) => a.has(k) && !changed.some((c) => c.id === k)).length }
}
const factsOf = (p) => [...(p.publicFacts || []).map((f) => ({ ...f, visibility: 'PUBLIC' })), ...(p.conditionalFacts || []).map((f) => ({ ...f, visibility: 'CONDITIONAL' }))]
const anchorsOf = (p) => Object.entries(p.rubric?.anchorsByBehaviour || {}).map(([behaviourId, anchors]) => ({ id: behaviourId, anchors }))

export function diffPackages(from, to) {
  return {
    from: { id: from.id, version: from.version }, to: { id: to.id, version: to.version },
    title: from.title === to.title ? null : { before: from.title, after: to.title },
    facts: diffCollection(factsOf(from), factsOf(to), { fields: ['text', 'triggers', 'visibility'] }),
    stages: diffCollection(from.stages, to.stages, { fields: ['label', 'activity', 'budgetMinutes', 'worldChangeId'] }),
    worldChanges: diffCollection(from.worldChanges, to.worldChanges, { fields: ['stageId', 'description', 'setFacts', 'preservesBoard'] }),
    opportunities: diffCollection(from.opportunities, to.opportunities, { fields: ['stageId', 'groupId', 'capabilityId', 'behaviourIds', 'required', 'accepts', 'dependsOn', 'aiGenerated', 'stimulus', 'clarification', 'description'] }),
    behaviours: diffCollection(from.behaviours, to.behaviours, { fields: ['capabilityId', 'label'] }),
    anchors: diffCollection(anchorsOf(from), anchorsOf(to), { fields: ['anchors'] }),
    board: same(from.board, to.board) ? { changed: false } : { changed: true, rows: diffCollection(from.board?.rows || [], to.board?.rows || [], { key: 'rowId' }) },
    director: same(from.director, to.director) ? { changed: false } : { changed: true, before: from.director || null, after: to.director || null },
  }
}

// --- coverage matrix (P4.5) -----------------------------------------------------
export function coverageMatrix(form) {
  const families = [...new Set((form.opportunities || []).map((o) => o.capabilityId))]
  const floor = form.director?.coverageFloorPerFamily ?? null
  const rows = families.map((capabilityId) => {
    const opps = form.opportunities.filter((o) => o.capabilityId === capabilityId)
    const groups = [...new Set(opps.map((o) => o.groupId))]
    const requiredGroups = [...new Set(opps.filter((o) => o.required).map((o) => o.groupId))]
    return {
      capabilityId, opportunities: opps.map((o) => ({ id: o.id, stageId: o.stageId, groupId: o.groupId, required: o.required, behaviourIds: o.behaviourIds, accepts: o.accepts, dependsOn: o.dependsOn, aiGenerated: o.aiGenerated })),
      groups, distinctGroups: groups.length, requiredGroups: requiredGroups.length, requiredOpportunities: opps.filter((o) => o.required).length, optionalOpportunities: opps.filter((o) => !o.required).length,
      meetsAuthoringFloor: floor == null ? null : requiredGroups.length >= floor,
      behavioursTargeted: [...new Set(opps.flatMap((o) => o.behaviourIds))],
    }
  })
  const behaviours = (form.behaviours || []).map((b) => ({ id: b.id, capabilityId: b.capabilityId, opportunities: form.opportunities.filter((o) => o.behaviourIds.includes(b.id)).map((o) => o.id) }))
  return {
    formId: form.formId || `${form.id}:${form.version}`, authoringFloorPerFamily: floor,
    note: 'Authoring coverage floor only; not the governed evidence sufficiency floor. Counts are opportunities and groups, never a measurement.',
    families: rows, behaviours, untargetedBehaviours: behaviours.filter((b) => !b.opportunities.length).map((b) => b.id),
    stages: (form.stages || []).map((s) => ({ id: s.id, label: s.label, opportunities: form.opportunities.filter((o) => o.stageId === s.id).map((o) => o.id), worldChangeId: s.worldChangeId || null })),
  }
}

// --- synthetic preview (P4.8) ----------------------------------------------------
// Runs the Director and the fact boundary over an in-memory ledger with a
// canned synthetic learner script. Nothing is persisted: no session, no
// actions, no evidence units. The output is marked is_synthetic.
export const SYNTHETIC_SCRIPT = Object.freeze({
  // Learner words are synthetic: plain, defensible, never measurement claims.
  defaultMessage: 'Synthetic preview answer: here is what I would check first and why, with one alternative if that does not work.',
  boardPatch: { 'R2.owner': 'Priya', 'R3.owner': 'You', 'R2.rationale': 'Synthetic preview rationale.' },
})
export function syntheticPreview(form, { script = SYNTHETIC_SCRIPT, seed = 'preview-seed', maxSteps = 40 } = {}) {
  const ledger = new Map(form.opportunities.map((o) => [o.id, { opportunityId: o.id, state: 'PLANNED', actionIds: [], updatedAt: null }]))
  const actions = []
  const stepsOut = []
  const stimuliByStage = Object.fromEntries(form.stages.map((s) => [s.id, []]))
  let tick = 0
  const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick += 1)).toISOString()
  let stop = null
  for (let i = 0; i < maxSteps; i += 1) {
    const rows = [...ledger.values()]
    const next = selectNext({ form, presented: rows, actions, budget: {}, seed })
    if (next.kind === 'STOP') { stop = next; break }
    if (next.kind === 'WAIT') break
    const id = next.kind === 'CLARIFY' ? next.opportunityId : next.opportunity.id
    const o = next.opportunity
    if (!ledger.has(id)) ledger.set(id, { opportunityId: id, state: 'PLANNED', actionIds: [], updatedAt: null })
    const row = ledger.get(id)
    if (!next.stimulus.ok) {
      Object.assign(row, { state: 'REVIEW_REQUIRED', renderHash: next.stimulus.renderHash, issues: next.stimulus.issues, updatedAt: at() })
      stepsOut.push({ step: i + 1, kind: next.kind, opportunityId: id, stageId: o.stageId, status: 'REVIEW_REQUIRED', issues: next.stimulus.issues, renderHash: next.stimulus.renderHash, decision: next.decision })
      continue
    }
    Object.assign(row, { state: 'PRESENTED', renderHash: next.stimulus.renderHash, presentedAt: at() })
    const stimulus = { opportunityId: id, stageId: o.stageId, speaker: next.stimulus.message.speaker, role: next.stimulus.message.role, actorKind: next.stimulus.message.actorKind, aiGenerated: next.stimulus.message.aiGenerated, label: next.stimulus.message.label, content: next.stimulus.message.content, factsUsed: next.stimulus.factsUsed, renderHash: next.stimulus.renderHash, worldChangeId: next.worldChangeId || null }
    stimuliByStage[o.stageId].push(stimulus)
    // Synthetic learner answers in an accepted kind, then the opportunity is served.
    const kind = next.kind === 'CLARIFY' ? 'MESSAGE' : (o.accepts.includes('ARTIFACT') ? 'ARTIFACT' : 'MESSAGE')
    const action = { actionId: `synthetic-${String(actions.length + 1).padStart(3, '0')}`, kind, state: 'APPLIED', sequence: actions.length + 1, is_synthetic: true,
      payload: kind === 'ARTIFACT' ? { artifactId: form.board.artifactId, updates: script.boardPatch } : { text: script.defaultMessage } }
    actions.push(action)
    Object.assign(row, { state: 'ACTION_RECEIVED', actionIds: [action.actionId], updatedAt: at() })
    stepsOut.push({ step: i + 1, kind: next.kind, opportunityId: id, stageId: o.stageId, status: 'PRESENTED', renderHash: next.stimulus.renderHash, decision: next.decision, syntheticAction: { actionId: action.actionId, kind } })
  }
  const rows = [...ledger.values()]
  const coverage = coverageFrom(form, rows)
  const planned = form.opportunities.filter((o) => o.required)
  return {
    is_synthetic: true, formId: form.formId || `${form.id}:${form.version}`, version: form.version, seed,
    note: 'Synthetic preview: no session, no learner, no evidence written. Stimuli are rendered only from permitted facts; nothing here is a measurement.',
    stages: form.stages.map((s) => ({ id: s.id, label: s.label, stimuli: stimuliByStage[s.id] })),
    worldChangesApplied: appliedWorldChanges(form, rows), finalWorldState: worldStateFor(form, { appliedWorldChangeIds: appliedWorldChanges(form, rows) }),
    coverage: Object.fromEntries(Object.entries(coverage).map(([cap, groups]) => [cap, { answeredGroups: groups, floor: form.director.coverageFloorPerFamily, meetsAuthoringFloor: groups >= form.director.coverageFloorPerFamily }])),
    requiredPlanned: planned.length, requiredAnswered: planned.filter((o) => ANSWERED_STATES.has(ledger.get(o.id)?.state)).length,
    renderHashes: rows.filter((r) => r.renderHash).map((r) => ({ opportunityId: r.opportunityId, renderHash: r.renderHash, state: r.state })),
    reviewRequired: rows.filter((r) => r.state === 'REVIEW_REQUIRED').map((r) => ({ opportunityId: r.opportunityId, issues: r.issues })),
    stop: stop ? { reason: stop.reason, partial: stop.partial, review: stop.review } : { reason: 'STEP_LIMIT', partial: [], review: [] },
    steps: stepsOut, syntheticActions: actions.length,
  }
}

// --- review store ------------------------------------------------------------------
const trim = (v, max) => String(v ?? '').trim().slice(0, max)
export function createMemoryReviewStore() {
  const attachments = []
  const comments = []
  const decisions = []
  const drafts = []
  return {
    async addAttachment(row) { attachments.push(row); return row },
    async listAttachments(formId, version) { return attachments.filter((a) => a.formId === formId && a.version === version) },
    async addComment(row) { comments.push(row); return row },
    async listComments(formId, version) { return comments.filter((c) => c.formId === formId && c.version === version) },
    async addDecision(row) { decisions.push(row); return row },
    async listDecisions(formId, version) { return decisions.filter((d) => d.formId === formId && d.version === version) },
    async addDraft(row) { drafts.push(row); return row },
    async listDrafts() { return [...drafts] },
  }
}

const mapAttachment = (r) => ({ id: r.id, formId: r.form_id, version: r.version, kind: r.kind, behaviourId: r.behaviour_id, text: r.text, createdBy: r.created_by, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at })
const mapComment = (r) => ({ id: r.id, formId: r.form_id, version: r.version, author: r.author, text: r.text, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at })
const mapDecision = (r) => ({ id: r.id, formId: r.form_id, version: r.version, reviewerRole: r.reviewer_role, reviewerId: r.reviewer_id, decision: r.decision, reason: r.reason, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at })
export function createPgReviewStore(query) {
  return {
    async addAttachment(a) {
      await query('INSERT INTO content_attachments (id, form_id, version, kind, behaviour_id, text, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [a.id, a.formId, a.version, a.kind, a.behaviourId, a.text, a.createdBy, a.createdAt])
      return a
    },
    async listAttachments(formId, version) { return ((await query('SELECT * FROM content_attachments WHERE form_id = $1 AND version = $2 ORDER BY created_at', [formId, version]))?.rows || []).map(mapAttachment) },
    async addComment(c) {
      await query('INSERT INTO content_comments (id, form_id, version, author, text, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [c.id, c.formId, c.version, c.author, c.text, c.createdAt])
      return c
    },
    async listComments(formId, version) { return ((await query('SELECT * FROM content_comments WHERE form_id = $1 AND version = $2 ORDER BY created_at', [formId, version]))?.rows || []).map(mapComment) },
    async addDecision(d) {
      await query('INSERT INTO content_review_decisions (id, form_id, version, reviewer_role, reviewer_id, decision, reason, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [d.id, d.formId, d.version, d.reviewerRole, d.reviewerId, d.decision, d.reason, d.createdAt])
      return d
    },
    async listDecisions(formId, version) { return ((await query('SELECT * FROM content_review_decisions WHERE form_id = $1 AND version = $2 ORDER BY created_at', [formId, version]))?.rows || []).map(mapDecision) },
    async addDraft(d) {
      await query('INSERT INTO content_form_drafts (form_id, content_id, version, derived_from, package_json, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [d.formId, d.contentId, d.version, d.derivedFrom, JSON.stringify(d.pkg), d.createdBy, d.createdAt])
      return d
    },
    async listDrafts() {
      return ((await query('SELECT * FROM content_form_drafts ORDER BY created_at'))?.rows || []).map((r) => ({ formId: r.form_id, contentId: r.content_id, version: r.version, derivedFrom: r.derived_from, pkg: r.package_json, createdBy: r.created_by, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at }))
    },
  }
}

// --- service --------------------------------------------------------------------------
export function createContentTooling({ registry, store = createMemoryReviewStore(), clock = () => new Date() }) {
  let hydrated = false
  // Draft versions persisted by earlier processes are appended to the
  // in-process registry once (module content is already there).
  async function hydrate() {
    if (hydrated) return
    hydrated = true
    for (const d of await store.listDrafts()) {
      if (!registry.hasVersion(d.contentId, d.version)) registry.addDraftVersion({ contentId: d.contentId, version: d.version, pkg: d.pkg, actor: { id: d.createdBy }, derivedFrom: d.derivedFrom, at: new Date(d.createdAt) })
    }
  }
  const actorId = (actor) => actor?.id || actor?.email || null
  const versionOf = async (contentId, version) => { await hydrate(); return registry.getVersion(contentId, version) }
  return {
    hydrate,
    async getVersion(contentId, version) { return versionOf(contentId, version) },
    async diff(contentId, from, to) {
      if (!from || !to) throw new ApiError('VALIDATION_FAILED', 'Both from and to versions are required.')
      const [a, b] = await Promise.all([versionOf(contentId, from), versionOf(contentId, to)])
      return diffPackages(a.package, b.package)
    },
    async coverage(contentId, version) {
      const v = version ? await versionOf(contentId, version) : await latest(contentId)
      return coverageMatrix(v.package)
    },
    async preview(contentId, version, { seed } = {}) {
      const v = version ? await versionOf(contentId, version) : await latest(contentId)
      if (!v.package.director) throw new ApiError('VALIDATION_FAILED', 'Only Director-driven universal forms can be previewed.')
      return syntheticPreview(v.package, seed ? { seed: trim(seed, 64) } : {})
    },
    async addAttachment(contentId, version, { kind, behaviourId = null, text }, actor) {
      const v = await versionOf(contentId, version)
      if (!ATTACHMENT_KINDS.includes(kind)) throw new ApiError('VALIDATION_FAILED', `kind must be one of ${ATTACHMENT_KINDS.join(', ')}.`)
      if (trim(text, 4000).length < 3) throw new ApiError('VALIDATION_FAILED', 'Attachment text is required.')
      if (behaviourId && !(v.package.behaviours || []).some((b) => b.id === behaviourId)) throw new ApiError('VALIDATION_FAILED', `Unknown behaviour ${behaviourId} in this version.`)
      if (kind !== 'NOTE' && !behaviourId) throw new ApiError('VALIDATION_FAILED', 'An exemplar or counterexample must name the behaviour it illustrates.')
      return store.addAttachment({ id: randomUUID(), formId: v.formId, version, kind, behaviourId: behaviourId || null, text: trim(text, 4000), createdBy: actorId(actor), createdAt: clock().toISOString() })
    },
    async listAttachments(contentId, version) { const v = await versionOf(contentId, version); return store.listAttachments(v.formId, version) },
    async addComment(contentId, version, { text }, actor) {
      const v = await versionOf(contentId, version)
      if (trim(text, 4000).length < 2) throw new ApiError('VALIDATION_FAILED', 'Comment text is required.')
      return store.addComment({ id: randomUUID(), formId: v.formId, version, author: actorId(actor), text: trim(text, 4000), createdAt: clock().toISOString() })
    },
    async listComments(contentId, version) { const v = await versionOf(contentId, version); return store.listComments(v.formId, version) },
    async addDecision(contentId, version, { reviewerRole, decision, reason }, actor) {
      const v = await versionOf(contentId, version)
      if (!REVIEWER_ROLES[reviewerRole]) throw new ApiError('VALIDATION_FAILED', `reviewerRole must be one of ${Object.keys(REVIEWER_ROLES).join(', ')}.`)
      if (!REVIEW_DECISIONS.includes(decision)) throw new ApiError('VALIDATION_FAILED', `decision must be one of ${REVIEW_DECISIONS.join(', ')}.`)
      if (trim(reason, 2000).length < 10) throw new ApiError('VALIDATION_FAILED', 'A reason of at least 10 characters is required.')
      const perms = actor?.permissions instanceof Set ? actor.permissions : new Set(actor?.permissions || [])
      if (!REVIEWER_ROLES[reviewerRole].some((p) => perms.has(p))) throw new ApiError('FORBIDDEN', `Your roles do not include the ${reviewerRole} reviewer role.`)
      if (!actorId(actor)) throw new ApiError('FORBIDDEN', 'A signed-in reviewer is required.')
      return store.addDecision({ id: randomUUID(), formId: v.formId, version, reviewerRole, reviewerId: actorId(actor), decision, reason: trim(reason, 2000), createdAt: clock().toISOString() })
    },
    async listDecisions(contentId, version) { const v = await versionOf(contentId, version); return store.listDecisions(v.formId, version) },
    // Transition with the pilot gate read from recorded decisions.
    async transition(contentId, formId, { to, reason }, actor) {
      await hydrate()
      const version = formId.includes(':') ? formId.slice(formId.indexOf(':') + 1) : null
      const decisions = version && registry.hasVersion(contentId, version) ? await store.listDecisions(formId, version) : []
      return registry.transition({ formId, to, actor, reason, decisions })
    },
    // Draft edit: validate, then append a NEW version. The source package is
    // never mutated; a version id that already exists is a conflict.
    async createDraft(contentId, body, actor) {
      await hydrate()
      const pkg = validateFormPackage(body?.package ?? body)
      if (pkg.id !== contentId) throw new ApiError('VALIDATION_FAILED', `Package id ${pkg.id} does not match form ${contentId}.`)
      const derivedFrom = typeof body?.derivedFrom === 'string' ? body.derivedFrom : null
      if (derivedFrom && !registry.hasVersion(contentId, derivedFrom)) throw new ApiError('VALIDATION_FAILED', `derivedFrom version ${derivedFrom} does not exist.`)
      const created = registry.addDraftVersion({ contentId, version: pkg.version, pkg: Object.freeze(pkg), actor, derivedFrom, at: clock() })
      await store.addDraft({ formId: created.formId, contentId, version: pkg.version, derivedFrom, pkg, createdBy: actorId(actor), createdAt: clock().toISOString() })
      return created
    },
  }
  async function latest(contentId) {
    await hydrate()
    const versions = registry.listVersions(contentId)
    return registry.getVersion(contentId, versions[versions.length - 1].version)
  }
}
