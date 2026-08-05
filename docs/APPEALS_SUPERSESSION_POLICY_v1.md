# APPEALS AND SUPERSESSION POLICY v1

Charter §11. Implementation LIVE in code (Phase 3): dispute plane +
review-packet + decide endpoints; resolution readable by the candidate.

## Candidate rights

- **One free human review** per assessment. Requesting it is idempotent
  while open; after a resolution exists, further requests return
  `REVIEW_ALREADY_USED` (a second review is a discretionary outcome, below).
- Target turnaround: **7 business days** — a monitored service target, not a
  guaranteed legal SLA (overdue reviews are flagged on the admin plane).
- The candidate sees the outcome and a plain-language explanation
  (`GET /dispute`); private reviewer reasoning stays in admin notes.

## Review procedure (admin plane)

1. Reviewer opens the **blinded review packet**: transcript turns, rubric and
   operational scores — no identity fields (blind by construction).
2. Decision is one of four recorded outcomes:
   - `upheld` — original report stands.
   - `invalidated_reassessment` — session invalidated; a free
     `review_grant` entitlement is minted (a REAL candidate seat) and the
     credential is revoked (every share-link holder sees the change).
   - `superseded` — corrected report issued as a new version; the original
     is preserved immutably in the version chain; corrections can never
     assign a score to an Insufficient-evidence dimension.
   - `second_review` — escalation to another reviewer.
3. Every decision writes audit rows on both planes.

## Lineage

Supersession never edits history: `report_versions` keeps every issued
version; credentials chain (superseded_by pointers); verify surfaces show
the chain status honestly.
