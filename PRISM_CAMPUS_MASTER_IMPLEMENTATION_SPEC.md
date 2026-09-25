# StudAI Prism — Campus + Personal Master Implementation Specification

**Repository:** `studai-ecosystem/studai-prism`  
**Audit baseline:** `63d320db7949bdf7e9c3526228d8e732e51becbd` (2026-09-21)  
**Document status:** APPROVED PRODUCT DIRECTION — BUILD SPECIFICATION  
**Primary implementation target:** VS Code AI Agent / Copilot  
**Product owner:** StudAI One  
**Priority:** Frontend-first experience rebuild + measurement integrity + campus architecture  

---

## 0. AI AGENT EXECUTION DIRECTIVE

This document is not a brainstorming document. Treat it as the implementation contract for evolving the current Prism codebase into a production-grade platform with two operating modes:

1. **Prism Personal** — direct individual users.
2. **Prism Campus** — institution-sponsored student cohorts.

Do **not** fork the application into separate products. Do **not** create separate student identities for campus users. Do **not** allow campus sponsorship or campus permissions to alter, expose, consume, or overwrite a student's direct/personal Prism data.

Implementation must preserve all working production-critical behavior unless this specification explicitly replaces it. Prefer migrations, adapters, route aliases, compatibility layers, and feature flags over destructive rewrites.

### Absolute implementation rules

- One global user identity.
- Multiple workspaces and sponsorship contexts around that identity.
- Personal data remains personal by default.
- College can only see data produced inside the college-sponsored scope, except where the student explicitly shares additional data.
- No fake scores, fake norms, fake confidence intervals, default evidence, default interests, default strengths, default role fit, or hard-coded performance conclusions.
- Missing evidence must resolve to `INSUFFICIENT_EVIDENCE`, never a neutral/default passing score.
- Development/practice evidence must not directly modify formal assessment evidence.
- Formal growth requires a governed reassessment.
- Frontend must clearly communicate evidence, uncertainty, sponsorship context, privacy, and next actions.
- All new frontend pages must include loading, empty, partial-data, error, unauthorized, expired-entitlement, offline/reconnect, and mobile/tablet behavior where relevant.
- No frontend-only authorization. All visibility and access decisions must be enforced server-side.
- New campus APIs should be versioned under `/api/v1/` while legacy APIs remain available during migration.
- Use feature flags for all major rollout boundaries.
- Every phase must include tests and acceptance criteria before moving to the next phase.

---

# 1. PRODUCT NORTH STAR

Prism should not be positioned internally or technically as a generic soft-skills test.

The target product is:

> **StudAI Prism — Work-Readiness Intelligence**
>
> Measure how students think, work and adapt. Help them improve. Prove their growth.

The core product loop is:

**Assess → Explain → Develop → Reassess → Prove**

The institution buys the program and cohort intelligence. The student receives the personal value.

A college should feel that Prism answers:

- What workplace capabilities does our cohort currently demonstrate?
- Where are the biggest evidence-backed capability gaps?
- Which students require specific forms of development support?
- Which interventions should we run?
- Did students actually improve after intervention?
- Are we improving work readiness across departments and batches?

A student should feel that Prism answers:

- What am I currently good at?
- What evidence supports that conclusion?
- Where am I weak or under-evidenced?
- What should I do next?
- Did I improve after practice?
- What can I credibly share with a college, mentor, recruiter, or employer?

---

# 2. CURRENT STATE — WHAT TO KEEP, CHANGE, REMOVE, OR REPLACE

The current repository already contains valuable building blocks. Do not throw them away. However, Prism Next currently mixes production-grade foundations with prototype behavior and UI concepts.

## 2.1 Keep and strengthen

Preserve and evolve:

- React 18 + Vite frontend.
- React Router.
- Tailwind CSS.
- Framer Motion for restrained motion.
- Lucide icon set.
- Existing authentication/session foundation.
- Existing public research, legal, verification, marketing, and admin routes unless superseded.
- Server-side scoring principle.
- Evidence graph concept.
- Competency model v2 concept.
- Occupational capability graph concept.
- Scenario/artifact workspace concept.
- Human-rater / psychometrics control-plane work.
- Credential verification concept.
- Institution invite/coupon foundations where compatible.
- PostgreSQL migration approach.
- Feature-flag strategy.
- Existing audit/security/remediation work.

## 2.2 Refactor

Refactor these current frontend areas:

- `src/App.jsx`
- `src/pages/ShellHome.jsx`
- `src/pages/Profile.jsx`
- `src/pages/AssessmentWorkspace.jsx`
- `src/pages/StudentReportV2.jsx`
- `src/pages/ExploreMode.jsx`
- `src/pages/DevelopmentMission.jsx`
- `src/pages/InviteRedeem.jsx`
- current scattered direct `fetch()` calls
- current repeated token extraction from `localStorage`
- current page-level visual language
- current route guarding

## 2.3 Remove from customer-facing behavior

Remove or prohibit:

- `PRISM NEXT` implementation language in customer UI.
- “12-section capability intelligence” language.
- Emoji-heavy production labels and section headers.
- Arbitrary overall readiness labels that are not validated.
- Hard-coded candidate archetypes.
- Hard-coded strengths.
- Hard-coded weaknesses.
- Hard-coded “job ready” claims.
- Hard-coded salary/budget/responsibility readiness claims.
- Fake standard error or confidence intervals.
- Fake percentage-based role match.
- Auto-created candidate interest vectors.
- Default RIASEC values that influence results.
- Frontend fallback simulation dialogue when backend requests fail.
- Default “verified” evidence.
- Default rubric level `3` when evidence is missing.
- Default unanimous judge agreement.
- Silent fallback to the marketing scenario for unknown assessment IDs.
- Practice mission outputs being treated as formal assessment evidence.
- Public cohort/student leaderboards.
- Any generic overall “Prism Score” in Campus v1.

## 2.4 Current known code defects that must be fixed before Campus rollout

### `AssessmentWorkspace.jsx`

Current problems:

- Hard-coded `scenarioId: 'prism-sim-mkt-l1'`.
- Hard-coded `jobFamilyId: 'STUDAI-JF-MKT-L1'`.
- Hard-coded Lumina Botanicals title.
- Hard-coded fallback dialogue.
- UI can continue despite backend failure.
- Completion behavior is too permissive.
- Candidate can be shown generated fallback content not produced by governed server logic.

Required direction:

- Session metadata must fully define scenario, job family, required capabilities, allowed artifacts, progress state, and integrity policy.
- No client hard-coded scenario selection.
- No fabricated dialogue fallback.
- Network failure must show recoverable session state.
- Auto-save every meaningful interaction.

### `StudentReportV2.jsx` + `server/lib/reportV2.js`

Current problems:

- 12-section report is too long and enterprise-looking for student use.
- Backend can generate fallback scores and levels.
- Backend can generate fallback quotes and evidence.
- Hard-coded archetype and readiness language.
- Hard-coded strengths/growth focus.
- Hard-coded psychometric precision values.
- Marketing-specific assumptions.
- Role recommendations can overstate evidence.

Required direction:

Replace with **Student Report V3**, evidence-first and fail-closed.

### `ExploreMode.jsx`

Current problems:

- Starts with fabricated/pre-filled RIASEC values.
- Starts with pre-selected preferences.
- Automatically evaluates on load.
- Uses percentage-style values that look more precise than warranted.
- Can blur self-reported preference and demonstrated capability.

Required direction:

- Blank/unanswered by default.
- Interests are clearly self-reported.
- Capability evidence is clearly observed.
- Recommendations explain what is known and unknown.
- No fake “match” percentage.

### `DevelopmentMission.jsx` + mission route

Current problems:

- Current mission evaluator mainly checks string length/budget presence.
- Can produce Level 4 despite insufficient evidence.
- Feedback contains claims not actually verified.
- Observable behaviors can be emitted regardless of actual actions.

Required direction:

- Rebuild mission evaluation around deterministic artifact checks + rubric evaluator + evidence provenance.
- Mission completion and mission quality are separate.
- Practice outcome is not a formal assessment score.

### `ShellHome.jsx`

Current problem:

It is built primarily as a license/start-or-resume assessment launcher.

Required direction:

Replace as the authenticated **Prism Home** inside a shared application shell with workspace switching and personal/campus context.

---

# 3. TARGET PRODUCT ARCHITECTURE

```text
                              PRISM CORE
                                  |
            +---------------------+----------------------+
            |                     |                      |
     Assessment Engine       Evidence Graph       Development Engine
            |                     |                      |
            +---------------------+----------------------+
                                  |
                         Capability Profile
                                  |
               +------------------+------------------+
               |                                     |
        Prism Personal                         Prism Campus
               |                                     |
       Personal entitlement                  Sponsored entitlement
               |                                     |
       Personal assessments                  Campus assignments
               |                                     |
       Personal reports                      Cohort analytics
               |                                     |
       Personal development                  Interventions
                                                     |
                                               Reassessment
```

