# Support runbook (P10.8)

Status: prepared for pilot operation; **no operator is assigned by this
document**. Roles are placeholders to be named by the product owner before any
canary. Customers are never asked to paste tokens, session URLs or report ids;
support locates resources from the customer's account under authorization.

Roles (placeholders): **Support owner**, **On-call engineer**, **Engineering
lead**, **Measurement lead**, **Content reviewer**, **Security lead / DPO**,
**Product/commercial owner**, **Release operator**.

Alert definitions live in `server/domain/metrics/alerts.js`; release-blocker
alerts also live in `server/domain/release/alerts.js`. Operational,
measurement and customer views stay separate:

- **Operational:** action loss, jobs without results, expired leases, repeated
  start and cost outliers.
- **Measurement:** technical zero-evidence clusters, failed claims and
  ownership/history conflicts.
- **Customer:** unauthorized scope attempts and recovery-credit anomalies.

Alert payloads are references and aggregate counts only. They must not contain
answers, transcripts, prompts, report text, e-mail addresses, names or tokens.

## Corrected runtime recovery

- Schema 0054 is required before new allocations. Apply additive migrations
  only on an authorized target; the local rehearsal uses a disposable cluster.
- Server startup drains durable EVALUATE_RUN jobs and retries publication.
  Lease renewal continues during inference; a stale result cannot be accepted.
  Model calls may repeat; acceptance is idempotent, not exactly-once inference.
- An accepted-batch receipt binds input hash, method hash and evidence IDs.
  Reconciliation/publication must not include unaccepted later graph rows.
- `PINNED_METHOD_UNAVAILABLE` or `EVALUATION_CONTEXT_INCOMPLETE` means review
  incomplete, not a student weakness. Preserve work and issued snapshots;
  restore the exact archive/context or escalate. Never substitute a current
  rubric, rebuild a historical interpretation, or request another purchase.
- Publication failure keeps accepted work. Retry explicit publication;
  ordinary owner/sponsor/share/legacy GETs cannot trigger it or inference.
  Select the requested snapshot version consistently across audiences.
- Missing historical formatted views lead to the original owned report.
  An unavailable V3 interpretation is not missing ownership or erased history.
- Erasure markers fence evidence, reports and late receipts. Do not remove a
  marker to make a retry succeed. Retained financial records are not evidence.
- Compatible rollback stops new allocations and drains active work first.
  Preserve 0054 and accepted receipts in production; do not run schema-down
  scripts or drop learner evidence as an application rollback shortcut.
  Disposable down/up rehearsal is not a production restore authorization.

## Daily pilot triage (when an operator is assigned)

1. Review open alerts by severity (PAGE → TICKET → REVIEW).
2. Check `node scripts/check-experience-baseline.mjs --stage <stage>` output:
   `release.blockers` must match the expected stage; any unexpected
   `NOT_READY` is an incident.
3. Review new support requests against the paths below; record outcome and
   evidence path (no learner data) in `TEST_RESULTS.md` or the incident log.
4. Check new allocations, accepted actions, queue depth, expired leases,
   publication delay, zero-evidence clusters and repeated Begin.
5. Check authorization-denial and ownership-conflict aggregates separately;
   never infer an ownership transfer from a support claim.
6. Review cost outliers and recovery-credit references with the appropriate
   owner. Support cannot issue a credit.
7. Confirm the active content, evaluator, method, form and release config
   versions match the approved candidate. A version mismatch blocks starts.
8. Confirm no queued erasure has a later applied worker/model result.

## Safe diagnostic query shapes

These are templates for an authorized, read-only connection. Return references
and counts only; do not add text/payload/content columns.

```sql
-- Accepted Finish without a queued job.
SELECT a.session_id, count(*) AS missing_job_count
FROM assessment_candidate_actions a
LEFT JOIN assessment_jobs j ON j.session_id = a.session_id
WHERE a.kind = 'FINISH' AND a.state IN ('ACCEPTED', 'APPLIED')
  AND j.session_id IS NULL
GROUP BY a.session_id;

-- Queue state and expired leases.
SELECT state, count(*) AS job_count
FROM assessment_jobs
GROUP BY state;

-- Report chain integrity (references/counts only).
SELECT session_id, count(*) AS version_count, max(version) AS latest_version
FROM student_report_versions
GROUP BY session_id;

-- Share state by status; never select the share token.
SELECT revoked_at IS NOT NULL AS revoked, count(*) AS share_count
FROM share_grants
GROUP BY revoked_at IS NOT NULL;

-- Erasure fencing aggregate.
SELECT count(*) AS erased_session_count
FROM assessment_erasure_markers;
```

Use `node scripts/reconcile-release-candidate.mjs` for the standard aggregate
candidate inventory. It starts `BEGIN READ ONLY` and rejects connection-string
arguments.

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

### cost-outlier or recovery-credit alert
Owner: On-call engineer -> Product/commercial owner.
1. Use request/job/grant references from the alert; do not retrieve learner
   content unless separately authorized for the incident.
2. Check idempotency and provider status. Do not retry a charge or create a
   credit from the support console.
3. Apply only the approved recovery policy. T54 is BLOCKED, so release remains
   NO-GO until that policy exists.

## Version discipline

- Content, evaluator, scenario, rubric, method, form and release config changes
  produce a new version; never silently edit a pinned version.
- Active runs stay on their compatible pinned handler.
- A missing compatible handler is `RUN_VERSION_UNSUPPORTED`, not a legacy
  fallback.
- Content in REVIEW/RETIRED blocks new allocation but does not mutate history.
- Support records the reference and escalates; it never edits version state.

## What support never does
- Ask for tokens, passwords, session URLs or report ids.
- Change scores, evidence, content state or flags.
- Move an active V3 run to the legacy player or rerun Start.
- Share anything from a Campus workspace with a Personal account or vice versa.
