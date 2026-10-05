// Governed practice-mission library (C8.02). The single seeded legacy mission
// (`routes/missions.js` MIS-MKT-EXP-01) is carried over as governed v1
// PRACTICE content: its scenario stays as practice context (it is not a
// formal assessment scenario, K1/K81), its two stated success behaviours are
// kept, and the objective's hypothesis and budget-allocation steps become
// checkable criteria. No job-family fallback exists: a mission is found by id
// or not at all. New missions need governance review (HA-C009).
import { P6_MISSIONS, handoverRevision, handoverRevisionV3, runtimeRevision } from './missionLibrary.p6.js'

const MKT_EXPERIMENT_V1 = {
    mission_id: 'MIS-MKT-EXP-01',
    version: 1,
    status: 'PUBLISHED',
    title: 'Design a clean A/B test for a new ad message',
    target_capability_id: 'CAP-MKT-EXPERIMENTATION',
    target_behavior_ids: ['TESTABLE_HYPOTHESIS', 'SINGLE_VARIABLE', 'METRIC_BEFORE_TEST', 'BUDGET_WITHIN_LIMIT'],
    scenario_context: {
      setting: 'Lumina Botanicals, a skincare brand, has ₹1,00,000 to test whether a "Clean Ingredients" ad message converts better than the current "Glow Fast" message.', // campus-allow HARDCODED_SCENARIO: governed practice content carried over from the legacy mission (K82), not an assessment scenario
      objective: 'Write a testable hypothesis, change only one thing between the two ads, decide how success will be measured before the test starts, and split the budget between the control and the test ad.',
    },
    instructions: [
      'Write your hypothesis in the first box.',
      'Fill in the test plan: what changes between the two ads, how you will measure success, and when you will call a winner.',
      'Split the ₹1,00,000 budget between the control and the test ad.',
      'Submit when you are ready. You can try again as many times as you like.',
    ],
    artifacts: [
      {
        artifact_id: 'HYPOTHESIS',
        type: 'TEXT_RESPONSE',
        title: 'Hypothesis',
        prompt: 'What do you expect to happen, and why?',
        initial_state: { text: '' },
        max_length: 1500,
      },
      {
        artifact_id: 'TEST_PLAN',
        type: 'FIELD_SHEET',
        title: 'Test plan',
        prompt: 'Describe the test before it runs.',
        fields: [
          { key: 'variable_changed', label: 'What is different between the two ads?', kind: 'text', max_length: 600 },
          { key: 'kept_the_same', label: 'What stays exactly the same?', kind: 'text', max_length: 600 },
          { key: 'primary_metric', label: 'How will you measure success?', kind: 'text', max_length: 600 },
          { key: 'decision_rule', label: 'When will you call a winner?', kind: 'text', max_length: 600 },
        ],
        initial_state: { fields: { variable_changed: '', kept_the_same: '', primary_metric: '', decision_rule: '' } },
      },
      {
        artifact_id: 'BUDGET',
        type: 'TABLE',
        title: 'Budget split',
        prompt: 'Allocate the full ₹1,00,000 across the two ads.',
        columns: [
          { key: 'variant', label: 'Ad', kind: 'text', editable: false },
          { key: 'spend', label: 'Spend (₹)', kind: 'number', editable: true },
        ],
        initial_state: { rows: [{ id: 'ctrl', variant: 'Control — "Glow Fast"', spend: null }, { id: 'test', variant: 'Test — "Clean Ingredients"', spend: null }] },
      },
    ],
    constraints: { notes: ['The total budget is ₹1,00,000.', 'Both ads run at the same time to the same audience.'], budget_total: 100000 },
    deterministic_validation_rules: [
      { rule_id: 'R-HYP-FRAME', criterion_id: 'C-HYPOTHESIS', type: 'TEXT_PATTERN', artifact_id: 'HYPOTHESIS', path: 'text', params: { pattern: '\\bif\\b[\\s\\S]{3,}\\bthen\\b[\\s\\S]{3,}\\bbecause\\b', flags: 'i' }, description: 'The hypothesis is written as "If … then … because …".' },
      { rule_id: 'R-VAR-NAMED', criterion_id: 'C-SINGLE-VARIABLE', type: 'REQUIRED_FIELD', artifact_id: 'TEST_PLAN', path: 'fields.variable_changed', params: { min_length: 3 }, description: 'The plan says what differs between the ads.' },
      { rule_id: 'R-SAME-NAMED', criterion_id: 'C-SINGLE-VARIABLE', type: 'REQUIRED_FIELD', artifact_id: 'TEST_PLAN', path: 'fields.kept_the_same', params: { min_length: 3 }, description: 'The plan says what stays the same.' },
      { rule_id: 'R-METRIC-NAMED', criterion_id: 'C-METRIC', type: 'REQUIRED_FIELD', artifact_id: 'TEST_PLAN', path: 'fields.primary_metric', params: { min_length: 3 }, description: 'The plan names a success measure.' },
      { rule_id: 'R-BUDGET-SUM', criterion_id: 'C-BUDGET', type: 'SUM_EQUALS', artifact_id: 'BUDGET', path: 'rows.spend', params: { total: 100000 }, description: 'The two amounts add up to exactly ₹1,00,000.' },
      { rule_id: 'R-BUDGET-RANGE', criterion_id: 'C-BUDGET', type: 'NUMBER_RANGE', artifact_id: 'BUDGET', path: 'rows.spend', params: { min: 1, max: 100000 }, description: 'Each ad gets some of the budget.' },
    ],
    rubric: {
      criteria: [
        { criterion_id: 'C-HYPOTHESIS', behavior_id: 'TESTABLE_HYPOTHESIS', description: 'Writes the hypothesis in the form "If … then … because …" (a change, an expected result and a reason).', check: 'DETERMINISTIC', artifact_ids: ['HYPOTHESIS'] },
        {
          criterion_id: 'C-SINGLE-VARIABLE', behavior_id: 'SINGLE_VARIABLE', description: 'Changes only one thing between the control and the test ad.', check: 'BOTH', artifact_ids: ['HYPOTHESIS', 'TEST_PLAN'],
          evaluator_guidance: 'Observed only if the plan changes exactly one element of the ad (for example the headline or message) and keeps everything else the same, including the landing page, audience and timing. Not observed if two or more things change or if it is unclear.',
        },
        {
          criterion_id: 'C-METRIC', behavior_id: 'METRIC_BEFORE_TEST', description: 'Defines the primary success measure before the test runs.', check: 'BOTH', artifact_ids: ['TEST_PLAN'],
          evaluator_guidance: 'Observed only if the plan names one measurable outcome (for example conversion rate or click-through rate) as the primary measure, decided before launch. Not observed for vague goals such as "see what works".',
        },
        { criterion_id: 'C-BUDGET', behavior_id: 'BUDGET_WITHIN_LIMIT', description: 'Splits the full budget between both ads without going over it.', check: 'DETERMINISTIC', artifact_ids: ['BUDGET'] },
      ],
    },
    required_evidence: { min_criteria_observed: 1 },
    scaffolding_policy: {
      hints: [
        'A hypothesis frame that works: "If we change [one thing], then [a measure] will [change] because [reason]."',
        'Ask yourself: if you change the ad copy AND the landing page together, how would you know which one made the difference?',
        'Decide the success measure before you look at any results.',
      ],
      reveal: 'ON_REQUEST',
    },
    feedback_policy: { mode: 'CRITERION', show_unobserved: true },
    estimated_duration: { minutes: 20 },
    accessibility_mode: { keyboard_only: true, screen_reader: true, untimed: true },
}

  // P2.8 — DRAFT handover mission. Original, domain-light practice content:
  // hand an unfinished plan to a colleague. DRAFT content is seeded (so it is
  // governed and immutable like any version) but reachable only when
  // PRISM_DRAFT_CONTENT is on (test/local); it is never recommended to real
  // users and, like every mission, writes PRACTICE evidence only.
