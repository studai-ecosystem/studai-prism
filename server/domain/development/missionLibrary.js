// Governed practice-mission library (C8.02). The single seeded legacy mission
// (`routes/missions.js` MIS-MKT-EXP-01) is carried over as governed v1
// PRACTICE content: its scenario stays as practice context (it is not a
// formal assessment scenario, K1/K81), its two stated success behaviours are
// kept, and the objective's hypothesis and budget-allocation steps become
// checkable criteria. No job-family fallback exists: a mission is found by id
// or not at all. New missions need governance review (HA-C009).
export const MISSION_LIBRARY = Object.freeze([
  {
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
  },
])
