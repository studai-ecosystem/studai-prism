# Experience programme - decision and external-gate register

## P6 remaining-gap decisions - 2026-10-03

1. **A retry is deduplicated on the attempt it follows, not on the client key.**
   The server derives `retry:<mission>:<previousAttemptId>` so a double click, two
   simultaneous "Try again" requests or a repeat with the same client key all yield
   one new attempt; the client key is still required (API contract) and the chain
   tip is followed rather than timestamps (fixed test clocks tie `createdAt`).
2. **A failed review never costs an attempt.** A retry after
   `EVALUATION_UNAVAILABLE` is a reissue (`retryOrigin.reissued = true`): no
   allowance unit is consumed, even when the allowance is exhausted. Finished
   attempts stay readable regardless.
3. **Copied assistance is labelled, never praised, and never counted.** ≥ 80 % of the
   word pairs of a shown example/hint sentence (≥ 6 words) reproduced in a
   criterion's artifacts marks the criterion `COPIED_ASSISTANCE` whether the check
   would otherwise have passed or not; exposure spans every attempt of that mission in
   the workspace. The threshold is a product rule for assistance provenance, not a
   measurement claim; a live-model review of false positives is a Layer C item.
4. **Fresh challenges prefer the practised mission's transfer version.** The
   unfamiliar-setting version of a mission the learner has practised (same behaviour
   ids, different setting) ranks before another mission of the capability; anything
   whose exposure tags the learner has met is excluded. `practiceReplay.test.js` P6.7
   was updated to this rule (requirement change, every earlier guarantee retained).
5. **DRAFT v1 mission content was revised in place.** The P6 missions have never been
   seeded into a persistent store (DRAFT is dark in production; test DBs are
   disposable), so the reviewer-package fields were added to the existing v1 bodies
   rather than minting v2s. `MIS-MKT-EXP-01` v1 and handover v1 stay byte-identical;
   once any DRAFT mission is seeded into a durable environment, further content
   changes must be new versions.
6. **Provenance lives in `assistance_json`, not a new table.** Hints/examples
   exposed, coached revision, retry origin, variant, copy-check sources and the
   feedback/evaluator/prompt versions are additive keys on the existing column
   (0046); no migration was needed.

## P5 remaining-gap decisions - 2026-10-03

1. **Recommendations are a read-time projection, never part of the stored
   version.** `development.priorities[].recommendedMission` stays `null` in
   every published version and the schema still forbids anything else. The
   owner response carries a separate `recommendations[]` computed from the
   stored version's own evidence (behaviour ids in unit provenance), the
   missions the workspace can open today and the live allowance. A mission
   publication, a content-state change or an allowance change therefore
   never changes a version number or `evidence_set_hash`; historical reports
   remain reproducible. Sponsors and share links never receive
   recommendations. DRAFT missions are eligible only behind
   `PRISM_DRAFT_CONTENT` (test/local) and are labelled as draft; the legacy
   `MIS-MKT-EXP-01` has no form behaviours and is never a recommendation.
2. **Withholding evidence after a review is a provenance flag, not a
   mutation.** A CORRECT decision stores `withholdEvidenceIds` in the
   append-only `report_review_decisions` row; the evidence unit's
   `evidence_status`, `human_review_status`, level and provenance are
   untouched. The report builder and the directory-backed read models exclude
   the withheld ids and the corrected publication is a NEW version (reason
   `REVIEW_CORRECTION`, prior version set, `report.review.withheldEvidenceIds`
   recorded) built through the ordinary publication path; the original version
   is byte-identical afterwards. Rejected: mutating `evidence_status` (would
   rewrite calibration/rating inputs) and editing the stored version (append-only
   trigger, and a silent rewrite is exactly what CH-29 forbids). Sufficiency
   floors are unchanged; withholding can only reduce evidence.
