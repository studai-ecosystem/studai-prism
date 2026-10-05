// P6.2 — nine original DRAFT practice missions (M01–M03, M05–M10) plus the
// M04 revision of the existing handover mission. Domain-light, synthetic
// situations; no real person, institution or product. Every mission is
// DRAFT (reachable only behind PRISM_DRAFT_CONTENT, never recommended) and
// marked ORIGINAL. Behaviour ids come from the universal-form catalogue so
// practice and formal observation speak the same language, and
// `exposure_tags` name the form opportunities a mission resembles so a fresh
// challenge can avoid familiar settings (P6.7). Publication is a separate
// human decision (HA-C009); nothing here self-approves.
import { FAMILY } from '../assessments/universalForm.js'

const COMMON = Object.freeze({
  version: 1,
  status: 'DRAFT',
  source: 'ORIGINAL',
  required_evidence: { min_criteria_observed: 1 },
  feedback_policy: { mode: 'CRITERION', show_unobserved: true },
  accessibility_mode: { keyboard_only: true, screen_reader: true, untimed: true },
})
const message = (artifact_id, title, prompt, max_length = 1500) => ({ artifact_id, type: 'TEXT_RESPONSE', title, prompt, initial_state: { text: '' }, max_length })
const sheet = (artifact_id, title, prompt, fields) => ({
  artifact_id, type: 'FIELD_SHEET', title, prompt,
  fields: fields.map(([key, label, max_length = 400]) => ({ key, label, kind: 'text', max_length })),
  initial_state: { fields: Object.fromEntries(fields.map(([key]) => [key, ''])) },
})
const board = (artifact_id, title, prompt, columns, rows) => ({ artifact_id, type: 'TABLE', title, prompt, columns, initial_state: { rows } })
const col = (key, label, editable = false, kind = 'text') => ({ key, label, kind, editable })

const required = (rule_id, criterion_id, artifact_id, path, min_length, description) => ({ rule_id, criterion_id, type: 'REQUIRED_FIELD', artifact_id, path, params: { min_length }, description })
const pattern = (rule_id, criterion_id, artifact_id, path, re, description) => ({ rule_id, criterion_id, type: 'TEXT_PATTERN', artifact_id, path, params: { pattern: re, flags: 'i' }, description })
const range = (rule_id, criterion_id, artifact_id, path, min, max, description) => ({ rule_id, criterion_id, type: 'NUMBER_RANGE', artifact_id, path, params: { min, max }, description })
// P6.8 valid-reference rule: the value names one of the people (or decision
// words) that exist in the situation. Confirms a reference, never its wisdom.
const oneOf = (rule_id, criterion_id, artifact_id, path, options, description) => ({ rule_id, criterion_id, type: 'ONE_OF', artifact_id, path, params: { options }, description })
const det = (criterion_id, behavior_id, description, artifact_ids) => ({ criterion_id, behavior_id, description, check: 'DETERMINISTIC', artifact_ids })
const meaning = (criterion_id, behavior_id, description, artifact_ids, intent, synonyms, evaluator_guidance) => ({
  criterion_id, behavior_id, description, check: 'MEANING', artifact_ids, evaluator_guidance, meaning: { intent, synonyms },
})
// P6.8 counterpart reply lines, bound to one criterion's actual result.
const reacts = (criterion_id, observed, notObserved) => [
  { criterion_id, when: 'OBSERVED', text: observed },
  { criterion_id, when: 'NOT_OBSERVED', text: notObserved },
]
// P6.2 reviewer-package helpers. Examples are teaching support (shown after a
// submission or on request) — a copied example is detected and never counted
// as the learner's own behaviour. Nothing here is approved: every review
// record says so.
const example = (example_id, criterion_ids, text, note) => ({ example_id, kind: 'EXAMPLE', criterion_ids, text, note })
const counter = (example_id, criterion_ids, text, note) => ({ example_id, kind: 'COUNTEREXAMPLE', criterion_ids, text, note })
const clarify = (question, answer) => ({ question, answer })
const REVIEW_RECORD = Object.freeze({
  status: 'DRAFT', authored_by: 'Prism product-engineering team (synthetic content)', authored_on: '2026-10-03',
  reviewed_by: null, reviewed_on: null, approval: 'NOT_APPROVED',
  notes: 'Original synthetic situation; no real person, institution or product. Needs content and measurement review before publication.',
})
const A11Y_TEXT = 'One text box, keyboard-only, screen-reader labelled, untimed. The suggested minutes are guidance, not a limit. No colour-only state; feedback is text.'
const A11Y_SHEET = 'Short labelled fields, keyboard-only, screen-reader labelled, untimed. Field order follows the reading order of the task. No colour-only state.'
const A11Y_BOARD = 'The board is a labelled table with editable cells reachable by Tab; every cell has a row and column label for screen readers. Untimed; the message box wraps long text. No colour-only state.'
const CONFOUNDS_TEXT = [
  'Writing fluency in English can look like the behaviour; checks read for the specific fact or intent, not polish.',
  'A learner may know the convention (ask a question) without applying it to the right fact; the meaning check asks for the fact.',
  'Copying an exposed example is detected and not counted as the learner\'s own behaviour.',
  'Length, headings and punctuation are not evidence: a concise sentence that does the thing counts; long text that does not is not met.',
]

