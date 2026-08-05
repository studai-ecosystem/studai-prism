# Prism Accommodations & Alternate Administration Policy — v1 (DRAFT)

**Status: DRAFT — legal text PENDING COUNSEL (HA-005). Charter MASTER-2026-08-04 §13.**

## 1. What Prism offers

Candidates may request an alternate administration of the assessment:

- **Text-only assessment** — the conversation is typed; no voice input is required
  (voice is always optional in the standard administration too).
- **No-camera mode** — no webcam, no face analysis, no room scan.
- **Reduced proctoring** — monitoring limited to what is strictly necessary,
  where justified.
- Additional interaction support where operationally feasible, and a human
  support/escalation path (`support@studai.one`) at every step.

The consent and briefing surfaces are keyboard-navigable; accessibility issues are
treated as defects.

## 2. How a request works

1. The candidate describes what they need on the briefing page (or via support)
   before the assessment starts. The request text is stored with the session only.
2. A person with the `accommodations:manage` role reviews and decides the request,
   recording which modes are granted and a written decision note. Every decision is
   audited on both audit planes.
3. An approved accommodation activates automatically when the assessment starts.

## 3. Privacy rules (absolute)

- The candidate's needs text — which may reference disability — is visible ONLY to
  administrators holding `accommodations:read`. It never appears in reports,
  credentials, verification pages, share-token views, exports or any buyer-facing
  data. This is CI-test-enforced.
- Buyers and institutions are never told the accommodation type.
- The ONLY external disclosure, and only when the reviewing administrator judged
  that the alternate administration **materially changes score interpretation**, is
  the fixed sentence:

  > This assessment was completed using an approved alternate administration mode.
  > Results should be interpreted according to the accompanying administration notes.

- A non-material alternate administration is externally indistinguishable from a
  standard one.
- Where comparability has not been established, the report is a descriptive
  evidence profile: no percentile and no overall composite are provided (the pilot
  product is profile-first for every candidate — charter §6).
- Accommodation records are erased with the candidate's session under the
  right-to-erasure flow.

## 4. Prohibited use (buyer clause — include in every institutional agreement)

Buyers and institutions must not filter, rank, score, reject or otherwise
disadvantage candidates by alternate administration status, by the presence of an
administration note, or by any attempt to infer accommodation or disability
status. Prism provides no interface for doing so, and attempting to obtain such
information is a violation of the access policy (charter §10) and of this clause.

---
*Version history: v1 created 2026-08-04 (Phase 3 part 2). Draft pending counsel —
do not present as approved legal text.*