3. **Reviewer permission.** A new `reports:review` key (product_admin,
   assessment_ops) rather than reusing `reports:supersede`, because a review
   decision never changes a score and must not require the dual approval the
   legacy score supersession needs. UPHOLD and REJECT record only; nothing
   is decided twice.
4. **A DONE evaluation run is a report for the session directory (T35).**
   `hasReport` no longer depends on a legacy report row; `completedAt` is the
   worker's stored completion time and `reportIssuedAt` the stored V3
   version's issue time. No clock-derived date is introduced.
5. **One insufficient state (CH-27).** The report callout shows one sentence
   per audience; the capability detail shows a single plain state and keeps
   reason codes under Details; the single-assessment timeline is not shown
   because it would only repeat that state.
6. **Comprehension protocol prepared, not run.** `RESEARCH_PROTOCOLS.md`
   §3a holds the facilitator script, sealed MAP/LIST assignment and the
   recording-sheet fields. The LIST variant is the map's own accessible
   rendering (track hidden), not a new component. No participant, no
   observation and no comprehension figure exist; the study stays BLOCKED on
   the §6 approvals.

## P3 acceptance-gap decisions - 2026-10-03

1. **Speech in the V3 formal path: text only in V3 formal path; speech
   review-before-commit deferred.** The V3 player has no speech capture or
   transcription. The intro says replies are typed and that speech input is not
   part of this assessment version. The legacy player's short automatic-send
   timer is NOT ported. A speech path needs a reviewed transcription-review
   step (learner sees and edits the transcript before committing), mode and
   correction provenance and an accessibility review; that is a later,
   separately approved change. A static test (`p3Player.test.jsx`) keeps
   speech auto-send, hint and coaching wording out of the formal player.
2. Plan board (P3.6): the client renders the server-validated owner/status/
   dependency lists sent in the contract as `artifacts[].schema` (same lists as
   `validateBoardPatch`; no rubric content). Learner changes stay stored as
   `<rowId>.<field>` keys; seeded TEMPLATE values are shown as "Provided" and
   learner values as "Your edit". No measurement, evidence or validation rule
   changed.
3. Required material (P3.5/T11): an artifact entry without data shows a
   recovery state (reload the session contract, contact support) instead of
   the old "continue in the conversation" placeholder; an unsupported type is
   named and routed to support. Zero-artifact forms keep the centred
   conversation.
4. Time warnings (P3.8): 10/5/1-minute milestones apply only when the run's
   persisted policy duration exceeds the milestone (`policyDurationMs` is now
   in the contract; legacy runs report their 35-minute limit). Post-cutoff
   drafts stay visible, read-only and labelled "not submitted"; they are never
   sent. Server-side cutoff enforcement is unchanged (`server/test/runTiming.test.js`).
5. Home (P3.3): `PREPARATION_IN_PROGRESS` (PERSONAL workspace, flag
   `PRISM_PREPARATION_V1`, own DRAFT/REHEARSING attempt) ranks after a formal
   run in progress; `PRACTICE_AVAILABLE` (first recommended non-DRAFT mission
   from the development plan, with duration, mode and allowance) ranks after a
   ready report. A failed read omits the state; nothing is invented. Technical
   failure still leads to recovery and support, never a purchase.
6. The P3 real-browser journey enables `PRISM_DRAFT_CONTENT` only inside the
   throwaway 4174 audit server, via `PRISM_AUDIT_DRAFT_CONTENT` set by the
   runner's `p3` mode. No `.env`, flag default or real environment changed.

## P1 execution decisions - 2026-10-02

The supplied P1 block authorizes continuing independent implementation after
P0, not self-approving the domain decisions below.

1. Bare account creation uses `/app`; explicit paid assessment entry keeps its
   purchase destination. The registration assertion and paid browser tests
   intentionally distinguish these requirements. No prices, free grant, credit,
   allowance or checkout handler changed.
2. Same-origin next paths use the actual application route family; unsafe/
   malformed/unsupported targets show a recoverable notice without echoing them.
   Legacy guarded actions preserve their real destination through registration.