export const P6_MISSIONS = Object.freeze([
  // ── Reasoning ─────────────────────────────────────────────────────────
  {
    ...COMMON,
    mission_id: 'MIS-CORE-MISSING-FACT-01',
    display_code: 'M01',
    title: 'Find the missing fact',
    target_capability_id: FAMILY.REASONING,
    target_behavior_ids: ['QUESTION_ASSUMPTION', 'STATE_UNCERTAINTY'],
    form_behaviour_ids: ['QUESTION_ASSUMPTION', 'STATE_UNCERTAINTY'],
    exposure_tags: ['OPP-REASON-FACTS-ASSUMPTIONS'],
    why_it_matters: 'Confirming something you cannot yet know looks helpful and causes rework later. Naming the missing fact and asking for it is faster for everyone.',
    scenario_context: {
      setting: 'A colleague, Dev, messages you: "Can you confirm the Tuesday room booking for the team session? I have put us in Room 2." You know Room 2 seats twelve. Nobody has said how many people are coming, and two other teams were invited last week.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Reply to Dev: say what you still need to know before confirming, ask for it, and say what you will do in the meantime without treating the booking as settled.',
    },
    instructions: [
      'Read what Dev asked and what you actually know.',
      'Write your reply in the box. Ask for the fact you are missing.',
      'Say what happens once you have it, rather than confirming now.',
      'Submit when you are ready. You can try again.',
    ],
    artifacts: [message('REPLY', 'Reply to Dev', 'What do you need to know before you can confirm?', 1200)],
    constraints: { notes: ['Room 2 seats twelve.', 'Two other teams were invited last week.'] },
    deterministic_validation_rules: [],
    rubric: {
      criteria: [
        meaning('C-ASKS', 'QUESTION_ASSUMPTION', 'Asks Dev for the missing information instead of only confirming.', ['REPLY'],
          'Asks Dev for information needed before confirming (a request, with or without a question mark).',
          ['could you', 'can you', 'please confirm', 'please check', 'do you know', 'check with', 'confirm how many', 'who is coming', 'how many are', 'would you'],
          'Met if the reply asks Dev for information needed to decide; "Please confirm the expected attendance" counts and a question mark is not required. Not met if the reply only informs or confirms, or for a courtesy "let me know if you need anything".'),
        meaning('C-NAMES-UNKNOWN', 'QUESTION_ASSUMPTION', 'Says that the number of people attending is not yet known and matters for the room.', ['REPLY'],
          'States that how many people are coming is unknown and is needed before the room can be confirmed.',
          ['how many people', 'how many are coming', 'number of people', 'headcount', 'who is coming', 'not sure how many'],
          'Met only if the learner identifies attendance as the unknown. Not met if they only ask a generic question or confirm the room.'),
        meaning('C-LIMIT', 'STATE_UNCERTAINTY', 'Connects the room limit to the risk of confirming now.', ['REPLY'],
          'Refers to the room\'s limit (twelve seats) as the reason confirming without the headcount is risky.',
          ['seats twelve', 'only seats', 'room only', 'holds twelve', 'twelve', 'a dozen', 'over twelve', 'more than twelve', 'fits twelve', 'too small'],
          'Met only if the limit is tied to the risk (the room may not fit everyone). Not met if "12" appears without that connection, or the limit is not mentioned.'),
        meaning('C-HOLDS', 'STATE_UNCERTAINTY', 'Makes the confirmation conditional on the missing fact.', ['REPLY'],
          'Says what will happen once the missing fact is known, instead of confirming now.',
          ['once I know', 'until I know', 'when I know', 'depends on', 'if more than', 'for now', 'hold the booking', 'pencil'],
          'Met only if the learner defers or conditions the confirmation. Not met if the reply confirms Room 2 outright.'),
      ],
    },
    scaffolding_policy: {
      hints: [
        'What does Dev assume that nobody has actually said?',
        'Ask for the one number that decides whether Room 2 works.',
        'Say what you will do if the answer is over twelve, and what you will do if it is not.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'Which fact, if it had turned out differently, would have changed your reply most?',
    retry_variation: 'A different decision-relevant fact is absent (the session date is not fixed).',
    situation_facts: ['Dev has booked Room 2 and asks you to confirm.', 'Room 2 seats twelve.', 'Nobody has said how many people are coming.', 'Two other teams were invited last week.'],
    learner_actions: ['Read what Dev asked and what is actually known.', 'Write a reply that asks for the missing fact.', 'Make the confirmation conditional instead of confirming now.'],
    clarifications: [
      clarify('Can I confirm Room 2 and change it later?', 'You can decide that; the task is to show what you still need to know before you confirm.'),
      clarify('Do I know the date of the session?', 'Yes, Tuesday. Only the headcount is unknown.'),
    ],
    examples: [
      example('EX-ASK', ['C-ASKS', 'C-NAMES-UNKNOWN'], 'Before I confirm Room 2, can you tell me how many people are coming? Two other teams were invited last week, so the number could be well over twelve.', 'Asks for the one fact that decides the room and says why it matters.'),
      counter('CX-CONFIRM', ['C-HOLDS'], 'Confirmed, Room 2 is booked for Tuesday. Thanks for sorting it.', 'Confirms a fact nobody has; the headcount is never asked for.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-NAMES-UNKNOWN', 'C-ASKS', 'C-HOLDS', 'C-LIMIT'], next_change_priority: ['C-NAMES-UNKNOWN', 'C-HOLDS', 'C-ASKS', 'C-LIMIT'] },
    transfer: {
      setting: 'A colleague, Jo, messages you: "Can you confirm the courier slot for Friday? I have booked the standard van." You know the standard van takes parcels up to 20 kg in total. Nobody has weighed the kit boxes yet, and a second set of boxes was added yesterday.',
      objective: 'Reply to Jo: say what you still need to know before confirming, ask for it, and say what you will do once you have it without treating the slot as settled.',
      constraints_notes: ['The standard van carries up to 20 kg.', 'A second set of boxes was added yesterday.'],
      situation_facts: ['Jo has booked the standard van and asks you to confirm.', 'The van carries up to 20 kg.', 'Nobody has weighed the boxes.', 'More boxes were added yesterday.'],
      exposure_tags: [],
      meaning_overrides: [{
        criterion_id: 'C-NAMES-UNKNOWN', intent: 'States that the total weight of the boxes is unknown and is needed before the van can be confirmed.',
        synonyms: ['how much do they weigh', 'how heavy', 'total weight', 'weigh the boxes', 'weight of the kit', 'not sure how heavy', 'weighed'],
        evaluator_guidance: 'Met only if the learner identifies the weight as the unknown. Not met if they only ask a generic question or confirm the van.',
      }, {
        criterion_id: 'C-LIMIT', intent: 'Refers to the van\'s limit (20 kg) as the reason confirming without the weight is risky.',
        synonyms: ['20 kg', 'twenty kilos', 'up to 20', 'weight limit', 'too heavy', 'over 20', 'carries up to', 'the van only takes'],
        evaluator_guidance: 'Met only if the limit is tied to the risk (the boxes may exceed it). Not met if "20" appears without that connection, or the limit is not mentioned.',
      }],
    },
    accessibility_note: A11Y_TEXT,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 10 },
  },
  {
    ...COMMON,
    mission_id: 'MIS-CORE-CHECK-RECOMMENDATION-01',
    display_code: 'M02',
    title: 'Check the confident recommendation',
    target_capability_id: FAMILY.REASONING,
    target_behavior_ids: ['CHECK_EVIDENCE', 'STATE_UNCERTAINTY'],
    form_behaviour_ids: ['CHECK_EVIDENCE', 'STATE_UNCERTAINTY'],
    exposure_tags: ['OPP-REASON-CHECK-RECOMMENDATION'],
    why_it_matters: 'A confident summary is easy to forward. Checking its one load-bearing claim against what you know is what stops a small error becoming a missed delivery.',
    scenario_context: {
      setting: 'An automatically generated summary says: "Order 60 printed packs for Friday; the supplier delivers in two days." The brief you hold says 48 people have confirmed, Friday is three working days away, and the supplier page says delivery takes four working days.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Write a short check note: say whether you would go ahead, which claim you checked and what you found, what you are still unsure about, and what you would do instead.',
    },
    instructions: [
      'Compare the summary with the brief before deciding.',
      'Fill in the check note. Name the claim you checked and what you found.',
      'Say what is still uncertain and how it affects the decision.',
      'Propose what to do instead if you would not go ahead as written.',
    ],
    artifacts: [sheet('CHECK', 'Check note', 'Keep it short enough to read in a minute.', [
      ['decision', 'Would you go ahead as written? Say yes or no and why.', 300],
      ['claim_checked', 'Which claim did you check?', 200],
      ['what_found', 'What did you find when you checked it?', 400],
      ['uncertain', 'What are you still unsure about, and what difference does it make?', 400],
      ['alternative', 'What would you do instead?', 400],
    ])],
    constraints: { notes: ['The summary was produced automatically and not checked by a person.'] },
    deterministic_validation_rules: [],
    rubric: {
      criteria: [
        meaning('C-CLAIM', 'CHECK_EVIDENCE', 'Names the specific claim that was checked.', ['CHECK'],
          'Names the specific claim from the summary that was checked (the two-day delivery, or the order of 60 against 48 confirmed).',
          ['delivery claim', 'two-day delivery', 'claim that', 'the claim', '60 packs', 'order of 60', 'sixty packs', 'delivery time', 'two-day claim', 'checked the'],
          'Met only if a specific claim from the summary is named. Not met for "I checked the summary" with no claim, or for a filled-in field that names nothing.'),
        meaning('C-CONFLICT', 'CHECK_EVIDENCE', 'Points to the specific conflict between the summary and a known fact.', ['CHECK'],
          'Identifies that the delivery time (four working days versus three) or the quantity (48 confirmed versus 60) contradicts the summary.',
          ['four working days', 'four days', 'will not arrive', 'does not arrive', 'too late', 'only 48', '48 people', 'more than confirmed', 'three working days'],
          'Met only if the learner states which fact the summary conflicts with. Not met for general doubt without a fact.'),
        meaning('C-UNCERTAIN', 'STATE_UNCERTAINTY', 'Names what is still uncertain and how it affects the decision.', ['CHECK'],
          'States something not yet known (for example late confirmations or a faster delivery option) and its effect on the choice.',
          ['not sure', 'unsure', 'do not know', 'unclear', 'might change', 'could change', 'depends on', 'if more people'],
          'Met only if a specific uncertainty is named. Not met for "not sure" with no object.'),
        meaning('C-ALT', 'CHECK_EVIDENCE', 'Proposes an alternative that fits the facts.', ['CHECK'],
          'Proposes a specific alternative that works with the facts (an order that can arrive in time, a quantity close to the 48 confirmed, a different supplier or format), not a vague "do something else".',
          ['instead', 'order 50', 'order 48', 'in-house', 'next day', 'different supplier', 'smaller order', 'print tomorrow', 'print shop'],
          'Met only if the alternative is specific and consistent with the delivery and quantity facts. Not met for "find another way", for an alternative that still cannot arrive by Friday, or for a filled-in field with no actual proposal.'),
      ],
    },
    scaffolding_policy: {
      hints: [
        'Count the working days the supplier needs and the working days you have.',
        'Compare the number ordered with the number confirmed; which is the summary relying on?',
        'An alternative can be a smaller order, a different supplier, or a different format. Say which and why.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'What made the summary sound reliable, and what would have made you check it sooner?',
    retry_variation: 'The error changes from a contradiction to an unsupported assumption (no delivery time is stated at all).',
    situation_facts: ['The summary says order 60 packs for Friday and that delivery takes two days.', '48 people have confirmed.', 'Friday is three working days away.', 'The supplier page says delivery takes four working days.'],
    learner_actions: ['Compare the summary with the brief.', 'Fill in the check note: decision, claim checked, finding, uncertainty, alternative.', 'Propose what to do instead if the summary should not be followed as written.'],
    clarifications: [
      clarify('Is the supplier page up to date?', 'Treat it as the most recent information you have.'),
      clarify('Can more people still confirm?', 'Possibly; nothing in the brief rules it out.'),
    ],
    examples: [
      example('EX-CONFLICT', ['C-CLAIM', 'C-CONFLICT'], 'I checked the delivery claim against the supplier page, and it says four working days, so an order placed today will not arrive by Friday.', 'Names the claim and the specific fact it conflicts with.'),
      counter('CX-VAGUE', ['C-UNCERTAIN'], 'I am not sure about this summary, it feels a bit optimistic to me.', 'Doubt without a fact; nothing is checked and no uncertainty is named.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-CONFLICT', 'C-CLAIM', 'C-ALT', 'C-UNCERTAIN'], next_change_priority: ['C-CONFLICT', 'C-ALT', 'C-UNCERTAIN', 'C-CLAIM'] },
    transfer: {
      setting: 'An automatically generated summary says: "Book the larger hall for the open evening; attendance will exceed eighty." The sign-up sheet you hold shows forty-one names with three days to go, last year\'s final count was fifty-five, and the summary gives no source for "eighty".',
      objective: 'Write a short check note: say whether you would book the larger hall, which claim you checked and what you found, what you are still unsure about, and what you would do instead.',
      constraints_notes: ['The summary was produced automatically and gives no source for its attendance figure.'],
      situation_facts: ['The summary recommends the larger hall because attendance will exceed eighty.', 'The sign-up sheet shows forty-one names.', 'Last year\'s final count was fifty-five.', 'No source is given for eighty.'],
      exposure_tags: [],
      meaning_overrides: [{
        criterion_id: 'C-CONFLICT', intent: 'Identifies that the attendance figure (eighty) has no source and is not supported by the sign-ups (forty-one) or last year (fifty-five).',
        synonyms: ['no source', 'where does eighty', 'nothing supports', 'forty-one', 'only 41', 'last year was fifty-five', 'unsupported', 'not backed by'],
        evaluator_guidance: 'Met only if the learner states that the figure is unsupported or names the sign-up or last-year figure against it. Not met for general doubt.',
      }, {
        criterion_id: 'C-CLAIM', intent: 'Names the specific claim from the summary that was checked (attendance will exceed eighty, so the larger hall is needed).',
        synonyms: ['attendance claim', 'exceed eighty', 'over eighty', 'eighty people', 'the claim', 'claim that', 'larger hall is needed', 'attendance figure'],
        evaluator_guidance: 'Met only if the attendance claim is named. Not met for "I checked the summary" with no claim.',
      }, {
        criterion_id: 'C-ALT', intent: 'Proposes a specific alternative consistent with the facts (hold the usual room and keep the larger hall provisional, re-check sign-ups before a deadline, ask for the source).',
        synonyms: ['instead', 'usual room', 'smaller room', 'provisional', 'hold the hall', 'keep the option', 'check the sign-ups', 'wait until', 'ask where eighty', 'recount'],
        evaluator_guidance: 'Met only if the alternative is specific and fits the sign-up facts. Not met for "find another way" or for booking the larger hall anyway with no condition.',
      }],
    },
    accessibility_note: A11Y_SHEET,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 12 },
  },

  // ── Communication ─────────────────────────────────────────────────────
  {
    ...COMMON,
    mission_id: 'MIS-CORE-EXPLAIN-DECISION-01',
    display_code: 'M03',
    title: 'Explain your recommendation',
    target_capability_id: FAMILY.COMMUNICATION,
    target_behavior_ids: ['STATE_MAIN_POINT', 'ADAPT_TO_AUDIENCE'],
    form_behaviour_ids: ['STATE_MAIN_POINT', 'ADAPT_TO_AUDIENCE'],
    exposure_tags: ['OPP-COMM-PLAN-EXPLAIN'],
    why_it_matters: 'People who were not in the discussion need the decision, the reason that affects them and the action; everything else slows them down.',
    scenario_context: {
      setting: 'You compared two options for next week\'s onboarding session: one long session for everyone, or two shorter sessions with smaller groups. You chose two shorter sessions because the room holds fifteen and twenty-two people are joining. Ravi, who manages the calendar and has not followed the discussion, needs to know what to book.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Write Ravi a message that leads with the decision, gives the one reason that matters to him, and says exactly what you need him to book and by when.',
    },
    instructions: [
      'Put the decision in the first sentence.',
      'Give the reason Ravi needs, not the whole comparison.',
      'End with the action you need from him and a deadline.',
    ],
    artifacts: [message('NOTE', 'Message to Ravi', 'Ravi has one minute to read this.', 1200)],
    constraints: { notes: ['Ravi was not part of the discussion.', 'The room holds fifteen people.'] },
    deterministic_validation_rules: [],
    rubric: {
      criteria: [
        meaning('C-MAIN-FIRST', 'STATE_MAIN_POINT', 'States the decision up front, before the background.', ['NOTE'],
          'Opens with the decision itself (two sessions rather than one) before any reasoning or background.',
          ['two shorter', 'two sessions', 'decision: two', 'we will run two', 'split into two', 'pair of', 'two slots', 'run it twice'],
          'Met only if the decision is stated in the first sentence or two, in any wording. Not met if it appears only after the reasoning, or not at all.'),
        meaning('C-REASON', 'STATE_MAIN_POINT', 'Gives the reason for two sessions: the room cannot hold everyone at once.', ['NOTE'],
          'Explains that the room\'s capacity (fifteen) is below the number joining (twenty-two), so one session does not fit.',
          ['room holds', 'holds fifteen', 'only fifteen', 'twenty-two', 'does not fit', 'too many for the room', 'room is too small', 'more people than seats', 'space takes fifteen'],
          'Met only if the capacity reason is given. Not met if a different or no reason is given.'),
        meaning('C-ASK', 'ADAPT_TO_AUDIENCE', 'Tells Ravi the specific booking action.', ['NOTE'],
          'Names the concrete action Ravi should take (book two sessions / slots) rather than describing the discussion.',
          ['please book', 'can you book', 'could you book', 'book two', 'two slots', 'put two sessions', 'reserve'],
          'Met only if a booking action is requested. Not met if the message only informs.'),
        meaning('C-DEADLINE', 'ADAPT_TO_AUDIENCE', 'Gives Ravi a deadline for the booking.', ['NOTE'],
          'Tells Ravi by when the booking should be made (a day, a date or "by the end of the week").',
          ['by thursday', 'by friday', 'by monday', 'by tuesday', 'by wednesday', 'by the end of', 'by tomorrow', 'let me know by', 'confirm them by', 'before friday', 'by end of'],
          'Met only if a time by which Ravi should act is given, in any form. Not met if days are mentioned only as session dates, or no deadline is given.'),
      ],
    },
    scaffolding_policy: {
      hints: [
        'Start with "We will run two shorter sessions" and only then explain.',
        'Ravi cannot act on the pros and cons; he can act on room size and head count.',
        'Finish with what to book and by when, so Ravi does not need to reply with a question.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'What did you leave out that you would have included for a colleague who was in the discussion?',
    retry_variation: 'The audience changes from a familiar colleague to an unfamiliar external contact who needs a yes/no.',
    situation_facts: ['Two options were compared: one long session or two shorter sessions.', 'Two shorter sessions were chosen.', 'The room holds fifteen; twenty-two people are joining.', 'Ravi manages the calendar and did not follow the discussion.'],
    learner_actions: ['Put the decision in the first sentence.', 'Give the one reason Ravi needs: the room does not hold everyone.', 'End with what to book and by when.'],
    clarifications: [
      clarify('Should I explain both options to Ravi?', 'He did not follow the discussion and cannot act on the comparison; he can act on what to book.'),
      clarify('Which days are the sessions?', 'Not fixed yet; you may propose days or ask Ravi for free slots.'),
    ],
    examples: [
      example('EX-LEAD', ['C-MAIN-FIRST', 'C-REASON', 'C-ASK', 'C-DEADLINE'], 'We will run two shorter onboarding sessions instead of one, because the room holds fifteen and twenty-two people are joining. Please book two slots of ninety minutes next week and confirm by Thursday.', 'Decision first, the capacity reason, a concrete booking action and a deadline.'),
      counter('CX-COMPARISON', ['C-MAIN-FIRST', 'C-ASK'], 'Hi Ravi, we had a long discussion about the onboarding format and weighed up several pros and cons of a single session versus smaller groups before reaching a view.', 'Opens with the discussion, not the decision, and asks for nothing.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-MAIN-FIRST', 'C-REASON', 'C-ASK', 'C-DEADLINE'], next_change_priority: ['C-MAIN-FIRST', 'C-ASK', 'C-REASON', 'C-DEADLINE'] },
    transfer: {
      setting: 'You compared two time slots for a visiting group\'s lab tour: the morning, or the afternoon. You chose the afternoon because the lab is in use for teaching until noon. Mr Okafor, who coordinates the visit from the other side and has had none of this discussion, needs a clear yes or no on the 2 pm slot he proposed.',
      objective: 'Write Mr Okafor a message that leads with the answer (yes to 2 pm), gives the one reason he needs, and says exactly what you need him to confirm and by when.',
      constraints_notes: ['Mr Okafor was not part of the discussion and needs a yes or no.', 'The lab is in use until noon.'],
      situation_facts: ['Two slots were compared: morning or afternoon.', 'The afternoon was chosen because the lab is in use until noon.', 'Mr Okafor proposed 2 pm and needs a yes or no.'],
      exposure_tags: [],
      meaning_overrides: [
        { criterion_id: 'C-MAIN-FIRST', intent: 'Opens with the answer itself (yes to the 2 pm slot) before any reasoning.', synonyms: ['yes to 2 pm', 'yes, the afternoon', 'the afternoon slot works', '2 pm works', 'confirm the 2 pm', 'the answer is yes', 'afternoon is fine', 'yes, 2 pm'], evaluator_guidance: 'Met only if the yes/no answer comes first, in any wording. Not met if it follows the reasoning or is missing.' },
        { criterion_id: 'C-REASON', intent: 'Explains that the lab is used for teaching until noon, so a morning slot is not possible.', synonyms: ['in use until noon', 'teaching until', 'lab is busy', 'not free in the morning', 'until midday', 'morning is not possible', 'lab is used'], evaluator_guidance: 'Met only if the lab-use reason is given. Not met if a different or no reason is given.' },
        { criterion_id: 'C-ASK', intent: 'Asks Mr Okafor to confirm something concrete (the 2 pm slot, group size or arrival point) rather than describing the discussion.', synonyms: ['please confirm', 'could you confirm', 'can you confirm', 'let me know', 'send me', 'confirm the group size', 'confirm 2 pm'], evaluator_guidance: 'Met only if a concrete confirmation is requested. Not met if the message only informs.' },
      ],
    },
    accessibility_note: A11Y_TEXT,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 10 },
  },

  // ── Collaboration ─────────────────────────────────────────────────────
  {
    ...COMMON,
    mission_id: 'MIS-CORE-DISAGREE-01',
    display_code: 'M05',
    title: 'Disagree without giving up',
    target_capability_id: FAMILY.COLLABORATION,
    target_behavior_ids: ['UNDERSTAND_CONCERN', 'DISAGREE_CONSTRUCTIVELY'],
    form_behaviour_ids: ['UNDERSTAND_CONCERN', 'DISAGREE_CONSTRUCTIVELY'],
    exposure_tags: ['OPP-COLLAB-PUSHBACK', 'OPP-COLLAB-HANDOVER-DISAGREEMENT'],
    why_it_matters: 'Giving way to avoid friction and overriding to end it both lose information. Showing the concern was understood is what makes a disagreement workable.',
    scenario_context: {
      setting: 'Your colleague Mina wants to drop the printed handout from Thursday\'s session: "Nobody reads them and printing takes an afternoon we do not have." You think the handout matters because about half the group joins without laptops and would have nothing to follow.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Reply to Mina: show you understood her concern, say where you disagree and why, and propose one workable next step you could both accept.',
    },
    instructions: [
      'Restate Mina\'s concern in your own words before answering it.',
      'Say where you disagree and tie it to a fact about the group.',
      'Offer one next step or a way to decide.',
    ],
    artifacts: [message('REPLY', 'Reply to Mina', 'Write as you would in a team chat.', 1200)],
    constraints: { notes: ['Printing takes an afternoon.', 'About half the group joins without laptops.'] },
    deterministic_validation_rules: [],
    rubric: {
      criteria: [
        meaning('C-RESTATE', 'UNDERSTAND_CONCERN', 'Restates Mina\'s concern accurately.', ['REPLY'],
          'Shows the concern was understood: printing costs time the team does not have, and the handouts may go unread.',
          ['takes an afternoon', 'time to print', 'nobody reads', 'may not read', 'you are right that', 'i understand that printing', 'fair point about', 'go unread', 'end up unread'],
          'Met only if the learner restates the time cost or the unread risk, in their own words and however briefly. Not met for a generic "I hear you" or for length without the concern.'),
        meaning('C-DISAGREE', 'DISAGREE_CONSTRUCTIVELY', 'States the disagreement with a reason tied to the facts.', ['REPLY'],
          'Says they still want a handout because people without laptops would have nothing to follow.',
          ['without laptops', 'no laptop', 'nothing to follow', 'half the group', 'i disagree', 'i still think', 'i see it differently', 'that said'],
          'Met only if a reason tied to the group is given. Not met if the learner simply gives way or simply insists.'),
        meaning('C-NEXT', 'DISAGREE_CONSTRUCTIVELY', 'Proposes a workable next step or a way to decide.', ['REPLY'],
          'Offers a concrete compromise or decision method (shorter handout, print fewer, ask the group, a quick trial).',
          ['one page', 'single page', 'shorter handout', 'print only', 'ask the group', 'could we', 'what if we', 'let us try', 'how about'],
          'Met only if a specific next step is proposed. Not met for "let us discuss".'),
      ],
    },
    // P6.8: Mina answers in character from what the reply actually did.
    counterpart: {
      name: 'Mina', role: 'Colleague',
      reactions: [
        ...reacts('C-RESTATE',
          'Thanks — yes, that is my worry exactly: the afternoon it takes and how many copies end up unread.',
          'I am not sure you heard my point. It is the afternoon of printing we do not have, not the handout as such.'),
        ...reacts('C-DISAGREE',
          'The people without laptops — fair, I had not weighed that. That changes the picture for the exercises.',
          'So where do you actually stand? I cannot tell whether you agree with dropping it or not.'),
        ...reacts('C-NEXT',
          'That I could live with. Let us do it that way and see how Thursday goes.',
          'OK, but what do we do on Thursday? I need something we can both act on, not just the disagreement.'),
      ],
      all_met: 'Good — you heard me, you said where you differ and why, and you gave us something we can try. I am in.',
      none_met: 'I cannot work with this yet: I do not see my concern reflected, I cannot tell where you stand, and there is nothing for Thursday.',
    },
    scaffolding_policy: {
      hints: [
        'Begin by saying back what Mina is worried about; check it is accurate.',
        'Your disagreement is about the people without laptops. Say that plainly.',
        'A next step both can accept is usually smaller than either original position.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'Which part of Mina\'s concern was legitimate, and did your reply show that?',
    retry_variation: 'The counterparty values a different constraint (accessibility rather than time).',
    situation_facts: ['Mina wants to drop the printed handout from Thursday\'s session.', 'Printing takes an afternoon the team does not have.', 'About half the group joins without laptops.'],
    learner_actions: ['Restate Mina\'s concern in your own words.', 'Say where you disagree and tie it to the group without laptops.', 'Offer one next step or a way to decide.'],
    clarifications: [
      clarify('Can we print fewer copies or a shorter handout?', 'Nothing rules that out; it is one possible next step.'),
      clarify('Who decides in the end?', 'The two of you; the task is to reach a workable next step, not to win.'),
    ],
    examples: [
      example('EX-RESTATE', ['C-RESTATE', 'C-DISAGREE', 'C-NEXT'], 'You are right that printing takes an afternoon we do not have, and some handouts do go unread. I still think we need something on paper because half the group joins without laptops and would have nothing to follow. Could we try a single page for just that half?', 'Restates the concern, disagrees with a reason tied to the group, offers a smaller next step.'),
      counter('CX-GIVE-WAY', ['C-DISAGREE', 'C-NEXT'], 'Fine, let us drop the handout then, you know this better than I do.', 'Gives way without stating the disagreement or a next step.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-RESTATE', 'C-DISAGREE', 'C-NEXT'], next_change_priority: ['C-RESTATE', 'C-NEXT', 'C-DISAGREE'] },
    transfer: {
      setting: 'Your colleague Omar wants to replace the slide deck for Thursday\'s session with a live whiteboard: "Slides feel rigid and nobody reads them afterwards." You think the shared slide file matters because two participants use screen readers and need the material in advance in a readable form.',
      objective: 'Reply to Omar: show you understood his concern, say where you disagree and why, and offer a next step both of you could accept.',
      constraints_notes: ['Two participants use screen readers.', 'Omar finds slides rigid and unread afterwards.'],
      situation_facts: ['Omar wants to replace the slides with a live whiteboard.', 'He finds slides rigid and unread afterwards.', 'Two participants use screen readers and need material in advance.'],
      exposure_tags: [],
      meaning_overrides: [
        { criterion_id: 'C-RESTATE', intent: 'Shows the concern was understood: slides can feel rigid and are rarely read afterwards.', synonyms: ['feel rigid', 'rigid', 'nobody reads them', 'rarely read', 'you are right that', 'i understand that slides', 'fair point about', 'i see why'], evaluator_guidance: 'Met only if the learner restates the rigidity or unread point. Not met for a generic "I hear you".' },
        { criterion_id: 'C-DISAGREE', intent: 'Says they still want a shared readable file because two participants use screen readers and need it in advance.', synonyms: ['screen reader', 'in advance', 'readable file', 'two participants', 'i disagree', 'i still think', 'i see it differently', 'that said'], evaluator_guidance: 'Met only if a reason tied to the two participants is given. Not met if the learner simply gives way or simply insists.' },
        { criterion_id: 'C-NEXT', intent: 'Offers a concrete compromise or way to decide (whiteboard live plus a short readable file sent before, ask the two participants, a trial).', synonyms: ['both', 'as well as', 'send a short', 'ask the two', 'could we', 'what if we', 'let us try', 'how about', 'one page'], evaluator_guidance: 'Met only if a specific next step is proposed. Not met for "let us discuss".' },
      ],
      counterpart: {
        name: 'Omar', role: 'Colleague',
        reactions: [
          ...reacts('C-RESTATE',
            'Yes — that is it: the deck feels rigid in the room and nobody opens it afterwards.',
            'I do not think you have picked up what bothers me about the slides; it is how rigid they make the session.'),
          ...reacts('C-DISAGREE',
            'The two people on screen readers — I had not thought about them needing it in advance. Fair.',
            'I still cannot tell whether you want to keep the slides or not, or why.'),
          ...reacts('C-NEXT',
            'I can go with that. Let us try it on Thursday.',
            'Then what do we actually do on Thursday? I need a plan, not just the objection.'),
        ],
        all_met: 'You heard my point, you told me where you differ and why, and you gave us a way forward. Agreed.',
        none_met: 'I am not sure we have moved: my concern is not reflected, I cannot see your position, and nothing is decided for Thursday.',
      },
    },
    accessibility_note: A11Y_TEXT,
    confounds: [...CONFOUNDS_TEXT, 'Politeness words are not the behaviour; the check reads for the restated concern and the reason, not tone.'],
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 12 },
  },
  {
    ...COMMON,
    mission_id: 'MIS-CORE-BOUNDARY-01',
    display_code: 'M06',
    title: 'Negotiate a realistic boundary',
    target_capability_id: FAMILY.COLLABORATION,
    target_behavior_ids: ['NEGOTIATE_BOUNDARY'],
    form_behaviour_ids: ['NEGOTIATE_BOUNDARY'],
    exposure_tags: ['OPP-COLLAB-PRIORITY-ALIGN'],
    why_it_matters: 'Accepting everything silently fails later; refusing everything leaves the team stuck. A clear limit with an alternative keeps both the work and the relationship intact.',
    scenario_context: {
      setting: 'Priya asks you to also run the sign-in desk on Thursday morning. You already own the room setup from 8:00 and the welcome at 9:00, and both need you in the room. The sign-in desk is in the corridor from 8:30.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Reply to Priya: say clearly what you can and cannot take on, explain the clash, offer what you can do instead, and agree who decides if plans change.',
    },
    instructions: [
      'Fill in each part of the reply sheet.',
      'Explain why the desk clashes with what you already own.',
      'Offer an alternative and name who decides if the limit is tested.',
    ],
    artifacts: [sheet('REPLY', 'Reply to Priya', 'Four short answers.', [
      ['can_do', 'What can you take on?', 300],
      ['cannot_do', 'What can you not take on, and why?', 400],
      ['instead', 'What can you offer instead?', 300],
      ['who_decides', 'Who decides if this needs to change?', 120],
    ])],
    constraints: { notes: ['Room setup from 8:00 and the welcome at 9:00 both need you in the room.', 'The desk is in the corridor from 8:30.'] },
    deterministic_validation_rules: [
      oneOf('R-DECIDER', 'C-DECIDER', 'REPLY', 'fields.who_decides', ['priya'], 'The decider named is someone in the situation (Priya asked for the desk).'),
    ],
    rubric: {
      criteria: [
        meaning('C-LIMIT', 'NEGOTIATE_BOUNDARY', 'States the limit: what they cannot take on.', ['REPLY'],
          'Says plainly what they will not take on (the sign-in desk from 8:30, or the part of it that clashes).',
          ['cannot', "can't", 'not able to', 'not realistic', 'will not be able', 'is not possible', 'unable to', 'cannot run', 'not going to be able'],
          'Met only if a specific limit is stated, however briefly. Not met for "it is difficult" with nothing refused, or for a filled-in field that refuses nothing.'),
        meaning('C-WHY', 'NEGOTIATE_BOUNDARY', 'Explains the capacity clash.', ['REPLY'],
          'Explains that the desk from 8:30 overlaps with setup and the welcome, which both need them in the room.',
          ['at the same time', 'overlap', '8:30', 'both need me', 'in the room', 'two places', 'clash', 'while i am setting up'],
          'Met only if the time clash is explained. Not met for "I am too busy".'),
        meaning('C-INSTEAD', 'NEGOTIATE_BOUNDARY', 'Offers a concrete alternative.', ['REPLY'],
          'Offers something specific they can do instead (cover until a time, brief a stand-in, leave the list ready).',
          ['i can hand', 'i can offer', 'what i can offer', 'i can brief', 'i can cover', 'instead i', 'i could', 'leave them', 'hand the desk', 'until 8:50'],
          'Met only if the alternative is concrete (a time slice, a stand-in, a prepared handover). Not met for "I will help where I can".'),
        det('C-DECIDER', 'NEGOTIATE_BOUNDARY', 'Names who decides if the limit is tested.', ['REPLY']),
      ],
    },
    // P6.8: Priya answers in character from what the reply actually did.
    counterpart: {
      name: 'Priya', role: 'Coordinator',
      reactions: [
        ...reacts('C-LIMIT',
          'Understood — the desk from 8:30 is a no from you. Good to have that clear.',
          'I still do not know what you are actually saying no to. Can you take the desk or not?'),
        ...reacts('C-WHY',
          'Right, setup and the welcome both have you in the room; I had not lined the times up.',
          'Why not, though? Without the clash spelled out I cannot tell what would give.'),
        ...reacts('C-INSTEAD',
          'That alternative works for me; I can plan the desk around it.',
          'So what can you do? A plain no leaves me with an uncovered desk at 8:30.'),
        ...reacts('C-DECIDER',
          'Agreed — if the desk has to be covered after all, that call sits with me.',
          'And if I need the desk covered anyway, who decides what moves?'),
      ],
      all_met: 'That is a clear answer: what you can do, what you cannot and why, an alternative, and who decides. I can work with it.',
      none_met: 'I am not clearer than before: I cannot tell what you will take on, why the desk is a problem, or what happens instead.',
    },
    scaffolding_policy: {
      hints: [
        'Lay the three times side by side: 8:00 setup, 8:30 desk, 9:00 welcome.',
        'An alternative can be a time slice (the desk until 8:50) or a different person.',
        'If Priya needs the desk covered anyway, who gets to choose what gives?',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'Did you state the limit before or after offering the alternative, and did it read as a refusal or a plan?',
    retry_variation: 'The deadline matters more than the scope (Priya needs an answer in five minutes).',
    situation_facts: ['Priya asks you to also run the sign-in desk on Thursday morning.', 'You own the room setup from 8:00 and the welcome at 9:00.', 'Both need you in the room.', 'The sign-in desk is in the corridor from 8:30.'],
    learner_actions: ['Say what you can take on.', 'Say what you cannot, and explain the clash.', 'Offer an alternative and name who decides if the limit is tested.'],
    clarifications: [
      clarify('Can someone else do the setup?', 'Nothing in the facts says so; you may propose it as the alternative.'),
      clarify('Does the desk need to be covered the whole morning?', 'Priya has not said; you may ask or propose a time slice.'),
    ],
    examples: [
      example('EX-CLASH', ['C-LIMIT', 'C-WHY', 'C-INSTEAD'], 'I cannot take the desk from 8:30 because the setup from 8:00 and the welcome at 9:00 both need me in the room at the same time. I can cover the desk until 8:50 and then hand it to whoever Priya names.', 'States the limit, explains the time clash, offers a bounded alternative.'),
      counter('CX-BUSY', ['C-WHY'], 'Sorry, I am really busy that morning so I cannot do the desk as well.', 'A limit without the clash; the reader cannot tell what gives.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-WHY', 'C-LIMIT', 'C-INSTEAD', 'C-DECIDER'], next_change_priority: ['C-WHY', 'C-INSTEAD', 'C-DECIDER', 'C-LIMIT'] },
    transfer: {
      setting: 'Priya messages: "Can you take the visitor tour at 11:00? I need an answer in the next five minutes." You already run the feedback session from 10:30 to 11:30, which cannot move because the visitors leave at noon.',
      objective: 'Reply to Priya within the five minutes: say clearly what you can and cannot take on, explain the clash, offer what you can do instead, and agree who decides if plans change.',
      constraints_notes: ['Priya needs an answer in five minutes.', 'The feedback session runs 10:30 to 11:30 and cannot move.'],
      situation_facts: ['Priya asks you to take the visitor tour at 11:00.', 'An answer is needed in five minutes.', 'You run the feedback session 10:30 to 11:30.', 'The visitors leave at noon.'],
      exposure_tags: [],
      meaning_overrides: [{
        criterion_id: 'C-WHY', intent: 'Explains that the tour at 11:00 falls inside the feedback session (10:30 to 11:30), which cannot move.', synonyms: ['during the feedback session', 'inside the session', 'overlap', '11:00 is in the middle', 'cannot move', 'at the same time', 'two places', 'clash'], evaluator_guidance: 'Met only if the time clash is explained. Not met for "I am too busy".',
      }],
      counterpart: {
        name: 'Priya', role: 'Coordinator',
        reactions: [
          ...reacts('C-LIMIT',
            'OK — the 11:00 tour is a no from you. That is the answer I needed in the time I had.',
            'Five minutes and I still do not have a yes or no on the tour from you.'),
          ...reacts('C-WHY',
            'Of course, 11:00 sits inside your feedback session and that cannot move.',
            'Why not? If I do not know what it clashes with, I cannot move anything else around.'),
          ...reacts('C-INSTEAD',
            'That I can use; let me see if it covers the visitors.',
            'So what can you offer the visitors instead? A bare no leaves them with nobody at 11:00.'),
          ...reacts('C-DECIDER',
            'Agreed — if the tour has to happen anyway, I make that call.',
            'And if the tour has to go ahead, who decides what gives?'),
        ],
        all_met: 'Clear and in time: what you can and cannot do, why, an alternative, and who decides. Thank you.',
        none_met: 'The five minutes are up and I am no clearer on what you can do, what clashes, or what happens instead.',
      },
    },
    accessibility_note: A11Y_SHEET,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 10 },
  },

  // ── Adaptability ──────────────────────────────────────────────────────
  {
    ...COMMON,
    mission_id: 'MIS-CORE-REPLAN-01',
    display_code: 'M07',
    title: 'Replan after a change',
    target_capability_id: FAMILY.ADAPTABILITY,
    target_behavior_ids: ['REPLAN_CONSTRAINT', 'SEEK_HELP'],
    form_behaviour_ids: ['REPLAN_CONSTRAINT', 'SEEK_HELP'],
    exposure_tags: ['OPP-ADAPT-REPLAN', 'OPP-EXEC-DEPENDENCY-UPDATE'],
    why_it_matters: 'A change rarely breaks the whole plan. Finding exactly what it touches, saying what the fix costs and asking for the right help is what keeps the rest on track.',
    scenario_context: {
      setting: 'Your plan for Thursday\'s session has three parts: setup (you), a short talk by Sam, and group work (you). Sam has just told you he is needed elsewhere until noon. The session starts at 9:30 and must finish by 11:30. Priya is free that morning.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Update the board and write to Priya: say which part is affected, what you will change and what it costs, and ask Priya for one specific thing.',
    },
    instructions: [
      'On the board, give every part an owner and note what changes.',
      'In the message, name the affected part and the cost of your change.',
      'Ask Priya for one specific thing.',
    ],
    artifacts: [
      board('PLAN', 'Session plan', 'Owner and change for each part.', [col('part', 'Part'), col('owner', 'Owner', true), col('change', 'What changes', true)], [
        { id: 'setup', part: 'Setup (9:15)', owner: null, change: null },
        { id: 'talk', part: 'Short talk (9:30)', owner: null, change: null },
        { id: 'group', part: 'Group work (10:15)', owner: null, change: null },
      ]),
      message('NOTE', 'Message to Priya', 'What changed, what it costs, and what you need from her.', 1200),
    ],
    constraints: { notes: ['The session must finish by 11:30.', 'Sam is unavailable until noon.'] },
    deterministic_validation_rules: [
      oneOf('R-OWNERS', 'C-OWNERS', 'PLAN', 'rows.owner', ['me', 'i', 'myself', 'you', 'priya', 'sam'], 'Every part names an owner who is in the plan (you, Priya or Sam).'),
    ],
    rubric: {
      criteria: [
        meaning('C-AFFECTED', 'REPLAN_CONSTRAINT', 'Names the part of the plan the change affects.', ['NOTE'],
          'Identifies which part of the session the change breaks (Sam\'s short talk), in any wording.',
          ["sam's talk", "sam's slot", "sam's short talk", 'the talk', 'his talk', 'part that breaks', 'affected', 'depends on sam'],
          'Met only if the affected part is identified. Not met if the message says "the plan changed" without saying which part, or names the wrong part.'),
        meaning('C-REPLAN', 'REPLAN_CONSTRAINT', 'Re-plans inside the time limit and states the cost.', ['NOTE', 'PLAN'],
          'Changes the affected part (moved, shortened, swapped or dropped) and says what that costs in scope, time or quality.',
          ['move the talk', 'swap', 'shorten', 'drop the talk', 'skip', 'postpone', 'instead of', 'cut', 'reorder', 'start with group work', 'we lose'],
          'Met only if a change and its cost are stated. Not met for "we will manage".'),
        meaning('C-HELP', 'SEEK_HELP', 'Asks a specific person for a specific thing.', ['NOTE'],
          'Asks Priya for one concrete thing (for example to give the talk, cover setup, or confirm the room).',
          ['could you', 'can you', 'would you be able', 'priya, please', 'i need you to', 'can i ask you to', 'would you give the talk'],
          'Met only if the request names what Priya should do. Not met for "any help welcome".'),
        det('C-OWNERS', 'REPLAN_CONSTRAINT', 'Every part has an owner who is in the plan.', ['PLAN']),
      ],
    },
    scaffolding_policy: {
      hints: [
        'Only one of the three parts depended on Sam. Start there.',
        'Every change costs something: time, content or quality. Say which.',
        'A request Priya can say yes or no to in one word is a specific request.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'What did you keep unchanged, and why was that still valid?',
    retry_variation: 'The change affects a dependency (the room is unavailable until 10:00) rather than a person.',
    situation_facts: ['Thursday\'s session has three parts: setup (you), a short talk by Sam, group work (you).', 'Sam is needed elsewhere until noon.', 'The session runs 9:30 to 11:30.', 'Priya is free that morning.'],
    learner_actions: ['Give every part an owner on the board and note what changes.', 'In the message, name the affected part and what your change costs.', 'Ask Priya for one specific thing.'],
    clarifications: [
      clarify('Can the session be moved to the afternoon?', 'No; it must finish by 11:30.'),
      clarify('Can I drop the talk entirely?', 'Yes, if you say what that costs.'),
    ],
    examples: [
      example('EX-REPLAN', ['C-AFFECTED', 'C-REPLAN', 'C-HELP'], 'Only the short talk depends on Sam, so I will swap it with the group work and shorten the talk to ten minutes at the end, which costs us the discussion time after it. Priya, could you give the talk at 11:00 using Sam\'s slides?', 'Names the affected part, states the change and its cost, asks Priya one specific thing.'),
      counter('CX-MANAGE', ['C-REPLAN', 'C-HELP'], 'Sam cannot make it, but we will manage somehow on the day and any help from anyone is welcome.', 'No change, no cost, no specific request.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-REPLAN', 'C-AFFECTED', 'C-HELP', 'C-OWNERS'], next_change_priority: ['C-REPLAN', 'C-HELP', 'C-OWNERS', 'C-AFFECTED'] },
    transfer: {
      setting: 'Your plan for Thursday\'s session has three parts: setup (you), a short talk by Sam, and group work (you). The room has just been double-booked and is unavailable until 10:00. The session starts at 9:30 and must finish by 11:30. Priya is free that morning and knows the other rooms.',
      objective: 'Update the board and write to Priya: say which part is affected, what you will change and what it costs, and ask Priya for one specific thing.',
      constraints_notes: ['The session must finish by 11:30.', 'The room is unavailable until 10:00.'],
      situation_facts: ['The session has setup, a short talk and group work.', 'The room is unavailable until 10:00.', 'The session must finish by 11:30.', 'Priya is free and knows the other rooms.'],
      exposure_tags: [],
      meaning_overrides: [{
        criterion_id: 'C-HELP', intent: 'Asks Priya for one concrete thing (for example to find another room, to greet people at 9:30, or to confirm when the room frees up).', synonyms: ['could you', 'can you', 'would you be able', 'priya, please', 'i need you to', 'can i ask you to', 'find another room', 'check the room'], evaluator_guidance: 'Met only if the request names what Priya should do. Not met for "any help welcome".',
      }, {
        criterion_id: 'C-AFFECTED', intent: 'Identifies which part of the session the room clash breaks (the setup at 9:15 and the start), in any wording.',
        synonyms: ['the setup', 'setup is affected', 'the room', 'room is unavailable', '9:15', 'the start', 'first part', 'affected part', 'cannot set up', 'no room until'],
        evaluator_guidance: 'Met only if the affected part is identified. Not met for "the plan changed" without saying which part.',
      }],
    },
    accessibility_note: A11Y_BOARD,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 15 },
  },
  {
    ...COMMON,
    mission_id: 'MIS-CORE-REPAIR-01',
    display_code: 'M08',
    title: 'Recover after a mistake',
    target_capability_id: FAMILY.ADAPTABILITY,
    target_behavior_ids: ['REPAIR_MISTAKE', 'UPDATE_WITH_EVIDENCE'],
    form_behaviour_ids: ['REPAIR_MISTAKE', 'UPDATE_WITH_EVIDENCE'],
    exposure_tags: ['OPP-ADAPT-FEEDBACK', 'OPP-ADAPT-FACT-MISMATCH-REVISION'],
    why_it_matters: 'The cost of a mistake is mostly in what happens after it. Owning it plainly, fixing it and checking what else it touched is what people remember.',
    scenario_context: {
      setting: 'You sent the group the wrong start time: your message said 10:00, but the booking is 9:30. Sam noticed and asked whether he misread. Twenty people received your message an hour ago, and some will have added it to their calendars.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Write the correction you will send to the group: own the specific error, give the right time, deal with what the mistake may already have affected, and say what you will do so it does not happen again.',
    },
    instructions: [
      'Say plainly what was wrong and that it was yours.',
      'Give the correct time.',
      'Think about what people may already have done with the wrong time.',
    ],
    artifacts: [message('CORRECTION', 'Correction to the group', 'Everyone who got the first message gets this one.', 1200)],
    constraints: { notes: ['The booking is 9:30.', 'The first message went out an hour ago.'] },
    deterministic_validation_rules: [
      pattern('R-CORRECT', 'C-CORRECT', 'CORRECTION', 'text', '\\b0?9[:.]30\\b|\\b9\\s?30\\s?(am)?\\b|half past nine|nine[- ]thirty', 'The correction gives the right start time (9:30).'),
    ],
    rubric: {
      criteria: [
        meaning('C-OWN', 'REPAIR_MISTAKE', 'Acknowledges the specific error as their own.', ['CORRECTION'],
          'Says the earlier time was wrong and that the error was theirs, without blaming others or hiding it.',
          ['my mistake', 'i sent the wrong', 'i got the time wrong', 'apologies', 'sorry', 'i wrote 10:00', 'the error was mine', 'i made an error', 'my error'],
          'Met only if ownership is explicit. Not met for a passive "the time was incorrect".'),
        det('C-CORRECT', 'REPAIR_MISTAKE', 'Gives the correct start time (9:30).', ['CORRECTION']),
        meaning('C-KNOCKON', 'UPDATE_WITH_EVIDENCE', 'Addresses what the wrong time may already have affected.', ['CORRECTION'],
          'Checks for knock-on effects (calendar entries, travel, arrival, room) and tells people what to do about them.',
          ['calendar', 'invite', 'travel', 'arrive', 'if you have already', 'please update', 'knock-on', 'forwarded', 'let anyone know'],
          'Met only if a specific knock-on effect is addressed. Not met if only the time is corrected.'),
        meaning('C-PREVENT', 'REPAIR_MISTAKE', 'Says what will prevent it recurring.', ['CORRECTION'],
          'Names a concrete step they will take so the error does not happen again.',
          ['next time', 'from now on', 'in future', 'i will double-check', 'i will check', 'before sending', 'to avoid this', 'against the booking'],
          'Met only if a prevention step is stated. Not met for "it will not happen again" alone.'),
      ],
    },
    scaffolding_policy: {
      hints: [
        'Name the wrong time and the right time in the same sentence.',
        'What has a person done with the wrong time in the last hour? Address that.',
        'Prevention is a specific check, not a promise.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'Did your correction make the reader\'s next step obvious, or did it mostly explain yourself?',
    retry_variation: 'The error arises from ambiguous source information (two bookings with different times).',
    situation_facts: ['Your message said 10:00; the booking is 9:30.', 'Sam asked whether he misread.', 'Twenty people received the message an hour ago.', 'Some will have added 10:00 to their calendars.'],
    learner_actions: ['Say plainly what was wrong and that it was yours.', 'Give the correct time.', 'Address what people may already have done with the wrong time.', 'Say what you will do so it does not happen again.'],
    clarifications: [
      clarify('Should I reply only to Sam?', 'Everyone who got the first message gets this one.'),
      clarify('Do I need to explain how it happened?', 'Not in detail; owning it and preventing it matter more than the story.'),
    ],
    examples: [
      example('EX-OWN', ['C-OWN', 'C-CORRECT', 'C-KNOCKON', 'C-PREVENT'], 'My mistake: I wrote 10:00 in this morning\'s message, but the session starts at 9:30. If you have already put 10:00 in your calendar, please change it to 9:30. Next time I will check the time against the booking before sending.', 'Owns the specific error, corrects it, handles the calendar knock-on, names a concrete prevention step.'),
      counter('CX-PASSIVE', ['C-OWN', 'C-KNOCKON'], 'Please note the time was incorrect in the earlier message; the correct start is 9:30.', 'Passive voice hides whose error it was; nothing is said about calendars.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-OWN', 'C-CORRECT', 'C-KNOCKON', 'C-PREVENT'], next_change_priority: ['C-OWN', 'C-KNOCKON', 'C-PREVENT', 'C-CORRECT'] },
    transfer: {
      setting: 'Two bookings exist for Thursday\'s session: the room calendar shows 14:30, the confirmation email from the venue says 14:00. You told the group 14:30. The venue has just confirmed that 14:00 is right and the calendar entry was stale. Twenty people got your message yesterday.',
      objective: 'Write the correction you will send to the group: own the specific error, give the right time, deal with what the mistake may already have affected, and say what you will do so it does not happen again.',
      constraints_notes: ['The venue confirmation (14:00) is authoritative.', 'Your message went out yesterday.'],
      situation_facts: ['Two sources disagreed: calendar 14:30, venue email 14:00.', 'You told the group 14:30.', 'The venue confirms 14:00.', 'Twenty people got the message yesterday.'],
      exposure_tags: [],
      rule_overrides: [{ rule_id: 'R-CORRECT', params: { pattern: '\\b14[:.]00\\b|\\b2\\s?pm\\b|two o\'clock', flags: 'i' }, description: 'The correction gives the right start time (14:00).' }],
      meaning_overrides: [{
        criterion_id: 'C-OWN', intent: 'Says the earlier time was wrong and that choosing it was their error, without blaming the calendar or the venue.', synonyms: ['my mistake', 'i sent the wrong', 'i got the time wrong', 'apologies', 'sorry', 'i wrote 14:30', 'the error was mine', 'i should have checked'], evaluator_guidance: 'Met only if ownership is explicit. Not met for a passive "the time was incorrect" or for blaming the calendar.',
      }],
    },
    accessibility_note: A11Y_TEXT,
    confounds: [...CONFOUNDS_TEXT, 'Apology words alone are not ownership; the check reads for the named error, not remorse or tone.'],
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 10 },
  },

  // ── Execution ─────────────────────────────────────────────────────────
  {
    ...COMMON,
    mission_id: 'MIS-CORE-USABLE-HANDOVER-01',
    display_code: 'M09',
    title: 'Make the handover usable',
    target_capability_id: FAMILY.EXECUTION,
    target_behavior_ids: ['ASSIGN_RESPONSIBILITY', 'DEFINE_COMPLETION'],
    form_behaviour_ids: ['ASSIGN_RESPONSIBILITY', 'DEFINE_COMPLETION'],
    exposure_tags: ['OPP-EXEC-BOARD-OWNERS', 'OPP-EXEC-BOARD-FINAL'],
    why_it_matters: 'A board where everyone agrees "we will sort it" is not a plan. Realistic owners and completion checks someone else can verify are what let two people work without asking you.',
    scenario_context: {
      setting: 'Two colleagues, Lea and Tom, agreed to prepare a short demonstration for a visiting group next Wednesday, but nobody wrote down who does what. The board lists four tasks with no owner and no completion check. Lea is free Monday and Tuesday; Tom is away on Monday. The projector cannot be tested until the room is free on Tuesday.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Give each task a realistic owner and a completion check someone else could verify, then write the handover both can run from. If a task cannot be owned, say who must decide.',
    },
    instructions: [
      'Fill in the owner and "done when" for every task on the board.',
      'Respect who is available when.',
      'Write the handover so Lea and Tom can start without asking you anything.',
    ],
    artifacts: [
      board('BOARD', 'Demo task board', 'Owner and completion check for each task.', [col('task', 'Task'), col('due', 'Due'), col('owner', 'Owner', true), col('done_when', 'Done when', true)], [
        { id: 'slides', task: 'Prepare the demo slides', due: 'Monday', owner: null, done_when: null },
        { id: 'room', task: 'Book the demo room', due: 'Monday', owner: null, done_when: null },
        { id: 'projector', task: 'Test the projector', due: 'Tuesday', owner: null, done_when: null },
        { id: 'visitors', task: 'Confirm the visitor list', due: 'Wednesday morning', owner: null, done_when: null },
      ]),
      message('HANDOVER', 'Handover to Lea and Tom', 'What each of them owns and how they will know it is done.', 1500),
    ],
    constraints: { notes: ['Lea is free Monday and Tuesday.', 'Tom is away on Monday.', 'The projector can only be tested on Tuesday.'] },
    deterministic_validation_rules: [
      oneOf('R-OWNERS', 'C-OWNERS', 'BOARD', 'rows.owner', ['lea', 'tom', 'escalate', 'escalated', 'decide', 'decides'], 'Every task names Lea or Tom, or escalates it to a named decider.'),
      required('R-DONE', 'C-DONE', 'BOARD', 'rows.done_when', 6, 'Every task has something written in "done when".'),
    ],
    rubric: {
      criteria: [
        det('C-OWNERS', 'ASSIGN_RESPONSIBILITY', 'Every task names Lea or Tom as owner, or a named person who will decide.', ['BOARD']),
        det('C-DONE', 'DEFINE_COMPLETION', 'Every task has a completion check written down.', ['BOARD']),
        meaning('C-REALISTIC', 'ASSIGN_RESPONSIBILITY', 'Owners respect who is available when.', ['HANDOVER', 'BOARD'],
          'Monday tasks are not given to Tom, and the projector test sits on Tuesday when the room is free; or an unresolvable task is escalated to a named decider with the reason.',
          ['tom is away', 'lea on monday', 'tuesday when the room', 'room is free', 'not monday', 'tom cannot', 'available on', 'tom from tuesday', 'ask priya to decide', 'escalating to', 'escalate to', 'cannot assign'],
          'Met only if availability is reflected in the assignment, or an unassignable task is explicitly escalated to a named person with a reason (a defensible escalation counts). Not met if Tom owns Monday work with no comment.'),
        meaning('C-VERIFIABLE', 'DEFINE_COMPLETION', 'Completion checks are observable by someone else.', ['BOARD', 'HANDOVER'],
          'Each "done when" names something another person could see or receive (a file sent, a confirmation received, a successful test), not "when finished".',
          ['sent to', 'uploaded', 'confirmed by', 'booking confirmation', 'test run', 'shown on screen', 'list has', 'checked by', 'in the shared folder', 'reply from'],
          'Met only if at least most checks are observable. Not met for "done when done" style entries.'),
      ],
    },
    scaffolding_policy: {
      hints: [
        'Could another person tell what they own from this handover?',
        'Match each due day to who is actually available that day.',
        'A completion check is something someone else could see: a file in a folder, a confirmation, a working projector.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'Which task was hardest to give an owner, and did you escalate it or force it?',
    retry_variation: 'A dependency has no available owner (nobody is free on Tuesday for the projector test).',
    situation_facts: ['Lea and Tom agreed to prepare a short demonstration for next Wednesday.', 'Nobody wrote down who does what.', 'Four tasks have no owner and no completion check.', 'Lea is free Monday and Tuesday; Tom is away on Monday.', 'The projector can only be tested on Tuesday when the room is free.'],
    learner_actions: ['Give every task an owner and a "done when" on the board.', 'Respect who is available when; escalate what cannot be owned.', 'Write the handover so Lea and Tom can start without asking you anything.'],
    clarifications: [
      clarify('Can I give a task to myself?', 'You are handing over; if a task has no realistic owner, name who decides rather than taking it silently.'),
      clarify('What if nobody can do a task on its due day?', 'Say so and escalate it to a named person with the reason. A defensible escalation is a valid answer.'),
      clarify('Does the completion check have to be a document?', 'No; anything another person could see or receive counts.'),
    ],
    examples: [
      example('EX-HANDOVER', ['C-REALISTIC', 'C-VERIFIABLE'], 'Lea takes both Monday items, the slides and the room booking, since Tom cannot work that day; Tom runs the projector test on Tuesday afternoon once the room is free. A task is finished when another person can see it: the deck sitting in the shared folder, the booking confirmation forwarded, or the test slide showing on screen.', 'Owners follow availability and every check is something another person could see.'),
      counter('CX-WE-WILL-SORT', ['C-OWNERS', 'C-VERIFIABLE'], 'You two sort out the slides and the room between you this week, and we will know it is done when it feels ready.', 'No owner, no observable check; the two people still have to ask.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-REALISTIC', 'C-OWNERS', 'C-VERIFIABLE', 'C-DONE'], next_change_priority: ['C-OWNERS', 'C-DONE', 'C-REALISTIC', 'C-VERIFIABLE'] },
    transfer: {
      setting: 'After a call with a client, Lea and Tom agreed to follow up but nobody wrote down who does what. The board lists four follow-up tasks with no owner and no completion check. Lea is out on Thursday; Tom has no access to the quoting tool. The follow-up call cannot be booked until the client replies, which nobody can make happen.',
      objective: 'Give each follow-up task a realistic owner and a completion check someone else could verify, then write the handover both can run from. If a task cannot be owned yet, say who decides and why.',
      constraints_notes: ['Lea is out on Thursday.', 'Tom has no access to the quoting tool.', 'The follow-up call depends on the client replying.'],
      situation_facts: ['Lea and Tom agreed to follow up after a client call.', 'Four tasks have no owner and no completion check.', 'Lea is out on Thursday; Tom cannot use the quoting tool.', 'The follow-up call cannot be booked until the client replies.'],
      exposure_tags: [],
      artifact_initial_state: {
        BOARD: { rows: [
          { id: 'summary', task: 'Send the call summary to the client', due: 'Wednesday', owner: null, done_when: null },
          { id: 'quote', task: 'Share the revised quote', due: 'Thursday', owner: null, done_when: null },
          { id: 'followup', task: 'Book the follow-up call', due: 'When the client replies', owner: null, done_when: null },
          { id: 'record', task: 'Update the contact record', due: 'Friday', owner: null, done_when: null },
        ] },
      },
      meaning_overrides: [{
        criterion_id: 'C-REALISTIC', intent: 'Thursday work is not given to Lea, the quote is not given to Tom, and the follow-up call (which depends on the client) is escalated to a named decider with the reason rather than forced onto someone.',
        synonyms: ['lea is out', 'not lea on thursday', 'tom cannot access', 'no access to the quoting', 'depends on the client', 'until the client replies', 'escalating to', 'escalate to', 'cannot assign', 'ask priya to decide', 'who decides'],
        evaluator_guidance: 'Met only if availability or access is reflected in the assignment, or the dependent task is explicitly escalated to a named person with a reason. Not met if Lea owns Thursday work or Tom owns the quote with no comment.',
      }],
    },
    accessibility_note: A11Y_BOARD,
    confounds: [...CONFOUNDS_TEXT, 'A learner may force an owner onto every task to "finish"; the escalation route is explained so forcing is not rewarded over an honest handover.'],
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 15 },
  },
  {
    ...COMMON,
    mission_id: 'MIS-CORE-NOT-TO-DO-01',
    display_code: 'M10',
    title: 'Choose what not to do',
    target_capability_id: FAMILY.EXECUTION,
    target_behavior_ids: ['PRIORITIZE_WORK', 'CHECK_DEPENDENCY'],
    form_behaviour_ids: ['PRIORITIZE_WORK', 'CHECK_DEPENDENCY'],
    exposure_tags: ['OPP-EXEC-BOARD-OWNERS', 'OPP-EXEC-DEPENDENCY-UPDATE'],
    why_it_matters: 'When there is time for three things out of five, the quality of the plan is in what you say no to and why, not in doing a little of everything.',
    scenario_context: {
      setting: 'It is Wednesday afternoon. Five tasks are open for Friday\'s session and you have time for three. The tasks: confirm the room (nothing else can be finalised without it), print name badges, prepare the feedback form, send the reminder with the room details, and tidy the shared folder.', // campus-allow HARDCODED_SCENARIO: synthetic DRAFT practice content (P6.2), not an assessment scenario
      objective: 'Order the tasks, give each a decision with a reason tied to the goal or a dependency, and say explicitly which tasks you defer or hand to someone else.',
    },
    instructions: [
      'Give every task an order from 1 to 5.',
      'For each task write DO, DEFER or HAND OFF and the reason.',
      'In the note, explain the one dependency that fixes part of the order.',
    ],
    artifacts: [
      board('BOARD', 'Open tasks', 'Order and decision for each task.', [col('task', 'Task'), col('order', 'Order', true, 'number'), col('decision', 'Decision and reason', true)], [
        { id: 'room', task: 'Confirm the room', order: null, decision: null },
        { id: 'badges', task: 'Print name badges', order: null, decision: null },
        { id: 'form', task: 'Prepare the feedback form', order: null, decision: null },
        { id: 'reminder', task: 'Send the reminder with room details', order: null, decision: null },
        { id: 'folder', task: 'Tidy the shared folder', order: null, decision: null },
      ]),
      message('NOTE', 'Note to the team', 'What you will do, what you will not, and why.', 1000),
    ],
    constraints: { notes: ['You have time for three of the five tasks.', 'The reminder must include the room details.'] },
    deterministic_validation_rules: [
      range('R-ORDER', 'C-ORDER', 'BOARD', 'rows.order', 1, 5, 'Every task has an order from 1 to 5.'),
      oneOf('R-DECISIONS', 'C-DECISIONS', 'BOARD', 'rows.decision', ['do', 'defer', 'hand off', 'hand-off', 'handoff', 'hand to', 'escalate', 'drop', 'skip'], 'Every task has a decision word (DO, DEFER, HAND OFF or an escalation).'),
    ],
    rubric: {
      criteria: [
        det('C-ORDER', 'PRIORITIZE_WORK', 'Every task has an order.', ['BOARD']),
        det('C-DECISIONS', 'PRIORITIZE_WORK', 'Each task has a decision entered (DO, DEFER, HAND OFF or an escalation).', ['BOARD']),
        meaning('C-DEPENDENCY', 'CHECK_DEPENDENCY', 'Puts the room confirmation before the reminder because the reminder depends on it.', ['NOTE', 'BOARD'],
          'Explains that the reminder cannot go out until the room is confirmed, so the room comes first.',
          ['room first', 'before the reminder', 'reminder needs the room', 'depends on the room', 'cannot send the reminder', 'once the room is confirmed', 'after the room', 'until the room'],
          'Met only if the room-to-reminder dependency is stated. Not met if the order is right but no dependency is named.'),
        meaning('C-DEFER', 'PRIORITIZE_WORK', 'Explicitly defers or hands off at least one task with a reason.', ['NOTE', 'BOARD'],
          'Names a task that will not be done this week (or by them) and gives the reason; escalating a task to a named person with the reason also counts.',
          ['defer', 'leave until', 'after friday', 'hand to', 'ask someone', 'not this week', 'drop', 'skip', 'can wait', 'escalating to', 'escalate to', 'cannot assign'],
          'Met only if a task is explicitly deferred, handed off or escalated with a reason. Not met if all five are kept.'),
      ],
    },
    scaffolding_policy: {
      hints: [
        'One task unblocks another. Which, and what does that fix about the order?',
        'Ask of each task: if this is not done by Friday, what actually happens?',
        'Deferring is a decision. Write it down with the reason, so nobody assumes it is still coming.',
      ],
      reveal: 'ON_REQUEST',
    },
    reflection_prompt: 'Which task did you drop that you would have been tempted to squeeze in, and what would it have cost?',
    retry_variation: 'A formerly low-priority task becomes urgent (the shared folder is needed by a visitor on Thursday).',
    situation_facts: ['It is Wednesday afternoon; five tasks are open for Friday\'s session.', 'You have time for three.', 'Nothing can be finalised until the room is confirmed.', 'The reminder must include the room details.'],
    learner_actions: ['Give every task an order from 1 to 5.', 'Write DO, DEFER or HAND OFF with a reason for each.', 'In the note, explain the dependency that fixes part of the order.'],
    clarifications: [
      clarify('Can I hand a task to someone else?', 'Yes, if you name who and say why; that counts as a decision.'),
      clarify('Do I have to do exactly three?', 'Three is what you have time for; the point is to decide explicitly about the other two.'),
    ],
    examples: [
      example('EX-ORDER', ['C-DEPENDENCY', 'C-DEFER'], 'The room comes first because the reminder cannot go out until the room is confirmed, so the reminder is second. I will defer tidying the shared folder until after Friday because nobody needs it before the session.', 'States the room-to-reminder dependency and defers a task with a reason.'),
      counter('CX-ALL-FIVE', ['C-DEFER'], 'I will try to get through all five tasks by Friday and see how far I get.', 'Nothing is deferred; the choice has not been made.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-DEPENDENCY', 'C-DEFER', 'C-ORDER', 'C-DECISIONS'], next_change_priority: ['C-DEFER', 'C-DEPENDENCY', 'C-DECISIONS', 'C-ORDER'] },
    transfer: {
      setting: 'It is Wednesday afternoon. Five tasks are open for Friday\'s session and you have time for three. A visitor has just asked to see the shared folder on Thursday morning, so tidying it is no longer the small task it was. The room still has to be confirmed before the reminder with room details can go out.',
      objective: 'Order the tasks again, give each a decision with a reason tied to the goal or a dependency, and say explicitly which tasks you now defer or hand to someone else.',
      constraints_notes: ['You have time for three of the five tasks.', 'The visitor needs the shared folder on Thursday morning.', 'The reminder must include the room details.'],
      situation_facts: ['Five tasks are open; time for three.', 'The shared folder is needed by a visitor on Thursday morning.', 'The reminder depends on the room being confirmed.'],
      exposure_tags: [],
    },
    accessibility_note: A11Y_BOARD,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
    estimated_duration: { minutes: 12 },
  },
])

// M04 — the existing DRAFT handover mission (MIS-CORE-HANDOVER-01) keeps its
// id and its v1 content untouched (a stored version never changes); v2 adds
// the P6 metadata only.
export function handoverRevision(v1) {
  return Object.freeze({
    ...v1,
    version: 2,
    display_code: 'M04',
    source: 'ORIGINAL',
    form_behaviour_ids: ['STATE_MAIN_POINT', 'ADAPT_TO_AUDIENCE'],
    exposure_tags: ['OPP-COMM-HANDOVER-AUDIENCE', 'OPP-EXEC-BOARD-OWNERS'],
    why_it_matters: 'A handover is read by someone who was not there. If they cannot tell what is open, who owns it and what to do first, the work stops the moment you leave.',
    reflection_prompt: 'Could Sam tell what he owns from this handover without messaging you?',
    retry_variation: 'The ambiguity concerns scope (what "launch checklist" includes) rather than timing.',
    situation_facts: ['You are away for two days and unreachable.', 'Two board tasks have no owner: the vendor quotes (Thursday) and the launch checklist (Friday).', 'Sam takes over and has not seen the plan.'],
    learner_actions: ['Fill in an owner (or who decides) for both tasks.', 'Write the handover message naming both tasks.', 'Say what Sam does first and give a day and time for the check-in.'],
    clarifications: [
      clarify('Can Sam own both tasks?', 'Yes, if you say so on the board and in the message.'),
      clarify('What if I do not know who should own a task?', 'Write who should decide; that is a settled answer for Sam.'),
    ],
    examples: [
      example('EX-SAM', ['C-NAMES-TASKS', 'C-FIRST-STEP'], 'Sam, two tasks have no owner yet: the vendor quotes due Thursday and the launch checklist due Friday. Please call the venue first to confirm the quote, before anything else.', 'Names both open tasks and gives one concrete first step.'),
      counter('CX-SPEED', ['C-FIRST-STEP', 'C-CHECKPOINT'], 'Sam, please get up to speed with the plan while I am away and we can catch up soon.', 'No task named, no first step, no check-in anyone can put in a calendar.'),
    ],
    first_attempt_feedback: { completed_priority: ['C-OWNERSHIP', 'C-NAMES-TASKS', 'C-CHECKPOINT', 'C-FIRST-STEP'], next_change_priority: ['C-NAMES-TASKS', 'C-OWNERSHIP', 'C-CHECKPOINT', 'C-FIRST-STEP'] },
    transfer: {
      setting: 'You are leaving for two days and a small event plan is not finished. Two tasks on the board have no owner yet: the venue contract and the "comms pack" — and nobody agrees what the comms pack actually includes. Your colleague Sam is taking over while you are away and has not seen the plan before.',
      objective: 'Write the handover so Sam can pick the plan up without asking you: name the two unowned tasks, assign an owner or ask Sam to find one, say what Sam must do first (including how to settle what the comms pack includes), and give a time when you will check in.',
      constraints_notes: ['Sam has not seen this plan before.', 'You will be unreachable for two days.', 'The scope of the comms pack is not agreed.'],
      situation_facts: ['You are away for two days and unreachable.', 'Two tasks have no owner: the venue contract and the comms pack.', 'Nobody agrees what the comms pack includes.', 'Sam has not seen the plan.'],
      exposure_tags: [],
      artifact_initial_state: {
        BOARD: { rows: [{ id: 'quotes', task: 'Venue contract', due: 'Thursday', owner: null }, { id: 'checklist', task: 'Comms pack', due: 'Friday', owner: null }] },
      },
      rule_overrides: [
        { rule_id: 'R-MSG-QUOTES', params: { pattern: 'venue\\s+contract', flags: 'i' }, description: 'The message names the venue contract.' },
        { rule_id: 'R-MSG-CHECKLIST', params: { pattern: 'comms\\s+pack', flags: 'i' }, description: 'The message names the comms pack.' },
      ],
    },
    accessibility_note: A11Y_BOARD,
    confounds: CONFOUNDS_TEXT,
    review_record: REVIEW_RECORD,
  })
}

// M04 v3 (P6.8) — the handover's checks are made honest. v1 and v2 stay
// byte-identical; v3 changes only how claims are checked:
//   C-NAMES-TASKS  "names both tasks" was two exact phrases ("vendor quotes",
//                  "launch checklist") → MEANING, so "the quotes from the
//                  vendor" counts and a reworded task name is not a failure.
//   C-OWNERSHIP    "an owner or who decides" was any 2+ characters → ONE_OF a
//                  person in the situation (Sam, Priya, you) or a decide word.
//   C-FIRST-STEP   BOTH (8+ characters + evaluator) → MEANING: one concrete
//                  first action, not a filled-in field.
//   C-CHECKPOINT   unchanged: a day AND a clock time is a structural check.
export function handoverRevisionV3(v2) {
  const transfer = { ...v2.transfer }
  delete transfer.rule_overrides
  const criteria = v2.rubric.criteria.map((c) => {
    if (c.criterion_id === 'C-NAMES-TASKS') {
      return meaning('C-NAMES-TASKS', c.behavior_id, 'Names both unowned tasks in the handover message.', ['MESSAGE'],
        'Names both tasks that have no owner (the vendor quotes and the launch checklist) so Sam knows what is open.',
        ['vendor quotes', 'launch checklist', 'the quotes', 'the checklist', 'two tasks', 'both tasks', 'quotes and the', 'checklist due', 'quotes due', 'still unowned'],
        'Met only if both open tasks are identifiable from the message, in any wording. Not met if only one is named or the tasks are referred to only as "the open items".')
    }
    if (c.criterion_id === 'C-FIRST-STEP') {
      return meaning('C-FIRST-STEP', c.behavior_id, 'Tells Sam the one concrete thing to do first.', ['PLAN', 'MESSAGE'],
        'Names one concrete action Sam should take before anything else (for example call the venue to confirm the quote).',
        ['first', 'before anything else', 'start with', 'call the venue', 'ring the venue', 'to begin with', 'the first thing', 'start by'],
        'Met only if one concrete first action is named. Not met for a list with no order, or for "get up to speed".')
    }
    if (c.criterion_id === 'C-OWNERSHIP') return { ...c, description: 'Assigns each unowned task to a person in the situation, or names who will decide.' }
    return c
  })
  return Object.freeze({
    ...v2,
    version: 3,
    deterministic_validation_rules: [
      oneOf('R-BOARD-OWNERS', 'C-OWNERSHIP', 'BOARD', 'rows.owner', ['sam', 'priya', 'me', 'i', 'myself', 'decide', 'decides'], 'Both unowned tasks name Sam, Priya or you as owner, or say who decides.'),
      ...v2.deterministic_validation_rules.filter((r) => r.criterion_id === 'C-CHECKPOINT'),
    ],
    rubric: { criteria },
    confounds: [...v2.confounds, 'Naming a task is checked by meaning, not by the exact words on the board, so a reworded task name is not a failure.'],
    transfer: {
      ...transfer,
      meaning_overrides: [{
        criterion_id: 'C-NAMES-TASKS', intent: 'Names both tasks that have no owner (the venue contract and the comms pack) so Sam knows what is open.',
        synonyms: ['venue contract', 'comms pack', 'the contract', 'two tasks', 'both tasks', 'contract and the', 'still unowned', 'communications pack'],
        evaluator_guidance: 'Met only if both open tasks are identifiable from the message, in any wording. Not met if only one is named.',
      }],
    },
  })
}

const WORK_BINDINGS = {
  M02: { 'C-CLAIM': ['CHECK:fields.claim_checked'], 'C-CONFLICT': ['CHECK:fields.what_found'], 'C-UNCERTAIN': ['CHECK:fields.uncertain'], 'C-ALT': ['CHECK:fields.alternative'] },
  M04: { 'C-FIRST-STEP': ['PLAN:fields.first_step', 'MESSAGE:text'], 'C-CHECKPOINT': ['PLAN:fields.checkpoint'], 'C-OWNERSHIP': ['BOARD:rows.owner'] },
  M06: { 'C-LIMIT': ['REPLY:fields.cannot_do'], 'C-WHY': ['REPLY:fields.cannot_do'], 'C-INSTEAD': ['REPLY:fields.instead'], 'C-DECIDER': ['REPLY:fields.who_decides'] },
  M09: { 'C-OWNERS': ['BOARD:rows.owner'], 'C-DONE': ['BOARD:rows.done_when'], 'C-REALISTIC': ['BOARD:rows.owner', 'HANDOVER:text'], 'C-VERIFIABLE': ['BOARD:rows.done_when'] },
  M10: { 'C-ORDER': ['BOARD:rows.order'], 'C-DECISIONS': ['BOARD:rows.decision'] },
}

// New unapproved versions only: earlier mission bodies remain seedable unchanged.
export function runtimeRevision(mission) {
  let criteria = mission.rubric.criteria.map((c) => {
    const locations = WORK_BINDINGS[mission.display_code]?.[c.criterion_id]
    const work_paths = locations ? locations.map((s) => {
      const [artifact_id, path] = s.split(':')
      return { artifact_id, path }
    }) : mission.artifacts.filter((a) => c.artifact_ids.includes(a.artifact_id)).flatMap((a) => {
      const paths = a.type === 'TEXT_RESPONSE' ? ['text'] : a.type === 'FIELD_SHEET' ? a.fields.map((f) => `fields.${f.key}`) : a.columns.filter((col) => col.editable).map((col) => `rows.${col.key}`)
      return paths.map((path) => ({ artifact_id: a.artifact_id, path }))
    })
    return { ...c, work_paths }
  })
  let rules = mission.deterministic_validation_rules.map((r) => {
    if (r.type === 'ONE_OF') return { ...r, params: { ...r.params, match: r.path === 'rows.decision' ? 'DECISION' : 'REFERENCE', ...(mission.display_code === 'M09' ? { named_decider: true } : {}) } }
    if (mission.display_code === 'M10' && r.rule_id === 'R-ORDER') return { ...r, params: { ...r.params, integer: true, unique: true } }
    return r
  })
  const overrides = [...(mission.transfer.meaning_overrides || [])]
  const addOverride = (criterion_id, intent, synonyms, evaluator_guidance) => {
    const index = overrides.findIndex((o) => o.criterion_id === criterion_id)
    const value = { criterion_id, intent, synonyms, evaluator_guidance }
    if (index < 0) overrides.push(value); else overrides[index] = value
  }
  if (mission.display_code === 'M01') {
    addOverride('C-ASKS', 'Asks Jo for the total box weight needed before confirming the courier slot.', ['please weigh', 'could you', 'can you', 'please check'], 'Met for a direct or indirect request for the missing weight, in any wording. Not met for merely confirming the slot or asking about the base room booking.')
    addOverride('C-HOLDS', 'Defers or conditions confirmation of the courier slot until the missing weight is known.', ['once I know', 'until I know', 'provisional', 'hold the slot'], 'Met if the slot is held or its confirmation depends on knowing the weight. Not met if the standard van is confirmed regardless of weight.')
  }
  if (mission.display_code === 'M03') addOverride('C-DEADLINE', 'Gives Mr Okafor a deadline for the requested confirmation.', ['by thursday', 'by friday', 'by tomorrow', 'let me know by'], 'Met if a time by which Mr Okafor should confirm is given, in any wording. Not met if 2 pm is mentioned only as the tour time, or if no confirmation deadline is given.')
  if (mission.display_code === 'M04') addOverride('C-FIRST-STEP', 'Names one concrete first action for Sam that includes resolving the unsettled comms-pack scope.', ['first', 'start by', 'agree the scope', 'settle what'], 'Met if the first action concretely addresses what the comms pack includes. Not met for a vague instruction to get up to speed or a first step that ignores the unsettled scope.')
  if (mission.display_code === 'M06') {
    addOverride('C-LIMIT', 'States the limit on taking the visitor tour at 11:00 while running the fixed feedback session.', ['cannot', 'not able to', 'not realistic', 'cannot take'], 'Met if the conflicting tour is clearly refused or bounded, in any wording. Not met for only describing the clash or refusing the unrelated base sign-in desk.')
    addOverride('C-INSTEAD', 'Offers a concrete alternative for the visitor tour without moving the fixed feedback session or ignoring the noon departure.', ['i can offer', 'instead', 'brief a stand-in', 'after 11:30'], 'Met for a specific feasible time slice, substitute or handover. Not met for moving the fixed session, a tour after departure, or vague help.')
  }
  if (mission.display_code === 'M07') addOverride('C-REPLAN', 'Changes the room-dependent setup or start to handle the room being unavailable until 10:00, stays within the 11:30 finish and states the cost.', ['another room', 'shorten', 'move', 'we lose'], 'Met only for a concrete feasible change with its scope, time or quality cost. Not met for using the booked room before 10:00, finishing after 11:30, or a change that only fixes the base absent-speaker problem.')
  if (mission.display_code === 'M08') {
    criteria = criteria.map((c) => c.criterion_id === 'C-CORRECT' ? {
      ...c, check: 'MEANING',
      meaning: { intent: 'Communicates that 9:30 is the correct start, replacing the erroneous 10:00 message.', synonyms: ['starts at 9:30', 'correct time', 'half past nine', 'nine-thirty'] },
      evaluator_guidance: 'Met only if the reader is told to use the authoritative 9:30 start, in any wording. Not met for merely mentioning 9:30, negating it, or reaffirming 10:00.',
    } : c)
    rules = rules.filter((r) => r.criterion_id !== 'C-CORRECT')
    addOverride('C-CORRECT', 'Communicates that the authoritative venue start is 14:00, replacing the erroneous 14:30 message.', ['starts at 14:00', 'correct time', '2 pm', 'two o\'clock'], 'Met only if the reader is told to use the authoritative 14:00 start, in any wording. Not met for merely mentioning or negating it, or reaffirming 14:30.')
  }
  return Object.freeze({
    ...mission,
    version: mission.version + 1,
    rubric: { criteria },
    deterministic_validation_rules: rules,
    transfer: {
      ...mission.transfer,
      meaning_overrides: overrides.map((o) => ({ ...o, description: o.intent })),
      ...(mission.display_code === 'M08' ? { rule_overrides: [] } : {}),
      ...(mission.display_code === 'M06' ? { counterpart: {
        ...mission.transfer.counterpart,
        reactions: mission.transfer.counterpart.reactions.map((r) => r.criterion_id === 'C-LIMIT' ? {
          ...r,
          text: r.when === 'OBSERVED' ? 'OK - the conflicting 11:00 tour is a no from you. That is a clear limit.' : 'I still do not have a clear limit on the 11:00 tour from you.',
        } : r),
        all_met: 'Clear: what you can and cannot do, why, an alternative, and who decides. Thank you.',
        none_met: 'I am no clearer on what you can do, what clashes, or what happens instead.',
      } } : {}),
    },
    review_record: { ...mission.review_record, authored_on: '2026-10-05', notes: 'CR04 DRAFT revision: structured-work attribution, effective transfer criteria and honest structural checks. Not reviewed or approved; requires content and measurement review before publication.' },
  })
}
