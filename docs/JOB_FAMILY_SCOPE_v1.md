# Prism Job-Family Scope — v1

**Document id:** `job-family-scope-v1` · **Status:** GOVERNING (charter MASTER-2026-08-04 §3)
**Rule:** Public and institutional copy must never exceed this scope. The governed,
machine-readable mirror of this document is `JOB_FAMILY_SCOPE` in
`server/lib/sharedConstants.js`; a CI test pins the two together. Changing scope
requires a new version of this document AND of the shared constant, reviewed together.

## 1. Intended use (charter §2, verbatim positioning)

> An evidence-based workplace-readiness assessment for graduating students, used for
> development and structured interview preparation—not automated rejection.

Policy carried on every relevant surface (reports, verification pages, marketing,
report emails, this document):

> Prism must not be used as the sole basis for an adverse educational or employment
> decision.

## 2. Job families in the first validation cycle

The first validation cycle covers **only** these two families:

### 2.1 Graduate Business Operations (`graduate-business-operations`)

Examples: Operations Associate · Management Trainee · Project Coordinator ·
Junior Business Analyst.

### 2.2 Customer-Facing Growth (`customer-facing-growth`)

Examples: Customer Success Associate · Inside Sales Executive · Business Development
Associate · Client Support Executive.

## 3. Explicit exclusions (cycle one)

Prism cycle-one claims do NOT extend to: technical/engineering roles, clinical or
medical roles, specialist professional roles, general intelligence testing, emotion
recognition, personality diagnosis, universal employability ranking, pass/fail
cut-offs, or claims of job-performance prediction. These are pilot non-goals
(charter §2) and remain excluded until supported by job analysis and validation
evidence.

## 4. Scenario → job-family mapping

The scenario bank is calibration-frozen at 8 active scenarios (audit C11). The
mapping below is a **documented content alignment only** — it carries no
scientifically framed job-family weights, and none may be created without future
job-analysis and validation evidence (charter §3).

| Scenario id | Title | Tier | Families | Usage |
| --- | --- | --- | --- | --- |
| `group-project` | The Group Project | foundational | GBO + CFG | standard |
| `fest-budget` | The Fest Budget | foundational | GBO | standard |
| `clinic-triage` | The Clinic Backlog | foundational | GBO + CFG | standard |
| `delayed-launch` | The Delayed Launch | intermediate | GBO | standard |
| `supplier-failure` | The Supplier Crisis | intermediate | GBO | standard |
| `brand-crisis` | The Brand Crisis | intermediate | CFG | standard |
| `ethical-ai` | The Ethical AI Decision | advanced | GBO | **sparing** (senior demands) |
| `team-restructure` | The Team Restructure | advanced | GBO | **sparing** (senior demands) |

Mapping rationale: peer-coordination and service-operations scenarios
(`group-project`, `clinic-triage`) exercise behaviours common to both families;
budget/operations/planning scenarios map to Graduate Business Operations;
`brand-crisis` (external-audience communication under pressure) maps to
Customer-Facing Growth. The two advanced scenarios may represent more senior
workplace demands and are used sparingly (near-tier scenario selection already
enforces this operationally).

## 5. Construct notes carried into public copy (charter §7)

- **Collaborative Behaviour** (public label for the `collaboration` dimension, §7.1):
  defined publicly as *"Behaviour demonstrated while responding to other participants
  in a simulated workplace interaction."* One AI simulation does not establish general
  collaboration ability, and no copy may claim it does.
- **Critical Thinking / Problem Solving** (§7.3): reported as separate pilot
  constructs. Their distinction is **provisional pending factor evidence**; they may
  not be merged or reweighted without approved evidence.
- **AI & Digital Fluency** (§7.2): scored only when the session included the
  standardized, versioned direct probe (`anchor_probes.v1.json`) and the minimum
  evidence threshold was met; otherwise the report says **Insufficient evidence**.
  The probe targets workplace judgement involving AI or digital tools — not product
  trivia, coding knowledge or memorized terminology.

## 6. Copy ceiling

The claims-ceiling test suite (`server/test/claimsCeiling.test.js`) enforces the
terminology floor of charter §7.4 on every public surface, and the trust-reporting
suite pins this document's existence and its agreement with the governed constant.
Any marketing, report, verification or institutional wording that names roles or
job families beyond §2 of this document is out of scope and must not ship.

---
*Version history: v1 created 2026-08-04 under Phase 2 of the master remediation
programme. This file is versioned — do not edit in place; create
`JOB_FAMILY_SCOPE_v2.md` and bump the shared constant together.*
