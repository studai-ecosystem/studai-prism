# IDENTITY-ASSURANCE SPECIFICATION v1

Charter §9. Implementation LIVE in code (`server/lib/identityAssurance.js`,
Phase 3). Level 3 activation is legally gated (HA-007).

## Levels

| Level | Meaning | How it is established | Status |
| --- | --- | --- | --- |
| **L1 — Self-attested** | Account email + declared name; no external corroboration | Default for every session | live |
| **L2 — Institution-verified** | The sponsoring institution's responsible authority confirmed this candidate against its roster | Recorded `institution_verifications` event via the admin invites plane (write-once per session; session-keyed, no user id — data minimization). An invite alone is NOT identity. | live |
| **L3 — Document-verified** | Government-ID (Aadhaar-OCR) match | Requires a 'verified' OCR record AND `PRISM_IDENTITY_L3=true` — flag OFF pending counsel (HA-007). With the flag off, a verified record still reports L1/L2: no "L3-ish" claims. | dark |

## Rules

- Every issued report and credential bundle is stamped with its assurance
  level (`identity_assurance_stamped` audit row) and the level is explained
  on report and verify surfaces (`ASSURANCE_LEVELS` constants).
- Assurance describes **who took the assessment**, never how well they did;
  it must not be read as a quality signal.
- Buyers see the level and its plain-language meaning — never underlying
  documents or OCR artifacts (only the last-4 Aadhaar digits result field
  exists at all, per the privacy contract).