3. Browser account changes clear only known candidate drafts/pending input/
   personalization/workspace keys, not unrelated storage or a pending invitation.
   Account-bound component state resets; token renewal by the same owner retains
   drafts. Workspace resets apply to page content, not shell navigation/focus.
   Client cancellation is not proof that a server action was cancelled or saved.
4. Original issued reports keep stored findings and dates; absence stays absent.
   Rendering/retry fixes do not approve reanalysis or alter the original blob.
5. No safe assumption resolves CH-08/38/39/40: reviewed ownership write/access
   decisions, pinned formal-run/async acceptance and the source-retention/erasure
   contract remain missing. HA-C002/005/008/012/013 and related operational gates
   remain open. Existing rights, authorization, timing, erasure and retention are
   preserved. No unused parallel history/job framework or synthetic success
   pipeline is created to disguise that integration blocker.

Date: 2026-10-02. Scope: approved **P0 diagnostic-only preparation**.
Source: `..\..\..\.github\prompts\document.md` section 39 and
`..\..\..\.github\prompts\plan.prompt.md` P0.7.
Execution authority: approved session plan
`02dcb662-6d57-42a7-b583-59b4a7c1e3d1`.
See [112-ID traceability](IMPLEMENTATION_STATE.md).

Documentation structural verification: 13 unique ADR rows match the source
decision/default/approval wording; all 13 HA-C references are retained.
The paired ledger's 112-ID/source-phase/path check found zero mismatches.
This structural check is documentation evidence only. Fresh application
diagnostic results are now supplied by the parent checkpoint in
[BASELINE](BASELINE.md) and [TEST_RESULTS](TEST_RESULTS.md). Supplied fresh
diagnostic/partial evidence is summarized below; remaining full source
acceptance and external gates stay OPEN.

**No human approval, completed study, content publication, runtime repair,
production activation or release readiness is recorded by this document.**
No application change or commit is authorized by this register.
Source defaults are directions to review, not evidence that the proposed
behavior currently exists. Unassigned roles are visibly awaiting named owners.

## Status and authority

- **ADOPTED DIRECTION**: retained approved product/architecture direction,
  not a signed external approval and not a completed implementation.
- **PRESERVATION CONSTRAINT**: mandatory compatibility/safety boundary for P0;
  it does not approve a new policy.
- **PROPOSED / PENDING REVIEW**: design/content/science/commercial decision
  requires its named authority before dependent implementation/activation.
- **DRAFT INTAKE**: reviewer materials may be prepared; no executable formal
  content, rubric, evaluator, published mission or standardization decision.

Paul Jeevanesan A. is the source product/commercial owner. Engineering lead,
frontend/backend/QA/UX, content specialist, external measurement lead,
security reviewer, counsel/DPO, accessibility lead, finance approver and
release/support operator still require named assignments. An agent cannot
act as an independent reviewer of its own output.

## ADR-01 through ADR-13

The default and approval-role wording below is retained from the source decision
table. Status records the P0 disposition; the open condition is an actual gate,
not a suggestion that later-phase work is complete.

