# CLAIMS AND EVIDENCE-STATUS REGISTER v1

**The live register is machine-served — this document records where it
lives and the rules; it deliberately contains no numbers.**

## Live sources of truth

| Surface | What it serves |
| --- | --- |
| `GET /api/evidence/claims` | The ONLY source for public statistics (LAW 1): every stat renders from the study-results registry or as NULL/pending. UI components (`measurement.jsx`) structurally cannot render a number without an API-shaped value. |
| `GET /api/pilot/flip-check` | Per-flag GO/NO-GO verdicts with preconditions — the executable claim→evidence map (`server/lib/flagMap.js`). All science flags: NO-GO. |
| `GET /api/evidence/adversarial` | Adversarial-robustness benchmark status (preregistered-pending; zero numbers until real runs). |
| Technical manual (`calibration/jobs/tech_manual.py`) | Renders every study as **PENDING** until real registered results exist; content-hash tamper-evident. |

## Rules (CI-enforced)

- The claims-ceiling suite (`server/test/claimsCeiling.test.js`) bans
  unsupported claim families ("certified", "validated", reliability labels,
  confidence bands, "300 sessions", guaranteed improvement, etc.) across all
  public copy including server-side email copy.
- New claims require: a registered study result + flip-check GO + human flag
  flip (ONE LAW) — in that order, never copy-first.
- Evidence status today (2026-08-05): **all validity studies PENDING**
  (HA-009/010/013); constructs provisional (HA-011); no fairness claims
  (UNDERPOWERED, §15).
