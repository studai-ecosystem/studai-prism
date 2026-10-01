# Prism Campus — Claims Register

Status as of 2026-09-26 (Phase 12, C12.02). Every scientific or privacy claim a
campus surface could imply, with the evidence that would earn it. **All are
PENDING.** The agent never changes a status; a human does, citing a frozen
analysis or a signed review. The machine-readable source is
`server/domain/claims/campusClaims.js`, served as `campusClaims` by
`GET /api/evidence/claims`. `server/test/campusClaims.test.js` fails if a claim
leaves PENDING while its human action is still open, or if a campus or student
surface states a pending claim as fact.

| Id | Claim | Status | Evidence required | Human action |
| --- | --- | --- | --- | --- |
| CAMPUS-LEVEL-LABELS | Capability level labels (Early evidence to Strongly demonstrated) correspond to calibrated performance standards. | PENDING | Standard-setting study and approved level cut points. | HA-C002 |
| CAMPUS-SUFFICIENCY | The evidence sufficiency rules decide correctly when there is enough evidence to report a level. | PENDING | Approved sufficiency thresholds checked against human-rated sessions. | HA-C002 |
| CAMPUS-AI-HUMAN-AGREEMENT | AI judgements of evidence agree with trained human raters. | PENDING | A frozen `evidence_agreement_v3` run with enough double-rated items per capability (the queue built in C12.01), reviewed by the psychometrics lead. | HA-C008 |
| CAMPUS-RELIABILITY | Results are consistent across forms and over short retest intervals. | PENDING | Retest and alternate-form reliability studies. | HA-C008 |
| CAMPUS-FORM-EQUIVALENCE | Different assessment forms measure a capability on the same scale. | PENDING | Equating evidence and an approved form-equivalence decision per pair. | HA-C004 |
| CAMPUS-GROWTH | A change between baseline and reassessment reflects a real change in capability. | PENDING | Approved form equivalence plus a growth study with measurement error accounted for. | HA-C004 |
| CAMPUS-PRACTICE-TRANSFER | Practice missions improve formally assessed capability. | PENDING | A controlled comparison of formal reassessment outcomes with and without practice. | HA-C009 |
| CAMPUS-FAIRNESS | Results do not differ unfairly across student groups (language, gender, region, disability). | PENDING | DIF and fairness review on a sufficiently large, consented sample. | HA-C008 |
| CAMPUS-PREDICTIVE | Results predict placement or workplace outcomes. | PENDING | A criterion study with outcome data agreed with partner institutions or employers. | HA-C008 |
| CAMPUS-AGGREGATE-PRIVACY | Aggregate campus reporting cannot be used to identify an individual student. | PENDING | Privacy review of the suppression rules, participation counts and exports. | HA-C010 |

## What the product says instead

- Levels are shown with "provisional until measurement governance finalises them".
- Insufficient evidence is stated plainly; no level is invented.
- Growth appears only between forms approved as comparable (none are approved yet).
- Practice evidence is labelled as practice and never changes a formal result.
- Aggregates hide groups below the organization's minimum size.

## Existing programme claims

The remediation programme's register (`docs/CLAIMS_EVIDENCE_REGISTER_v1.md`) and
the public claims ceiling (`server/test/claimsCeiling.test.js`) are unchanged.
The only live public claim remains "cryptographically verifiable evidence chain".
