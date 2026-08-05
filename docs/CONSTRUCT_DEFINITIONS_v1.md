# CONSTRUCT DEFINITIONS v1

**PROVISIONAL — pending SME content-validity workshops (HA-011) and external
psychometric review (HA-008).** The canonical machine-readable definitions
live in `server/lib/sharedConstants.js` (`DIMENSION_PUBLIC_DEFINITIONS`,
`DIMENSION_LABELS`) and are what candidates and buyers actually see; this
document records their status and lineage. Definitions may not drift from
the constants (label-consistency tests).

| Key | Public label | Status |
| --- | --- | --- |
| criticalThinking | Critical Thinking | provisional; CT/PS distinction explicitly provisional (§7.3) |
| collaboration | Collaborative Behaviour | renamed per charter §7.1 (was "Collaboration"); measures observable collaborative behaviour in the exercise, not a trait |
| communication | Communication | provisional |
| problemSolving | Problem Solving | provisional; see CT note |
| aiFluency | AI & Digital Fluency | reported ONLY with a direct anchor probe + sufficient response (§7.2); otherwise "Insufficient evidence" |

Notes:

- All dimensions describe **observed behaviour in a single situational
  exercise** — not stable traits, not clinical constructs.
- Anchor probes (standardized core, §8) provide the per-dimension evidence
  floor; wording is versioned in `server/prompts/anchor_probes.v1.json` and
  avatar-invariant by construction.
- No composite of these dimensions is exposed externally (§6).