| ID | Decision | Default in source plan | Who approves change (source) | P0 status | Implementation / dependency refs | Open approval or verification condition |
| --- | --- | --- | --- | --- | --- | --- |
| ADR-01 | Canonical player | Existing V3 player; legacy adapters only | Engineering + product | ADOPTED DIRECTION; compatibility review pending | CH-09/10/11/12/48; I02/I06/I07; P3/P10 | Approved V3-only forward direction does not prove universally version-aware routing. Keep active/legacy adapters and historical readers until parity, usage inventory and drain are evidenced; HA-C001/007/013 remain OPEN. |
| ADR-02 | Report architecture | Evolve V3; immutable publication snapshots | Engineering + measurement | ADOPTED DIRECTION; publication contract pending | CH-03/23/25/28/29/52; I13/I20; P2/P5/P10 | No Report V4 or silent historical rebuild. Fresh parent B run reproduces report GET appending a version: T36 read/publication invariant FAIL/OPEN, not a safe support probe. Full same-version-content, correction and race acceptance remain unverified. Retained candidate-source/citation and correction policy need MEASURE/PRIVACY sign-off. |
| ADR-03 | New engine path | Versioned runtime for new runs, old method preserved | Engineering + measurement | PROPOSED / PENDING REVIEW | CH-09/17/18/20/21/40; I09/I10; N02/N03/N04; P1/P2/P4 | Existing engine adapter calls the legacy assessment router. New mode/form/method/config must be pinned server-side; no new runtime, durable worker or distributed proof is delivered in P0. Independent approval and real B lineage are required. |
| ADR-04 | First target customer | Internship/placement-stage adults and early-career professionals | Paul, based on demand evidence | PROPOSED; research preparation only | CH-43/45/51; P0 intake/P8/P9 | Prepare neutral 12-student/12-professional interview and comprehension protocols; no participant contact/findings here. Adult-entry declaration behavior is preserved, not a new eligibility policy. Intended-use, demand and consent evidence pending. |
| ADR-05 | Universal content | One domain-light original blueprint, draft until reviewed | Content + measurement | DRAFT INTAKE; content approval pending | CH-15/17/18/19/50; I11; N12; P4 | CORE-TEAMREADY-A receives provenance/reviewer/confound/accessibility intake only. No new formal scenario, fact, opportunity schedule, rubric execution or publication in P0. HA-C003/008 govern approval; name alone is not reviewed content. |
| ADR-06 | Capability families | Keep five; revise rubrics through versions | Measurement + product | ADOPTED KEEP DIRECTION; revisions pending | CH-16/21/24/36/47; I12/I24/I26; P4/P5/P7 | No legacy percentage-to-band conversion, invented threshold, new construct or formal-growth claim. Assertiveness/help-seeking and format-bias review need approved versions and held-out exemplars. HA-C002/004/008 remain OPEN. |
| ADR-07 | Formal duration | Preserve existing runs; new form timing reviewed before publish | Measurement + accessibility + product | PRESERVATION CONSTRAINT; new administration pending | CH-13/14/49; T14-T20; I08/I09/I27; N15; P3/P4 | Preserve existing server 35-minute contract, timestamp/deadline and accommodations. No 30-minute display clamp or pre-intro start change here. Future acknowledgement, begin replay, strict answer cutoff, operational grace and recoverable unscored drafts require approved administration/version and B race tests. |
| ADR-08 | Practice development offer | Ten reviewed missions in library; bounded purchased allowance | Content + product + finance | DRAFT INTAKE; offer/allowance approval pending | CH-30/31/32/33/42; I16/I17/I21; N10/N12; P6/P8 | M01-M10 reviewer intake is not ten delivered missions. Existing MIS-MKT-EXP-01/evaluator must retain HA-C009 review. Do not market universal coverage, invent allowance or alter bought rights before reviewed content and finance/entitlement evidence. |
| ADR-09 | Personal preparation | Private practice, no automatic Campus visibility | Privacy + product | ADOPTED PRIVACY DIRECTION; implementation/review pending | CH-04/34/35/37/39; N08/N09; P7/P8 | Separate PREPARATION and SELF_REPORT from formal/practice evidence. No ingestion of employer email/calendar, raw analytics leakage or student opt-out promise without reviewed disclosure and implemented access/erasure. HA-C005/012 remain OPEN. |
| ADR-10 | Formal/provisional claims | Evidence-limited; no readiness/placement guarantee | Measurement + counsel | PRESERVATION CONSTRAINT; intended-use review pending | CH-21/22/24/26/36/45/47; I12/I14/I24; P2/P5/P9 | Existing claims/copy ceilings stay at least as strict. Technical failure, genuinely insufficient evidence and clearly developing observation are distinct. No fabricated confidence/growth or scientific approval; provisional interpretation and actual study conclusions need HA-C002/008 and counsel. |
| ADR-11 | Pricing | INR 499/999 are tests, not immutable configuration | Paul + finance | PROPOSED HYPOTHESES; commercial approval pending | CH-42/43/51; T53-T55; I21/I29; P8/P9 | Source prices are research hypotheses, not current checkout values or an approved offer. No billing, credit/refund, allowance, subscription or payment activation here. Preserve grandfathered rights; finance/provider approval and measured unit economics are required. HA-C006 remains separately applicable to Campus. |
| ADR-12 | Platform retention | Explicit policy; no indefinite default promise | Privacy/counsel + operations | PRESERVATION CONSTRAINT; source-retention decision pending | CH-23/25/29/34/39; T32/36/48/52; I20; N14; P1/P2/P7/P10 | Fresh parent B run reproduces normal completion removing history that V3 reads: T32 source dependency FAIL/OPEN. Separate telemetry retention does not supply builder access; this does not prove every source copy erased or production data lost. No silent retention extension or reconstruction from summaries. Approved source/derived-copy/backup/erasure manifest and worker tombstones needed; HA-C005/012 and remediation legal gates remain open. |
| ADR-13 | Production activation | Operator-controlled after gates | Named release owner | ADOPTED AUTHORITY BOUNDARY; activation BLOCKED | CH-09/10/38/39/40/41; T49-T52/T60; I22/I28/I30/I31; P0/P9/P10 | Parent FINAL_REPORT closes code-safe diagnostic-only P0; final browser runner exit 0 has 91 passed + 1 flaky, not 92 clean passes. Dark flag consistency is not release readiness; product FAILs remain unresolved. No live flags, customer mutations, deployment, production migration or live-model spending. Pinned active handlers/drain and approved recovery required before rollback; HA-C001/007/012 and named owner pending. |

