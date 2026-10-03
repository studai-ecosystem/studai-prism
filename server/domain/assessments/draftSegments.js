// P2.1 — the one DRAFT scenario segment the vertical slice runs on. Synthetic,
// original, domain-light text; status DRAFT and never self-approved. It is
// exposed to the scenario source ONLY when PRISM_DRAFT_CONTENT === 'true'
// (test / local), never by default. A run on this segment is pinned to the
// snapshot hash, so later edits to this file can never rewrite what a stored
// run was measured against.
import { createHash } from 'node:crypto'
import { PRIMARY_CAPABILITY_IDS } from './catalog.js'
import { CORE_TEAMREADY_A, CORE_TEAMREADY_A_ID, CORE_TEAMREADY_A_FORM_ID, UNIVERSAL_RUBRIC_REF } from './universalForm.js'
import { RELEASE_CONFIG_VERSION } from '../release/version.js'

export const DRAFT_SEGMENT_ID = 'draft-core-teamready-a-handover'
export const SLICE_METHOD_VERSION = 'v3-slice-0.1'
export const DRAFT_HANDOVER_RUBRIC_REF = 'draft-handover-rubric.v0.1'
export const DRAFT_EVALUATE_JOB_KIND = 'EVALUATE_RUN'
export const evaluateJobKey = (sessionId) => `evaluate:${sessionId}`

const cap = (suffix) => {
  const id = PRIMARY_CAPABILITY_IDS.find((c) => c.endsWith(suffix))
  if (!id) throw new Error(`draft segment: missing primary capability ${suffix}`)
  return id
}

export const DRAFT_CORE_TEAMREADY_A_HANDOVER = Object.freeze({
  id: DRAFT_SEGMENT_ID,
  version: '0.1.0-draft',
  status: 'DRAFT',
  // P4: this segment is the stage-5 subset of the universal form.
  formRef: { formId: CORE_TEAMREADY_A_FORM_ID, stageId: 'RESOLVE_HANDOVER' },
  title: 'Get the team ready: the final handover',
  publicFacts: [
    'Two colleagues have been preparing a short internal workshop for next week.',
    'The workshop plan board lists the remaining tasks; two tasks have no owner.',
    'One colleague is away from tomorrow and will not be reachable before the workshop.',
    'The room, the invitation list and the printed handouts are the three open items that still matter.',
  ],
  conditionalFacts: [
    { revealWhen: 'CANDIDATE_ASKS_ABOUT_AVAILABILITY', fact: 'The colleague who stays can take at most one extra task this week.' },
    { revealWhen: 'CANDIDATE_ASKS_ABOUT_HANDOUTS', fact: 'The handouts can be printed on the morning of the workshop if someone sends the final file the day before.' },
  ],
  participants: [
    { name: 'Dev', role: 'Workshop co-organiser (leaving tomorrow)', actorKind: 'AI_PARTICIPANT' },
    { name: 'Nia', role: 'Workshop co-organiser (staying)', actorKind: 'AI_PARTICIPANT' },
  ],
  artifactSchema: {
    artifactId: 'HANDOVER-BOARD',
    type: 'PLAN_BOARD',
    title: 'Workshop plan board',
    rows: [
      { task: 'Confirm the room booking', owner: 'Nia', due: 'Monday' },
      { task: 'Send the invitation list', owner: null, due: 'Tuesday' },
      { task: 'Finalise and print the handouts', owner: null, due: 'Thursday' },
    ],
    candidateEditable: ['owner', 'due'],
  },
  allowedEvent: 'FINAL_HANDOVER_CONVERSATION',
  opportunities: [
    { id: 'OPP-CLARIFY', group: 'handover-dialogue', capabilityId: cap('REASONING'), behaviourId: 'BEH-CLARIFY-UNOWNED-WORK', description: 'Notices that tasks lack an owner and asks what is needed before deciding.' },
    { id: 'OPP-BOARD-OWNER', group: 'handover-board', capabilityId: cap('COLLABORATION'), behaviourId: 'BEH-ASSIGN-OWNER-REALISTICALLY', description: 'Changes an owner on the board in a way that respects what each colleague can take on.' },
    { id: 'OPP-HANDOVER', group: 'handover-dialogue', capabilityId: cap('COMMUNICATION'), behaviourId: 'BEH-STATE-HANDOVER-CLEARLY', description: 'States who does what by when so the colleague who stays can act without follow-up questions.' },
  ],
  rubricRef: DRAFT_HANDOVER_RUBRIC_REF,
  knownLimitations: [
    'Synthetic DRAFT content: not reviewed by measurement governance; local and test use only.',
    'Covers three opportunities; it cannot show the full range of any capability on its own.',
    'More than one defensible handover exists; the evaluator must not reward one fixed answer.',
  ],
})

// Hash of the exact snapshot a run was pinned to (key-order independent).
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value === undefined ? null : value)
}
export const snapshotHash = (snapshot) => createHash('sha256').update(canonical(snapshot)).digest('hex')

