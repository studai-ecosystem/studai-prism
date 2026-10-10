# AGE-GATING POLICY v1 (18+)

Charter §12. Implementation is LIVE in code (Phase 3, commit b1d48ff);
this document is its policy record. **Under-18 support is a pending human
decision (HA-006); DPDP review pending (HA-005).**

## Policy

- Prism is **18+ only**. Every account must carry an explicit, version-
  stamped declaration (`age-18plus-v1`) that the candidate is 18 or older.
- **No date of birth is collected** for gating (data minimization); the
  declaration is a boolean with version + timestamp.
- Enforcement points (all server-side, test-covered per entitlement mode):
  1. Registration requires `ageConfirmed === true` (400 otherwise).
  2. Pre-gate accounts must confirm once via `/api/auth/confirm-age`
     (write-once — the original acceptance is the record).
  3. `/api/assessment/start` HARD-blocks commencement without a declaration
     (403 `AGE_CONFIRMATION_REQUIRED` + `age_gate` audit row) across paid,
     invite, coupon and review-grant entitlements.
- Anonymous starts exist only on dev/trial paths (synthetic by construction)
  and write an audit row saying so.
- `PRISM_UNDER18_PATH` exists as a dark flag; it stays OFF until a signed
  under-18 decision memo (guardian consent or explicit exclusion — HA-006)
  and counsel approval (HA-005) exist.

## Institution notice

Invite/cohort surfaces state that candidates must be 18+ and that the
platform enforces the confirmation before commencement — institutions cannot
waive it.

## Addendum 2026-10-10 — guardian-consent path built dark (PROD-READY Phase 8)

The policy above is unchanged: Prism is 18+ only. First-year college cohorts
can include 17-year-olds, so the engineering for the guardian-consent option
named in HA-006 now exists, **dark** behind `PRISM_UNDER18_PATH` (registered
OFF). It is not a decision: HA-006 (guardian consent or explicit exclusion)
and HA-005 (DPDP review) stay PENDING, and all copy is DRAFT
(`guardian-consent-u18-v0-draft`). With the flag off, registration and the
commencement gate behave exactly as described above (test:
`server/test/guardianConsent.test.js`).

What the path does, only while the flag is on:

1. The learner registers saying they are under 18 and gives a guardian's email
   address. The account gets **no** age declaration, so the commencement gate
   (403 `AGE_CONFIRMATION_REQUIRED`) keeps blocking every start.
2. The guardian gets a single-use link by email (only its hash is stored;
   it expires after 14 days for a decision). Verification method:
   possession of the emailed link. That is a weak check; whether it is
   enough is part of HA-006.
3. If the guardian agrees, the record becomes VERIFIED. The account gets a
   declaration whose version is `guardian-consent-u18-v0-draft` and whose basis
   is `GUARDIAN_CONSENT`, never an 18+ confirmation. The gate then passes and
   the audit row names that version.
4. The guardian can decline. They can withdraw later with the same link.
   Withdrawal removes the guardian-based declaration, so starts are blocked
   again. A learner's own 18+ declaration is never touched.

Data minimisation: `guardian_consents` (migration 0062) holds only these
fields:

- the guardian's email address;
- the copy version shown;
- the hash of the link;
- the state;
- the request, expiry, decision and withdrawal times.

It holds no guardian name, relationship, identity document or date of birth.
The table is registered in the personal-data registry. It is deleted with the
learner's account by the erasure cascade. Requests never verified are deleted
30 days after they ended (`guardian_consents_unverified`, PROVISIONAL,
HA-003, job `retention.guardian_consents` under
`PRISM_RETENTION_ENFORCEMENT`).

Not built: a control on the registration form (the form cannot know a
server flag before sign-in), age verification of any kind, and any
institution-facing guardian view.
