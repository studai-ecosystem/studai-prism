# Prism Campus — Human Action Register

Items the agent cannot complete (authority, credentials, legal, science, commercial or
production access). An item is only closed with linked evidence supplied by a human.
Checklist items marked `[H]` in [CAMPUS_PROGRAM_STATE.md](./CAMPUS_PROGRAM_STATE.md)
must cite one of these ids. The agent may ADD items and update "Prepared by agent";
it never marks an item DONE.

| Id | Item | Why human | Prepared by agent | Owner | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| HA-C001 | Flip any campus feature flag (`PRISM_APP_SHELL_V3`, `PRISM_STUDENT_REPORT_V3`, `PRISM_EVIDENCE_FAIL_CLOSED`, `PRISM_CAMPUS_ENABLED`, `PRISM_CAMPUS_ANALYTICS`, `PRISM_DEVELOPMENT_V2`, `PRISM_GROWTH_ENABLED`, `PRISM_ROLE_EXPLORATION_V2`, `PRISM_ASSESSMENT_WORKSPACE_V3`) in any real environment | ONE LAW: humans flip flags | Flags registered OFF; rollout order in ROLLOUT_PLAN (Phase 12) | Operator | OPEN | — |
| HA-C002 | Finalise capability level labels and sufficiency thresholds (spec §20.2, §33.2) | Measurement governance decision | Provisional constants + rule config | Psychometrics lead | OPEN | — |
| HA-C003 | Author/approve new universal-core and career-track scenario content (spec §34) | Charter §19 scenario freeze + calibration law | Registry + metadata contract only | Content governance + psychometrics | OPEN | — |
| HA-C004 | Approve assessment form equivalence for growth comparison (spec §17, §30.10) | Scientific approval | Equivalence registry with PENDING rows only | Psychometrics lead | OPEN | — |
| HA-C005 | Legal/privacy review of campus disclosure, consent and sharing copy (spec §11, §36) | Counsel | Draft copy in governed constants | Counsel | OPEN | — |
| HA-C006 | Approve campus commercial configuration and price values (spec §38) | Commercial authority | Nullable contract pricing schema | Business owner | OPEN | — |
| HA-C007 | Push branches / open PRs / merge / deploy to any environment | Shared systems | Local stacked branches + commits | Operator | OPEN | — |
| HA-C008 | Validation programme execution (spec §45: psychometrician, raters, reliability, DIF, criterion studies) | Science programme | Tooling + rating queue (Phase 12) | Psychometrics lead | OPEN | — |
