# P0 content review and research preparation

Prepared: 2026-10-02. **DRAFT intake and proposed protocols only.**

This record implements the approved diagnostic-only P0.6 boundary. It is not new
scenario content, a rubric, a catalogue seed, a publication decision, a research
result or completion of P1-P10. No participants have been contacted and no study
has been conducted for this record.

## Authority and evidence boundary

- Source: [execution prompt P0.6](../../../.github/prompts/plan.prompt.md) and
  [master plan](../../../.github/prompts/document.md), sections 6, 11, 14, 19.7,
  20.3, 30 and 34. The session-approved diagnostic boundary narrows their broader
  authoring/automatic-progression instructions: prepare intake, not new content.
- The supplied source snapshot `609f748277d4462e4c113c9c2e5b66fe05e016bb` is historical.
  Local code was read at observed HEAD `f40bd1c`, including pre-existing dirty
  routing work. This is code inspection, not deployed-build or browser evidence.
- The HTML reading companion and illustrative reference images were not supplied.
  Neither is claimed inspected. The reference-conflict register below comes from
  the written source requirements, not an image comparison.
- Existing [repair map](../ui/FLOW_REPAIR_MAP.md),
  [readiness](../ui/FLOW_REPAIR_READINESS.md) and
  [UI programme state](../ui/UI_PROGRAM_STATE.md) remain authoritative for their
  own historical checkpoints. Their test counts are not fresh P0 results.
  Overall journey readiness remains **NO-GO**.
- This file and [recovery preparation](./ROLLOUT.md) change documentation only.
  Frozen historical forms, formal stimulus/timing, rubric/thresholds, evidence,
  authorization, retention and entitlements are unchanged.

## Appendix A: Screen inventory

Stable link target for the parent baseline: `CONTENT_REVIEW.md#appendix-a-screen-inventory`.
This is a presentation inventory; the parent baseline owns the detailed route,
middleware and lineage matrices.

**Status key:** `EXISTS (code)` means a route/component is present, not that its
data or end-to-end path works. `PARTIAL (code)` means some building blocks exist
but the requested experience is not established. `PLANNED` means no dedicated
implementation was identified in the inspected router/surfaces. Every row remains
**NOT BROWSER-VERIFIED IN THIS RECORD**. Flag defaults are not effective production
configuration.