// P4: the universal form in the snapshot shape the pin, evaluator and
// director share. `universal: true` marks a run as Director-driven; the
// opportunity list carries behaviourIds (plural) and groupId/stageId.
export const UNIVERSAL_SNAPSHOT = Object.freeze({
  id: CORE_TEAMREADY_A_ID,
  version: CORE_TEAMREADY_A.version,
  status: CORE_TEAMREADY_A.status,
  universal: true,
  title: CORE_TEAMREADY_A.title,
  publicFacts: CORE_TEAMREADY_A.publicFacts.map((f) => f.text),
  participants: CORE_TEAMREADY_A.participants.map((p) => ({ name: p.name, role: p.role, actorKind: p.actorKind })),
  artifactSchema: { artifactId: CORE_TEAMREADY_A.board.artifactId, type: CORE_TEAMREADY_A.board.type, title: CORE_TEAMREADY_A.board.title, rows: CORE_TEAMREADY_A.board.rows, candidateEditable: CORE_TEAMREADY_A.board.editable },
  opportunities: CORE_TEAMREADY_A.opportunities.map((o) => ({
    id: o.id, group: o.groupId, groupId: o.groupId, stageId: o.stageId, capabilityId: o.capabilityId,
    behaviourId: o.behaviourIds[0], behaviourIds: o.behaviourIds, description: o.description, required: o.required, accepts: o.accepts,
  })),
  rubricRef: UNIVERSAL_RUBRIC_REF,
  form: CORE_TEAMREADY_A,
})

export const DRAFT_SEGMENTS = Object.freeze({ [DRAFT_SEGMENT_ID]: DRAFT_CORE_TEAMREADY_A_HANDOVER, [CORE_TEAMREADY_A_ID]: UNIVERSAL_SNAPSHOT })
export const draftContentEnabled = () => process.env.PRISM_DRAFT_CONTENT === 'true'
export const draftSegmentFor = (scenarioId) => DRAFT_SEGMENTS[scenarioId] || null
export const isUniversalSnapshot = (snapshot) => Boolean(snapshot?.universal)

// The segment in the shape the scenario bank / catalog already understand
// (a FIXED_FORM definition with one interactive artifact). Nothing private
// (opportunities, rubric reference, conditional facts) is placed where the
// session contract reads briefing/characters/artifacts.
export function draftBankScenarios() {
  if (!draftContentEnabled()) return {}
  const s = DRAFT_CORE_TEAMREADY_A_HANDOVER
  const u = CORE_TEAMREADY_A
  return {
    [u.id]: {
      scenarioId: u.id,
      version: u.version,
      status: u.status,
      title: u.title,
      briefing: {
        background: [u.briefing.background, ...u.publicFacts.map((f) => f.text)].join(' '),
        objective: u.briefing.objective,
        role: u.briefing.role,
        characters: u.participants.map((p) => ({ name: p.name, role: p.role })),
      },
      interactiveArtifacts: [{ artifactId: u.board.artifactId, type: u.board.type, title: u.board.title, data: { rows: u.board.rows.map((r) => ({ ...r })) } }],
      // One dialogue turn per stage: the player's "required exchanges" count.
      probingTree: { turns: u.stages.map((_, i) => ({ turn: i + 1 })) },
    },
    [s.id]: {
      scenarioId: s.id,
      version: s.version,
      status: s.status,
      title: s.title,
      briefing: {
        background: s.publicFacts.join(' '),
        objective: 'Agree a clear handover so the workshop is ready without the colleague who is leaving.',
        role: 'Workshop coordinator',
        characters: s.participants.map((p) => ({ name: p.name, role: p.role })),
      },
      interactiveArtifacts: [{ artifactId: s.artifactSchema.artifactId, type: s.artifactSchema.type, title: s.artifactSchema.title, data: { rows: s.artifactSchema.rows } }],
      probingTree: { turns: s.opportunities.filter((o) => o.group === 'handover-dialogue').map((o, i) => ({ turn: i + 1 })) },
    },
  }
}

// Authored dialogue for the (non-universal) handover segment: a question
// that asks about a conditional fact gets that pinned fact verbatim from the
// staying colleague; anything else gets no participant turn. No model is ever
// asked to speak in a draft run, so no generated text can be shown or rated.
const SEGMENT_QUESTION_CUES = Object.freeze({
  CANDIDATE_ASKS_ABOUT_AVAILABILITY: /\b(availab\w*|capacity|free|extra task|take on|time this week)\b/i,
  CANDIDATE_ASKS_ABOUT_HANDOUTS: /\b(handouts?|print\w*)\b/i,
})
export function answerSegmentQuestion(snapshot, text) {
  if (!snapshot || snapshot.universal || !/\?/.test(String(text || ''))) return []
  const speaker = (snapshot.participants || []).find((p) => /staying/i.test(p.role)) || snapshot.participants?.[0] || null
  return (snapshot.conditionalFacts || [])
    .filter((f) => SEGMENT_QUESTION_CUES[f.revealWhen]?.test(text))
    .map((f) => ({ speaker: speaker?.name || '', role: speaker?.role || null, actorKind: 'AI_PARTICIPANT', content: f.fact, factAnswer: 'AUTHORED' }))
}

// What a run on the segment is pinned to. Stored at start; read at evaluation
// and publication so no later edit can change the measurement conditions.
export function buildRunPin({ formId, engineVersion = 'legacy-engine', scenarioId = DRAFT_SEGMENT_ID }) {
  const snapshot = DRAFT_SEGMENTS[scenarioId]
  if (!snapshot) throw new Error(`buildRunPin: unknown draft scenario ${scenarioId}`)
  // The universal form is pinned by the hash of the full authored form.
  const pinned = snapshot.universal ? snapshot.form : snapshot
  return {
    scenarioId,
    engineVersion,
    formId,
    releaseConfigVersion: RELEASE_CONFIG_VERSION,
    methodVersion: SLICE_METHOD_VERSION,
    rubricRef: snapshot.rubricRef,
    snapshotVersion: snapshot.version,
    snapshotHash: snapshotHash(pinned),
  }
}