There is one engine and one identity system. Sponsorship, context, policy, visibility and entitlements differ.

---

# 4. IDENTITY, WORKSPACES, AND CUSTOMER SEPARATION

## 4.1 One user, many contexts

A global `user` can belong to zero, one, or many organizations.

Example:

```text
User: Priya Kumar

Personal workspace
- Personal Prism assessment — paid directly
- Personal development missions
- Career exploration

Campus workspace: Vels University
- Sponsored baseline assessment
- Sponsored development plan
- Sponsored reassessment

Future employer workspace
- Explicitly shared evidence only
```

Never duplicate the user because they joined a college.

## 4.2 Workspace types

Introduce:

- `PERSONAL`
- `CAMPUS_STUDENT`
- `CAMPUS_ADMIN`
- future: `EMPLOYER`

Workspace is a UI and authorization context, not a second identity.

## 4.3 Context isolation rule

Every sponsored assessment, assignment, report, intervention, mission and reassessment must carry an explicit ownership/sponsorship scope.

Minimum scope fields:

- `owner_user_id`
- `sponsor_type`
- `sponsor_organization_id`
- `workspace_id`
- `program_id`
- `cohort_id`
- `visibility_policy`
- `created_by`

## 4.4 Direct customer protection

A Campus membership must never:

- consume personal credits;
- unlock paid personal assessment products unless explicitly included;
- expose personal reports;
- expose prior private reports;
- expose another campus's reports;
- expose personal exploration history;
- change personal assessment pricing;
- force personal data into campus reports;
- merge private practice with institution-sponsored measurement.

---

# 5. FRONTEND REBUILD — PRIMARY PRIORITY

The frontend is not a skin over the backend. It must become the main product system through which personal users, students, placement teams and administrators understand Prism.

## 5.1 Design principles

1. **Calm, credible, evidence-first.**
2. Avoid “AI dashboard” visual clichés.
3. Avoid excessive gradients, neon, glows and emojis.
4. Use dense information only where administrators need it.
5. Student experience should feel supportive and action-oriented, not like a psychometric audit console.
6. Campus analytics should feel executive and operational.
7. The assessment workspace can remain darker and distraction-free.
8. Product shell should default to a light neutral UI with optional dark mode later.
9. Color is semantic, not decorative.
10. A number should only appear when it has a clear meaning and provenance.

## 5.2 Recommended product visual model

### Main application

- background: near-white / subtle neutral
- cards: white
- borders: soft neutral
- text: high-contrast slate/ink
- Prism accent: indigo/violet
- positive evidence: restrained emerald
- warning/partial evidence: amber
- blocked/error: red
- insufficient evidence: neutral/gray, not failure-red

### Assessment workspace

Retain a dark, focused environment because it separates “simulation mode” from the rest of the product.

### Campus dashboard

Use light mode first for readability, printability, presentation and projector use.

## 5.3 New frontend dependencies

Add only if implementation needs them:

- `@tanstack/react-query` — server state and caching.
- `zod` — API response/form validation.
- `react-hook-form` — forms.
- `recharts` — institution analytics visualizations.
- `date-fns` — dates.

Avoid adding a large UI framework. Continue with Tailwind and internal components.

## 5.4 Frontend architecture

Create:

```text
src/
  app/
    AppRouter.jsx
    providers/
      AuthProvider.jsx
      QueryProvider.jsx
      WorkspaceProvider.jsx
      FeatureFlagProvider.jsx
    guards/
      AuthGuard.jsx
      WorkspaceGuard.jsx
      RoleGuard.jsx
      EntitlementGuard.jsx

  layouts/
    PublicLayout.jsx
    AppShell.jsx
    StudentShell.jsx
    CampusShell.jsx
    AssessmentShell.jsx

  components/
    ui/
    navigation/
    capability/
    evidence/
    assessment/
    reports/
    missions/
    campus/
    charts/
    tables/
    states/

  features/
    auth/
    workspaces/
    assessments/
    capabilities/
    evidence/
    development/
    reports/
    exploration/
    campus/
    billing/
    sharing/

  api/
    client.js
    auth.js
    workspaces.js
    assessments.js
    reports.js
    evidence.js
    development.js
    campus.js
    entitlements.js

  hooks/
  lib/
  styles/
```

Do not keep building unrelated pages inside one flat `src/pages/` directory.

---

# 6. NEW ROUTE INFORMATION ARCHITECTURE

## 6.1 Public routes

Keep:

```text
/
/login
/register
/verify/:credentialId
/research/*
/about/*
/privacy
/terms
/security
/contact
```

## 6.2 Authenticated personal/student application

Target:

```text
/app
/app/home
/app/assessments
/app/assessments/:assignmentId/briefing
/app/assessments/:assignmentId/system-check
/app/assessment/:sessionId
/app/reports/:sessionId
/app/capabilities
/app/evidence
/app/development
/app/development/missions/:missionId
/app/growth
/app/explore
/app/sharing
/app/settings
```

## 6.3 Campus student workspace

Use a clear workspace context:

```text
/app/campus/:organizationId/home
/app/campus/:organizationId/assignments
/app/campus/:organizationId/development
/app/campus/:organizationId/growth
```

Personal data should never automatically appear inside these routes unless marked explicitly as shared.

## 6.4 Campus administration

```text
/campus/:organizationId/overview
/campus/:organizationId/students
/campus/:organizationId/students/:studentId
/campus/:organizationId/cohorts
/campus/:organizationId/cohorts/:cohortId
/campus/:organizationId/programs
/campus/:organizationId/programs/:programId
/campus/:organizationId/assessments
/campus/:organizationId/development
/campus/:organizationId/reassessments
/campus/:organizationId/analytics
/campus/:organizationId/reports
/campus/:organizationId/members
/campus/:organizationId/integrations
/campus/:organizationId/billing
/campus/:organizationId/settings
```

## 6.5 Legacy redirects

During migration:

- `/workspace/:sessionId` → `/app/assessment/:sessionId`
- `/report/:sessionId/v2` → `/app/reports/:sessionId`
- `/missions/:missionId` → `/app/development/missions/:missionId`
- `/explore` → `/app/explore`

Keep aliases for at least one production release cycle.

---

# 7. SHARED APPLICATION SHELL

## 7.1 Desktop shell

Left navigation:

- Home
- Assessments
- My Capabilities
- Evidence
- Development
- Growth
- Explore Roles
- Sharing

Bottom:

- Help
- Settings
- User menu

Top bar:

- workspace selector
- context badge: `Personal` or institution name
- notifications
- profile

## 7.2 Workspace switcher

Example:

```text
Workspace

Personal
Vels University
```

Switching workspace must:

- change route context;
- invalidate workspace-scoped queries;
- reload entitlements;
- reload permissions;
- never merge private and campus datasets;
- display a short context confirmation.

## 7.3 Mobile navigation

For student views:

Bottom navigation can include:

- Home
- Assess
- Develop
- Growth
- More

Campus administration does not need full mobile parity for complex analytics, but must remain usable for viewing basic status and approvals.

---

# 8. DESIGN SYSTEM

Create or refactor the current `DesignSystem.jsx` into internal reusable primitives.

## 8.1 Core primitives

Build:

- `Button`
- `IconButton`
- `LinkButton`
- `Badge`
- `StatusChip`
- `Card`
- `Panel`
- `StatCard`
- `ProgressBar`
- `Tabs`
- `SegmentedControl`
- `Tooltip`
- `Popover`
- `Modal`
- `Drawer`
- `DropdownMenu`
- `Avatar`
- `Input`
- `Select`
- `Textarea`
- `Checkbox`
- `RadioGroup`
- `Switch`
- `DataTable`
- `Pagination`
- `Breadcrumbs`
- `PageHeader`
- `EmptyState`
- `ErrorState`
- `Skeleton`
- `InlineNotice`
- `Callout`
- `Toast`

## 8.2 Prism-specific components

Build:

- `WorkspaceSwitcher`
- `CapabilityCard`
- `CapabilityLevelBadge`
- `EvidenceSufficiencyBadge`
- `EvidenceTracePanel`
- `ObservedBehaviorCard`
- `AssessmentAssignmentCard`
- `AssessmentStatusTimeline`
- `MissionCard`
- `MissionResultCard`
- `GrowthDeltaCard`
- `GrowthTimeline`
- `RoleExplorationCard`
- `PrivacyScopeBadge`
- `SponsoredByCard`
- `CohortCapabilityHeatmap`
- `CapabilityDistributionChart`
- `InterventionOutcomeChart`
- `CohortFilterBar`
- `StudentDrawer`
- `ConsentScopePanel`

