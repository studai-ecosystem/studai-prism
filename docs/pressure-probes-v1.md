# Pressure probes — v1 (Track 3.2)

Flag: `PRISM_PRESSURE` (default **off**; requires the Executive engine on the session).
Code: `server/engine/probeSelector.js` (`PRESSURE_PROBES`, `selectPressure`) — **keep this file and that table in sync**.

## Design constraint (non-negotiable)

Every pressure move is a **legitimate skill probe first**: it must be a fair,
answerable question for an honest candidate and it must produce scoreable
evidence for a named dimension. Its second effect — making an external-LLM
relay detectably laggy or discontinuous — is a property of the *timing*, never
of a trick. Nothing in this set exists only to trap.

## Probe registry

| Kind | What the avatar does | Dimension it evidences | Why it is fair | Relay signature it stresses |
| --- | --- | --- | --- | --- |
| `contingency_shift` | Changes ONE concrete fact right before the candidate answers ("actually, before you answer — the budget just changed"), then asks how their answer holds. | `problemSolving` (re-planning under a changed constraint) | Real work changes under you; adapting a plan is exactly the skill being scored. The change is small, realistic, explicit. | A relayed answer was composed against the OLD facts; regeneration adds latency and often ignores the shift. |
| `micro_response` | Asks for a ONE-SENTENCE answer this turn ("in one line — what's your call?"), fuller reasoning welcome next turn. | `communication` (concision + prioritisation under constraint) | Summarising a position in one line is a core communication rubric anchor; the constraint is stated plainly. | Round-tripping an external LLM for one sentence produces distinctive latency out of proportion to output length. |
| `callback` | Quotes the candidate's own earlier words back ("earlier you said X — how does that square with this?"). | `criticalThinking` (consistency and revision of reasoning) | Reconciling or revising with a reason are BOTH good answers; the quote is their own sanitized phrasing, ≤140 chars. | An external LLM has no memory of what the candidate personally said unless re-fed — the lookup/consistency gap is measurable. |

## Scheduling fairness rules (enforced in `selectPressure`)

- Never before exchange 4 (candidate settles in first).
- At most **one** pressure move per 3 turns and **two** per session.
- Never stacked on a challenger push-back turn — one source of pressure at a time.
- The kind is chosen to match the turn's target dimension when possible, so the
  pressure move is also the most informative probe available.
- Every deployment is audit-logged (`pressure_probe` event: exchange, kind,
  `evidencesDimension`) and stamped into the turn's `behavior` record.

## Scoring note

Pressure moves add **no special scoring**. The judge panel scores the response
against the same rubric anchors as any turn. Timing features go to the research
corpus (Track 3.1) — detection outputs, when they exist, are ADVISORY ONLY and
route to human review (Track 3.5); they never auto-fail a candidate.