I/N references resolve to exact existing/proposed-absent paths in
IMPLEMENTATION_STATE. No ADR is marked externally APPROVED or CLOSED.
Any future approval must include decision/version, named authority, date, scope,
evidence reference and permitted action, not just a checkbox or merged commit.

## Fresh parent evidence - diagnostic checkpoint, not approval

[TEST_RESULTS](TEST_RESULTS.md) records 9 final diagnostic unit tests passing,
true read-only PostgreSQL enforcement (write rejected with SQLSTATE 25006,
record count unchanged), conflict/unclaimed classification and a 3-test
normal HTTP/scorer integration run applying all 39 actual migrations. The
external model alone was stubbed; no report/evidence was preseeded.

Frontend: 360 pass. Server: 649 total, 624 pass, 0 fail, 25 skip; skipped
DB checks stay unverified. Build, static and dark test-process configuration
checks PASS. The initial four-browser run passed 92 assertions but exited 1
on EBUSY cleanup. The final rerun completed with **91 passed + 1 flaky
(total 92)**, 0 final failures and runner exit 0; bounded cleanup succeeded.
Firefox materials at 360 initially failed during sign-in setup (`page.goto`
load timeout); the same assertions passed on unchanged automatic retry.
This is not a claim of 92 clean passes.

**Product FAIL/OPEN:** T25/T26 Layer A receipt-write fault/retry gives
2 engine effects / 1 receipt; T27 Layer B gives zero judged strict dialogue
units; T32 Layer B loses the history dependency V3 reads; T36 Layer B GET
appends a stored version. Passing diagnostic tests correctly expose these
failures; they do not repair or approve the product.

**Partial only:** T05/T47 prove owned completed synthetic history and a denied
second owner, not old-customer/original-format/full audience acceptance.
T59 proves the actual dev timeline row is synthetic, not the unknown full
conversion/research exclusion manifest. No live-model, customer, human-study
or external approval evidence was supplied. **Code-safe diagnostic-only P0 is
COMPLETE per [FINAL_REPORT](FINAL_REPORT.md); all later-phase acceptance stays
OPEN and learner release stays NO-GO.**