## 8.3 Accessibility

Meet WCAG 2.2 AA where feasible.

Mandatory:

- keyboard navigation;
- focus-visible states;
- contrast-safe text;
- aria labels;
- semantic headings;
- no color-only meaning;
- reduced motion support;
- screen reader labels for charts;
- chart data available as accessible tables;
- skip-navigation links;
- timed mission accessibility policy;
- candidate accommodations support.

---

# 9. STUDENT HOME — NEW

Route: `/app/home`

The student homepage should answer “what should I do now?” within 5 seconds.

## 9.1 Header

Show:

- greeting/name
- active workspace
- current sponsored program if applicable
- privacy context

Example:

```text
Good morning, Priya
Vels University · Placement Readiness 2026
Your personal Prism data remains separate from this campus program.
```

## 9.2 Primary action card

Priority order:

1. assessment due;
2. incomplete assessment;
3. report ready;
4. development mission due;
5. reassessment upcoming;
6. no active work → personal capability summary.

## 9.3 Capability snapshot

Show 5 primary capabilities plus contextual AI judgment if measured.

Do not show fake percentages.

Each card:

- capability name;
- observed level/label;
- evidence sufficiency;
- change from valid prior comparable assessment if available;
- one-sentence evidence summary;
- link to details.

## 9.4 Development focus

Show maximum 3 current priorities.

Example:

```text
Current focus
1. Structure recommendations before presenting them
2. Make ownership explicit in execution plans
3. Challenge AI-generated evidence before using it
```

## 9.5 Campus-sponsored card

If in Campus:

- sponsor name;
- program name;
- what the institution can see;
- link to full privacy explanation.

---

# 10. ASSESSMENTS LIST

Route: `/app/assessments`

Tabs:

- Active
- Completed
- Upcoming

Each assessment card shows:

- assessment title;
- scope: personal or sponsored;
- sponsor;
- expected duration;
- due date if applicable;
- integrity mode;
- status;
- resume/start CTA.

Never mix sponsored and personal purchases invisibly.

Display scope label prominently:

- `Personal assessment`
- `Sponsored by Vels University`

---

# 11. ASSESSMENT BRIEFING

Route: `/app/assessments/:assignmentId/briefing`

Replace generic pre-test funnel with a clean briefing.

Required sections:

1. What this assessment measures.
2. What it does not measure.
3. How the simulation works.
4. Estimated duration.
5. Allowed tools/resources.
6. Integrity requirements.
7. Accessibility/accommodation options.
8. Sponsorship/privacy scope.
9. Technical check.
10. Start button.

Campus-sponsored disclosure example:

```text
This assessment is sponsored by Vels University.
The university can access this sponsored assessment result and program-related development progress.
Your personal Prism assessments and private activity are not shared automatically.
```

Require explicit acknowledgement.

---

# 12. ASSESSMENT WORKSPACE V3

Refactor `AssessmentWorkspace.jsx` into feature modules.

## 12.1 Desktop layout

```text
+---------------------------------------------------------------+
| Scenario | status | help | save state                         |
+----------------------------+----------------------------------+
|                            |                                  |
| Conversation / directives  | Artifact workspace               |
|                            |                                  |
|                            | Tabs: Dashboard / Ticket / Model  |
|                            |                                  |
+----------------------------+----------------------------------+
| Response composer / action bar                                |
+---------------------------------------------------------------+
```

## 12.2 Required behavior

- Session metadata from backend only.
- Backend defines scenario.
- Backend defines artifact list.
- Backend defines stakeholder personas.
- Backend controls next prompt.
- Autosave responses and artifact mutations.
- Record client event IDs for idempotency.
- Resume after refresh.
- Resume after temporary disconnect.
- Server authoritative clock if timed.
- Clear “saved” indicator.
- No generated fallback dialogue.
- No scoring details while assessment is active.
- Do not reveal which exact answer earns which rubric level.

## 12.3 Completion

Before finishing:

- check required evidence opportunities;
- check pending artifact save;
- warn if the candidate is ending early;
- allow legitimate early exit;
- if assessment cannot be scored, return insufficient evidence rather than fabricating results.

## 12.4 Mobile behavior

Formal simulation should prefer laptop/tablet.

On small mobile widths:

- show supported-device warning if the scenario relies on complex artifacts;
- do not squeeze desktop two-pane UI into unusable cards;
- if permitted, use switchable tabs `Conversation` / `Workspace`.

## 12.5 Frontend file target

```text
src/features/assessments/
  pages/AssessmentPlayerPage.jsx
  components/AssessmentHeader.jsx
  components/ConversationPane.jsx
  components/ArtifactPane.jsx
  components/ResponseComposer.jsx
  components/SessionSaveStatus.jsx
  components/AssessmentExitDialog.jsx
  hooks/useAssessmentSession.js
  hooks/useAssessmentAutosave.js
  api/assessmentSessionApi.js
```

---

# 13. CAPABILITY MODEL V3 PRESENTATION

Primary transferable capabilities:

1. Reasoning & Decision Quality
2. Communication & Structure
3. Collaboration & Navigation
4. Adaptability & Learning
5. Execution & Ownership

Contextual:

6. AI & Digital Judgment

## 13.1 Do not show “soft skill score”

The UI should show:

- observed level;
- evidence sufficiency;
- observations;
- development guidance;
- change across valid reassessments.

## 13.2 Capability details page

Route: `/app/capabilities`

For each capability:

- definition;
- current evidence-backed level;
- status: insufficient/provisional/sufficient;
- key observed behaviors;
- evidence sources;
- development priority;
- related missions;
- valid historical observations.

---

# 14. STUDENT REPORT V3 — REPLACE V2

Route: `/app/reports/:sessionId`

The main student report should be short, clear and actionable.

## 14.1 Page 1 equivalent — Capability Profile

Header:

- candidate name;
- assessment name;
- sponsor if any;
- completion date;
- assessment/version ID;
- verification state;
- privacy/share state.

Then capability cards.

Each card:

```text
Reasoning & Decision Quality
Observed level: Demonstrated
Evidence: Sufficient

What we observed:
You separated customer complaints from channel-performance symptoms before recommending budget changes.

See evidence →
```

## 14.2 Page 2 equivalent — Evidence

For each major conclusion:

- claim;
- scenario context;
- actual candidate action or short quote;
- artifact interaction if relevant;
- rubric anchor;
- evidence sufficiency;
- provenance.

Never display invented quotes.

## 14.3 Page 3 equivalent — Development Plan

Maximum 3 priorities.

Each:

- behavior to improve;
- why it matters;
- recommended mission;
- expected practice time;
- suggested reassessment window.

## 14.4 Optional tabs

- Summary
- Evidence
- Development
- Methodology

Methodology should not dominate the report but should remain accessible.

## 14.5 Share/report export

Allow:

- secure share link;
- selective disclosure;
- PDF export;
- revoke share;
- expiry date.

A campus cannot convert an institution-only report into public sharing without student permission unless contract/legal basis explicitly permits it.

---

# 15. EVIDENCE EXPLORER

Route: `/app/evidence`

This is a long-term moat feature.

Display a timeline/graph of:

```text
Scenario
  ↓
Candidate action
  ↓
Observed behavior
  ↓
Capability
  ↓
Rubric anchor
  ↓
Evidence status
```

Filters:

- capability;
- assessment;
- sponsored/personal;
- date;
- formal/practice.

Practice evidence must be visually different from formal assessment evidence.

---

# 16. DEVELOPMENT ENGINE V2

Routes:

```text
/app/development
/app/development/missions/:missionId
```

## 16.1 Development plan

Student sees:

- current development priorities;
- recommended missions;
- completed missions;
- upcoming reassessment;
- evidence gained from practice, explicitly labeled `Practice evidence`.

## 16.2 Mission schema

Every mission requires:

```text
mission_id
version
status
target_capability_id
target_behavior_ids
scenario_context
instructions
artifacts
constraints
deterministic_validation_rules
rubric
required_evidence
scaffolding_policy
feedback_policy
estimated_duration
accessibility_mode
```

## 16.3 Mission evaluation pipeline

```text
Candidate action
    ↓
Schema validation
    ↓
Deterministic artifact checks
    ↓
Structured evaluator
    ↓
Evidence extraction
    ↓
Rubric comparison
    ↓
Uncertainty check
    ↓
Practice feedback
```

Do not create formal capability-score increases from this pipeline.

## 16.4 Mission UI

Mission player should include:

- concise scenario;
- clear deliverable;
- artifact workspace;
- optional hint drawer;
- save state;
- submit review;
- feedback by criterion;
- retry.

Remove “Level 4 achieved!” gamification if the evaluation is not scientifically equivalent to formal assessment.

Use:

