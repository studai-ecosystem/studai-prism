# Prism Data Retention Policy — v1 (PROVISIONAL)

**Status: PROVISIONAL — pending counsel (HA-003). Charter MASTER-2026-08-04 §16.**
No period below is legally approved; the payment period in particular is a
provisional configuration, not a statutory determination.

## 1. Provisional schedule (charter §16 defaults, seeded into the registry)

| Data category (registry entity) | Provisional default | Notes |
| --- | --- | --- |
| Assessment transcripts (`assessment_transcripts`) | 12 months, then delete | unless valid research consent applies |
| Reports and evidence excerpts (`reports_evidence`) | 24 months | |
| Integrity telemetry (`integrity_telemetry`) | 90 days | unless a dispute or legal hold is active |
| Research datasets (`research_datasets`) | consent-scoped | pseudonymized until withdrawal or study end — not timer-based |
| Operational audit records (`operational_audit`) | 3 years | |
| Human-review and dispute materials (`review_dispute_materials`) | 3 years | |
| Payment records (`payment_records`) | ~8 years (provisional) | statutory period pending counsel — NOT legally approved |
| Revoked credential record (`revoked_credential_tombstone`) | indefinite | content-free tombstone for verification integrity |

The live registry (`data_retention_rules`) is the operative source; provisional
rows carry `provisional = true` and are labelled "PROVISIONAL, pending counsel"
on every admin surface. An explicit operator decision (with a written basis)
clears the provisional flag.

## 2. Enforcement

- **Registry**: `data_retention_rules` (+ per-contract `retention_overrides`).
- **Engine**: `server/lib/retentionEnforcement.js` — dry-run first-class, every
  run (either mode) leaves a `retention_runs` receipt and an admin audit row.
- **Timer-enforceable categories** (deliberately narrow): `integrity_telemetry`
  (proctoring events, both store backends) and `assessment_transcripts`
  (blinded rating transcripts). Everything else is deliberate-action-only.
- **Exclusions**: sessions with an active dispute and sessions/candidates/entities
  under an active **legal hold** are never pruned.
- **Contract overrides**: validated (entity + contract reference + days + written
  basis); the engine uses the LONGEST applicable period — an override can extend,
  never silently shorten, what the timer keeps.
- **Scheduler**: `PRISM_RETENTION_ENFORCEMENT` (default OFF). Dark = dry-runs and
  deliberate audited runs only; enabling automated deletion is a human decision
  (HA-020) after counsel approves the schedule (HA-003). Real enforcement runs
  additionally require a dry-run receipt for the same entity within 24 hours.

## 3. Erasure precedence (charter §16)

Candidate erasure supersedes normal retention **except**:

1. **Legal hold** — an active hold on the candidate or any in-scope session blocks
   erasure execution until released (enforced in `privacyPlanner.executeErasure`).
2. **Mandatory statutory retention** — applied through counsel-approved registry
   entries (payment records; pending HA-003).
3. **Content-free credential tombstones** — the current implementation deletes
   credentials fully on erasure (more privacy-protective than the tombstone
   minimum); see PROGRAM_STATE decision log.
4. **Properly anonymized aggregate outputs** — calibration parameters, approved
   aggregate statistics and published anonymized findings survive because they
   contain no per-candidate rows. Removing names alone is NOT anonymization.

## 4. Alternate stores, exports, caches

Erasure and pruning cover both store backends (JSON/EFS and PostgreSQL twins),
the live session cache, and the telemetry cascade; exports are ledgered
(`admin_exports`) — the ledger records who exported what, never the data. Tests
pin zero-orphan behavior (track0 T0.4, governance suites).

---
*Version history: v1 created 2026-08-04 (Phase 3 part 2). Provisional pending
counsel (HA-003) — do not present any period as legally approved.*