## P0 operational decisions

| Topic | Diagnostic-only disposition | Evidence / remaining condition |
| --- | --- | --- |
| Scope conflict | Approved session P0 overrides attachment's auto-progress and repair instructions. Stop before P1. | Parent owns phase closure/results/final handoff; this owner edits only these two documents. |
| Dirty checkout | Preserve pre-existing changes; no application edits, staging or commits here. | Observed HEAD f40bd1c; parent retains exact baseline/status and excluded paths. |
| Safe diagnostics | Parent implemented allowlisted metadata/count projections, explicit unknown/errors, redacted references and enforced read-only transactions. | F-A/F-B in TEST_RESULTS: 9 diagnostic tests and PostgreSQL SQLSTATE 25006/unchanged count. Diagnostic command does not boot/migrate/settle/build reports; separate isolated HTTP integration setup does migrate/write. Real-environment authorization/readiness remains pending. |
| Unsafe read assumptions | HTTP GET is not automatically read-only. Report reads may publish versions, session reads may settle state; admin initialization may seed RBAC. | Parent coherent handler trace must govern operator procedures; no customer HTTP investigation here. |
| Migration probe | Do not run migrate:store as production dry run: its migrateUp call mutates without enforce. | Isolated B run applied all 39 actual migrations; repository head 0039 is not production applied state. Operator production evidence pending. |
| Ownership | MATCHED, CONFLICTING, UNCLAIMED, DELETED, EXCLUDED are diagnostic categories, not write authorization. | Fresh conflict/unclaimed fixtures verified, no transfer. DELETED/EXCLUDED stay unknown without authoritative manifests; missing rows do not prove deletion. Stored matched refs/names/email/UUID possession never authorize a claim. |
| Persistence | Dirty PG advisory-lock wiring must not be erased or described as memory-only. | Fresh Layer A T25/T26 reproduction: receipt-write fault then retry yields 2 effects/1 receipt. Normal B writes pass only the normal path. Distributed crash/lease/race proof remains absent; evaluation Maps remain a durability concern. |
| Technical recovery | Prepare authorized lookup and evidence needed for retry/review; preserve original result and retained source. | Distinguish existing approved retry from proposed reviewed re-analysis/no-charge reissue. No re-scoring, transfer, credit/refund or promise of recovery issuance here. |
| Source loss | Never substitute model summaries, invented excerpts or completed fixtures for missing candidate work. | Source-retention/privacy and immutable publication contracts are external/backend gates, not cosmetic fixes. |
| Review materials | CORE-TEAMREADY-A and M01-M10 are DRAFT reviewer-intake records only. | Parent CONTENT_REVIEW records provenance, required review, confounds/accessibility and publication blockers; no formal content authored/activated here. |
| Research | Interview and five-second/two-minute comprehension materials are proposals only. | No recruitment/contact, incentives implying voluntary return, fabricated findings or independent validation claims. Consent and named researcher pending. |
| Reference conflicts | Written measurement/privacy/availability requirements win over mockups. | Missing HTML/screens not inspected; no rainbow precision, failure-red absence, mixed formal/practice/self-report profile, invented dates/people, numeric growth, avatars, false privacy or template-to-learner attribution. |
| Evidence layers | A fixture contracts, B real disposable DB/HTTP pipeline, C authorized live-model staging stay distinct. | Fresh A/B counts and product failures are supplied in TEST_RESULTS; earlier repair counts stay historical. C/manual studies and remaining full acceptance NOT RUN; no B claim from intercepted/seeded report UI. |
| Closure | Parent FINAL_REPORT closes code-safe diagnostic-only P0, not product recovery or release. | Final runner exit 0 retains 91 passed + 1 flaky and earlier EBUSY. UI A-M completion stays separate; later acceptance/human/production gates remain FAIL/OPEN/NO-GO. Parent owns the explicit-path local phase commit. |

