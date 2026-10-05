// P4.1–P4.5 — the canonical ORIGINAL universal assessment form
// CORE-TEAMREADY-A, draft revision 0.1 ("Get the team ready"). Synthetic,
// domain-light, status DRAFT and never self-approved: it reaches the scenario
// source only when PRISM_DRAFT_CONTENT === 'true' and is pinned per run by
// snapshot hash (draftSegments.js). Published content is immutable: a change
// is a new version, never an edit of this object (deep-frozen at load).
//
// Numbers in the facts are scenario content, not measurement thresholds.
// Nothing here is a validated score; behaviour ids are proposed authoring
// behaviours and the private rubric anchors are a DRAFT revision.
import { PRIMARY_CAPABILITY_IDS } from './catalog.js'
import { DRAFT_UNIVERSAL } from './timingPolicy.js'

export const CORE_TEAMREADY_A_ID = 'draft-core-teamready-a'
export const CORE_TEAMREADY_A_VERSION = '0.2.0-draft'
export const CORE_TEAMREADY_A_V1_FORM_ID = `${CORE_TEAMREADY_A_ID}:0.1.0-draft`
export const CORE_TEAMREADY_A_FORM_ID = `${CORE_TEAMREADY_A_ID}:${CORE_TEAMREADY_A_VERSION}`
export const UNIVERSAL_RUBRIC_REF = 'draft-teamready-rubric.v0.1'
export const BOARD_ARTIFACT_ID = 'TEAMREADY-BOARD'

const cap = (suffix) => {
  const id = PRIMARY_CAPABILITY_IDS.find((c) => c.endsWith(suffix))
  if (!id) throw new Error(`universal form: missing primary capability ${suffix}`)
  return id
}
export const FAMILY = Object.freeze({
  REASONING: cap('REASONING'), COMMUNICATION: cap('COMMUNICATION'), COLLABORATION: cap('COLLABORATION'),
  ADAPTABILITY: cap('ADAPTABILITY'), EXECUTION: cap('EXECUTION'),
})

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

