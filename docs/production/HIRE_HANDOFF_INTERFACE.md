# StudAI Hire evidence hand-off — interface contract (not connected)

**Status:** INTERFACE ONLY — every action answers `501 NOT_IMPLEMENTED`; nothing is sent anywhere.
**Introduced:** PROD-READY Phase 9 (2026-10-11), decision P96 in [PROD_READY_STATE.md](./PROD_READY_STATE.md).
**Code:** `server/domain/integrations/hire/index.js` (contract + provider), `server/routes/v1/evidenceHandoff.js` (routes).
**Flag:** `PRISM_EMPLOYER_LND` (registered OFF). Off → the routes are 404. On → `GET` describes the contract, `POST` is 501.
**Human dependencies:** HA-025 (written decision on any Prism → StudAI Hire data sharing), HA-005 (counsel review of the consent text), HA-004 (prohibited-use terms that bind the receiving employer). All OPEN.

## 1. What this is, and what it is not

Prism results are **not a hiring screen**. Prism is never a ranking, a pass/fail cut-off or a job-performance predictor ([JOB_FAMILY_SCOPE_v1.md](../JOB_FAMILY_SCOPE_v1.md), charter law 6), and a buyer may not use a Prism result as the sole or primary basis for any selection, employment, promotion or termination decision ([PROHIBITED_USES_POLICY_v1.md](../PROHIBITED_USES_POLICY_v1.md), item 1).

The hand-off, if it is ever connected, is **evidence the candidate chooses to carry** into a development conversation on StudAI Hire. Only the candidate can start it. There is no pull or query API for Hire or for any employer, and the candidate can revoke it at any time.

## 2. Why it returns 501: the separation policy

[ECOSYSTEM_SEPARATION_POLICY_v1.md](../ECOSYSTEM_SEPARATION_POLICY_v1.md) rule 2: *"There is no shared datastore; any future data sharing requires a written decision recorded in the human-action register."* No such decision exists. The policy therefore does not allow a Prism → Hire evidence flow today, so:

- the interface is defined but returns `501` for every action, exactly like the single sign-on interface (`server/domain/auth/providers/index.js`, `POST /api/v1/auth/sso/start`, HA-C011);
- the module contains no network code (no `fetch`, no HTTP client, no environment variable), and a test fails if one is added (`server/test/employerLnd.test.js`);
- the missing decision is recorded as **HA-025** in [HUMAN_ACTION_REGISTER.md](../remediation/HUMAN_ACTION_REGISTER.md) (OPEN).

## 3. Relationship to the live identity hand-over (`POST /api/ecosystem/handover-token`)

That route (hardened in Phase 1S, N5/P15) is live and is **not** an evidence channel:

| | `POST /api/ecosystem/handover-token` (live) | Evidence hand-off (this interface) |
| --- | --- | --- |
| Purpose | Land the signed-in person on Hire or Career already signed in | Carry report evidence the candidate chose |
| Carries | Account id, email, name, an optional job reference and an optional credential reference the candidate already holds | Nothing yet (501). Contract in §4 |
| Guard | Signed-in caller; server-to-server pre-authorization signed with `ECOSYSTEM_SECRET` (60-second HS256); 503 in production without a configured base URL | Flag + signed-in caller; 501 until HA-025 is closed and a human connects it |
| Consent record | None (identity only) | Required, one per hand-off (§4.2) |

Rules that keep this a single guarded path:

1. The identity hand-over must never be extended to carry evidence (scores, levels, quotes, report bodies). A test pins its server-to-server body to exactly `ecosystem_person_id, email, name, destination, target_job_ref, source_credential_id` (`server/test/employerLnd.test.js`).
2. Evidence may only travel through this interface, after its consent record is written, and only once it is connected by a human decision.
3. A connected implementation reuses the identity hand-over's guard model (server-to-server, signed, short-lived) and sends identity as `ecosystemPersonId` only — never the email or name inside the evidence payload.

## 4. The contract (version `hire-evidence-handoff.v0-draft`)

The machine-readable copy is `HIRE_HANDOFF_CONTRACT` in `server/domain/integrations/hire/index.js`, served by `GET /api/v1/integrations/hire/handoff`. A future implementation must not send a field that is not listed here.

### 4.1 Initiation
- **Candidate only** (`initiatedBy: CANDIDATE_ONLY`), signed in, from their own report.
- Never started by an employer, an institution, StudAI staff or Hire. No bulk hand-off; one report per hand-off.