| ID | Required screen/state | Current path or code reference | Status / review obligation |
| --- | --- | --- | --- |
| S01 | Public offer | `/`; `src\pages\LandingPage.jsx`, existing Pricing and story components | EXISTS (code). Current CTA goes to registration/payment; do not invent a new offer, price or allowance. |
| S02 | Free preview | Public story sections explain the product; no dedicated interactive preview route identified | PARTIAL (code). A genuine free experience is PLANNED for P8; static story content is not proof of usable preview. |
| S03 | Understand / Practise / Prepare intent selection | `/app` launcher uses ShellHome or Home under the shell flag | PLANNED as a unified three-intent flow; launcher presence is not that flow. |
| S04 | Authentication and returning-user entry | `/login`, `/register`; `Auth.jsx`; explicit next/alias handling in AppRouter | EXISTS (code). Review next priority, loading/error, deep link and denied entry; do not repeat historical redirect claims as fresh results. |
| S05 | Home: new, active, completed, unavailable | `/app/home`; `features\home\pages\HomePage.jsx` | EXISTS (code). Review honest no-history/no-evidence, recent owned reports, active-resume, network/offline, flag-off and scope states using governed data. |
| S06 | History, assessments and profile | `/app/assessments`, assignment detail; `/dashboard` and `/profile` authenticated aliases to Home/settings | EXISTS (code). History ownership reconciliation is still open; an empty list is not proof that past work was erased. |
| S07 | Formal briefing and system check | `/app/assessments/:assignmentId/briefing`, `/system-check`; legacy `/briefing` | EXISTS (code). Privacy/consent and start wiring exist; approved intro-before-clock contract is not established. |
| S08 | Formal scenario introduction | V3 player inline briefing/context; legacy Assessment and AssessmentWorkspace | PARTIAL (code). Do not call inline context an approved pre-timed introduction. System-check starts the existing engine; retain its timing policy. |
| S09 | Conversation-only player | `/app/assessment/:sessionId`; `AssessmentPlayerPage.jsx`; `hasWork` false | EXISTS (code). No-work layout is a code path, not evidence of successful stimulus/evaluation. No coaching, private rubric or artificial progress. |
| S10 | Conversation plus work-pane player | Same V3 route; ArtifactPane and shared composer; legacy `/workspace/:sessionId` and `/assessment` retained | EXISTS (code). Review actual material, save/conflict/failed-load, independent pane scroll, keyboard and draft persistence. An empty pane is not an authored artifact. |
| S11 | Expiry, interruption, resume and scoring recovery | V3 player clock, pending-message and submission states; existing finish/retry controls | EXISTS (code). Server start/duration and cut-off remain open governance concerns; retry is a mutation, not an approved support recovery policy. |
| S12 | Full report, partial/limited evidence, pending/held report | `/app/reports/:sessionId`; StudentReportPage/ReportView; `/score`, V2 and employee readers retained | EXISTS (code). Missing evidence is not zero capability. `REPORT_NOT_READY` and `REPORT_UNDER_REVIEW` withhold findings; technical failure must not masquerade as insufficient evidence. Reads can have server side effects; see ROLLOUT. |
| S13 | Capability detail | `/app/capabilities/:capabilityId`; CapabilityDetailPage | EXISTS (code). Review source-backed observations, absence, version/scope context; planned five-family map is not established by route presence. |
| S14 | Meaningful moment | Existing report evidence view and `/app/evidence`; no dedicated new moment route identified | PARTIAL (code). Planned action -> behaviour -> capability -> next behaviour presentation needs real eligible lineage; no invented quote/moment. |
| S15 | Practice and retry | `/app/development`, `/app/development/missions/:missionId`; DevelopmentPage/MissionPlayerPage; legacy `/missions` | EXISTS (code). Existing mission catalogue/attempts are not the proposed M01-M10 library; check unavailable/empty, practice label, assistance and separate attempts. |
| S16 | Replay and unfamiliar challenge | Existing server replay domain mounted at `/api/replay`; no dedicated replay/fresh-challenge screen identified in AppRouter | PARTIAL (code). Retrying a current mission is not proof of the complete P6 replay/fresh-task experience. |
| S17 | Private preparation | No dedicated preparation route identified in AppRouter | PLANNED (P7). Do not relabel Explore or a formal form as preparation. |
| S18 | Application check-in | No dedicated application/self-report check-in route identified; existing Growth page is separate | PLANNED (P7). Self-report cannot silently change formal evidence or become measured growth. |
| S19 | Campus learner disclosure and sponsored history | `/app/campus/:organizationId/{home,assignments,development,reports/:sessionId}`; shared pages plus workspace guards | EXISTS (code). Show sponsor/workspace and actual audience; personal history and preparation stay outside sponsored scope. |
| S20 | Campus report audience and sharing | `/campus/:organizationId/reports/:sessionId`, `/shared/:token`, existing share dialog | EXISTS (code). Role, scope and SUMMARY/FULL disclosure must be confirmed server-side. No promise of complete privacy or unrestricted sponsor access. |

Primary inspected references:
[router](../../src/app/AppRouter.jsx),
[flag/alias behaviour](../../src/app/routing.jsx),
[V3 player](../../src/features/assessments/pages/AssessmentPlayerPage.jsx),
[system check](../../src/features/assessments/pages/SystemCheckPage.jsx),
[report page](../../src/features/reports/pages/StudentReportPage.jsx),
[development](../../src/features/development/pages/DevelopmentPage.jsx),
[mission player](../../src/features/development/pages/MissionPlayerPage.jsx) and
[landing](../../src/pages/LandingPage.jsx).

### Inventory review checklist, not completed QA

For applicable rows, capture loading, empty, partial, error/retry, offline,
permission, completion and flag-off states without inventing production data.
Review refresh/deep links and Personal versus sponsored scope separately.
Reuse existing Prism tokens, official assets and primitives; no new design system
is proposed. Future QA needs keyboard/focus, assistive technology, zoom/reflow,
contrast and widths 1440/1280/1024/768/430/390/360. Automated or fixture checks alone
cannot close manual accessibility or real-pipeline gates.