## Carried-forward HA-C001 through HA-C013

Authority: [Campus human-action register](..\campus\CAMPUS_HUMAN_ACTIONS.md).
All thirteen rows were **OPEN with no linked closure evidence** when read.
This mirror carries their authority and dependencies; it does not rewrite or close
the canonical register. The status column deliberately distinguishes source OPEN
from new evidence: no fresh external evidence has been supplied.

Some preparation notes are historical: source HA-C001's single-instance condition
must be reconciled with pre-existing dirty advisory-lock wiring, not blindly repeated
as the current implementation. Source HA-C007's push/merge/deploy status may be stale
relative to old commits, but there is no authority here to infer completion.
HA-C003/009's older no-authoring wording is reconciled only for **P0 draft intake**;
human approval/publication requirements stay unchanged.

| ID | Carried action / authority | Role owner | Source status / P0 external status | Experience dependencies | Evidence required to close / current evidence |
| --- | --- | --- | --- | --- | --- |
| HA-C001 | Flip Campus/application/report/evidence/development/growth/role/player/rating flags in any real environment | Operator; awaiting named owner | OPEN / pending | ADR-01/03/13; CH-09/37/40/41; T04/T60 | Approved entry gates, effective build/config/schema, scoped activation and active-run drain record. No current flag evidence or activation here. Dirty locks require B proof, not assumed multi-instance readiness. |
| HA-C002 | Final capability labels and sufficiency thresholds | Psychometrics lead; awaiting named owner | OPEN / pending | ADR-06/10; CH-16/21/24/36; T23/T29/T30/T37/T46 | Versioned reviewed labels/rules, named science sign-off and supporting held-out/intended-use evidence. Existing constants are provisional, not approval. |
| HA-C003 | Author/approve universal-core and career-track scenario content | Content governance + psychometrics; awaiting named owners | OPEN / pending | ADR-05/07; CH-15/17/18/19/50; T19/T22/T24 | Provenance, reviewed blueprint/opportunity/rubric/accessibility/confound records and publication/version authorization. P0 intake is DRAFT only. |
| HA-C004 | Approve form equivalence for growth | Psychometrics lead; awaiting named owner | OPEN / pending | ADR-06/10; CH-36; T46 | Named dual review, cited form-pair evidence and audited approval under existing equivalence governance; HA-C002 prerequisite. PENDING registry pairs are not equivalence. |
| HA-C005 | Legal/privacy review of disclosure, consent and sharing | Counsel; awaiting named owner | OPEN / pending | ADR-09/10/12; CH-23/34/37/38/39/44/45; T43/T47/T48/T52 | Written approved scope/copy/retention/research use and candidate-excerpt consent basis. No P0 counsel approval; private-preparation intent is not proof of access enforcement. |
| HA-C006 | Campus commercial contracts and approved price configuration | Business owner + finance; finance owner pending | OPEN / pending | ADR-08/11; CH-37/42/51; T53/T55/T57 | Signed institution-specific contract, finance review and approved pricing/audit evidence. Null/draft records and Personal INR hypotheses do not close Campus approval. |
| HA-C007 | Push / PR / merge / deploy | Operator; awaiting named owner | OPEN / no action authorized here | ADR-13; CH-10/41; P10 | Explicit authorized operation with exact branch/build/environment and linked execution evidence. Historical commits do not prove present deployment; no commit/push/PR/merge/deploy in this document work. |
| HA-C008 | Human validation, raters, reliability, DIF and criterion studies | Psychometrics lead; awaiting named owner | OPEN / pending | ADR-04/05/06/10; CH-16/21/33/45; T29/T30/T33/T42 | Qualified independent raters, predefined protocol/splits, consent basis with HA-C005, held/invalidated-session recheck, actual data/results and science sign-off. Tooling/protocol drafts are not executed studies. |
| HA-C009 | Mission content and practice evaluator governance, including MIS-MKT-EXP-01 | Content governance + psychometrics; awaiting named owners | OPEN / pending | ADR-08; CH-30/31/32/33/42; T39-T42 | Reviewed mission versions, evaluator/schema/quote/confidence/semantic criteria and held-out human-rated examples. Existing seed does not prove all five families or ten reviewed missions. |
| HA-C010 | Privacy review of Campus aggregates/suppression/filter/export risk | Counsel + DPO; awaiting named owners | OPEN / pending; no expansion in P0 | CH-37/44/46; T07/T43/T58 | Approved group-size/participation/differencing/suppression/export policy and review evidence. Historical server suppression does not constitute independent approval. |
| HA-C011 | Live SSO/SIS integration configuration | Operator + counsel; awaiting named owners | OPEN / deferred from experience expansion | CH-02/37/46; T57 | Institution-specific credentials/metadata/domain verification, contract/DPA and authorized integration execution. Interfaces or honest Not connected screens are not live integrations. |
| HA-C012 | Final independent production security review, dependency/secrets/multi-instance assessment | Security lead; awaiting named owner | OPEN / pending | ADR-03/09/12/13; CH-38/39/40/41; T34/T47/T49/T50/T52/T60 | Independent review, relevant production/DAST/dependency/rotation evidence and closure of erasure/access/multi-instance findings. Historical audit counts not rerun; no penetration test here. |
| HA-C013 | Manual accessibility with assistive technology and users | Accessibility lead; awaiting named owner | OPEN / pending | ADR-01/07; CH-01/11/12/24/49; T13/T14/T56 | Recorded screen-reader, zoom/reflow, forced-color, voice-control and assistive-user journeys with build/devices/findings/remediation. Historical automated checks do not establish WCAG conformance. |