> Mission completed — 3 of 4 target behaviors demonstrated.

only when actually verified.

---

# 17. GROWTH EXPERIENCE

Route: `/app/growth`

Growth is only displayed when there are comparable formal assessments.

Show:

- baseline date;
- reassessment date;
- assessment form/version;
- comparability status;
- capability change;
- confidence/uncertainty where validated;
- intervention timeline.

Never calculate a growth delta across non-equated forms and present it as scientific improvement.

If not comparable:

```text
A later assessment exists, but these forms are not yet validated for direct growth comparison.
```

---

# 18. ROLE EXPLORATION

Route: `/app/explore`

Separate two inputs:

### Self-reported interests

- RIASEC/preferences
- explicitly labeled self-reported

### Demonstrated capability evidence

- from formal Prism evidence only

Then recommendations may say:

```text
Product Operations
Why it appears:
- You reported high interest in problem solving and stakeholder work.
- Prism observed evidence of structured reasoning and communication.

What remains unknown:
- No formal evidence yet for product analytics.

Next step:
Complete Product Prioritization simulation.
```

No `87% match`.

No fabricated defaults.

No auto-evaluation before the user provides interest data.

---

# 19. CAMPUS PRODUCT — FRONTEND INFORMATION ARCHITECTURE

Prism Campus is a separate workspace experience, not a separate product codebase.

## 19.1 Campus left navigation

- Overview
- Students
- Cohorts
- Programs
- Assessments
- Development
- Reassessments
- Analytics
- Reports
- Team
- Integrations
- Billing
- Settings

Use role-aware visibility.

---

# 20. CAMPUS OVERVIEW DASHBOARD

Route: `/campus/:organizationId/overview`

The landing page should answer:

- Are students completing the program?
- What are the biggest capability gaps?
- What should we do next?
- Are interventions working?

## 20.1 Top summary

Cards:

- Students enrolled
- Assessment completion
- Reports ready
- Development missions active
- Reassessments due

Avoid a generic “average Prism score.”

## 20.2 Capability overview

Show distribution for each capability.

Example buckets:

- Insufficient evidence
- Early evidence
- Developing
- Demonstrated
- Strongly demonstrated

Only use labels finalized by the measurement specification.

## 20.3 Top cohort development needs

Example:

```text
Highest-priority development areas
1. Execution & Ownership — 38% of assessed students need further evidence/development
2. Communication & Structure — 31%
3. AI & Digital Judgment — 27%
```

The calculation must be transparent and based on defined thresholds.

## 20.4 Actions

- Create assessment program
- Import students
- Assign development plan
- Schedule reassessment
- Export cohort report

---

# 21. STUDENTS DIRECTORY

Route: `/campus/:organizationId/students`

Columns:

- student name
- email/student identifier
- department
- cohort
- program status
- baseline status
- development status
- reassessment status

Do not show sensitive capability detail directly in a large table by default.

Filters:

- campus
- department
- course/program
- batch
- cohort
- status
- assignment

Bulk actions:

- assign assessment;
- assign development program;
- resend invite;
- move cohort;
- export authorized fields.

---

# 22. CAMPUS STUDENT DETAIL

Route: `/campus/:organizationId/students/:studentId`

Display only organization-authorized data.

Sections:

- program status;
- sponsored assessments;
- capability profile from sponsored assessments;
- sponsored development plan;
- reassessment history;
- consent/share scope;
- intervention history.

Show a visible privacy note:

> This view contains only data available to this organization. Personal Prism activity is excluded unless explicitly shared.

---

# 23. COHORT MANAGEMENT

Routes:

```text
/campus/:organizationId/cohorts
/campus/:organizationId/cohorts/:cohortId
```

Cohort creation supports:

- name;
- campus;
- department;
- academic program;
- batch/year;
- semester;
- tags;
- owner/coordinator.

Student import:

- CSV;
- manual add;
- invite link;
- future SIS integration.

Import preview must show errors before committing.

---

# 24. CAMPUS PROGRAMS

A `Program` is an institution initiative around assessment and development.

Example:

```text
Placement Readiness 2026
Baseline: Oct 2026
Development: Oct–Dec
Reassessment: Jan 2027
Cohorts: CSE 2027, ECE 2027, MBA 2027
```

A program contains:

- cohorts;
- assessment assignments;
- intervention plan;
- development missions;
- reassessment schedule;
- reporting policy;
- sponsorship/billing scope.

---

# 25. CAMPUS ASSESSMENT MANAGEMENT

Institution administrator can:

- create an assignment from approved assessment definitions;
- select cohorts;
- define window;
- select integrity policy;
- configure accommodations;
- set reminder policy;
- preview student consent/disclosure;
- monitor completion.

Institution cannot edit scoring rubrics.

Institution cannot create arbitrary scored prompts.

Assessment content remains governed by Prism.

---

# 26. CAMPUS DEVELOPMENT / INTERVENTIONS

Route: `/campus/:organizationId/development`

Placement team should be able to create development programs around cohort evidence.

Example:

```text
Intervention: Structured Communication Sprint
Target capability: Communication & Structure
Target cohort: CSE 2027
Duration: 4 weeks
Missions: 3
Reassessment: scheduled after completion
```

Do not allow intervention completion to modify formal scores.

---

# 27. CAMPUS ANALYTICS

Route: `/campus/:organizationId/analytics`

## 27.1 Required views

- capability distribution;
- evidence sufficiency distribution;
- department comparison;
- cohort comparison;
- baseline vs reassessment where comparable;
- mission completion;
- intervention outcome;
- assessment completion funnel;
- insufficient-evidence rates.

## 27.2 Privacy suppression

For small groups, prevent re-identification.

Introduce configurable minimum aggregate group size. Default recommendation: `10`.

If group size is below minimum:

```text
Data hidden because this segment is too small for aggregate reporting.
```

## 27.3 Chart principles

- show sample size;
- show missing/insufficient evidence;
- no truncated y-axis where misleading;
- provide table equivalent;
- no ranking students;
- no unexplained composite score.

---

# 28. CAMPUS REPORTS

Support:

### Executive cohort report

- participation;
- capability distributions;
- major gaps;
- intervention activity;
- reassessment status;
- recommended next actions.

### Department report

Same structure scoped to department.

### Individual sponsored report

Evidence-based student report within authorized scope.

Do not include private personal Prism data.

---

# 29. ROLES AND PERMISSIONS

Minimum organization roles:

```text
ORG_OWNER
PLACEMENT_DIRECTOR
PLACEMENT_OFFICER
DEPARTMENT_COORDINATOR
FACULTY_MENTOR
STUDENT
PRISM_REVIEWER
STUDAI_ADMIN
```

## 29.1 Permission examples

| Action | Owner | Placement Director | Placement Officer | Dept Coordinator | Faculty Mentor | Student |
|---|---:|---:|---:|---:|---:|---:|
| Manage organization | Yes | Limited | No | No | No | No |
| Manage team | Yes | Yes | Limited | No | No | No |
| View all cohorts | Yes | Yes | Assigned | Department | Assigned | No |
| Create program | Yes | Yes | Yes | Limited | No | No |
| Assign assessment | Yes | Yes | Yes | Limited | No | No |
| View cohort analytics | Yes | Yes | Assigned | Department | Assigned limited | No |
| View student sponsored result | Yes | Yes | Assigned | Department | Assigned | Own only |
| View personal Prism result | No | No | No | No | No | Own only |
| Export cohort data | Yes | Yes | Permission | Permission | No | No |

Server must enforce every permission.

---

# 30. DATABASE ARCHITECTURE

Add migrations after current migrations without rewriting migration history.

Recommended tables/entities:

## 30.1 Organizations

```text
organizations
- id
- name
- slug
- organization_type
- status
- country
- timezone
- created_at
- updated_at
```

## 30.2 Organizational structure

```text
campuses
academic_departments
academic_programs
academic_batches
cohorts
cohort_members
```

## 30.3 Membership

```text
organization_memberships
- id
- organization_id
- user_id
- role
- status
- department_id nullable
- scope jsonb
- joined_at
```

## 30.4 Workspaces

```text
workspaces
- id
- type
- owner_user_id nullable
- organization_id nullable
- name
- status
```

## 30.5 Campus programs

```text
campus_programs
- id
- organization_id
- name
- description
- status
- starts_at
- ends_at
- created_by
```

Join tables:

```text
campus_program_cohorts
campus_program_assignments
campus_program_interventions
```

## 30.6 Assessment definitions and assignments

Separate the definition from an institution assignment.

```text
assessment_definitions
assessment_forms
assessment_assignments
assessment_assignment_targets
assessment_assignment_students
assessment_sessions
```

Do not let an institution assignment mutate the assessment definition.

## 30.7 Entitlements