### 4.2 Consent record (required)
- Written **before** anything is sent; one record per hand-off.
- Type `HIRE_EVIDENCE_HANDOFF` (a new migration adds the type when the interface is connected; it is not in the schema today).
- Fields: `userId`, `reportSessionId`, `reportVersion`, `disclosureLevel`, `copyVersion`, `grantedAt`, `expiresAt` (at most 180 days, the share-grant maximum), `withdrawnAt`.
- The consent text is DRAFT until counsel approves it (HA-005).

### 4.3 What would be shared (minimal)
| Field | Content |
| --- | --- |
| `handoffId` | Prism-generated UUID, one per hand-off |
| `contractVersion` | `hire-evidence-handoff.v0-draft` |
| `subject` | `ecosystemPersonId` only (the id the identity hand-over already uses). No email, name or phone in the payload |
| `report` | `reportVersion`, `issuedAt`, and a verification reference the candidate already holds |
| `disclosureLevel` | `SUMMARY` by default; `FULL` (evidence quotes) only if the candidate chooses it for this hand-off |
| `capabilities` | Per capability: id, public name, evidence status (`SUFFICIENT` / `PROVISIONAL` / `INSUFFICIENT_EVIDENCE` / `HUMAN_REVIEW_REQUIRED`) and the provisional level label only where the status allows one |
| `integrity` | Tri-status only (conditions met / review recommended / invalidated) |
| `scope` | Job-family scope version `job-family-scope-v1` and the families of the assessment |
| `notices` | Not-sole-basis policy, pilot notice and the development-use statement, always |

### 4.4 Never shared
- **Raw transcripts — never, even with consent.** [BUYER_ACCESS_SPEC_v1.md](../BUYER_ACCESS_SPEC_v1.md) lists raw transcripts as never available to any recipient, and a Hire employer is such a recipient. (Decision for this phase: the task allowed "unless consented"; the buyer-access spec is stricter, so it wins.)
- Composite score, percentile, ranking or any comparison with other people.
- Raw integrity telemetry or events.
- Accommodation type, needs or reason; demographic data.
- Contact details inside the evidence payload.
- Results sponsored by an employer or institution, unless the candidate owns the report and shares it themselves.
- Practice, private preparation, role exploration and cohort data.

### 4.5 Revocation and erasure
- The candidate can revoke at any time from Sharing. Prism records `withdrawnAt` and sends a revocation notice.
- Hire must stop showing the evidence and delete the payload. The deadline is PENDING (HA-025).
- A revoked hand-off shows its status, never a stale copy (the same rule as a revoked credential).
- Account erasure (Phase 2 cascade) revokes every hand-off and sends the notices before the account is erased; the consent records go with the account.

## 5. Endpoints

| Method | Path | Flag off | Flag on |
| --- | --- | --- | --- |
| GET | `/api/v1/integrations/hire/handoff` | 404 | 401 signed out; 200 `{ status: 'NOT_CONFIGURED', contract }` |
| POST | `/api/v1/integrations/hire/handoff` | 404 | 401 signed out; **501** `NOT_IMPLEMENTED` with `details.pendingOn = ['HA-025','HA-005','HA-004']` |

The post-deploy smoke battery checks the GET route is dark (`hire-handoff`, `scripts/post-deploy-smoke.mjs`).

## 6. What connecting it would take (all human-gated)

1. HA-025 closed: a written decision on Prism → Hire evidence sharing, with Hire's deletion and revocation commitments and the separation-policy review (science governance, ECOSYSTEM_SEPARATION_POLICY rule 5).
2. HA-005: counsel approves the consent text; HA-004: the prohibited-use terms bind the receiving employer.
3. Engineering (a later, separately reviewed change): a migration adding the `HIRE_EVIDENCE_HANDOFF` consent type and the hand-off ledger (registered in the erasure cascade and retention policy in the same change, law 7); the payload builder from the published report version at the chosen disclosure level; the signed server-to-server send; revocation notices; tests proving every §4.4 exclusion.
4. A human flips the flag (law 1).

## 7. Tests

- `server/test/employerLnd.test.js` — "StudAI Hire evidence hand-off: interface only": 404 while dark, 401 signed out, the contract (candidate-only, raw transcripts never shared, pending HA ids), `POST` 501, no network code in the module, the identity hand-over body pinned.
- `server/test/postDeploySmoke.test.js` — the `hire-handoff` dark check discriminates (404 off, not 404 on).
- `server/test/claimsCeiling.test.js` — the contract module is in the claims-ceiling scan.