### Written-source reference conflicts

| Illustrative direction | Required review constraint |
| --- | --- |
| Radar polygon/rainbow area and precise-looking values | Use approved ordinal meaning/provenance; no inferred continuous metric or false certainty from area. |
| Red missing-evidence state | Neutral insufficient/not measured state, not weak performance or failure red. Technical faults stay distinct. |
| One mixed profile for formal, practice and self-report | Modes and provenance stay separate; neither coaching nor self-report raises formal capability. |
| Decimal arrows, numeric growth and comparison | No unapproved comparison/equivalence or invented change; retain governed absence/reassessment states. |
| Example people, dates, findings and quotations | No sample identity/result enters production; any later test preview is explicitly synthetic and excluded from analytics/studies. |
| Photorealistic avatars | Deferred; no new people or avatar assets authored in P0. |
| Absolute privacy promises | Match actual owner/sponsor/share scope and reviewed retention; current source-retention conflict remains open. |
| Auto-filled plan board presented as the learner's work | Template/AI material retains attribution; only eligible learner actions can support findings. |

## Appendix B: DRAFT reviewer intake

**All eleven records are DRAFT / NOT SUBMITTED / NOT APPROVED.** Titles and target
families below are transcribed from the supplied plan, not newly authored scenarios
or criteria. Intake revision is documentary only; it is not an executable content
version. No facts, dialogue, branches, exemplars, scoring anchors, rubric thresholds
or mission payloads are created here.

Required role key:
**C** learning/assessment content specialist; **M** external measurement lead;
**A** accessibility lead; **P** security/privacy reviewer where scope or data is
involved. All reviewer names, assignments, review receipts and approval references
remain **AWAITING NAMED OWNER / NOT SUPPLIED**. Product/commercial accountability is
Paul's source-assigned role, not approval of these records.

| Intake ID | Source title / mode / target family | Provenance | Required reviewers | Accessibility/confound question (not a finding) | Publication blocker |
| --- | --- | --- | --- | --- | --- |
| CORE-TEAMREADY-A | Get the team ready; FORMAL; Reasoning, Communication, Collaboration, Adaptability, Execution | Master plan section 11, proposed draft 0.1 | C + M + A; P for source/consent handling | Can all required actions be performed without drag, fast typing or specialist workplace knowledge? Are distinct opportunities and timing feasible across supported access modes? | Authoring package, intended-use/timing review and frozen-version publication approval absent; no new formal seed authorized. |
| M01 | Find the missing fact; PRACTICE; Reasoning | Master plan section 20.3, M01 | C + M + A | Does reading load or prior project knowledge conceal the relevant unknown? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M02 | Check the confident recommendation; PRACTICE; Reasoning | Master plan section 20.3, M02 | C + M + A | Is verification possible from accessible supplied information rather than familiarity with polished business language? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M03 | Explain your recommendation; PRACTICE; Communication | Master plan section 20.3, M03 | C + M + A | Are accent, ASR errors, grammar and speed kept distinct from the intended communication behaviour? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M04 | Make the brief clear; PRACTICE; Communication | Master plan section 20.3, M04 | C + M + A | Can supported language/access modes make the ambiguity visible without rewarding a guessed answer key? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M05 | Disagree without giving up; PRACTICE; Collaboration | Master plan section 20.3, M05 | C + M + A | Does the interaction avoid privileging one cultural style, deference pattern or fluent performance? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M06 | Negotiate a realistic boundary; PRACTICE; Collaboration | Master plan section 20.3, M06 | C + M + A | Is hierarchy/employment experience a confound, and is legitimate refusal allowed rather than agreement rewarded? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M07 | Replan after a change; PRACTICE; Adaptability | Master plan section 20.3, M07 | C + M + A | Are changed constraints readable and navigable without memory, rapid switching or pointer-only interaction? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M08 | Recover after a mistake; PRACTICE; Adaptability | Master plan section 20.3, M08 | C + M + A | Can source misunderstanding be distinguished from language/ASR/access failure without shame or personality inference? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M09 | Make the handover usable; PRACTICE; Execution | Master plan section 20.3, M09; section 20.4 is a source draft, not activated here | C + M + A | Can keyboard/nonvisual users edit the work product, with template work distinct from their changes? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |
| M10 | Choose what not to do; PRACTICE; Execution | Master plan section 20.3, M10 | C + M + A | Do workload presentation and prior employment assumptions bias prioritization or escalation? | Reviewed practice package, evaluator/assistance review and versioned publication approval absent. |