```text
entitlements
- id
- user_id nullable
- organization_id nullable
- source_type
- source_reference_id
- product_code
- assessment_definition_id nullable
- quantity
- consumed_quantity
- valid_from
- valid_until
- status
- metadata jsonb
```

Source types:

```text
PERSONAL_PURCHASE
INSTITUTION_SPONSORSHIP
PROMO
ADMIN_GRANT
PARTNER_GRANT
```

Create immutable consumption ledger:

```text
entitlement_consumptions
```

## 30.8 Evidence

Current evidence table must evolve toward strict nullable/fail-closed semantics.

Required fields:

```text
evidence_id
session_id
source_type
source_turn
source_artifact_id
capability_id
behavior_anchor_id
candidate_action_json
observable_behavior
rubric_level nullable
rubric_label nullable
confidence_status
judge_agreement_json nullable
human_review_status
provenance_json
assessment_form_id
created_at
```

Never default rubric level or verification fields.

## 30.9 Development

```text
development_plans
development_plan_items
development_missions
mission_versions
mission_attempts
practice_evidence_units
interventions
intervention_memberships
```

Formal assessment evidence and practice evidence should be separate tables or strongly separated by immutable source type and query boundary.

## 30.10 Reassessment/growth

```text
reassessment_cycles
assessment_form_equivalence
capability_growth_snapshots
```

Growth snapshot should only be created if forms are approved for comparison.

## 30.11 Sharing/privacy

```text
consent_records
share_grants
share_grant_resources
data_access_audit_events
```

---

# 31. ENTITLEMENT ENGINE

Do not use `paid=true` as the source of truth.

## 31.1 Entitlement resolution

Input:

```text
user
workspace
requested product/action
assessment assignment
organization
```

Output:

```text
allowed
source
entitlement_id
consumption_required
expires_at
scope
reason
```

## 31.2 Campus-sponsored assessment

When a campus student begins an assigned assessment:

1. validate membership;
2. validate assignment;
3. validate sponsorship entitlement;
4. reserve seat/consumption;
5. create session;
6. finalize consumption on defined event.

Define whether the commercial billable event is:

- assessment started;
- assessment completed;
- report successfully generated.

Recommended: bill completed eligible assessment unless contract states otherwise.

---

# 32. NEW API LAYER

Create centralized frontend API client.

## 32.1 Client behavior

`src/api/client.js`

Must handle:

- base URL;
- auth token;
- workspace header/context;
- request ID;
- JSON parsing;
- standardized errors;
- 401 refresh/logout behavior;
- 403 authorization handling;
- network error;
- retry only for safe requests;
- no automatic retry for mutation unless idempotency key exists.

## 32.2 Versioned API examples

### Workspaces

```text
GET /api/v1/workspaces
POST /api/v1/workspaces/:workspaceId/activate
```

### Student

```text
GET /api/v1/me/home
GET /api/v1/me/capabilities
GET /api/v1/me/evidence
GET /api/v1/me/assessments
GET /api/v1/me/development-plan
GET /api/v1/me/growth
```

### Assessment

```text
GET  /api/v1/assessment-assignments/:id
POST /api/v1/assessment-assignments/:id/start
GET  /api/v1/assessment-sessions/:sessionId
POST /api/v1/assessment-sessions/:sessionId/messages
PATCH /api/v1/assessment-sessions/:sessionId/artifacts/:artifactId
POST /api/v1/assessment-sessions/:sessionId/finish
GET  /api/v1/assessment-sessions/:sessionId/report
```

### Campus

```text
GET  /api/v1/organizations/:orgId/overview
GET  /api/v1/organizations/:orgId/students
GET  /api/v1/organizations/:orgId/students/:studentId
POST /api/v1/organizations/:orgId/cohorts
POST /api/v1/organizations/:orgId/imports/students
POST /api/v1/organizations/:orgId/programs
POST /api/v1/organizations/:orgId/assessment-assignments
GET  /api/v1/organizations/:orgId/analytics/capabilities
GET  /api/v1/organizations/:orgId/analytics/growth
```

### Development

```text
GET  /api/v1/missions/:id
POST /api/v1/missions/:id/attempts
PATCH /api/v1/mission-attempts/:attemptId
POST /api/v1/mission-attempts/:attemptId/submit
```

---

# 33. MEASUREMENT INTEGRITY — FAIL CLOSED

This phase must precede broad Campus deployment.

## 33.1 Evidence graph corrections

Current unsafe behavior must be removed.

Do not default:

```text
observable_behavior
rubric_level
rubric_label
confidence_status
judge_agreement
```

Required rule:

If evidence cannot be produced with required provenance:

```text
status = INSUFFICIENT_EVIDENCE
rubric_level = null
```

## 33.2 Capability aggregation

Do not mark a capability `VERIFIED` because it has two rows.

Create capability-level evidence rules:

```text
minimum_evidence_units
minimum_independent_opportunities
required_anchor_coverage
minimum_judge_agreement
minimum_evidence_quality
calibration_state
human_review_requirement
```

Output:

```text
INSUFFICIENT_EVIDENCE
PROVISIONAL
SUFFICIENT
HUMAN_REVIEW_REQUIRED
```

Avoid the word `VERIFIED` for scientific capability claims unless specifically governed.

## 33.3 Report claim registry

Every report claim should include machine-readable provenance.

Example:

```json
{
  "claim_id": "claim-123",
  "claim_type": "STRENGTH",
  "capability_id": "CAP-L1-REASONING",
  "text": "You separated customer complaints from channel-performance symptoms before recommending action.",
  "evidence_ids": ["evid-1", "evid-2"],
  "status": "SUPPORTED"
}
```

Do not allow unsupported claims into the report renderer.

---

# 34. ASSESSMENT CONTENT STRATEGY

## 34.1 Universal workplace core

Build scenarios that do not require specialist professional knowledge.

Required scenario families:

- ambiguous operational problem;
- customer/stakeholder escalation;
- competing priorities;
- deadline failure;
- team disagreement;
- resource/budget trade-off;
- incomplete/misleading data;
- AI-generated recommendation requiring verification.

## 34.2 Career-context extensions

Initial four tracks:

1. Technology & Product
2. Business & Operations
3. Sales & Customer Success
4. Marketing & Growth

Do not create dozens of job families until the core system is validated.

## 34.3 Scenario registry

Unknown scenario IDs must return an explicit error.

Never silently fall back to Marketing.

---

# 35. AI & DIGITAL JUDGMENT

Treat this as contextual work judgment, not “can use ChatGPT.”

Possible behaviors:

- detects unsupported AI claim;
- validates sources;
- challenges hallucination;
- improves prompt/context;
- selects appropriate human escalation;
- distinguishes high-risk/low-risk AI use;
- makes decision after considering uncertainty;
- protects sensitive information.

Do not expose internal model prompting logic to candidates.

---

# 36. CAMPUS SPONSORSHIP + PERSONAL PRIVACY

## 36.1 Campus can access

When authorized:

- assigned assessment status;
- sponsored assessment output;
- sponsored development assignments;
- sponsored mission completion;
- valid reassessment results;
- aggregate cohort analytics;
- allowed student-level support information.

## 36.2 Campus cannot automatically access

- personal purchases;
- personal assessment reports;
- private role exploration;
- personal practice;
- other institution activity;
- future employer activity;
- unrelated StudAI product activity.

## 36.3 Student share controls

A student may explicitly share additional Prism evidence through `share_grants`.

Share grants require:

- resource scope;
- recipient/scope;
- created date;
- expiry;
- revoke state;
- audit trail.

---

# 37. CAMPUS ONBOARDING

## 37.1 Institution onboarding wizard

Steps:

1. Organization profile
2. Academic structure
3. Team members
4. Student import
5. Program creation
6. Assessment selection
7. Schedule
8. Privacy/consent review
9. Launch

Allow saving progress.

## 37.2 Student activation

Invite flow:

- detect existing Prism account by verified email where appropriate;
- invite user to join organization;
- do not create duplicate identity if an account exists;
- user signs in or registers;
- accepts organization membership;
- sees sponsorship/privacy disclosure;
- enters campus workspace.

---

# 38. BILLING / COMMERCIAL ARCHITECTURE

Do not hard-code commercial pricing into core authorization logic.

## 38.1 Personal

Current direction:

- Prism Personal assessment: ₹499.

Preserve direct payment funnel.

## 38.2 Campus

Support configurable contract components:

- platform fee;
- included assessment seats;
- per-completed assessment rate;
- reassessment rate;
- review allowance;
- custom integrations;
- validation services.

Initial commercial direction can support:

- Design Partner Pilot: approximately ₹1.25L–₹1.5L up to 250 students.
- Additional baseline: ₹349–₹399.
- Reassessment: ₹199–₹249 after comparability is validated.
- Annual platform: ₹1.5L+.
- Multi-campus: contract pricing.

