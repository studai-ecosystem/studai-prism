# HA-008 — Role brief: external psychometrician / I-O psychologist

PROD-READY Phase 10. **DRAFT role brief for the founder (register row HA-008).**
Engineering wrote it from what the repository already asks of this role. It
contains no engagement terms: fee, hours, contract form and start date are the
founder's to set (`______` below). Nothing here claims that any study has
been run or that any value is validated.

## 1. Purpose of the role

Prism is a development-use capability assessment (never a hiring screen,
ranking, pass/fail cut-off or job-performance predictor —
[JOB_FAMILY_SCOPE_v1.md](../../JOB_FAMILY_SCOPE_v1.md),
[PROHIBITED_USES_POLICY_v1.md](../../PROHIBITED_USES_POLICY_v1.md)). Every
measurement claim is PENDING
([CLAIMS_EVIDENCE_REGISTER_v1.md](../../CLAIMS_EVIDENCE_REGISTER_v1.md),
[CAMPUS_CLAIMS_REGISTER.md](../../campus/CAMPUS_CLAIMS_REGISTER.md)) and
every science flag is NO-GO until evidence exists. The psychometrician is the
independent scientific authority that decides what evidence is needed, runs
or supervises the studies, and signs (or declines to sign) the measurement
decisions. Separation policy rule 5 requires external advisory participation
in science decisions ([ECOSYSTEM_SEPARATION_POLICY_v1.md](../../ECOSYSTEM_SEPARATION_POLICY_v1.md)).

## 2. Decisions this person owns or co-signs

| Register item | Decision | Prepared material |
| --- | --- | --- |
| HA-C002 | Level labels, cut points and sufficiency thresholds | [HA-C002 decision memo](./HA-C002_LEVELS_SUFFICIENCY_DECISION_MEMO.md) |
| HA-C004 | Form equivalence for growth comparison (dual approval in `/api/admin/equivalence`) | Registry 0036 (PENDING pairs only) |
| HA-C008 | Validation programme: rating protocol for the V3 rating queue, reliability, DIF, criterion studies | Rating queue (`PRISM_V3_RATING_QUEUE`, OFF), `evidence_agreement_v3` job |
| HA-C009 (with content governance) | Practice missions and the mission evaluator (confidence 0.7, quote verification) | `server/prompts/mission_evaluator.v1.md` |
| HA-010 | Rater qualification oversight (quadratic weighted kappa ≥ 0.6 gate, `TRAINING_KAPPA_THRESHOLD`, `server/lib/studies.js:192`) | [RATER_MANUAL_DRAFT_v1.md](../../studies/RATER_MANUAL_DRAFT_v1.md) |
| HA-011 | SME content-validity workshops for construct definitions and anchors | [CONSTRUCT_DEFINITIONS_v1.md](../../CONSTRUCT_DEFINITIONS_v1.md) (PROVISIONAL) |
| HA-013 | Execute human studies (S2 agreement, S3 retest, DIF) and approve conclusions | Preregistered protocols in [docs/studies/](../../studies/) |
| HA-014 | Science-flag decisions (flip-check GO verdicts) | flip-check endpoint |
| Pilot report review (P8.15) | Review the pilot technical report template before any external use (`PRISM_PILOT_REPORT_EXPORT` entry criterion) | [PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md](../../commercial/PILOT_TECHNICAL_REPORT_TEMPLATE_v1.md) |
| Power floors | Ratify or replace the operational floors in [POWER_ANALYSIS_FRAMEWORK_v1.md](../../studies/POWER_ANALYSIS_FRAMEWORK_v1.md) (e.g. S2 ≥ 100 double-rated sessions, ≥ 4 qualified raters; S3 ≥ 30 retest pairs) with computed values | — |

## 3. First 90 days (proposed sequence, for the founder to adjust)

1. Read the measurement design: construct definitions, rubric anchors
   (`evidence-rubric.v1-provisional`), sufficiency rules
   (`sufficiency-rules.v1-provisional`), the HA-C002 memo, study protocols.
2. Approve or amend the rater manual and the V3 rating protocol (HA-C008),
   including the consent basis for rater access to candidate excerpts (with
   counsel, HA-C005).
3. Select and qualify raters with the science lead (HA-009, HA-010) — see
   the [rater recruitment one-pager](./HA-009_RATER_RECRUITMENT_ONE_PAGER.md).
4. Plan SME workshops (HA-011) and the first studies with computed power.
5. Decide HA-C002 option 1, 2 or 3 on the evidence available (option 1,
   "keep everything provisional", is a valid outcome).

## 4. Profile

- Doctorate or equivalent experience in psychometrics, educational
  measurement or I-O psychology.
- Practical experience with rater-based scoring: rubric anchoring, weighted
  kappa / ICC, rater drift, standard setting (e.g. bookmark, contrasting
  groups).
- Fairness methods: DIF analysis, small-sample caution, multilingual
  assessment (Prism has hi / hi-en / ta variants behind `PRISM_LANG`, OFF).
- Familiarity with AI-scored or automated scoring evaluation (human–AI
  agreement) is an advantage.
- Familiarity with Indian higher education and data protection (DPDP) is an
  advantage.
- Independence: no role in StudAI learning products (Loop, Career) —
  separation policy rules 2, 5 and 6.

## 5. What the role is given

- Read access to the science dashboards and calibration outputs; admin
  roles with `calibrations:*`, `scenarios:read` etc. are assigned by the
  operator (item-bank reads are audited, separation rule 1).
- No access to identifiable candidate data beyond what a study protocol and
  counsel's consent basis allow.

## 6. Engagement (founder to complete)

| Field | Value |
| --- | --- |
| Engagement form (consultant / advisory board / employee) | `______` |
| Time commitment | `______` |
| Fee | `______` |
| Conflict-of-interest declaration | `______` |
| Confidentiality / data-processing terms | `______` |
| Start date | `______` |
| Signed engagement reference (evidence to close HA-008) | `______` |
