# HA-025 — Decision brief: Prism → StudAI Hire evidence sharing

PROD-READY Phase 10. **DRAFT brief — no decision is recorded here.** Register
row HA-025 (added in Phase 9, decision P96) asks for a written decision on any
Prism → StudAI Hire evidence sharing, as
[ECOSYSTEM_SEPARATION_POLICY_v1.md](../../ECOSYSTEM_SEPARATION_POLICY_v1.md)
rule 2 requires: *"There is no shared datastore; any future data sharing
requires a written decision recorded in the human-action register."* The
deciders are the founder and the science lead (rule 5: science governance
with external advisory participation), with counsel through HA-005 and HA-004.

## 1. What exists

- A contract and an interface, **not a connection**:
  [HIRE_HANDOFF_INTERFACE.md](../HIRE_HANDOFF_INTERFACE.md), code
  `server/domain/integrations/hire/index.js` (`HIRE_HANDOFF_CONTRACT`, version
  `hire-evidence-handoff.v0-draft`) and `server/routes/v1/evidenceHandoff.js`.
  Dark behind `PRISM_EMPLOYER_LND` (OFF); with the flag on, `POST` answers
  `501 NOT_IMPLEMENTED` with `pendingOn = ['HA-025','HA-005','HA-004']`.
  The module has no network code, and a test fails if any is added
  (`server/test/employerLnd.test.js`).
- The live identity hand-over `POST /api/ecosystem/handover-token` carries
  identity only; its body is pinned by test and must never carry evidence.
- Candidates can already share a report with anyone through Prism's own
  share links (share grants, revocable, at most 180 days). That path does
  not need HA-025.

## 2. The decision to make

Choose one, in writing:

1. **No sharing (status quo).** The interface stays unconnected. Candidates
   use Prism share links. Nothing to build.
2. **Candidate-initiated sharing under the drafted contract.** Connect the
   interface as specified (candidate only, one report per hand-off, consent
   record first, minimal payload, raw transcripts never, revocable).
3. **Sharing under a different contract.** State what differs from the draft
   and why; the contract document is then revised before any engineering.

## 3. Questions the decision must answer if option 2 or 3 is chosen

| # | Question | Draft position in the contract | Owner |
| --- | --- | --- | --- |
| 1 | Who may start a hand-off? | Candidate only, signed in, from their own report | Founder |
| 2 | What disclosure levels are allowed? | `SUMMARY` default; `FULL` (evidence quotes) only by the candidate's choice per hand-off | Founder + counsel |
| 3 | Is anything ever sent without consent? | No; a consent record is written first, one per hand-off | Counsel (HA-005) |
| 4 | Consent wording | DRAFT, not yet written (type `HIRE_EVIDENCE_HANDOFF` is not in the schema) | Counsel (HA-005) |
| 5 | Maximum consent duration | 180 days (the share-grant maximum) | Founder + counsel |
| 6 | Hire's deletion deadline after revocation | **PENDING — no value proposed** | Founder + Hire owner |
| 7 | Hire's commitments on use (not sole basis, no ranking/cut-off, development conversation only) | Restates PROHIBITED_USES_POLICY_v1 item 1 | Counsel (HA-004) |
| 8 | Does this conflict with separation rule 2 (no derived training) or rule 4 (no cross-sell)? | Payload contains no item, rubric or transcript content; no recommendation of StudAI products | Science lead |
| 9 | Sponsored results (employer- or institution-sponsored sessions) | Not shareable unless the candidate owns the report and shares it | Founder |
| 10 | Audit and evidence of compliance from Hire | Not drafted | Founder + Hire owner |

## 4. What the decision does not do

- It does not connect anything. Connecting is a later, separately reviewed
  engineering change (migration for the consent type and ledger, erasure and
  retention coverage in the same change, payload builder, signed send,
  revocation notices, exclusion tests) — HIRE_HANDOFF_INTERFACE.md §6 — and a
  human flag flip.
- It does not approve any consent text (HA-005) or the employer terms (HA-004).

## 5. Decision record (to be completed by humans)

| Field | Value |
| --- | --- |
| Option (1 / 2 / 3) | `______` |
| Deviations from the drafted contract | `______` |
| Hire deletion deadline after revocation | `______` |
| Hire-side commitments document (link) | `______` |
| Science-governance review (rule 5) reference | `______` |
| Counsel references (HA-005, HA-004) | `______` |
| Signed by / date | `______` |

When signed, the founder links this record from register row HA-025.