These are commercial configuration, not immutable code constants.

## 38.3 Student experience

Institution-sponsored students should see:

```text
Sponsored by Vels University
No payment required
```

They should not see internal contract price or discount.

---

# 39. FRONTEND STATE MANAGEMENT

## 39.1 Server state

Use React Query for:

- user;
- workspaces;
- entitlements;
- assignments;
- session state;
- reports;
- campus lists;
- analytics;
- missions.

## 39.2 Local UI state

Use component state/context for:

- modal state;
- selected table filters;
- draft response before autosave;
- navigation state.

Avoid duplicating server data into large custom stores.

## 39.3 Assessment artifacts

Refactor current `artifactStore.js` so it tracks:

- current server snapshot;
- optimistic local mutation;
- unsaved mutation queue;
- last persisted version;
- conflict state.

Use version numbers or ETags for artifact writes.

---

# 40. ERROR, EMPTY, LOADING, AND PARTIAL STATES

Every new screen must implement all states.

Examples:

### Capability page with no formal assessment

```text
You do not have a formal capability profile yet.
Complete your first Prism assessment to begin building one.
```

### Campus cohort with no assessments

```text
No assessment data yet.
Create an assignment for this cohort.
```

### Partial evidence

Show available evidence and clearly mark missing capability areas.

### Assessment connection loss

```text
Connection interrupted.
Your latest saved work is safe.
Reconnecting…
```

Do not generate local fallback AI content.

---

# 41. FRONTEND SECURITY

- No sensitive authorization decisions in route rendering alone.
- Use server-provided permissions.
- Avoid storing full sensitive reports in long-lived local storage.
- Token handling should follow existing secure architecture and be reviewed for XSS risk.
- Sanitize any rich text from AI or administrators.
- Never render raw HTML from report generation without sanitization.
- CSP must support required assets without `unsafe-eval` in production.
- Avoid exposing internal rubric prompt content to candidate clients.
- Keep assessment answer keys/rubrics server-side.

---

# 42. ACCESSIBILITY AND ACCOMMODATIONS

Create accommodation profiles that can modify delivery without secretly changing construct interpretation.

Potential accommodations:

- extended time;
- larger text;
- reduced motion;
- keyboard-first;
- screen-reader optimized;
- alternate input mode;
- breaks where valid.

Record administration mode with the assessment session.

Do not interpret accessibility mode as lower performance.

---

# 43. NOTIFICATIONS

Build event-driven notifications for:

Student:

- invite received;
- assessment assigned;
- due soon;
- report ready;
- mission assigned;
- reassessment available.

Campus admin:

- import complete;
- assignment launched;
- completion threshold reached;
- reassessment window ready;
- report export complete.

Prefer in-app + email initially.

Do not build excessive engagement notifications.

---

# 44. AUDITABILITY

Record high-value events:

- membership changes;
- role changes;
- student import;
- assignment creation;
- assessment started/completed;
- sponsored report viewed;
- report exported;
- share grant created/revoked;
- intervention assigned;
- reassessment created;
- entitlement consumed;
- privileged data access.

Campus admins should have a limited organization audit log.

StudAI operations keep deeper operational logs.

---

# 45. SCIENCE / VALIDATION PROGRAM

Campus must not make unsupported “accurate” claims before validation.

Required parallel program:

1. Appoint external psychometrician / I-O psychologist.
2. Recruit and qualify human raters.
3. Establish blinded double-rating.
4. Measure AI-human agreement.
5. Test test-retest / alternate-form reliability.
6. Run DIF checks where sample size permits.
7. Evaluate language and administration mode effects.
8. Establish content validity through SME review.
9. Establish criterion evidence using mock interview, internship, placement or employer outcomes.
10. Freeze calibrated forms only after explicit governance approval.

Until then, UI should use careful labels such as:

- “Observed in this simulation”
- “Evidence currently available”
- “Provisional capability profile”
- “Insufficient evidence”

---

# 46. ANALYTICS AND PRODUCT TELEMETRY

Track product behavior without logging sensitive content unnecessarily.

Student funnel:

```text
invite_received
membership_accepted
briefing_opened
assessment_started
assessment_resumed
assessment_completed
report_viewed
mission_started
mission_completed
reassessment_started
reassessment_completed
```

Campus funnel:

```text
org_created
students_imported
program_created
assignment_created
assignment_launched
cohort_report_viewed
intervention_created
reassessment_created
renewal_intent_recorded
```

Do not put transcript text, raw answers, PII or report narrative into product analytics events.

---

# 47. PERFORMANCE TARGETS

Frontend target:

- App shell interactive quickly on ordinary campus networks.
- Route-level code splitting.
- Lazy-load heavy charts.
- Avoid fetching full student lists when summaries are enough.
- Server pagination for large cohorts.
- Virtualize large tables if necessary.
- Assessment workspace must not lose state during slow network.

Suggested targets:

- Core dashboard initial JS kept under control through route splitting.
- API p95 for normal dashboard summary endpoints under ~500–800ms where realistic.
- Assessment mutation acknowledgment under ~1s under normal conditions.

Treat these as engineering goals, not user-facing SLAs unless formally committed.

---

# 48. TESTING STRATEGY

## 48.1 Unit tests

Cover:

- entitlement resolver;
- permission resolver;
- evidence sufficiency;
- report claim generation;
- mission validation;
- growth comparability;
- aggregate privacy suppression.

## 48.2 API integration tests

Must include:

- direct user + campus membership isolation;
- personal report denied to campus admin;
- campus-sponsored report available to authorized admin;
- other organization denied;
- expired sponsor entitlement;
- duplicate assessment start idempotency;
- assessment resume;
- mission practice evidence isolation.

## 48.3 Frontend component tests

Prioritize:

- WorkspaceSwitcher;
- CapabilityCard;
- AssessmentAssignmentCard;
- report states;
- campus filter states;
- privacy scope;
- error boundaries.

## 48.4 Playwright critical journeys

### Journey A — direct user

```text
register
→ pay/personal entitlement
→ start assessment
→ complete
→ view Report V3
→ start development mission
```

### Journey B — existing direct user joins campus

```text
existing account
→ campus invite
→ accept membership
→ switch workspace
→ complete sponsored assessment
→ campus sees sponsored report
→ personal report remains inaccessible to campus
```

### Journey C — campus admin

```text
login
→ create cohort
→ import students
→ create program
→ assign assessment
→ monitor completion
→ view aggregate analytics
```

### Journey D — insufficient evidence

```text
assessment ends with incomplete evidence
→ no fabricated score
→ Report V3 clearly states insufficient evidence
```

### Journey E — network interruption

```text
assessment running
→ API unavailable
→ no fallback dialogue
→ save/reconnect UI
→ resume safely
```

## 48.5 Accessibility

Keep Axe/Playwright automated checks and add manual keyboard checks for critical journeys.

---

# 49. FEATURE FLAGS

Recommended flags:

```text
PRISM_APP_SHELL_V3
PRISM_STUDENT_REPORT_V3
PRISM_EVIDENCE_FAIL_CLOSED
PRISM_CAMPUS_ENABLED
PRISM_CAMPUS_ANALYTICS
PRISM_DEVELOPMENT_V2
PRISM_GROWTH_ENABLED
PRISM_ROLE_EXPLORATION_V2
PRISM_ASSESSMENT_WORKSPACE_V3
```

Server-side flags must guard sensitive behavior. Frontend flags are not authorization.

---

# 50. IMPLEMENTATION PHASES

---

## PHASE 0 — Baseline safety and regression lock

### Goal

Create a safe baseline before changing architecture.

### Tasks

- Pin current commit and create implementation branch.
- Run current test suites.
- Capture current key UI screenshots.
- Add Playwright smoke tests for current direct flow.
- Add tests reproducing known unsafe defaults.
- Document all existing flags.
- Map current API endpoints used by frontend.

### Acceptance

- Existing direct flow is reproducibly testable.
- Known unsafe behavior has failing regression tests ready for fixes.

---

## PHASE 1 — Frontend foundation and design system

### Goal

Create the new UI foundation before feature expansion.

### Tasks

- Create `src/app`, `src/layouts`, `src/features`, `src/api` structure.
- Add Query provider.
- Add centralized API client.
- Add unified AuthGuard.
- Add workspace context.
- Build AppShell.
- Build CampusShell.
- Build reusable primitives.
- Create responsive navigation.
- Remove repeated raw token/fetch boilerplate from migrated pages.
- Create route compatibility redirects.
- Establish light application theme + dark assessment theme.

### Frontend acceptance

- App shell responsive at 360, 768, 1024, 1440 widths.
- Keyboard navigable.
- Loading/empty/error primitives reusable.
- Workspace switching UI exists behind feature flag.
- Existing direct assessment remains usable.

