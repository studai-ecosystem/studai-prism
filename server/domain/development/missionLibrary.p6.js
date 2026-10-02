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
const DAY = '\\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\\b|\\btomorrow\\b|\\btoday\\b|\\bby\\s+\\d{1,2}(:\\d{2})?\\b'

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
const det = (criterion_id, behavior_id, description, artifact_ids) => ({ criterion_id, behavior_id, description, check: 'DETERMINISTIC', artifact_ids })
const meaning = (criterion_id, behavior_id, description, artifact_ids, intent, synonyms, evaluator_guidance) => ({
  criterion_id, behavior_id, description, check: 'MEANING', artifact_ids, evaluator_guidance, meaning: { intent, synonyms },
})

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
    deterministic_validation_rules: [
      pattern('R-ASKS', 'C-ASKS', 'REPLY', 'text', '\\?', 'The reply asks Dev a question.'),
      pattern('R-LIMIT', 'C-LIMIT', 'REPLY', 'text', '\\b(twelve|12)\\b', 'The reply refers to the room limit.'),
    ],
    rubric: {
      criteria: [
        det('C-ASKS', 'QUESTION_ASSUMPTION', 'Asks Dev a question instead of only confirming.', ['REPLY']),
        meaning('C-NAMES-UNKNOWN', 'QUESTION_ASSUMPTION', 'Says that the number of people attending is not yet known and matters for the room.', ['REPLY'],
          'States that how many people are coming is unknown and is needed before the room can be confirmed.',
          ['how many people', 'how many are coming', 'number of people', 'headcount', 'who is coming', 'not sure how many'],
          'Met only if the learner identifies attendance as the unknown. Not met if they only ask a generic question or confirm the room.'),
        det('C-LIMIT', 'STATE_UNCERTAINTY', 'Refers to the room limit when explaining the risk.', ['REPLY']),
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
    deterministic_validation_rules: [
      required('R-CLAIM', 'C-CLAIM', 'CHECK', 'fields.claim_checked', 8, 'The note names the claim that was checked.'),
      required('R-ALT', 'C-ALT', 'CHECK', 'fields.alternative', 12, 'The note proposes what to do instead.'),
    ],
    rubric: {
      criteria: [
        det('C-CLAIM', 'CHECK_EVIDENCE', 'Names the claim that was checked.', ['CHECK']),
        meaning('C-CONFLICT', 'CHECK_EVIDENCE', 'Points to the specific conflict between the summary and a known fact.', ['CHECK'],
          'Identifies that the delivery time (four working days versus three) or the quantity (48 confirmed versus 60) contradicts the summary.',
          ['four working days', 'four days', 'will not arrive', 'does not arrive', 'too late', 'only 48', '48 people', 'more than confirmed', 'three working days'],
          'Met only if the learner states which fact the summary conflicts with. Not met for general doubt without a fact.'),
        meaning('C-UNCERTAIN', 'STATE_UNCERTAINTY', 'Names what is still uncertain and how it affects the decision.', ['CHECK'],
          'States something not yet known (for example late confirmations or a faster delivery option) and its effect on the choice.',
          ['not sure', 'unsure', 'do not know', 'unclear', 'might change', 'could change', 'depends on', 'if more people'],
          'Met only if a specific uncertainty is named. Not met for "not sure" with no object.'),
        det('C-ALT', 'CHECK_EVIDENCE', 'Proposes a defensible alternative.', ['CHECK']),
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
    deterministic_validation_rules: [
      pattern('R-MAIN-FIRST', 'C-MAIN-FIRST', 'NOTE', 'text', '^[\\s\\S]{0,200}\\btwo\\b[\\s\\S]{0,60}\\bsessions?\\b', 'The decision (two sessions) appears in the opening lines.'),
      pattern('R-DEADLINE', 'C-DEADLINE', 'NOTE', 'text', DAY, 'The message gives a day or time for the booking.'),
    ],
    rubric: {
      criteria: [
        det('C-MAIN-FIRST', 'STATE_MAIN_POINT', 'States the decision in the opening lines.', ['NOTE']),
        meaning('C-REASON', 'STATE_MAIN_POINT', 'Gives the reason for two sessions: the room cannot hold everyone at once.', ['NOTE'],
          'Explains that the room\'s capacity (fifteen) is below the number joining (twenty-two), so one session does not fit.',
          ['room holds', 'holds fifteen', 'only fifteen', 'twenty-two', 'does not fit', 'too many for the room', 'room is too small', 'more people than seats'],
          'Met only if the capacity reason is given. Not met if a different or no reason is given.'),
        meaning('C-ASK', 'ADAPT_TO_AUDIENCE', 'Tells Ravi the specific booking action.', ['NOTE'],
          'Names the concrete action Ravi should take (book two sessions / slots) rather than describing the discussion.',
          ['please book', 'can you book', 'could you book', 'book two', 'two slots', 'put two sessions', 'reserve'],
          'Met only if a booking action is requested. Not met if the message only informs.'),
        det('C-DEADLINE', 'ADAPT_TO_AUDIENCE', 'Gives a deadline for the booking.', ['NOTE']),
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
    deterministic_validation_rules: [
      required('R-SUBSTANTIVE', 'C-SUBSTANTIVE', 'REPLY', 'text', 120, 'The reply engages rather than answering in one line.'),
    ],
    rubric: {
      criteria: [
        meaning('C-RESTATE', 'UNDERSTAND_CONCERN', 'Restates Mina\'s concern accurately.', ['REPLY'],
          'Shows the concern was understood: printing costs time the team does not have, and the handouts may go unread.',
          ['takes an afternoon', 'time to print', 'nobody reads', 'may not read', 'you are right that', 'i understand that printing', 'fair point about'],
          'Met only if the learner restates the time cost or the unread risk. Not met for a generic "I hear you".'),
        meaning('C-DISAGREE', 'DISAGREE_CONSTRUCTIVELY', 'States the disagreement with a reason tied to the facts.', ['REPLY'],
          'Says they still want a handout because people without laptops would have nothing to follow.',
          ['without laptops', 'no laptop', 'nothing to follow', 'half the group', 'i disagree', 'i still think', 'i see it differently', 'that said'],
          'Met only if a reason tied to the group is given. Not met if the learner simply gives way or simply insists.'),
        meaning('C-NEXT', 'DISAGREE_CONSTRUCTIVELY', 'Proposes a workable next step or a way to decide.', ['REPLY'],
          'Offers a concrete compromise or decision method (shorter handout, print fewer, ask the group, a quick trial).',
          ['one page', 'single page', 'shorter handout', 'print only', 'ask the group', 'could we', 'what if we', 'let us try', 'how about'],
          'Met only if a specific next step is proposed. Not met for "let us discuss".'),
        det('C-SUBSTANTIVE', 'UNDERSTAND_CONCERN', 'Replies substantively rather than in one line.', ['REPLY']),
      ],
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
      required('R-LIMIT', 'C-LIMIT', 'REPLY', 'fields.cannot_do', 8, 'A limit is stated.'),
      required('R-INSTEAD', 'C-INSTEAD', 'REPLY', 'fields.instead', 10, 'An alternative is offered.'),
      required('R-DECIDER', 'C-DECIDER', 'REPLY', 'fields.who_decides', 3, 'A decider is named.'),
    ],
    rubric: {
      criteria: [
        det('C-LIMIT', 'NEGOTIATE_BOUNDARY', 'States a limit clearly.', ['REPLY']),
        meaning('C-WHY', 'NEGOTIATE_BOUNDARY', 'Explains the capacity clash.', ['REPLY'],
          'Explains that the desk from 8:30 overlaps with setup and the welcome, which both need them in the room.',
          ['at the same time', 'overlap', '8:30', 'both need me', 'in the room', 'two places', 'clash', 'while i am setting up'],
          'Met only if the time clash is explained. Not met for "I am too busy".'),
        det('C-INSTEAD', 'NEGOTIATE_BOUNDARY', 'Offers what can be done instead.', ['REPLY']),
        det('C-DECIDER', 'NEGOTIATE_BOUNDARY', 'Names who decides if the limit is tested.', ['REPLY']),
      ],
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
      pattern('R-AFFECTED', 'C-AFFECTED', 'NOTE', 'text', '\\btalk\\b|\\bsam\\b', 'The message names the affected part.'),
      required('R-OWNERS', 'C-OWNERS', 'PLAN', 'rows.owner', 2, 'Every part has an owner on the board.'),
    ],
    rubric: {
      criteria: [
        det('C-AFFECTED', 'REPLAN_CONSTRAINT', 'Names the part of the plan the change affects.', ['NOTE']),
        meaning('C-REPLAN', 'REPLAN_CONSTRAINT', 'Re-plans inside the time limit and states the cost.', ['NOTE', 'PLAN'],
          'Changes the affected part (moved, shortened, swapped or dropped) and says what that costs in scope, time or quality.',
          ['move the talk', 'swap', 'shorten', 'drop the talk', 'skip', 'postpone', 'instead of', 'cut', 'reorder', 'start with group work', 'we lose'],
          'Met only if a change and its cost are stated. Not met for "we will manage".'),
        meaning('C-HELP', 'SEEK_HELP', 'Asks a specific person for a specific thing.', ['NOTE'],
          'Asks Priya for one concrete thing (for example to give the talk, cover setup, or confirm the room).',
          ['could you', 'can you', 'would you be able', 'priya, please', 'i need you to', 'can i ask you to', 'would you give the talk'],
          'Met only if the request names what Priya should do. Not met for "any help welcome".'),
        det('C-OWNERS', 'REPLAN_CONSTRAINT', 'Every part has an owner on the board.', ['PLAN']),
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
      pattern('R-CORRECT', 'C-CORRECT', 'CORRECTION', 'text', '\\b9[:.]30\\b|half past nine', 'The correction gives the right start time.'),
    ],
    rubric: {
      criteria: [
        meaning('C-OWN', 'REPAIR_MISTAKE', 'Acknowledges the specific error as their own.', ['CORRECTION'],
          'Says the earlier time was wrong and that the error was theirs, without blaming others or hiding it.',
          ['my mistake', 'i sent the wrong', 'i got the time wrong', 'apologies', 'sorry', 'i wrote 10:00', 'the error was mine', 'i made an error'],
          'Met only if ownership is explicit. Not met for a passive "the time was incorrect".'),
        det('C-CORRECT', 'REPAIR_MISTAKE', 'Gives the correct start time.', ['CORRECTION']),
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
      required('R-OWNERS', 'C-OWNERS', 'BOARD', 'rows.owner', 2, 'Every task has an owner, or a named person who will decide.'),
      required('R-DONE', 'C-DONE', 'BOARD', 'rows.done_when', 6, 'Every task has a written completion check.'),
    ],
    rubric: {
      criteria: [
        det('C-OWNERS', 'ASSIGN_RESPONSIBILITY', 'Every task has an owner, or a named person who will decide.', ['BOARD']),
        det('C-DONE', 'DEFINE_COMPLETION', 'Every task has a written completion check.', ['BOARD']),
        meaning('C-REALISTIC', 'ASSIGN_RESPONSIBILITY', 'Owners respect who is available when.', ['HANDOVER', 'BOARD'],
          'Monday tasks are not given to Tom, and the projector test sits on Tuesday when the room is free; or an unresolvable task is escalated to a named decider.',
          ['tom is away', 'lea on monday', 'tuesday when the room', 'room is free', 'not monday', 'tom cannot', 'available on', 'tom from tuesday', 'ask priya to decide'],
          'Met only if availability is reflected in the assignment or escalation. Not met if Tom owns Monday work with no comment.'),
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
      required('R-DECISIONS', 'C-DECISIONS', 'BOARD', 'rows.decision', 6, 'Every task has a decision with a reason.'),
    ],
    rubric: {
      criteria: [
        det('C-ORDER', 'PRIORITIZE_WORK', 'Every task has an order.', ['BOARD']),
        det('C-DECISIONS', 'PRIORITIZE_WORK', 'Each task has a decision with a reason.', ['BOARD']),
        meaning('C-DEPENDENCY', 'CHECK_DEPENDENCY', 'Puts the room confirmation before the reminder because the reminder depends on it.', ['NOTE', 'BOARD'],
          'Explains that the reminder cannot go out until the room is confirmed, so the room comes first.',
          ['room first', 'before the reminder', 'reminder needs the room', 'depends on the room', 'cannot send the reminder', 'once the room is confirmed', 'after the room', 'until the room'],
          'Met only if the room-to-reminder dependency is stated. Not met if the order is right but no dependency is named.'),
        meaning('C-DEFER', 'PRIORITIZE_WORK', 'Explicitly defers or hands off at least one task with a reason.', ['NOTE', 'BOARD'],
          'Names a task that will not be done this week (or by them) and gives the reason.',
          ['defer', 'leave until', 'after friday', 'hand to', 'ask someone', 'not this week', 'drop', 'skip', 'can wait', 'hand off'],
          'Met only if a task is explicitly deferred or handed off with a reason. Not met if all five are kept.'),
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
  })
}