### Other inherited blockers are not reset

Keep [remediation human-action register](..\remediation\HUMAN_ACTION_REGISTER.md),
[retention policy](..\RETENTION_POLICY_v1.md),
[intended use](..\PILOT_INTENDED_USE_v1.md),
[claims/evidence register](..\CLAIMS_EVIDENCE_REGISTER_v1.md),
[Campus security review](..\campus\SECURITY_REVIEW.md) and
[repair readiness](..\ui\FLOW_REPAIR_READINESS.md) authoritative in their domains.
The inherited credential/provider review, counsel retention/consent/under-18
decisions, appointment/qualification of measurement reviewers/raters, scientific
studies and flag/finance/production authorizations are not closed by the new source
document or by historical UI completion. No secret value is reproduced here.

## Evidence to request at parent handoff

1. Retain the supplied BASELINE checkout/route/report lineage, including reproduced
   GET side effects; production applied DB/build/flags remain unknown.
2. Retain fresh TEST_RESULTS with distinct A/B failures, partial slices and the
   final browser result: 91 passed + 1 flaky, runner exit 0, successful bounded
   cleanup; preserve the initial EBUSY failure. Parent FINAL_REPORT closes only P0
   diagnostics, not product acceptance.
3. Retain supplied safe diagnostic evidence: rejected writes, allowlisted metadata,
   query errors and conflict handling. Production access, deletion/exclusion
   manifests and approved claiming rules remain unsupplied.
4. DRAFT content/research intake, named review roles and no publication/contact claims.
5. Authorized owner decisions for source retention, ownership claims, immutable
   publication, durable engine/job receipts, administration, access/erasure and
   support recovery before a later phase depends on them.
6. Operator release evidence and independent content/science/privacy/security/
   accessibility/commercial gates before activation; pinned active-run handling
   and approved recovery before rollback.

These requests are an accountable handoff, not approval to execute restricted
actions. This document owner's acceptance is accurate ADR/HA traceability; the
parent owns test outcomes, P0 closure and the final report. **Stop before P1;
overall learner release remains NO-GO.**