const HANDOVER_V1 = {
    mission_id: 'MIS-CORE-HANDOVER-01',
    version: 1,
    status: 'DRAFT',
    title: 'Hand over an unfinished plan to a colleague',
    target_capability_id: 'CAP-L1-COMMUNICATION',
    target_behavior_ids: ['NAMES_OPEN_WORK', 'SETTLES_OWNERSHIP', 'STATES_FIRST_STEP', 'SETS_CHECKPOINT'],
    scenario_context: {
      setting: 'You are leaving for two days and a small event plan is not finished. Two tasks on the board have no owner yet: the vendor quotes and the launch checklist. Your colleague Sam is taking over while you are away and has not seen the plan before.', // campus-allow HARDCODED_SCENARIO: governed practice content (P2.8 draft), not an assessment scenario
      objective: 'Write the handover so Sam can pick the plan up without asking you: name the two unowned tasks, assign an owner or ask Sam to find one, say what Sam must do first, and give a time when you will check in.',
    },
    instructions: [
      'Fill in the owner column on the board for both unowned tasks. If you cannot assign one, write who should decide.',
      'Write the handover message to Sam. Name both unowned tasks in it.',
      'Say what Sam should do first and when you will check in.',
      'Submit when you are ready. You can try again as many times as you like.',
    ],
    artifacts: [
      {
        artifact_id: 'BOARD',
        type: 'TABLE',
        title: 'Task board',
        prompt: 'The two tasks that have no owner. Fill in who owns each one now.',
        columns: [
          { key: 'task', label: 'Task', kind: 'text', editable: false },
          { key: 'due', label: 'Due', kind: 'text', editable: false },
          { key: 'owner', label: 'Owner', kind: 'text', editable: true },
        ],
        initial_state: { rows: [{ id: 'quotes', task: 'Vendor quotes', due: 'Thursday', owner: null }, { id: 'checklist', task: 'Launch checklist', due: 'Friday', owner: null }] },
      },
      {
        artifact_id: 'MESSAGE',
        type: 'TEXT_RESPONSE',
        title: 'Handover message to Sam',
        prompt: 'What does Sam need to know to take this over?',
        initial_state: { text: '' },
        max_length: 1500,
      },
      {
        artifact_id: 'PLAN',
        type: 'FIELD_SHEET',
        title: 'Next steps',
        prompt: 'Make the first move and the check-in explicit.',
        fields: [
          { key: 'first_step', label: 'What should Sam do first?', kind: 'text', max_length: 400 },
          { key: 'checkpoint', label: 'When will you check in? (give a day and a time)', kind: 'text', max_length: 120 },
        ],
        initial_state: { fields: { first_step: '', checkpoint: '' } },
      },
    ],
    constraints: { notes: ['Sam has not seen this plan before.', 'You will be unreachable for two days.'] },
    deterministic_validation_rules: [
      { rule_id: 'R-MSG-QUOTES', criterion_id: 'C-NAMES-TASKS', type: 'TEXT_PATTERN', artifact_id: 'MESSAGE', path: 'text', params: { pattern: 'vendor\\s+quotes', flags: 'i' }, description: 'The message names the vendor quotes.' },
      { rule_id: 'R-MSG-CHECKLIST', criterion_id: 'C-NAMES-TASKS', type: 'TEXT_PATTERN', artifact_id: 'MESSAGE', path: 'text', params: { pattern: 'launch\\s+checklist', flags: 'i' }, description: 'The message names the launch checklist.' },
      { rule_id: 'R-BOARD-OWNERS', criterion_id: 'C-OWNERSHIP', type: 'REQUIRED_FIELD', artifact_id: 'BOARD', path: 'rows.owner', params: { min_length: 2 }, description: 'Both unowned tasks now have an owner, or a named person who will decide.' },
      { rule_id: 'R-FIRST-STEP', criterion_id: 'C-FIRST-STEP', type: 'REQUIRED_FIELD', artifact_id: 'PLAN', path: 'fields.first_step', params: { min_length: 8 }, description: 'A first step is written down.' },
      { rule_id: 'R-CHECKPOINT-TIME', criterion_id: 'C-CHECKPOINT', type: 'TEXT_PATTERN', artifact_id: 'PLAN', path: 'fields.checkpoint', params: { pattern: '(\\b\\d{1,2}(:\\d{2})?\\s*(am|pm)\\b|\\b\\d{1,2}:\\d{2}\\b|\\bnoon\\b|\\bmidday\\b)', flags: 'i' }, description: 'The check-in gives a clock time.' },
      { rule_id: 'R-CHECKPOINT-DAY', criterion_id: 'C-CHECKPOINT', type: 'TEXT_PATTERN', artifact_id: 'PLAN', path: 'fields.checkpoint', params: { pattern: '\\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\\b|\\btomorrow\\b|\\btoday\\b|\\b\\d{1,2}[/-]\\d{1,2}\\b', flags: 'i' }, description: 'The check-in gives a day.' },
    ],
    rubric: {
      criteria: [
        { criterion_id: 'C-NAMES-TASKS', behavior_id: 'NAMES_OPEN_WORK', description: 'Names both unowned tasks in the handover message.', check: 'DETERMINISTIC', artifact_ids: ['MESSAGE'] },
        { criterion_id: 'C-OWNERSHIP', behavior_id: 'SETTLES_OWNERSHIP', description: 'Assigns an owner to each unowned task, or names who will decide.', check: 'DETERMINISTIC', artifact_ids: ['BOARD'] },
        {
          criterion_id: 'C-FIRST-STEP', behavior_id: 'STATES_FIRST_STEP', description: 'Tells the receiver what to do first.', check: 'BOTH', artifact_ids: ['PLAN', 'MESSAGE'],
          evaluator_guidance: 'Observed only if the learner names one concrete action the receiver should take before anything else (for example "call the venue to confirm the quote"). Not observed for a list with no order, or for vague directions such as "get up to speed".',
        },
        { criterion_id: 'C-CHECKPOINT', behavior_id: 'SETS_CHECKPOINT', description: 'Gives a day and a clock time for the check-in.', check: 'DETERMINISTIC', artifact_ids: ['PLAN'] },
      ],
    },
    required_evidence: { min_criteria_observed: 1 },
    scaffolding_policy: {
      hints: [
        'Start the message with the two tasks that have no owner, so Sam sees them first.',
        'If you cannot assign an owner, name the person who should decide instead of leaving it blank.',
        'A check-in is only useful if Sam can put it in a calendar: give a day and a clock time.',
      ],
      reveal: 'ON_REQUEST',
    },
    feedback_policy: { mode: 'CRITERION', show_unobserved: true },
    estimated_duration: { minutes: 15 },
    accessibility_mode: { keyboard_only: true, screen_reader: true, untimed: true },
}

