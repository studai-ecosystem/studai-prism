# Prism Fairness-Research Framework — v1 (DRAFT)

**Status: FRAMEWORK ONLY — collection is OFF. Charter MASTER-2026-08-04 §15.**
Gate: `PRISM_DEMOGRAPHICS` (registered, default off). Activation requires
DPDP counsel approval (HA-005) **and** independent ethics review (HA-012),
documented in the human-action register. Nothing in the application writes
`candidate_demographics` — CI-enforced (track4) — and the write path may only
land in the same commit as that documented evidence.

## 1. Purpose

Enable future fairness research (differential item functioning, subgroup score
analysis) on a voluntary, separated, pseudonymous basis — without ever letting
demographic attributes touch scoring, operations or buyers.

## 2. The framework (already implemented)

| Requirement (§15) | Implementation |
| --- | --- |
| Voluntary participation | Collection UI does not exist; when built, it must be a separate opt-in, never bundled with product consent |
| Research consent separate from product consent | `candidate_demographics.consent_version` is its own consent record; the product consent set is untouched |
| Separated storage | `candidate_demographics` (migration 0019), keyed by the pseudonymous `candidate_id` — no session id, no user id, no email |
| Unavailable to judges/models/reviewers/institutions/employers | No code path reads the table; no serving surface exists; charter §5 payload isolation applies regardless |
| Pseudonymous | `candidate_id` only (Track 0.1 pseudonymous spine) |
| Role-restricted + audited access | No read surface exists; any future surface must be a dedicated permission + audit rows (pattern: `accommodations:read`) |
| Minimum-group-size suppression | `lib/fairnessResearch.js` `suppressSmallGroups` (MIN_GROUP_SIZE = 10, suppressed counts not disclosed) — mandatory for every output |
| `UNDERPOWERED` labelling | `lib/fairnessResearch.js` `powerLabel`; the DIF jobs already label underpowered analyses (`calibration/jobs/dif_audit.py`, ≥150/group) |
| No subgroup claim without adequate power | claims-ceiling discipline + `UNDERPOWERED` labels; publishing additionally requires ethics review (HA-012) |
| Withdrawal | `candidate_demographics.withdrawn_at`; withdrawal removes future research use where legally and technically possible |
| Erasure interplay | Candidate erasure deletes the candidate's `candidate_demographics` rows (privacyPlanner); properly anonymized aggregates — calibration parameters, approved aggregate statistics, published anonymized findings — survive because they contain no per-candidate rows |
| Not-anonymized-by-name-removal | A dataset is treated as re-identifiable unless a documented anonymization assessment says otherwise; removing names is NOT anonymization |

## 3. Activation checklist (do not activate without ALL of these)

1. Written DPDP counsel approval (HA-005) filed in the human-action register.
2. Independent ethics review approval (HA-012) filed.
3. Consent copy for the separate research-demographics scope reviewed by counsel.
4. The write path + collection UI land in the SAME commit as the track4 test
   update, referencing this checklist.
5. `PRISM_DEMOGRAPHICS=true` flipped by a human through the flag workflow
   (dual-approved; ONE LAW — the agent flips nothing).

---
*Version history: v1 created 2026-08-04 (Phase 3 part 2). Draft — pending the
approvals above.*