### Required submission packet and review receipt

Prepare later, under separate authoring authority; **none is supplied by this file**:

1. Source/licensing and change rationale; proposed mode, intended users, version
   and relation to frozen historical forms. Use original permitted material only.
2. Content specialist's briefing/facts/allowed-branch/work-product package and
   content-test references. Private rubric/exemplar attachments stay restricted,
   never in the learner-facing formal briefing or this public intake table.
3. Measurement lead's construct/task/observable-action alignment, opportunity
   independence, interpretation/confound assessment and intended-use decision.
   Source opportunity suggestions are not changed sufficiency rules.
4. Accessibility variants and manual-review evidence; formal timing justification
   and accommodations review. Existing runs retain their own timing policy.
5. For practice, assistance attribution, criterion/evaluator review and proof of
   separation from formal reporting. Coaching is labelled practice, not assessment.
6. Named reviewers, dated decisions, change requests, artifact/version references,
   restrictions and explicit publication purpose. An agent-created packet is not
   independent review evidence.

Source lifecycle: DRAFT -> CONTENT_REVIEW -> MEASUREMENT_REVIEW ->
ACCESSIBILITY_REVIEW -> APPROVED_FOR_PILOT -> APPROVED_FOR_INTENDED_USE -> RETIRED.
Mapping to existing catalogue statuses is later reviewed implementation, not a
P0 transition. Pilot approval is not broad validation. No frozen form is overwritten.
The existing carried-over mission `MIS-MKT-EXP-01` does not satisfy these eleven
new intake records or their approvals.

Carry forward [Campus human gates](../campus/CAMPUS_HUMAN_ACTIONS.md):
HA-C002/C003 for measurement/form governance, HA-C009 for missions/evaluator,
HA-C005/C008 for disclosure/research use and HA-C013 for manual accessibility.
The wider [human-action register](../remediation/HUMAN_ACTION_REGISTER.md) retains
its own appointment, rater, legal and study prerequisites. Nothing is closed here.

## Appendix C: Proposed discovery interview guide

**Preparation only; proposed 12 adult students and 12 early-career professionals,
not 24 recruited participants or validation observations.** UX/research lead owns
the protocol; Paul owns the source-assigned segment/commercial decision. Recruitment,
privacy/consent basis and participant handling require named human owners before use.

### Recruitment and consent gates

- Target students nearing internships/employment and early-career professionals.
  Recruit voluntarily with varied contexts, supported languages and accessibility
  needs; this is purposive discovery, not a representative/fairness sample.
- Keep recruitment/contact lists outside this repository in an approved restricted
  system. Do not scrape contact details or ask institutional staff to supply
  identifiable assessment histories. No recruitment or invitations occur in P0.
- Explain research purpose, optional recording, intended use/access, reviewed
  retention and withdrawal limits before consent. No career, admission, employment,
  Campus or assessment benefit depends on joining or a favourable answer.
- Allow skipping, breaks and ending participation. Recording is separately optional;
  do not promise deletion beyond the approved policy. Accommodations need not
  disclose diagnoses. No live employer/student confidential material is required.
- If compensation is later approved, it covers participation, not positive answers,
  purchases, practice activation or return visits. Record research-incentivized
  activity separately from voluntary product usage; do not count it as retention.

### Neutral question order

Ask about concrete recent events before showing Prism or proposing a solution:

1. “Tell me about a recent interaction or task that was difficult to handle.”
2. “What were you trying to achieve, and what happened?” Invite a de-identified
   description; do not request names, private messages or confidential documents.
3. “Which part was hardest? What made it hard in that situation?”
4. “What did you try before, during or afterwards? What alternatives did you use?”
5. “What did those alternatives help with, and what did they leave unresolved?”
6. “What were the consequences? What time, effort or money did you actually spend?”
7. “What similar situation do you expect next? What would you prepare for?”
8. After an approved, clearly labelled demonstration: “What do you think this
   tells you? What would you do next? What, if anything, is unclear or unhelpful?”