// Library order: published legacy mission, handover v1 (frozen), handover v2
// (M04 metadata revision), handover v3 (M04 honest-checks revision, P6.8),
// then the P6 originals M01–M03 and M05–M10.
const HANDOVER_V2 = handoverRevision(HANDOVER_V1)
const HANDOVER_V3 = handoverRevisionV3(HANDOVER_V2)
export const MISSION_LIBRARY = Object.freeze([
  MKT_EXPERIMENT_V1,
  HANDOVER_V1,
  HANDOVER_V2,
  HANDOVER_V3,
  ...P6_MISSIONS,
  ...[HANDOVER_V3, ...P6_MISSIONS].map(runtimeRevision),
])

// The ten P6 starter missions (latest version per id, with display codes).
export const P6_LIBRARY = Object.freeze([...MISSION_LIBRARY.filter((m) => m.display_code)
  .reduce((latest, m) => (!latest.has(m.mission_id) || latest.get(m.mission_id).version < m.version ? latest.set(m.mission_id, m) : latest), new Map()).values()]
  .sort((a, b) => a.display_code.localeCompare(b.display_code)))

export const DRAFT_CONTENT_FLAG = 'PRISM_DRAFT_CONTENT'
export const draftContentEnabled = () => process.env[DRAFT_CONTENT_FLAG] === 'true'
