# Support runbook (P10.8)

Status: prepared for pilot operation; **no operator is assigned by this
document**. Roles are placeholders to be named by the product owner before any
canary. Customers are never asked to paste tokens, session URLs or report ids;
support locates resources from the customer's account under authorization.

Roles (placeholders): **Support owner**, **On-call engineer**, **Engineering
lead**, **Measurement lead**, **Content reviewer**, **Security lead / DPO**,
**Product/commercial owner**, **Release operator**.

Alert definitions live in `server/domain/release/alerts.js`; each alert names
one of the triage paths below. Operational, measurement and customer-value
views stay separate — this runbook is operational only.

## Daily pilot triage (when an operator is assigned)

1. Review open alerts by severity (PAGE → TICKET → REVIEW).
2. Check `node scripts/check-experience-baseline.mjs --stage <stage>` output:
   `release.blockers` must match the expected stage; any unexpected
   `NOT_READY` is an incident.
3. Review new support requests against the paths below; record outcome and
   evidence path (no learner data) in `TEST_RESULTS.md` or the incident log.

## Triage paths

### absent-history ("my previous report is gone")
Owner: Support owner → On-call engineer.
1. Confirm the account (sign-in identity) and workspace (Personal vs Campus);
   history is workspace-scoped by design.
2. Support looks up owned sessions server-side by account; never by a pasted URL.
3. If the session exists but ownership is `CONFLICTING`/`UNCLAIMED` in the
   reconciliation view, escalate to Engineering lead — ownership is never
   granted by support.
4. Legacy readers (`/report/<id>/v2`, `/score`) remain available to the owner.

### failed-evaluation (SCORING stuck, technical failure, empty report)
Owner: On-call engineer.
1. Inspect the evaluation job for the session: state, attempts, `resultState`,
   lease. `FAILED/TECHNICAL_FAILURE` is a retryable technical state — the
   learner's work is saved.
2. Re-drive with the learner's own Finish (server retries the job) or an
   authorized worker pass. Never edit evidence or scores.
3. If `RUN_VERSION_UNSUPPORTED`: do not route to the legacy player; escalate
   to Engineering lead for a pinned-compatible build; disposition via
   Product/commercial owner (reviewed reissue process, `PROPOSED` policy).
4. A processing fault is communicated as a fault, never as "insufficient evidence".

### disputed-interpretation ("this observation is wrong")
Owner: Measurement lead, with Content reviewer.
1. Point the learner to the in-report review/correction request (it is
   recorded against the issued version).
2. Review the source excerpt and the rubric reference of the pinned run.
3. Any change is a new issued report version with a reason; the original is
   preserved. Never silently edit.

### inappropriate-content (scenario text, AI participant output)
Owner: Content reviewer → Engineering lead.
1. Capture the opportunity/stimulus hash (not the learner's text).
2. Content state can be moved to `REVIEW`/`RETIRED` by a reviewer with a
   reason; new allocations on that form then fail readiness.
3. Active runs on the pinned snapshot are drained, not re-routed.

### privacy-request (access, correction, erasure)
Owner: Security lead / DPO.
1. Verify identity through the account, not through e-mail content.
2. Erasure sets the erasure marker first; jobs, evidence, derived copies and
   late model results then fail closed (see `rollback.test.js`).
3. Preserve what retention rules require; record the decision in the audit trail.
4. Campus-sponsored data follows the institution's contract; do not promise
   deletion the contract does not allow.

### paid-technical-failure
Owner: Support owner → Product/commercial owner.
1. Confirm the grant/entitlement from the account; webhooks are idempotent on
   the provider event key, so a duplicate payment is not expected.
2. If a reservation is stuck after a technical failure, an authorized
   `releaseForTechnicalFailure` with a reason is audited; no automatic refund
   or credit — the remedy policy is `PROPOSED` and needs the owner's decision.
3. Communicate what is preserved and the next step without session URLs.

## What support never does
- Ask for tokens, passwords, session URLs or report ids.
- Change scores, evidence, content state or flags.
- Move an active V3 run to the legacy player or rerun Start.
- Share anything from a Campus workspace with a Personal account or vice versa.
