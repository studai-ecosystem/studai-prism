# Prism customer research protocols (P9.7)

Status: PREPARED, NOT EXECUTED. No interview, observation, payment or comprehension task has taken place. Nothing in this file is a finding. Results, when they exist, are recorded only after they happen, with permission, in a separate dated results file; a protocol is not research completion.

Machine completeness check: `scripts/check-programme-validation.mjs` verifies
the required interview, comparator, comprehension-task, incentive/compulsion and
blank-form sections exist. It does not validate research quality or turn this
protocol into a result. The planned sample is exactly 12 students and 12
early-career professionals; these are proposed recruit counts, not actuals.

Carries forward Appendix C (discovery interview guide) and Appendix D (five-second / two-minute comprehension protocol) of `CONTENT_REVIEW.md`; where they differ, this file is the executable version for P9 and the earlier appendices remain the provenance record.

## 0. Ethics, consent and data class

- Voluntary adult participants (18+). Written consent before any recording; consent version recorded on the sheet. Participants may stop at any time and may withdraw data within 14 days.
- Data class for research notes: RESEARCH_NOTES (pseudonymous participant code P-xx / E-xx; no name, email, institution or employer in notes or files). The code-to-contact key is held only by the research lead, off-repository, and destroyed at study close.
- Audio recording is optional and off by default; if used, it is stored only in the approved research store, never in the product, repository, analytics or fixtures.
- Product sessions use disposable or participant-owned accounts with explicit consent; staff never read a participant's report unless the participant shows it during the session.
- Record for every participant the incentive, the channel and any compulsion (see §5). Faculty-assigned participation is recorded as COMPULSORY and analysed separately from voluntary use.

## 1. Discovery interview guide — 12 students / 12 early-career professionals

Purpose: understand the last difficult professional interaction and its consequences, not to validate Prism. Avoid leading "would you buy our AI assessment" questions. 35–45 minutes. Semi-structured; the order below is neutral by design (problem before product).

Recruitment: 12 current students (mix of year, discipline, institution type) and 12 professionals in their first three years of work (mix of role and sector). Recruit through channels unrelated to any sponsoring faculty where possible; record the channel.

Opening (2 min): purpose, consent, "there are no right answers; we are not testing you."

Block A — last difficult interaction (12 min)
1. Think of the most recent work, placement or team interaction that did not go the way you wanted. What was the situation? (Probe: who, what was at stake, what you were trying to do.)
2. What happened moment to moment? What did you say or do first? Then?
3. What made it hard?

Block B — consequences (6 min)
4. What happened afterwards because of how it went? (Probe: for the task, the relationship, you.)
5. Did anyone give you feedback? What did they say, and what did you do with it?

Block C — alternatives and effort (8 min)
6. Since then, have you done anything to get better at that kind of interaction? What exactly? (Probe without naming products: people, practice, courses, videos, AI chat tools, nothing.)
7. How much time did that take? What did it cost you, in money or effort?
8. What worked, what did not, and how do you know?

Block D — next preparation need (6 min)
9. What is the next situation like this you expect to face? When?
10. If you could prepare for it, what would you want to be able to do differently?
11. What would make you trust feedback about how you handle such a situation? What would make you distrust it?

Closing (3 min)
12. Is there anything about this topic I should have asked and did not?

Do not ask: "Would you use/buy an AI assessment?", "How much would you pay?", "Do you like this idea?" Pricing and purchase are measured behaviourally (METRICS.md `paid_conversion`), not by stated intent.

Recording sheet fields: participant code, cohort (STUDENT | PROFESSIONAL), channel, incentive, compulsion (NONE | FACULTY_ASSIGNED | EMPLOYER_ASSIGNED | RESEARCHER_RELATIONSHIP), duration, per-question notes, verbatim phrases the participant used for the difficulty and for what they want to do differently, researcher confidence in the account (LOW | MEDIUM | HIGH) with reason. Analysis: affinity coding by two researchers independently, then reconciliation; disagreements kept.

## 2. Observed product session and generic-AI role-play comparator

Purpose: compare a Prism pilot-form session with a strong general-AI role-play alternative on the same difficulty, with matched effort and time, and record what each participant can say afterwards about their own behaviour and next step. Not a benchmark of model quality.