// --- P4.4 behaviour catalogue (20 proposed authoring behaviours) -------------
const anchors = (l1, l2, l3, l4, l5) => ({ 1: l1, 2: l2, 3: l3, 4: l4, 5: l5 })
export const BEHAVIOURS = deepFreeze([
  { id: 'QUESTION_ASSUMPTION', capabilityId: FAMILY.REASONING, label: 'Asks relevant questions and separates facts from assumptions', anchors: anchors('Treats every statement as settled fact.', 'Notices one assumption but does not act on it.', 'Names an assumption and asks a question that could settle it.', 'Separates several facts from assumptions and asks the question that matters most.', 'Does so and states what would change if the assumption were wrong.') },
  { id: 'COMPARE_ALTERNATIVES', capabilityId: FAMILY.REASONING, label: 'Weighs workable alternatives', anchors: anchors('Commits to the first idea without comparison.', 'Mentions a second option without weighing it.', 'Compares two viable options on a relevant criterion.', 'Compares options on the constraints that matter and explains the trade-off.', 'Does so and names when the other option would become better.') },
  { id: 'CHECK_EVIDENCE', capabilityId: FAMILY.REASONING, label: 'Verifies conflicting information against known facts', anchors: anchors('Accepts the supplied claim as given.', 'Expresses doubt without pointing to a fact.', 'Identifies the specific fact the claim conflicts with.', 'Identifies the conflict and says what to check or who to ask.', 'Does so and adjusts the plan proportionately to what the check would show.') },
  { id: 'STATE_UNCERTAINTY', capabilityId: FAMILY.REASONING, label: 'Explains what is uncertain and why', anchors: anchors('Presents guesses as certainties.', 'Says "not sure" without saying about what.', 'Names what is uncertain.', 'Names what is uncertain and how it affects the decision.', 'Does so and proposes a bounded way to reduce the uncertainty.') },
  { id: 'STATE_MAIN_POINT', capabilityId: FAMILY.COMMUNICATION, label: 'Makes the main point clear in the supported response mode', anchors: anchors('The main point cannot be found.', 'The main point is present but buried or contradicted.', 'The main point is clear.', 'The main point is clear and the reason for it is given.', 'Clear, reasoned, and the reader knows what to do next.') },
  { id: 'ADAPT_TO_AUDIENCE', capabilityId: FAMILY.COMMUNICATION, label: 'Adjusts what is said to who is listening', anchors: anchors('Repeats internal detail regardless of audience.', 'Changes tone but not content.', 'Selects what the audience needs to know.', 'Selects and orders content for the audience and omits what they cannot act on.', 'Does so and anticipates the audience\'s likely question.') },
  { id: 'CHECK_UNDERSTANDING', capabilityId: FAMILY.COMMUNICATION, label: 'Checks that the message landed', anchors: anchors('Assumes understanding.', 'Asks a generic "ok?"', 'Restates or asks a specific check.', 'Confirms the specific point that was at risk of being misunderstood.', 'Does so and corrects the misunderstanding that surfaces.') },
  { id: 'CLARIFY_REQUEST', capabilityId: FAMILY.COMMUNICATION, label: 'Resolves an important ambiguity before acting', anchors: anchors('Acts on an ambiguous request without noticing.', 'Notices ambiguity but guesses.', 'Asks a question that resolves the ambiguity.', 'Asks the question and states the interpretation being used meanwhile.', 'Does so and proposes how to avoid the ambiguity next time.') },
  { id: 'UNDERSTAND_CONCERN', capabilityId: FAMILY.COLLABORATION, label: 'Engages with what a colleague is worried about', anchors: anchors('Ignores or dismisses the concern.', 'Acknowledges the concern in passing.', 'Restates the concern accurately.', 'Restates it and addresses the part that is legitimate.', 'Does so and adjusts the plan or explains clearly why not.') },
  { id: 'DISAGREE_CONSTRUCTIVELY', capabilityId: FAMILY.COLLABORATION, label: 'Disagrees without requiring compliance or pretending agreement', anchors: anchors('Gives way or overrides without reasons.', 'States disagreement without reasons.', 'Gives a reason for the disagreement.', 'Gives a reason and proposes a way to decide.', 'Does so and keeps the working relationship explicit and intact.') },
  { id: 'NEGOTIATE_BOUNDARY', capabilityId: FAMILY.COLLABORATION, label: 'Sets or accepts a limit on what can be taken on', anchors: anchors('Accepts everything or refuses everything.', 'Hints at a limit.', 'States a limit clearly.', 'States a limit and offers what can be done instead.', 'Does so and agrees who decides if the limit is tested.') },
  { id: 'ACKNOWLEDGE_CONTRIBUTION', capabilityId: FAMILY.COLLABORATION, label: 'Recognises what others have done', anchors: anchors('Claims or ignores others\' work.', 'Generic thanks.', 'Names a specific contribution.', 'Names it and builds on it.', 'Does so in a way the colleague can act on.') },
  { id: 'UPDATE_WITH_EVIDENCE', capabilityId: FAMILY.ADAPTABILITY, label: 'Revises for a relevant reason', anchors: anchors('Keeps the plan regardless of the new fact.', 'Changes the plan for no stated reason.', 'Changes the relevant part of the plan.', 'Changes the relevant part and keeps what is still valid.', 'Does so and says what else would need to change if the new fact changes again.') },
  { id: 'REPLAN_CONSTRAINT', capabilityId: FAMILY.ADAPTABILITY, label: 'Re-plans under a new constraint', anchors: anchors('No re-plan.', 'Re-plans by wishful thinking.', 'Re-plans within the constraint.', 'Re-plans and states the cost (scope, time, quality).', 'Does so and offers a defensible alternative such as postponement or reduced scope.') },
  { id: 'SEEK_HELP', capabilityId: FAMILY.ADAPTABILITY, label: 'Gets needed support', anchors: anchors('Never asks when needed.', 'Asks vaguely.', 'Asks a specific person for a specific thing.', 'Asks and says what happens if help is not available.', 'Does so and bounds the request.') },
  { id: 'REPAIR_MISTAKE', capabilityId: FAMILY.ADAPTABILITY, label: 'Repairs an error', anchors: anchors('Denies or hides the error.', 'Acknowledges without repairing.', 'Acknowledges and corrects.', 'Corrects and checks for knock-on effects.', 'Does so and says what will prevent it recurring.') },
  { id: 'PRIORITIZE_WORK', capabilityId: FAMILY.EXECUTION, label: 'Orders work by what matters', anchors: anchors('No order.', 'Order without reason.', 'Order with a reason tied to the goal.', 'Order with reasons tied to constraints and dependencies.', 'Does so and names what will be dropped if time runs out.') },
  { id: 'ASSIGN_RESPONSIBILITY', capabilityId: FAMILY.EXECUTION, label: 'Gives each task a realistic owner', anchors: anchors('Tasks remain unowned.', 'Owners assigned without regard to capacity.', 'Owners assigned to real people with capacity.', 'Owners assigned with a stated reason.', 'Does so and names a fallback for the risky task.') },
  { id: 'CHECK_DEPENDENCY', capabilityId: FAMILY.EXECUTION, label: 'Sequences work by dependency', anchors: anchors('Dependencies ignored.', 'One dependency noted.', 'Dependencies noted and the sequence follows them.', 'Dependencies noted with the earliest point each can start.', 'Does so and flags the one that could block everything.') },
  { id: 'DEFINE_COMPLETION', capabilityId: FAMILY.EXECUTION, label: 'Says what done looks like', anchors: anchors('No completion check.', '"Done when done".', 'An observable completion check per task.', 'Completion checks someone else could verify.', 'Does so and names who verifies.') },
])
export const BEHAVIOUR_IDS = Object.freeze(BEHAVIOURS.map((b) => b.id))
const behaviour = (id) => {
  const b = BEHAVIOURS.find((x) => x.id === id)
  if (!b) throw new Error(`universal form: unknown behaviour ${id}`)
  return b
}