---

## PHASE 2 — Measurement integrity corrections

### Goal

Remove fabricated evidence and report behavior.

### Backend tasks

- Make evidence fields strict.
- Remove default rubric level.
- Remove default verified consensus.
- Add sufficiency engine.
- Unknown scenario → explicit error.
- Remove report hard-coding and fake defaults.
- Remove default role interests.
- Add report claim provenance.

### Frontend tasks

- Add insufficient-evidence state.
- Add provisional/sufficient badges.
- Remove fake precision.
- Remove customer-visible “PRISM NEXT” language.

### Acceptance

No report can show a score, strength, weakness, role conclusion or psychometric precision unless supported by actual data allowed by governance rules.

---

## PHASE 3 — Organization, workspace, membership, entitlement foundation

### Goal

Enable Campus without disturbing direct customers.

### Tasks

- organization tables;
- campus/department/program/batch/cohort;
- memberships;
- workspaces;
- sponsorship entitlements;
- immutable entitlement ledger;
- permission service;
- workspace APIs;
- campus invite flow;
- existing-user account linking.

### Frontend tasks

- WorkspaceSwitcher.
- Campus membership acceptance.
- Sponsored-by UI.
- Privacy scope panel.
- Personal/campus separation in navigation and data queries.

### Acceptance

An existing direct customer can join a college, use a sponsored assessment, and the college cannot access the existing personal report.

---

## PHASE 4 — Student application V3

### Goal

Replace ShellHome-centric experience with the actual student product.

### Build

- Home.
- Assessments list.
- Capability profile.
- Evidence explorer.
- Development overview.
- Growth placeholder/state.
- Explore Roles V2.
- Sharing/settings.

### Acceptance

Student can understand current status and next action without seeing internal system terminology.

---

## PHASE 5 — Assessment Workspace V3

### Goal

Make the simulation reliable, dynamic and production-grade.

### Backend

- session metadata contract;
- scenario registry;
- artifact versioning;
- idempotent message/action endpoints;
- resume support;
- completion/sufficiency check.

### Frontend

- dynamic AssessmentShell;
- conversation pane;
- artifact pane;
- save state;
- reconnection;
- accessible briefing;
- early-exit warning;
- responsive behavior.

### Acceptance

No hard-coded Marketing scenario remains in generic assessment UI.

---

## PHASE 6 — Student Report V3

### Goal

Deliver a concise evidence-first outcome.

### Build

- summary;
- capability profile;
- evidence trace;
- development plan;
- methodology drawer/tab;
- secure sharing;
- PDF renderer.

### Remove/deprecate

- StudentReportV2 customer route.
- 12-section default UX.
- employee-switch link from student report.
- unsupported readiness language.

### Acceptance

Every major displayed conclusion is linked to real evidence IDs or explicitly marked insufficient/provisional.

---

## PHASE 7 — Prism Campus administration

### Goal

Make Prism operational for placement teams.

### Build frontend first

- Campus Overview.
- Students directory.
- Student detail.
- Cohorts.
- Programs.
- Assessment management.
- Team/RBAC.
- Import wizard.
- Completion monitoring.

### Backend

- organization APIs;
- import jobs;
- cohort queries;
- assessment assignment service;
- audit events.

### Acceptance

A placement officer can launch a complete 250-student program without StudAI manually editing database records.

---

## PHASE 8 — Development Engine V2

### Goal

Turn reports into measurable action.

### Build

- governed mission schema;
- mission versioning;
- deterministic validators;
- structured AI evaluator;
- practice evidence ledger;
- development plans;
- cohort intervention assignments.

### Frontend

- mission catalogue;
- mission player;
- criterion-level feedback;
- retry;
- campus intervention builder.

### Acceptance

Mission output never claims behavior that the evaluator did not observe.

---

## PHASE 9 — Reassessment and growth

### Goal

Complete Assess → Develop → Reassess → Prove.

### Build

- reassessment cycles;
- parallel-form governance;
- equivalence registry;
- growth snapshot generation;
- student growth timeline;
- campus intervention outcome analytics.

### Acceptance

Growth delta only appears for approved comparable forms.

---

## PHASE 10 — Campus analytics and reporting

### Goal

Convert student evidence into institution intelligence.

### Build

- capability distributions;
- evidence sufficiency;
- cohort/department filters;
- baseline/reassessment;
- intervention analysis;
- export;
- privacy suppression;
- executive report.

### Acceptance

Campus can identify capability gaps and program outcomes without relying on an arbitrary aggregate Prism score.

---

## PHASE 11 — Billing, operations, integrations

### Build

- contract entitlements;
- campus billing configuration;
- usage ledger;
- invoice/export integration points;
- SSO-ready architecture;
- SIS/import integration interfaces;
- operational support tooling.

### Acceptance

Direct B2C billing and Campus sponsored billing operate independently.

---

## PHASE 12 — Validation and controlled scale rollout

### Goal

Move from paid design partners to defensible scale.

### Required

- human-rater studies;
- alternate-form/retest studies;
- fairness/DIF review;
- language/channel evaluation;
- criterion outcome agreements;
- documented claims register;
- legal/privacy review;
- final production security review.

---

# 51. FRONTEND FILE MIGRATION PLAN

## 51.1 Refactor

```text
src/App.jsx
→ src/app/AppRouter.jsx
```

Keep `App.jsx` as thin root wrapper initially.

```text
src/pages/ShellHome.jsx
→ src/features/home/pages/StudentHomePage.jsx
```

```text
src/pages/AssessmentWorkspace.jsx
→ src/features/assessments/pages/AssessmentPlayerPage.jsx
```

```text
src/pages/StudentReportV2.jsx
→ src/features/reports/pages/StudentReportPage.jsx
```

```text
src/pages/DevelopmentMission.jsx
→ src/features/development/pages/MissionPlayerPage.jsx
```

```text
src/pages/ExploreMode.jsx
→ src/features/exploration/pages/RoleExplorePage.jsx
```

## 51.2 New major frontend files

```text
src/layouts/AppShell.jsx
src/layouts/CampusShell.jsx
src/layouts/AssessmentShell.jsx

src/features/home/pages/StudentHomePage.jsx
src/features/workspaces/components/WorkspaceSwitcher.jsx
src/features/assessments/pages/AssessmentsPage.jsx
src/features/capabilities/pages/CapabilitiesPage.jsx
src/features/evidence/pages/EvidencePage.jsx
src/features/development/pages/DevelopmentPage.jsx
src/features/growth/pages/GrowthPage.jsx
src/features/sharing/pages/SharingPage.jsx

src/features/campus/pages/CampusOverviewPage.jsx
src/features/campus/pages/StudentsPage.jsx
src/features/campus/pages/StudentDetailPage.jsx
src/features/campus/pages/CohortsPage.jsx
src/features/campus/pages/CohortDetailPage.jsx
src/features/campus/pages/ProgramsPage.jsx
src/features/campus/pages/ProgramDetailPage.jsx
src/features/campus/pages/CampusAssessmentsPage.jsx
src/features/campus/pages/CampusDevelopmentPage.jsx
src/features/campus/pages/CampusAnalyticsPage.jsx
src/features/campus/pages/CampusReportsPage.jsx
src/features/campus/pages/CampusMembersPage.jsx
src/features/campus/pages/CampusBillingPage.jsx
src/features/campus/pages/CampusSettingsPage.jsx
```

---

# 52. UI SCREEN ACCEPTANCE CHECKLIST

Every screen must satisfy:

- page purpose clear within first viewport;
- primary action obvious;
- current workspace visible;
- sponsorship context visible when relevant;
- privacy scope discoverable;
- no fake precision;
- responsive behavior defined;
- keyboard accessible;
- loading state;
- empty state;
- error state;
- partial state;
- permission-denied state;
- analytics event defined;
- E2E coverage for critical screens.

---

# 53. FORBIDDEN IMPLEMENTATION SHORTCUTS

The AI coding agent must not:

- seed fake production report values to make UI look complete;
- use random percentages;
- hard-code user names;
- hard-code Marketing role in shared components;
- hard-code an institution;
- reuse personal assessment data for Campus analytics without scoped authorization;
- copy direct purchase entitlements into sponsorship entitlements;
- expose all organization data because user has any campus membership;
- mark evidence sufficient based only on row count;
- create frontend-only permission restrictions;
- silently swallow report generation errors;
- generate fake AI dialogue during outage;
- treat mission practice evidence as formal evidence;
- compute growth across unapproved forms;
- create a student ranking leaderboard;
- create an overall employability score in Campus v1;
- expose model prompts or answer keys in client bundles;
- delete legacy routes before migration is complete.

---

# 54. DATA MIGRATION STRATEGY

