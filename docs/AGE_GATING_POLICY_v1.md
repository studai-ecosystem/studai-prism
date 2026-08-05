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