// --- facts --------------------------------------------------------------------
const PUBLIC_FACTS = [
  { id: 'F-PARTICIPANTS', text: '24 participants are expected.', triggers: ['participant', 'how many people', 'attendees', 'headcount', 'confirmed number', 'the number', 'is 24', '24 confirmed', 'estimate', 'how many are'] },
  { id: 'F-FACILITATORS', text: 'Two facilitators (Priya and Sam) will run the workshop.', triggers: ['facilitator', 'who runs', 'who is running'] },
  { id: 'F-PREP-DAYS', text: 'There are two working days to prepare.', triggers: ['how long', 'how much time', 'days to prepare', 'deadline', 'when is'] },
  { id: 'F-VENUE', text: 'The venue has basic equipment: tables, chairs, one screen and a whiteboard.', triggers: ['what equipment', 'which equipment', 'is there a projector', 'does the venue have', 'what does the venue', 'what is in the room'] },
  { id: 'F-OPEN-TASKS', text: 'Three preparation tasks are still open: confirm the venue setup, prepare participant materials, and confirm the participant list and needs.', triggers: ['open task', 'outstanding', 'what is left', 'remaining'] },
  { id: 'F-PRIORITIES', text: 'Two legitimate priorities compete: reaching as many participants as possible, and supporting each participant well.', triggers: ['priorit', 'what matters most', 'the goal', 'which goal', 'compete', 'trade-off', 'tradeoff'] },
]
const CONDITIONAL_FACTS = [
  { id: 'CF-FACILITATOR-HOURS', text: 'Each facilitator can give about half a day to preparation on each of the two days.', triggers: ['available', 'availability', 'capacity', 'how much can', 'hours'] },
  { id: 'CF-PRINTING', text: 'Materials can be printed on the morning of the workshop if the final file is ready the day before.', triggers: ['print', 'handout', 'materials ready'] },
  { id: 'CF-ROOM-CAPACITY', text: 'The venue seats up to 30 people at tables.', triggers: ['capacity', 'fit', 'seats', 'how many fit'] },
]

// --- plan board (P4.3) ---------------------------------------------------------
export const BOARD_FIELDS = Object.freeze(['task', 'owner', 'due', 'dependency', 'status', 'rationale'])
export const BOARD_EDITABLE_FIELDS = Object.freeze(['owner', 'due', 'dependency', 'status', 'rationale'])
export const BOARD_STATUSES = Object.freeze(['PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE'])
export const BOARD_OWNERS = Object.freeze(['You', 'Priya', 'Sam', 'Unassigned'])
const BOARD = {
  artifactId: BOARD_ARTIFACT_ID,
  type: 'PLAN_BOARD',
  title: 'Shared preparation board',
  fields: BOARD_FIELDS,
  editable: BOARD_EDITABLE_FIELDS,
  statuses: BOARD_STATUSES,
  owners: BOARD_OWNERS,
  // Seeded, deliberately incomplete; every seeded row is TEMPLATE-attributed
  // and never counted as learner work.
  rows: [
    { rowId: 'R1', task: 'Confirm the venue setup', owner: 'Sam', due: 'Day 1 morning', dependency: null, status: 'PLANNED', rationale: null, actorKind: 'TEMPLATE' },
    { rowId: 'R2', task: 'Prepare participant materials', owner: null, due: null, dependency: null, status: 'PLANNED', rationale: null, actorKind: 'TEMPLATE' },
    { rowId: 'R3', task: 'Confirm the participant list and needs', owner: null, due: null, dependency: null, status: 'PLANNED', rationale: null, actorKind: 'TEMPLATE' },
  ],
}