1. Add new tables without changing existing production records.
2. Create workspace records for existing users lazily or via migration.
3. Map existing direct entitlement/license to `PERSONAL_PURCHASE` entitlement records.
4. Keep old payment APIs operational while entitlement service becomes source of truth.
5. Create adapters so legacy routes read new services where possible.
6. Feature-flag new frontend shell.
7. Internal QA.
8. Small test-user cohort.
9. Design partner campus.
10. Gradual default migration.
11. Remove legacy implementation only after observability confirms no meaningful usage.

---

# 55. DESIGN PARTNER PILOT CONFIGURATION

Recommended first real campus program:

```text
Program: Prism Work-Readiness Baseline
Students: 200–300
Target: pre-final/final-year students
Duration: 6–10 weeks

Week 0
Onboard + consent

Week 1
Baseline assessment

Week 2
Reports + cohort intelligence

Weeks 2–6
Development missions/intervention

Week 7+
Reassessment where validated

End
Student growth report + institution report + buyer review
```

Pilot success measures:

- seat activation;
- completion;
- report usefulness;
- student understanding;
- mission engagement;
- support burden;
- buyer usefulness;
- renewal intent;
- human-rating/science data quality.

---

# 56. LONG-TERM DATA MOAT

The strategic asset is not a 30-minute test.

It is the longitudinal capability evidence graph:

```text
Student
  ↓
Scenario
  ↓
Action
  ↓
Evidence
  ↓
Capability
  ↓
Development intervention
  ↓
Reassessment
  ↓
Internship / placement / early-career outcome
```

Keep this data model clean from the beginning.

Do not prematurely optimize for a single composite score.

The long-term value is evidence connecting behaviors, interventions and outcomes.

---

# 57. FUTURE STUD.AI ECOSYSTEM BOUNDARY

Prism should remain the measurement/evidence authority.

Future integration:

### StudAI Career

Can consume student-authorized Prism capability evidence to personalize development.

Career must not train directly on confidential assessment answer keys.

### StudAI Hire

Can consume selectively shared, validated Prism evidence.

Hire should never receive unrestricted Prism history by default.

### Separation policy

```text
Prism = measure / evidence
Career = develop / guide
Hire = recruit / screen
```

This separation reduces conflict-of-interest and “teach to your own test” risk.

---

# 58. DEFINITION OF DONE — PRISM CAMPUS V1

Prism Campus V1 is not complete because pages exist.

It is complete only when:

1. Direct users continue to work without regression.
2. Existing personal data stays isolated from Campus.
3. Existing personal customer can join a campus without duplicate account.
4. College can create cohorts and programs.
5. College can import and invite students.
6. College can sponsor an assessment.
7. Student can understand sponsorship/privacy before starting.
8. Assessment runs from server-defined scenario metadata.
9. Assessment survives refresh/network interruption safely.
10. No client fallback dialogue fabricates assessment content.
11. Evidence system fails closed.
12. Report V3 contains no fabricated evidence or unsupported claims.
13. Student receives concise capability + evidence + development output.
14. Campus can view authorized sponsored outcomes.
15. Campus cannot view unrelated personal outcomes.
16. Campus can see cohort capability distributions.
17. Small-group privacy suppression works.
18. Campus can assign development interventions.
19. Mission engine only claims observed practice behaviors.
20. Practice does not directly raise formal scores.
21. Reassessment flow exists.
22. Growth only appears where comparison is approved.
23. RBAC is server-enforced.
24. Audit logs exist for privileged access.
25. Student and admin critical journeys pass Playwright.
26. Accessibility critical checks pass.
27. Billing/entitlement separation is test-covered.
28. Security review passes.
29. Claims register matches actual scientific validation state.
30. Production rollout is feature-flagged and reversible.

---

# 59. BUILD ORDER FOR VS CODE AI AGENT

Follow this order. Do not begin by building Campus dashboard mockups on top of current unsafe report data.

```text
1. Baseline tests and regression lock
2. New frontend architecture + design system
3. Central API/auth/workspace layer
4. Measurement fail-closed fixes
5. Organization/workspace/entitlement schema
6. Workspace separation + membership flows
7. Student Home / Assessments / Capabilities / Evidence
8. Assessment Workspace V3
9. Student Report V3
10. Campus Overview + Students + Cohorts + Programs
11. Assessment assignment management
12. Development Engine V2
13. Reassessment/growth
14. Campus analytics/reports
15. Billing/operations
16. Validation/rollout hardening
```

At the end of every numbered step:

- run backend tests;
- run frontend build;
- run critical Playwright suite;
- run static audit;
- document migrations;
- update implementation checklist;
- do not proceed with known P0/P1 regressions.

---

# 60. FINAL PRODUCT STANDARD

The implementation should result in a product where a student can say:

> Prism showed me how I actually behaved in realistic work situations, explained what I did well, showed where my evidence was weak, gave me specific practice, and helped me demonstrate growth.

A placement team should be able to say:

> Prism gave us evidence of where our students are strong, where the cohort is struggling, what development to prioritize, and whether the intervention improved the capabilities we care about.

And a direct customer should experience no degradation because Campus exists.

That means the system must remain:

- one identity;
- one core measurement engine;
- one evidence graph;
- isolated workspaces;
- separate entitlements;
- explicit permissions;
- evidence-first reporting;
- student-first development;
- scientifically cautious;
- frontend-coherent;
- production-operable.

**End state:** Prism is not a test library. It is a capability measurement and development system with a portable student identity and an institution intelligence layer.

---

# 61. IMPLEMENTATION CHECKLIST

Use this section as the live checklist inside the repository.

## Foundation

- [ ] Baseline branch created
- [ ] Existing tests green
- [ ] Direct flow smoke E2E locked
- [ ] AppRouter introduced
- [ ] Query provider introduced
- [ ] API client introduced
- [ ] AuthGuard introduced
- [ ] WorkspaceProvider introduced
- [ ] Design system primitives introduced
- [ ] AppShell introduced
- [ ] CampusShell introduced
- [ ] AssessmentShell introduced

## Measurement integrity

- [ ] Evidence defaults removed
- [ ] Rubric level nullable
- [ ] Verification defaults removed
- [ ] Evidence sufficiency engine implemented
- [ ] Unknown scenario fails explicitly
- [ ] Report hard-coded claims removed
- [ ] Fake psychometric precision removed
- [ ] Default interests removed
- [ ] Role percentages removed
- [ ] Claim provenance implemented

## Campus foundation

- [ ] Organizations
- [ ] Campuses
- [ ] Departments
- [ ] Academic programs
- [ ] Batches
- [ ] Cohorts
- [ ] Memberships
- [ ] Workspaces
- [ ] RBAC
- [ ] Sponsorship entitlements
- [ ] Consumption ledger
- [ ] Audit events

## Student frontend

- [ ] Home
- [ ] Assessments
- [ ] Briefing
- [ ] Capabilities
- [ ] Evidence
- [ ] Development
- [ ] Growth
- [ ] Explore roles
- [ ] Sharing
- [ ] Settings

## Assessment

- [ ] Dynamic session metadata
- [ ] No hard-coded scenario
- [ ] No fallback AI dialogue
- [ ] Autosave
- [ ] Resume
- [ ] Reconnect
- [ ] Artifact versioning
- [ ] Idempotency
- [ ] Completion sufficiency check

## Report V3

- [ ] Summary
- [ ] Capability cards
- [ ] Evidence trace
- [ ] Development plan
- [ ] Methodology view
- [ ] Secure share
- [ ] PDF
- [ ] Insufficient evidence UI

## Campus frontend

- [ ] Overview
- [ ] Students
- [ ] Student detail
- [ ] Cohorts
- [ ] Cohort detail
- [ ] Programs
- [ ] Program detail
- [ ] Assessments
- [ ] Development
- [ ] Reassessments
- [ ] Analytics
- [ ] Reports
- [ ] Members
- [ ] Billing
- [ ] Settings

## Development V2

- [ ] Mission schema
- [ ] Mission versioning
- [ ] Deterministic checks
- [ ] Structured evaluator
- [ ] Practice evidence ledger
- [ ] Criterion feedback
- [ ] Intervention assignment
- [ ] Formal/practice separation tests

## Growth

- [ ] Reassessment cycles
- [ ] Form equivalence registry
- [ ] Growth snapshots
- [ ] Student growth timeline
- [ ] Campus outcome analytics
- [ ] Non-comparable-form warning

## Quality

- [ ] RBAC integration tests
- [ ] Tenant isolation tests
- [ ] Entitlement isolation tests
- [ ] Student E2E
- [ ] Campus E2E
- [ ] Insufficient evidence E2E
- [ ] Network recovery E2E
- [ ] Accessibility checks
- [ ] Performance review
- [ ] Security review
- [ ] Production rollout plan

