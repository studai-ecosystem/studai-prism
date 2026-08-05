# BUYER-ACCESS SPECIFICATION v1

Charter §10. Implementation LIVE in code (`buildVerifyView` in
`server/routes/credentials.js` — the single serving boundary; Phase 3).

## Access model

- **Candidate-authorized sharing only.** A buyer reaches a report through the
  candidate's share link (`/verify?...`), at the disclosure level the
  candidate chose. There is no buyer portal, no bulk export, no search.
- **Preview = the real thing.** A candidate previews by opening their own
  verify link — the page is byte-identical to what a recipient sees.

## What a buyer sees (default disclosure)

- Dimension profile with public definitions; "Insufficient evidence" rendered
  as such.
- AI panel consistency indicators.
- Identity-assurance level with plain-language meaning (§9).
- Integrity **tri-status only**: conditions met / review recommended /
  session invalidated — with the note that integrity signals never change
  scores.
- Alternate-administration disclosure ONLY where materially relevant (§13) —
  never the accommodation type or reason.
- Pilot notice + not-sole-basis policy, always.

## Full disclosure (explicit candidate choice) adds ONLY

- Evidence quotes and AI judge votes (glass-box provenance).

## Never available to any buyer (prohibited classes — regex-tested)

- Composite score, percentile, ranking of any kind.
- Raw transcripts.
- Raw integrity telemetry/events (legacy bundles included — stripped at the
  serving boundary).
- Accommodation type/needs, demographic data, candidate contact details.
- Cross-candidate comparisons or cohort leaderboards.

## Invalidation

Share links are bearer URLs; revocation (e.g., §11 review outcome) is what
every link-holder sees — a revoked credential renders its status and reason
category, never a stale score.