// --- participants --------------------------------------------------------------
const PARTICIPANTS = [
  { name: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', concerns: ['Wants a plan everyone can see and act on.', 'Worried about the open tasks with no owner.'], knows: ['F-OPEN-TASKS', 'F-PREP-DAYS', 'CF-PRINTING'], permittedReactions: ['ask for a decision', 'offer to take one task', 'disagree with reasons', 'agree and confirm'] },
  { name: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', concerns: ['Wants the room and materials to actually work on the day.', 'Does not want to be the default owner of everything.'], knows: ['F-VENUE', 'CF-ROOM-CAPACITY', 'CF-FACILITATOR-HOURS'], permittedReactions: ['raise a practical constraint', 'decline politely with a reason', 'propose an alternative', 'agree and confirm'] },
]
// A third person appears only as a short authored message.
const THIRD_PERSON_MESSAGE = { name: 'Ade', role: 'Programme contact (message only)', actorKind: 'AI_PARTICIPANT', optional: true, text: 'Quick note from Ade: the programme office only needs to know by the end of Day 1 whether the workshop goes ahead as planned or at reduced scope. Either is fine.' }

// --- stages (P4.2) ------------------------------------------------------------
const STAGES = [
  { id: 'UNDERSTAND', label: 'Understand', activity: 'Inspect the brief, ask clarifying questions and separate facts from assumptions.', budgetMinutes: [3, 4] },
  { id: 'CHOOSE_COORDINATE', label: 'Choose and coordinate', activity: 'Compare viable approaches, propose responsibilities and respond to a colleague\'s challenge.', budgetMinutes: [4, 5] },
  { id: 'RESPOND_TO_CHANGE', label: 'Respond to changed constraints', activity: 'One facilitator becomes unavailable for part of the preparation; re-plan without erasing earlier work.', budgetMinutes: [3, 4], worldChangeId: 'WC-FACILITATOR-UNAVAILABLE' },
  { id: 'CHECK_RECOMMENDATION', label: 'Check a recommendation', activity: 'Inspect a supplied AI-generated recommendation that conflicts with an explicit fact.', budgetMinutes: [3, 4] },
  { id: 'RESOLVE_HANDOVER', label: 'Resolve handover ambiguity', activity: 'Two colleagues interpret a responsibility differently; clarify and coordinate.', budgetMinutes: [3, 4] },
  { id: 'FINISH_WORK', label: 'Finish usable work', activity: 'Finalise the board and explain the plan to a different audience.', budgetMinutes: [3, 4] },
]
const WORLD_CHANGES = [
  {
    id: 'WC-FACILITATOR-UNAVAILABLE',
    stageId: 'RESPOND_TO_CHANGE',
    description: 'Sam is unavailable for the afternoon of Day 1.',
    setFacts: [
      { id: 'F-FACILITATORS', text: 'Two facilitators (Priya and Sam) will run the workshop, but Sam is now unavailable for the afternoon of Day 1.' },
      { id: 'F-FACILITATOR-CHANGE', text: 'New: Sam cannot work on preparation during the afternoon of Day 1. Your board is unchanged; revise it if you need to.', triggers: ['sam unavailable', 'sam available', 'sam availability', 'availability', 'what changed', 'afternoon'] },
    ],
    preservesBoard: true,
  },
]

// --- opportunity matrix (P4.5) -------------------------------------------------
const opp = (o) => ({ required: true, accepts: ['MESSAGE'], dependsOn: [], paraphraseOf: null, clarification: null, aiGenerated: false, ...o })
const OPPORTUNITIES = [
  // Stage 1
  opp({ id: 'OPP-REASON-FACTS-ASSUMPTIONS', stageId: 'UNDERSTAND', groupId: 'G-UNDERSTAND-FACTS', capabilityId: FAMILY.REASONING, behaviourIds: ['QUESTION_ASSUMPTION'],
    description: 'Separates what the brief states from what is assumed, and asks what is needed before planning.',
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-PARTICIPANTS', 'F-FACILITATORS', 'F-PREP-DAYS', 'F-OPEN-TASKS'], template: 'Here is where we are: {{F-PARTICIPANTS}} {{F-FACILITATORS}} {{F-PREP-DAYS}} {{F-OPEN-TASKS}} Before we plan, what do you want to check or ask?' },
    clarification: { template: 'Just so we are talking about the same thing: is there anything in the brief you want confirmed, or anything you think we are assuming?' } }),
  opp({ id: 'OPP-COMM-CLARIFY-BRIEF', stageId: 'UNDERSTAND', groupId: 'G-UNDERSTAND-CLARIFY', capabilityId: FAMILY.COMMUNICATION, behaviourIds: ['CLARIFY_REQUEST'], required: false,
    description: 'Resolves an ambiguity in the brief before acting on it.',
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-PRIORITIES'], template: '{{F-PRIORITIES}} People keep saying "make it work for everyone" and I am not sure what that means in practice. How do you read it?' } }),
  // Stage 2
  opp({ id: 'OPP-REASON-OPTIONS', stageId: 'CHOOSE_COORDINATE', groupId: 'G-CHOOSE-OPTIONS', capabilityId: FAMILY.REASONING, behaviourIds: ['COMPARE_ALTERNATIVES'],
    description: 'Compares at least two viable approaches to preparing in the available time.',
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-PREP-DAYS', 'F-PRIORITIES'], template: '{{F-PREP-DAYS}} {{F-PRIORITIES}} We could run one full session for everyone, or two shorter sessions with smaller groups, or trim the content. Which way would you go, and why?' } }),
  opp({ id: 'OPP-EXEC-BOARD-OWNERS', stageId: 'CHOOSE_COORDINATE', groupId: 'G-INITIAL-BOARD', capabilityId: FAMILY.EXECUTION, behaviourIds: ['ASSIGN_RESPONSIBILITY', 'PRIORITIZE_WORK'], accepts: ['ARTIFACT', 'MESSAGE'],
    description: 'Gives the open tasks realistic owners and an order on the shared board.',
    reviewReadiness: { all: ['R2.owner', 'R3.owner'], any: ['R2.due', 'R3.due', 'R2.dependency', 'R3.dependency'] },
    reactions: {
      OVERLOADED_SAM: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', content: 'I only have the morning available, and the room setup is already assigned to me. Which of the remaining tasks should take priority?', factAnswer: 'AUTHORED' },
      FEASIBLE_ALLOCATION: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', content: 'That allocation works with the responsibilities already on the board. Let us use it as the plan.' },
    },
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-OPEN-TASKS'], template: '{{F-OPEN-TASKS}} Two of those have no owner on the board. Can you update the board with who does what, and in what order?' } }),
  opp({ id: 'OPP-COMM-PLAN-EXPLAIN', stageId: 'CHOOSE_COORDINATE', groupId: 'G-INITIAL-BOARD', capabilityId: FAMILY.COMMUNICATION, behaviourIds: ['STATE_MAIN_POINT'], dependsOn: ['OPP-EXEC-BOARD-OWNERS'],
    description: 'Explains the board decisions so a colleague knows what to do next. Dependent on the board change in the same group.',
    stimulus: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', factIds: [], template: 'I have seen the board change. In a few sentences: what is the plan and what do you need from me first?' } }),
  opp({ id: 'OPP-COLLAB-PUSHBACK', stageId: 'CHOOSE_COORDINATE', groupId: 'G-CHOOSE-PUSHBACK', capabilityId: FAMILY.COLLABORATION, behaviourIds: ['UNDERSTAND_CONCERN', 'DISAGREE_CONSTRUCTIVELY'],
    description: 'Responds to a colleague\'s challenge without dismissing it or simply giving way.',
    stimulus: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-VENUE'], template: 'Honestly, I think the materials are a distraction. {{F-VENUE}} I would rather spend the time making sure the room works and skip printed materials altogether. Convince me, or tell me I am right.' } }),
  // Stage 3
  opp({ id: 'OPP-ADAPT-REPLAN', stageId: 'RESPOND_TO_CHANGE', groupId: 'G-CHANGE-REPLAN', capabilityId: FAMILY.ADAPTABILITY, behaviourIds: ['REPLAN_CONSTRAINT', 'SEEK_HELP'],
    description: 'Re-plans under the lost facilitator time; postponement, reduced scope or asking for help may all be defensible.',
    reactions: {
      HELP_REQUEST: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', content: 'I can take the part you asked for. Keep the board aligned with that revised responsibility.' },
      DECISION: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', content: 'That is a workable response to the time we still have. Update the board if any responsibility or due point moved.' },
      REFUSAL: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', content: 'Understood. If the current scope is not workable, make the boundary explicit and say what should be postponed or reduced.', continue: true },
      SAM_AFTERNOON_CONFLICT: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', content: 'I cannot take preparation work that afternoon. Choose a morning task for me, move it to someone else, or reduce the scope.', factAnswer: 'ALREADY_GIVEN' },
    },
    stimulus: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-FACILITATOR-CHANGE'], template: 'Change of plan on my side: {{F-FACILITATOR-CHANGE}} What do you want to do about it?' } }),
  opp({ id: 'OPP-COLLAB-PRIORITY-ALIGN', stageId: 'RESPOND_TO_CHANGE', groupId: 'G-CHANGE-PRIORITY', capabilityId: FAMILY.COLLABORATION, behaviourIds: ['NEGOTIATE_BOUNDARY'], required: false,
    description: 'Agrees a limit on what can be taken on now that time is shorter.',
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-PRIORITIES'], template: 'With less time, {{F-PRIORITIES}} Which one gives, and how much of it are you willing to take on yourself?' } }),
  opp({ id: 'OPP-EXEC-DEPENDENCY-UPDATE', stageId: 'RESPOND_TO_CHANGE', groupId: 'G-CHANGE-DEPENDENCY', capabilityId: FAMILY.EXECUTION, behaviourIds: ['CHECK_DEPENDENCY'], required: false, accepts: ['ARTIFACT', 'MESSAGE'],
    description: 'Updates due points and dependencies on the board after the change without erasing earlier work.',
    reviewReadiness: { any: ['R1.due', 'R2.due', 'R3.due', 'R1.dependency', 'R2.dependency', 'R3.dependency'] },
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: [], template: 'Does anything on the board need to move now? Update the due points or dependencies if so.' } }),
  // Stage 4
  opp({ id: 'OPP-REASON-CHECK-RECOMMENDATION', stageId: 'CHECK_RECOMMENDATION', groupId: 'G-CHECK-AI', capabilityId: FAMILY.REASONING, behaviourIds: ['CHECK_EVIDENCE', 'STATE_UNCERTAINTY'], aiGenerated: true,
    description: 'Checks an explicitly AI-generated recommendation against the known facts and says what is uncertain.',
    stimulus: { speaker: 'Planning assistant', role: 'AI-generated recommendation', actorKind: 'SYSTEM', label: 'AI-generated recommendation', factIds: ['F-PARTICIPANTS', 'F-VENUE'], template: 'AI-generated recommendation (not checked by a person): "Book the venue for 40 participants and rely on the venue\'s projector for the materials, so nothing needs printing." For reference, the brief says: {{F-PARTICIPANTS}} {{F-VENUE}} Do you accept this recommendation?' } }),
  opp({ id: 'OPP-ADAPT-FACT-MISMATCH-REVISION', stageId: 'CHECK_RECOMMENDATION', groupId: 'G-CHECK-REVISION', capabilityId: FAMILY.ADAPTABILITY, behaviourIds: ['UPDATE_WITH_EVIDENCE'], required: false,
    description: 'Revises the plan in light of the factual mismatch, keeping what is still valid.',
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: [], template: 'Given what you just found, does anything in our plan change?' } }),
  // Stage 5
  opp({ id: 'OPP-COLLAB-HANDOVER-DISAGREEMENT', stageId: 'RESOLVE_HANDOVER', groupId: 'G-HANDOVER-DISAGREE', capabilityId: FAMILY.COLLABORATION, behaviourIds: ['DISAGREE_CONSTRUCTIVELY', 'ACKNOWLEDGE_CONTRIBUTION'],
    description: 'Two colleagues read "prepare participant materials" differently; clarifies and coordinates.',
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-OPEN-TASKS'], template: 'Sam thinks "prepare participant materials" means a one-page agenda. I thought it meant the full worksheet pack. {{F-OPEN-TASKS}} We cannot both be right. How do you want to settle it?' } }),
  opp({ id: 'OPP-COMM-AMBIGUITY-CLARIFY', stageId: 'RESOLVE_HANDOVER', groupId: 'G-HANDOVER-CHECK', capabilityId: FAMILY.COMMUNICATION, behaviourIds: ['CHECK_UNDERSTANDING'], required: false,
    description: 'Checks that both colleagues now share the same understanding.',
    stimulus: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', factIds: [], template: 'OK. So to be clear, what exactly am I producing and by when?' } }),
  // Stage 6
  opp({ id: 'OPP-ADAPT-FEEDBACK', stageId: 'FINISH_WORK', groupId: 'G-FINISH-FEEDBACK', capabilityId: FAMILY.ADAPTABILITY, behaviourIds: ['REPAIR_MISTAKE', 'UPDATE_WITH_EVIDENCE'],
    description: 'Responds to relevant feedback that the board has an inconsistency, and repairs it.',
    statefulStimuli: {
      boardConsistent: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-PREP-DAYS'], template: 'I checked the board against the available time: {{F-PREP-DAYS}} I cannot see a timing or dependency conflict. Is it workable as written, or would you still change anything?' },
    },
    stimulus: { speaker: 'Sam', role: 'Operations colleague', actorKind: 'AI_PARTICIPANT', factIds: ['F-PREP-DAYS'], template: 'One thing: {{F-PREP-DAYS}} Something on the board is due after the workshop starts, or depends on a task that finishes later. Can you fix it, or tell me if I have misread the board?' } }),
  opp({ id: 'OPP-EXEC-BOARD-FINAL', stageId: 'FINISH_WORK', groupId: 'G-FINAL', capabilityId: FAMILY.EXECUTION, behaviourIds: ['DEFINE_COMPLETION', 'CHECK_DEPENDENCY'], accepts: ['ARTIFACT', 'MESSAGE'],
    description: 'Finalises the board: owners, due points, dependencies, status and what done looks like.',
    reviewReadiness: { all: ['R1.owner', 'R2.owner', 'R3.owner', 'R1.due', 'R2.due', 'R3.due'], edited: ['R1.status', 'R2.status', 'R3.status'] },
    stimulus: { speaker: 'Priya', role: 'Coordinating colleague', actorKind: 'AI_PARTICIPANT', factIds: [], template: 'Last pass on the board: make it something we can run from without asking you questions. Status and how we know each task is done, please.' } }),
  opp({ id: 'OPP-COMM-HANDOVER-AUDIENCE', stageId: 'FINISH_WORK', groupId: 'G-FINAL', capabilityId: FAMILY.COMMUNICATION, behaviourIds: ['ADAPT_TO_AUDIENCE', 'STATE_MAIN_POINT'], dependsOn: ['OPP-EXEC-BOARD-FINAL'],
    description: 'Explains the final plan to the programme contact, who needs a decision, not internal detail. Dependent on the final board change in the same group.',
    stimulus: { speaker: 'Ade', role: 'Programme contact (message only)', actorKind: 'AI_PARTICIPANT', factIds: [], template: 'Message from Ade: I only need to know whether the workshop goes ahead as planned or at reduced scope, and whether you need anything from the programme office. What should I tell them?' } }),
]

// --- exemplars and counterexamples (P4.4) -----------------------------------------
const EXEMPLARS = [
  { kind: 'CONCISE_EFFECTIVE', behaviourId: 'STATE_MAIN_POINT', text: 'Plan: Sam sets up the room Day 1 morning, I confirm the list today, Priya does materials Day 2. Sam, I need the seat count from you first.', note: 'Short, clear, actionable. Bullets are not required.' },
  { kind: 'VERBOSE_EMPTY', behaviourId: 'STATE_MAIN_POINT', text: 'There are many things to consider here and it is important that we align on the overall approach, taking into account all stakeholders and ensuring robust communication going forward.', note: 'Counterexample: fluent, long, says nothing actionable. Length and jargon earn nothing.' },
  { kind: 'SPOKEN_PHRASING', behaviourId: 'QUESTION_ASSUMPTION', text: 'ok so hang on — 24 people, is that confirmed or is it who signed up? cos if half dont show the room thing changes', note: 'Spoken, informal, lower-case: still a clear separation of fact from assumption.' },
  { kind: 'NON_NATIVE_CONSTRUCTION', behaviourId: 'REPLAN_CONSTRAINT', text: 'Sam not available afternoon, so I move the room setup to morning and materials I do myself in afternoon. If not finish, we print less copies.', note: 'Understandable non-native construction; re-plan is complete and states the cost.' },
  { kind: 'RESPECTFUL_REFUSAL', behaviourId: 'NEGOTIATE_BOUNDARY', text: 'I can take the participant list but not the materials as well — both by tomorrow is not realistic. If materials matter more, give me that and let Priya take the list.', note: 'Refusing part of the work with a reason and an alternative is defensible, not a failure.' },
  { kind: 'UNCERTAIN_CAREFUL', behaviourId: 'STATE_UNCERTAINTY', text: 'I am not sure the venue screen works with a laptop — I have not seen it. Until Sam checks, I would plan for printed materials as the fallback.', note: 'Names what is uncertain, its effect, and a bounded way to reduce it.' },
  { kind: 'REPAIRED_MISTAKE', behaviourId: 'REPAIR_MISTAKE', text: 'You are right, I put the materials due after the workshop starts. Moving it to Day 2 morning; that means printing moves to the day itself, which the venue allows.', note: 'Acknowledges, corrects, and checks the knock-on effect.' },
  { kind: 'WORKABLE_ALTERNATIVE_A', behaviourId: 'COMPARE_ALTERNATIVES', text: 'Two shorter sessions would support people better but double the setup; one session reaches everyone at once. With two days I would run one session and keep materials minimal.', note: 'One of several defensible answers.' },
  { kind: 'WORKABLE_ALTERNATIVE_B', behaviourId: 'COMPARE_ALTERNATIVES', text: 'I would postpone by a day if the programme office allows it. Rushing both the room and the materials risks both; a day later we do both properly.', note: 'Postponement is a defensible alternative, not a wrong answer.' },
  { kind: 'WORKABLE_ALTERNATIVE_C', behaviourId: 'COMPARE_ALTERNATIVES', text: 'Reduce scope: 24 people, one room, agenda on the whiteboard, no printed pack. Then the only critical task is the room.', note: 'Reduced scope is a defensible alternative.' },
]

export const CORE_TEAMREADY_A_V1 = deepFreeze({
  id: CORE_TEAMREADY_A_ID,
  formId: CORE_TEAMREADY_A_V1_FORM_ID,
  blueprintId: 'CORE-TEAMREADY-A',
  version: '0.1.0-draft',
  status: 'DRAFT',
  title: 'Get the team ready',
  briefing: {
    role: 'Team coordinator',
    background: 'You are coordinating a small team preparing a practical introductory workshop. Two colleagues, Priya (coordinating) and Sam (operations), are working with you. No specialist marketing, coding or finance knowledge is needed.',
    objective: 'Produce a feasible shared plan on the board and a clear handover.',
    responseModes: ['TEXT', 'BOARD'],
  },
  publicFacts: PUBLIC_FACTS,
  conditionalFacts: CONDITIONAL_FACTS,
  participants: PARTICIPANTS,
  thirdPersonMessage: THIRD_PERSON_MESSAGE,
  stages: STAGES,
  worldChanges: WORLD_CHANGES,
  opportunities: OPPORTUNITIES,
  behaviours: BEHAVIOURS,
  board: BOARD,
  // Private: never placed where the session contract reads briefing/board.
  rubric: { ref: UNIVERSAL_RUBRIC_REF, anchorsByBehaviour: Object.fromEntries(BEHAVIOURS.map((b) => [b.id, b.anchors])) },
  exemplars: EXEMPLARS,
  accessibilityVariants: {
    note: 'Text responses are the supported mode. Board edits have keyboard fields and buttons; drag is never required. A spoken-input variant and a reduced-reading variant change measurement conditions and therefore need separate form ids before use.',
    separateFormIdsRequired: ['SPOKEN_INPUT', 'REDUCED_READING', 'OTHER_LANGUAGE'],
  },
  timing: { policyRef: DRAFT_UNIVERSAL.version, policyStatus: DRAFT_UNIVERSAL.status, stageBudgetsAreAuthoringOnly: true },
  director: { coverageFloorPerFamily: 2, maxPresentedOpportunities: 14, maxClarificationsPerOpportunity: 1 },
  licensing: { source: 'ORIGINAL', author: 'StudAI Prism content team (synthetic draft)', licence: 'Proprietary, internal draft', derivedFrom: null },
  confounds: [
    'Typing speed and response length are not scored; concise and spoken-style answers are exemplars.',
    'Demographic, school, accent, confidence display and emotion proxies are out of scope for scoring.',
    'An AI participant agreeing with the learner is not evidence of capability.',
    'Refusal, postponement and reduced scope may be defensible; no single business answer is rewarded.',
    'A board change and its explanation in the same group are one independent observation.',
    'Fact questions answered by the authored boundary are neutral: asking about a given fact is not penalised.',
  ],
  knownLimitations: [
    'Synthetic DRAFT content: not reviewed by measurement, content or accessibility governance; local and test use only.',
    'Behaviour ids and anchors are proposed authoring revisions, not validated subscales; no subscale numbers are reported.',
    'The authoring coverage floor (two opportunities per family) is not the governed evidence sufficiency floor.',
  ],
  approvalHistory: [{ state: 'DRAFT', at: null, by: null, reason: 'Initial original draft; not self-approved.' }],
})

export const CORE_TEAMREADY_A = deepFreeze({
  ...CORE_TEAMREADY_A_V1,
  formId: CORE_TEAMREADY_A_FORM_ID,
  version: CORE_TEAMREADY_A_VERSION,
  publicFacts: CORE_TEAMREADY_A_V1.publicFacts.map((fact) => fact.id === 'F-PARTICIPANTS' ? { ...fact, triggers: [...fact.triggers, 'attendance'] } : fact),
  conditionalFacts: CORE_TEAMREADY_A_V1.conditionalFacts.map((fact) => {
    if (fact.id === 'CF-FACILITATOR-HOURS') return { ...fact, triggers: [...fact.triggers, 'how much time can sam', 'how much time does sam', 'sam contribute', 'sam have', 'how much time can priya', 'priya contribute'] }
    if (fact.id === 'CF-ROOM-CAPACITY') return { ...fact, triggers: [...fact.triggers, 'room capacity', 'venue capacity', 'seating capacity'] }
    return fact
  }),
  opportunities: CORE_TEAMREADY_A_V1.opportunities.map((o) => {
    if (o.id === 'OPP-EXEC-BOARD-OWNERS') return {
      ...o,
      reactions: {
        ...o.reactions,
        OVERLOADED_SAM: {
          ...o.reactions.OVERLOADED_SAM,
          content: 'I can give about half a day to preparation on each of the two days. How will the tasks fit, and which should come first?',
        },
        FEASIBLE_ALLOCATION: {
          ...o.reactions.FEASIBLE_ALLOCATION,
          content: 'That makes the ownership and order explicit. I will work from those responsibilities; tell me if a task needs a different time or owner.',
        },
      },
    }
    if (o.id === 'OPP-EXEC-BOARD-FINAL') return {
      ...o,
      reviewReadiness: {
        all: ['R1.owner', 'R2.owner', 'R3.owner', 'R1.due', 'R2.due', 'R3.due', 'R1.status', 'R2.status', 'R3.status', 'R1.rationale', 'R2.rationale', 'R3.rationale'],
      },
    }
    return o
  }),
  approvalHistory: [{ state: 'DRAFT', at: null, by: null, reason: 'Context/review-readiness correction; requires independent review, not self-approved.' }],
})

// --- lookups ----------------------------------------------------------------------
export const stageIndex = (form, stageId) => form.stages.findIndex((s) => s.id === stageId)
export const opportunityById = (form, id) => form.opportunities.find((o) => o.id === id) || null
export const behaviourById = behaviour
export function familiesCovered(form, opportunities = form.opportunities) {
  const byFamily = new Map()
  for (const o of opportunities) {
    if (!byFamily.has(o.capabilityId)) byFamily.set(o.capabilityId, new Set())
    byFamily.get(o.capabilityId).add(o.groupId)
  }
  return byFamily
}

// World state at a point in a run: public facts, plus revealed conditional
// facts, plus the fact changes of every world change already applied. Pure.
export function worldStateFor(form, { appliedWorldChangeIds = [], revealedFactIds = [] } = {}) {
  const facts = new Map(form.publicFacts.map((f) => [f.id, { ...f, visibility: 'PUBLIC' }]))
  for (const cf of form.conditionalFacts) if (revealedFactIds.includes(cf.id)) facts.set(cf.id, { ...cf, visibility: 'REVEALED' })
  for (const wc of form.worldChanges) {
    if (!appliedWorldChangeIds.includes(wc.id)) continue
    for (const f of wc.setFacts) facts.set(f.id, { ...(facts.get(f.id) || {}), ...f, visibility: 'PUBLIC', changedBy: wc.id })
  }
  return { facts: Object.fromEntries(facts), appliedWorldChangeIds: [...appliedWorldChangeIds], revealedFactIds: [...revealedFactIds] }
}

// Validates a learner board patch against the schema WITHOUT completing any
// field. Keys are `${rowId}.${field}`; unknown rows/fields/owners/statuses or
// a dependency on an unknown row are rejected. Returns { ok, errors }.
// P3.6: the choices the board accepts, for accessible labelled controls in
// the player. Exactly the lists validateBoardPatch enforces; no rubric content.
export function boardSchemaFor(artifactId) {
  if (artifactId !== BOARD_ARTIFACT_ID) return null
  return { fields: [...BOARD_FIELDS], editable: [...BOARD_EDITABLE_FIELDS], owners: [...BOARD_OWNERS], statuses: [...BOARD_STATUSES] }
}

export function validateBoardPatch(form, updates) {
  const errors = []
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return { ok: false, errors: ['Updates must be an object.'] }
  const rowIds = new Set(form.board.rows.map((r) => r.rowId))
  for (const [key, value] of Object.entries(updates)) {
    const [rowId, field, ...rest] = String(key).split('.')
    if (rest.length || !rowIds.has(rowId)) { errors.push(`Unknown board row in "${key}".`); continue }
    if (!form.board.editable.includes(field)) { errors.push(`Field "${field}" cannot be edited.`); continue }
    if (value !== null && typeof value !== 'string') { errors.push(`"${key}" must be text or null.`); continue }
    if (field === 'owner' && value !== null && !form.board.owners.includes(value)) errors.push(`"${value}" is not a participant.`)
    if (field === 'status' && value !== null && !form.board.statuses.includes(value)) errors.push(`"${value}" is not a status.`)
    if (field === 'dependency' && value !== null && !rowIds.has(value)) errors.push(`Dependency "${value}" is not a board row.`)
    if (field === 'dependency' && value === rowId) errors.push(`"${rowId}" cannot depend on itself.`)
  }
  return { ok: errors.length === 0, errors }
}