9. “How would this compare with what you already use? What would you need to know
   before choosing it?” Hypothetical willingness is not a purchase.

Do not ask “Would you buy our AI assessment?” as the opening question, imply
validated benefits or supply a preferred answer. Observe use separately from
interview opinion. No new formal assessment, scoring or live-model spend is
authorized by showing a later demonstration.

### Proposed recording sheet (empty; no results)

Use a study-local pseudonymous reference, segment, consent/version receipt,
access mode, de-identified problem/alternative summary, observed versus stated
behaviour, researcher-assistance marker and unresolved question. Store any actual
responses only in the approved research system, not this file or telemetry.
Current recruitment/consent/interview/findings fields are all **NOT COLLECTED**.
No personas, quotes, themes, counts of completed interviews or purchasing claims
are inferred from the proposal.

## Appendix D: Proposed five-second / two-minute comprehension protocol

Owner: UX/research lead, with measurement and accessibility review. **NOT RUN.**
Source: master plan sections 19.7 and 30.6. This is report usability/comprehension,
not scientific validity, efficacy, reliability or fairness evidence.

### Prerequisites and materials

Use only approved public-facing report material: either a clearly labelled synthetic
test-only specimen or specifically consented, authorized owned-report material.
Neither specimen is supplied here. Never create a fictional production result,
borrow another person's report, reveal private rubric anchors, or invoke a report
builder/live model to prepare a research view. Respect the read-side-effect warning
in [ROLLOUT](./ROLLOUT.md#read-path-side-effects-and-retention-conflict).
Include a supported finding and a limited-evidence state, plus pending/technical
failure cases when testing recovery understanding. Preserve their meaning.

### Procedure

1. Obtain approved consent and explain: “We are testing the page, not you. Please
   say what it means to you; there is no need to give a positive answer.”
2. Expose the summary for **five seconds**, then hide it. Ask, without hints:
   “What did that page tell you?” Record whether the participant identifies a
   supported finding **in this assessment**, or correctly recognizes limited
   evidence/no available finding. Do not teach labels before this first response.
3. Restore the report for **two minutes of inspection**. Ask: “Find something you
   could work on next, and show where you would go to practise it.” Observe the
   chosen behaviour, source/context finding and next-action navigation unassisted.
   Do not require a fabricated practice action when the catalogue is unavailable;
   correct recognition of that limitation is a separate outcome.
4. Ask: “What supports that finding? Does this describe all of you or this
   assessment? What does missing evidence mean? Does practice change this issued
   result?” For pending/failure material ask what is available now and what the
   appropriate recovery step is; do not tell them to purchase again.
5. Record the first response/action before any assistance. If the participant is
   stuck, end the unassisted observation before offering help and label later
   actions assisted. Collect preference/visual appeal only after comprehension.

Five-second visual exposure is not an accessibility test or a speed judgement.
Agree equivalent nonvisual presentation and any accessible timing variant in advance;
record it separately, not as a lower capability or a directly comparable timed
score. Keep instructions and content constant within any future list/map comparison;
counterbalance order and record learning effects. Do not build variants in P0.

### Proposed outcomes and decision use

Record separately: supported-finding/limited-evidence understanding; source and
scope recognition; next-behaviour identification; correct available practice/recovery
navigation; time to action; misunderstanding; and assistance/access variant.
Denominators, inclusion rules and an analysis plan require human agreement before
collection. Small discovery counts are not population thresholds. Any source-plan
commercial/comprehension targets remain hypotheses, not achieved gates.

All observations and results remain **NOT COLLECTED**. No participant contact,
comprehension percentage, feedback quotation, purchase or voluntary return is claimed.

## Completion and validation boundary

The screen inventory, eleven DRAFT intakes and proposed research protocols are
prepared for handoff. Reviewers/consent/publication/study execution remain pending.
Only documentation was changed; no fresh build, unit, server, browser, database or
live-model tests were run for this record. Read existing checkpoint results at their
original references; do not promote this preparation to release or P0-wide completion.