Design
- Within-participant, counterbalanced order (half Prism first, half comparator first), minimum 24 h between conditions to reduce carry-over of the scenario.
- Comparator: a strong, current general-purpose assistant with a researcher-prepared role-play prompt that gives the same scenario facts, the same role, the same time box and asks for feedback at the end. The prompt is reviewed by a second researcher for strength — a deliberately weak alternative invalidates the comparison. The prompt text is stored with the protocol version.
- Matched: time box (same as the pilot form's timing policy), device, environment, facilitator script. Participants are told both are "practice conversations", not that one is the product under study.
- Prism condition uses the approved pilot form only; if no form is APPROVED the Prism condition is BLOCKED and the session does not run.

Observation sheet (per condition): participant code, condition, order, start/end times, number of participant turns, visible confusion moments (timestamped, no content), help requests, abandonment, facilitator interventions (any intervention invalidates the unassisted comprehension measure for that condition).

Post-condition questions (same wording for both, asked verbally, verbatim notes):
- "Describe one specific thing you did in that conversation that you would do again."
- "Describe one specific thing you would do differently next time."
- "What did the feedback tell you about your own behaviour? Point to where it says that."
- "What would you practise next, and how?"

Post-study comparison question (after both): "Which experience, if either, told you something about your own behaviour that you could act on? What exactly?" The specific user-articulated advantage, if any, is recorded verbatim; "it looked nicer" is not an advantage.

Scoring of comprehension and next-step relevance is done later by two blinded raters from the verbatim notes (see VALIDATION_PLAN.md §3), not by the facilitator.

## 3. Five-second summary task and two-minute next-action task — map vs plain list

Purpose: test whether a participant correctly understands a bounded finding and its limit, and can start a relevant practice, from their own report; and whether the Capability Map variant or a plain-list variant supports this better. Liking the graphics is recorded but is not the outcome.

Variants (between-participant, randomised, balanced across cohort): MAP (Capability Map default view) and LIST (same content, plain ordered list, same copy). Both show the participant's own real report from their consented Prism session; no synthetic or demonstration report is used for scored trials.

Five-second task
- Show the report summary for 5 seconds (facilitator timer), then hide it.
- Ask: "In your own words, what did it say about you?" then "What did it say it could not tell?"
- Score later (blinded): FINDING_CORRECT (matches a stated observation and its level/limit), FINDING_OVERSTATED (claims more than shown — e.g. a percentage, an overall score, a pass/fail), FINDING_MISSED, LIMIT_CORRECT, LIMIT_MISSED. "Missing is not zero": a participant who reads an unmeasured capability as a weakness is scored OVERSTATED.

Two-minute next-action task
- Show the full report. "You have two minutes. Find the one thing you would work on next and start doing something about it." Facilitator observes only.
- Record: time to first relevant practice start (or none), path taken (moment opened? recommendation opened? mission started?), whether the chosen practice is linked to an evidenced moment, confusion moments, abandonment.
- Score later (blinded): NEXT_STEP_RELEVANT (linked to an evidenced moment or recommendation), NEXT_STEP_UNRELATED, NO_NEXT_STEP, PRACTICE_STARTED (yes/no).

Post-task questions: "What does this report not know about you?"; "Did anything here feel like a grade?" (verbatim); preference between MAP and LIST shown afterwards, recorded as preference only.

Unassisted rule: any facilitator hint before the participant answers marks the trial COACHED; it is excluded from `comprehension` and reported separately.

### 3a. Ready-to-run session script (P5.9; no results are recorded in this file)

Prepared so that the protocol can be run exactly as written once §6 approvals exist. It records the procedure only; running it, and any comprehension figure, remain BLOCKED on research-lead approval, consent materials and (where an institution is involved) its research/ethics clearance. Nothing below was executed and no participant observation exists.

Variant assignment
- Before recruitment the research lead prepares a sealed assignment list of alternating `MAP`/`LIST` labels per cohort (students, early-career), shuffled in blocks of four so each block of four participants has two of each. Assignment is read from the list in participant order; it is never chosen after seeing the participant or their report.
- The variant is set in the browser by the facilitator before the participant sits down: `MAP` shows the report summary as shipped (Capability Map with its segmented track); `LIST` shows the same report with the decorative track hidden — the map's own accessible rendering, obtained by the facilitator's browser at a viewport narrower than 640 px (or an equivalent facilitator stylesheet override that hides only the track). Rows, order, band labels, evidence-state labels and copy are identical in both. No separate list component exists or is required. The participant is not told which variant they have.
- A participant whose report state is wholly insufficient, under review, technical-incomplete or processing is still run (their task is to understand that limit), with `report_state` recorded.

Facilitator script (read aloud; square brackets are facilitator actions)
1. [Confirm consent is signed and the recording sheet header is filled: participant code, cohort, variant, report_state, channel, incentive, compulsion, prior_relationship_to_team, date, facilitator code.]
2. "This is your own report from the Prism session you completed. I am going to show it for five seconds and then hide it. There are no right answers; I want to know what it says to you. Ready?"
3. [Start the five-second timer on "Ready"; show the first screen of the report; hide it at five seconds.]
4. "In your own words, what did it say about you?" [Write verbatim. No prompting. If silence > 10 s: "Take your time." once; anything more marks the trial COACHED.]
5. "What did it say it could not tell?" [Write verbatim.]
6. "Now you can see the whole report. You have two minutes. Find the one thing you would work on next and start doing something about it. I will stay quiet." [Start the two-minute timer; observe only; note the path, first relevant click, confusion moments, abandonment; stop at two minutes or when a practice starts.]
7. "What does this report not know about you?" [Verbatim.]
8. "Did anything here feel like a grade?" [Verbatim.]
9. [Show the other variant for thirty seconds.] "Which of the two did you prefer, and why?" [Record preference and one reason; preference only.]
10. "Thank you. Nothing you said will be quoted in the product." [End recording.]

Recording sheet fields (one row per participant; blank template kept in the research store, never in this repository)

| Field | Values / notes |
|---|---|
| participant_code | pseudonymous code from the consent register |
| cohort | STUDENT, EARLY_CAREER |
| variant | MAP, LIST (from the sealed list) |
| report_state | READY, PARTLY_DESCRIBED, WHOLLY_INSUFFICIENT, UNDER_REVIEW, TECHNICAL_INCOMPLETE, PROCESSING, CORRECTED_VERSION |
| five_second_answer_self | verbatim |
| five_second_answer_limit | verbatim |
| finding_score | FINDING_CORRECT, FINDING_OVERSTATED, FINDING_MISSED (blinded rater, later) |
| limit_score | LIMIT_CORRECT, LIMIT_MISSED (blinded rater, later) |
| two_minute_first_relevant_click_s | seconds, or NONE |
| two_minute_path | ordered list from: MOMENT_OPENED, SEE_THE_MOMENT, CAPABILITY_OPENED, PRACTISE_THIS, RECOMMENDATION_OPENED, MISSION_STARTED, EVIDENCE_TAB, DEVELOPMENT_TAB, METHODOLOGY_TAB, SHARE, OTHER |
| next_step_score | NEXT_STEP_RELEVANT, NEXT_STEP_UNRELATED, NO_NEXT_STEP (blinded rater, later) |
| practice_started | YES, NO, NOT_AVAILABLE (no reviewed mission reachable for that report) |
| confusion_moments | free text, facilitator |
| abandonment | YES, NO |
| not_know_answer | verbatim |
| grade_answer | verbatim |
| preference | MAP, LIST, NONE; one reason verbatim |
| coached | YES, NO (any hint before an answer) |
| technical_event | free text; a product fault stops the session and is a technical event, not a participant result |
| channel / incentive / compulsion / prior_relationship_to_team | §5 values |

Scoring happens after all sessions, by a rater blinded to variant, from the verbatim fields only. Results, if and when they exist, are reported in `METRICS.md` with the sample, the share of COACHED and NOT_AVAILABLE rows and the compulsion split — never here.

## 4. Sample and stopping

Planning sizes, not a power claim: 12 + 12 interviews; 16–24 participants for the comparator study; 24–40 for the comprehension tasks (balanced MAP/LIST). The measurement lead may change these with a written reason before recruitment starts. Stop any session on distress, request, or a product fault that would mislead the participant (record the fault as a technical event, not a participant result).

## 5. Incentives, compulsion and channel — recorded for every participant

| Field | Values |
|---|---|
| channel | OPEN_CALL, FACULTY_REFERRAL, EMPLOYER_REFERRAL, PERSONAL_NETWORK, EXISTING_USER |
| incentive | NONE, VOUCHER_<amount>, COURSE_CREDIT, PRODUCT_ACCESS |
| compulsion | NONE, FACULTY_ASSIGNED, EMPLOYER_ASSIGNED, RESEARCHER_RELATIONSHIP |
| prior_relationship_to_team | NONE, ACQUAINTANCE, COLLEAGUE |

Analysis separates ordinary voluntary use (channel OPEN_CALL/EXISTING_USER, compulsion NONE) from incentivised or compelled participation; a result that holds only under compulsion is reported as such.

## 6. What is NOT authorised by this file

- Running interviews, observations or comprehension tasks (requires research-lead approval, consent materials and, where an institution is involved, its research/ethics clearance — HA register).
- Any payment to participants or any purchase by participants.
- Using participant content in product copy, fixtures, tests or analytics.
- Reporting a comprehension, activation, return or conversion number.

## Materials checklist (to prepare before the first session)

- [ ] Consent form (version-stamped) and participant information sheet
- [ ] Recording sheets (§1, §2, §3) as blank templates in the research store
- [ ] Comparator role-play prompt, version-stamped, second-researcher strength review recorded
- [ ] Blinded rating rubric for comprehension and next-step relevance (VALIDATION_PLAN.md §3)
- [ ] An APPROVED pilot form (currently DRAFT: Prism condition BLOCKED)
- [ ] Facilitator script with the unassisted rule
