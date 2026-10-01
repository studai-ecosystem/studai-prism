# Prism UI/UX + Brand Transformation - Programme State

Live checklist for `.github/skills/prism-ui/references/master-spec.md`. Keep the header and the `## Phase` blocks in this exact format. Items: `- [ ]` open, `- [x] ... - evidence: ...` done.
Status values: NOT_STARTED, IN_PROGRESS, COMPLETE. run_mode values: off, phase, autopilot.

<!-- UI-STATE:BEGIN
run_mode: off
active_phase: B
target_phase: M
branch: ui/prism-brand-transformation
last_updated: 2026-10-01
UI-STATE:END -->

## Baseline

| Field | Value |
| --- | --- |
| Starting branch | `campus/p12-validation-rollout` at `0d1c456` (pushed to origin) |
| Brand source | `studai-prism/StudAI_Prism_Complete_Brand_Pack/StudAI_Prism_Brand_Pack/` (colors.json: Navy #0E255B, Green #03B67A, White, Soft Surface #F6F8FB) |
| Campus baseline gates (phase 12) | server 620/596 pass/0 fail/24 skipped; DB 36; python 64; vitest 226; build PASS; static audit PASS; playwright 571 passed (4 projects) |
| Known facts | Two token systems exist (legacy `--color-*` teal/Fraunces and campus `--prism-*` indigo); gold ribbon logo in `components/ui/PrismLogo.jsx`; brand green fails text contrast on white (2.63:1) so green is fill/mark only, derived darker green for text |

## Decisions log

| Id | Decision |
| --- | --- |
| U1 | The brand pack defines no typeface; the primary UI face is chosen in phase B and recorded here. |
| U2 | Derived (non-brand-issued) colours and their measured contrast are in docs/ui/UI_AUDIT.md section 5: green-ink #027A55 for green text, navy text on green fills, chart ordinal ramp #7189BD #3F5C9E #27408A #0E255B, chart green series = green-ink. |
| U3 | Phase A found no slate, indigo, purple or cyan classes left; the real fragmentation is two token systems (legacy teal/cream/Fraunces and campus indigo/Noto Sans). Phase B swaps both token files to one brand system rather than hunting classes. |
| U4 | The landing sample score (Critical thinking 74) and dimension weight percentages conflict with the no-fabricated-data law; replaced in phase J with an illustrative, number-free evidence thread. |

## Risks and open questions

- The tagline word "Prove" versus the claims-ceiling tests: decide in phase J (see its prompt).
- Product copy "by StudAI One" is a naming decision for the owner; leave unchanged unless told.
- Local-run caveat: server/.env carries a local-campus block (campus flags on, DATABASE_URL to prism_local) for the demo; Playwright's flags-off server loads it and 6 @critical tests fail unless the block is removed for the run (git-ignored; remove or comment it before every e2e run).
- A pending, unstaged deletion of studai-prism/.github/copilot-instructions.md and untracked brand-pack files, data/ are unrelated to the UI commits; leave them out of phase commits.
- Tauri desktop icons need the `tauri icon` tool; outside this programme unless requested.

## Phase A - Repository audit, UI inventory and route map

Status: COMPLETE
Gates: PASS 2026-10-01 @ 0d1c456 (docs only; build, vitest 226, server 620/596/0/24, static audit, playwright critical chromium 55)
Commit: this commit (ui/prism-brand-transformation)

- [x] A.01 Inventory every route in the app router and every legacy page under src/pages (path, component, auth, flag, shell) - evidence: docs/ui/UI_AUDIT.md section 2 (every route in src/app/AppRouter.jsx: public, legacy funnel, /app, /campus, /admin) and section 3 (components)
- [x] A.02 Inventory visual languages: gold, slate-950, indigo, emerald, amber, purple, cyan usage, raw hex, fonts, gradients, emoji, button and card variants, loading and error patterns, alert() calls - evidence: docs/ui/UI_AUDIT.md section 1 (static counts over 277 non-test files: gold 11 files, two token systems 78 + 104, serif 26, emoji 7, alert() 3, spinners 22, radii) and section 6 (type)
- [x] A.03 Migration matrix per route and per shared component: KEEP, REDESIGN, MERGE, REPLACE, DEPRECATE with the target phase - evidence: docs/ui/UI_AUDIT.md sections 2 and 3 (KEEP / REDESIGN / MERGE / REPLACE / DEPRECATE with target phase for each route family and shared component)
- [x] A.04 Backend response shapes the UI depends on (me, home, capabilities, evidence, reports, assessment session, campus read models) from server code and zod schemas - evidence: docs/ui/UI_AUDIT.md section 4 (zod contracts in src/api/*; evidence-status mapping limited to what the API returns)
- [x] A.05 Brand asset inventory and token derivation from colors.json and the logo files, with a contrast table for every planned text and fill pair - evidence: docs/ui/UI_AUDIT.md section 5 (derived tokens, 32-row measured contrast table; brand green fails text contrast; chart ramp #7189BD #3F5C9E #27408A #0E255B and green-ink chart series pass 3:1)
- [x] A.06 Route hierarchy proposal that follows the repository real conventions, with the redirect list for legacy public URLs - evidence: docs/ui/UI_AUDIT.md section 7 (route table mapped to the real router; redirects keep legacy URLs; personal nav and mobile bar)
- [x] A.07 Baseline screenshots of key routes at 1440, 1024, 768, 390 under audit-results/ui/baseline/ - evidence: 64 screenshots (16 route families x 1440/1024/768/390) in audit-results/ui/baseline/ (git-ignored) with summary.json; viewed landing, app home, campus overview, login at 1440 and app home, landing at 390; 0 overflow, 0 HTTP errors, 5 console errors on / (StoryDimensions.jsx:64)
- [x] A.08 Baseline validation numbers (build, unit, server, static audit, playwright) recorded in the state file - evidence: docs/ui/UI_AUDIT.md section 8: build PASS; vitest 226 passed (one load-sensitive failure in campus/analytics.test.jsx on first run, 3 of 3 isolated and the full rerun pass); server 620 tests, 596 pass, 0 fail, 24 skipped; static audit PASS; playwright @critical chromium 55 passed once the local-campus block was removed from server/.env
- [x] A.09 Commit the audit on the ui branch - evidence: this commit on ui/prism-brand-transformation: docs/ui/UI_AUDIT.md and docs/ui/UI_PROGRAM_STATE.md only

## Phase B - Brand tokens, typography, logo integration and design primitives

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] B.01 Copy official SVG lockups, icon, favicons, app icons and social card to public/brand; rebuild manifest.webmanifest (PNG any and maskable) and index.html (theme-color, icons, title, fonts)
- [ ] B.02 Rewrite src/design/tokens.js and tokens.css in lockstep: color.brand/surface/text/border/status/data, evidence-status tokens, type, spacing, radius, elevation, motion, breakpoints, layout widths, sidebar widths, header heights, content widths, focus rings, chart tokens; light and scoped dark semantics
- [ ] B.03 Typography: one primary sans with Latin, Devanagari and Tamil support, tabular numerals, role scale (Display to Code/ID); remove the other font families and inline font-family styles
- [ ] B.04 Brand logo component on the official assets: full, compact, icon, reversed, mono; minimum sizes; replaces PrismLogo and removes it from the hex allowlist
- [ ] B.05 Tailwind config on tokens; remove gold, cream and other legacy colour names after migrating their usages; delete dead legacy CSS (shimmer, glow, hero grid) when unused
- [ ] B.06 Primitives on tokens: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Tabs, SegmentedControl, Badge, StatusBadge, Card, Panel, Metric, Dialog, Drawer, Tooltip, Popover, Dropdown, Toast
- [ ] B.07 Standard PageSkeleton, CardSkeleton, TableSkeleton, InlineSpinner, FullScreenLoading, EmptyState, ErrorState; replace every alert()
- [ ] B.08 Icon rules applied: lucide only, no emoji UI, aria-label on icon buttons
- [ ] B.09 Initial /design-system route sections for logo, colours, type, primitives (completed in phase L)
- [ ] B.10 Gates, visual QA, commit

## Phase C - Unified shell, navigation and workspace context

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] C.01 AppShell (Sidebar, Topbar, ContextHeader, Breadcrumb, MainContent, ContextActions) shared by personal, campus and internal surfaces
- [ ] C.02 Workspace switcher: Personal and sponsored campus, active context, privacy boundary text, never implies institutional ownership
- [ ] C.03 Personal navigation: Home, Assessments, Capabilities, Development, Growth, Explore, Profile; secondary Shared reports, Credentials, Settings, Privacy
- [ ] C.04 Campus navigation by permission: Overview, Students, Cohorts, Assessments, Capabilities, Development, Interventions, Growth, Reports, Settings
- [ ] C.05 Responsive navigation: persistent sidebar, compact tablet, drawer or bottom nav on mobile, collapsed icon-only sidebar
- [ ] C.06 Route hierarchy and redirects for legacy public URLs; standalone pages folded into the shell where the matrix says MERGE
- [ ] C.07 Brand presence rules in shell, auth and reports; no tagline under nav logos
- [ ] C.08 Tests (guards, nav by role, switcher keyboard) and gates, commit

## Phase D - Personal home, assessments list and capabilities

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] D.01 Home answers where am I, what do we know, what next: workspace, snapshot, next assessment, strengths, priority, recommended mission, valid growth only, recent evidence, primary action
- [ ] D.02 Assessments list and detail with Active, Upcoming, Completed and scope labels
- [ ] D.03 Capabilities list and detail: definition, demonstrated level, evidence sufficiency, latest observations, growth direction, development actions, reassessment eligibility
- [ ] D.04 CapabilityCard and related primitives with Insufficient evidence as a first-class state
- [ ] D.05 Loading, empty, partial, error, unauthorized and offline states on every page
- [ ] D.06 Tests and gates, visual QA at 4 widths, commit

## Phase E - Assessment funnel, simulation workspace and artifacts

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] E.01 Measurement-sensitive inventory documented in the state file
- [ ] E.02 Invitation, briefing (role, duration, can-do, observed, not assessed, accommodations, integrity, privacy, technical readiness), consent, identity and integrity screens
- [ ] E.03 Workspace desktop layout: context bar, conversation, artifact tabs and tools, composer; reconnecting and submission states; focus management and keyboard navigation
- [ ] E.04 Purpose-built responsive workspace mode (not stacked panes)
- [ ] E.05 Common artifact shell, toolbar, tabs, tables, editable cells, selection, save and focus states, empty states; every artifact component brought into it
- [ ] E.06 Submission, evaluation and completion states with calm copy and what happens next
- [ ] E.07 Assessment e2e and axe checks pass; no hints or rubric text introduced
- [ ] E.08 Gates, visual QA, commit

## Phase F - Report V3 and the Evidence UI system

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] F.01 Evidence components: EvidenceCard, EvidenceThread, EvidenceSource, EvidenceStatus, EvidenceQuote, EvidenceCoverage, EvidenceTimeline, EvidenceDetailDrawer
- [ ] F.02 Report V3 as Summary, Evidence, Development and Methodology tabs with hero, capability cards, strengths, priorities, highlights, missions, growth, methodology
- [ ] F.03 Evidence UI reused on capability pages and growth views
- [ ] F.04 Methodology and psychometric detail in drawers and expandables
- [ ] F.05 Share and credential controls, shared report page, employee view where it exists
- [ ] F.06 Tests (honest states, every conclusion has evidence or is marked) and gates, commit

## Phase G - Development missions and growth

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] G.01 Mission list and detail: objective, target behaviour, why it matters, instructions, optional hints, artifact workspace, reflection, feedback, retry, next mission
- [ ] G.02 Clear Practice Mission / Development Mission labelling distinct from formal assessment
- [ ] G.03 Growth page with comparability honesty, baseline to reassessment timeline, non-comparable warning
- [ ] G.04 Reassessment entry points
- [ ] G.05 Calm completion states without confetti
- [ ] G.06 Tests and gates, commit

## Phase H - Explore and role discovery

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] H.01 Explore page: relevant role families, why it appeared, supporting evidence, what remains unknown, required capabilities, try a mission, learn more
- [ ] H.02 Interest input asked or omitted, never defaulted; interest visibly separate from demonstrated capability
- [ ] H.03 Copy review against the claims ceiling
- [ ] H.04 Tests and gates, commit

## Phase I - Campus experience

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] I.01 Campus overview as executive intelligence with actionable insights
- [ ] I.02 Students directory with filters and privacy labelling (Institution-sponsored, Personal-private, Shared by student)
- [ ] I.03 Cohorts and cohort detail sections
- [ ] I.04 Interventions with the baseline to development to reassessment to change loop
- [ ] I.05 Reusable Prism chart wrappers (legend, tooltip, labels, empty and insufficient-data states, table equivalents)
- [ ] I.06 Assessments, assignments, reports, settings, billing and integrations surfaces on the new system
- [ ] I.07 Student-side sponsored views and workspace privacy cues
- [ ] I.08 Tests (including campus journeys) and gates, commit

## Phase J - Marketing site, pricing and authentication

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] J.01 Landing narrative sections on the new system, restrained motion
- [ ] J.02 Pricing: personal and campus positioning; outdated Verified Prism Score style wording replaced where it conflicts
- [ ] J.03 Login, registration, invite redemption, password flows redesigned; institution invite context preserved; no duplicate identity
- [ ] J.04 Footer, public layouts, contact
- [ ] J.05 Tests and gates, visual QA, commit

## Phase K - Admin, research, legal and profile or settings

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] K.01 Profile and settings consolidated: Profile, Account, Workspaces, Privacy, Sharing, Assessment preferences, Accessibility, Security
- [ ] K.02 Admin console on the design system: compact tables, filters, status labels, confirmations
- [ ] K.03 Research and science pages: editorial width, citation hierarchy, method cards, study status
- [ ] K.04 Legal pages: documentation layout, anchors, table of contents, last-updated metadata
- [ ] K.05 Tests and gates, commit

## Phase L - Responsive, accessibility and polish

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] L.01 Width matrix 1440, 1280, 1024, 768, 430, 390, 360 on every route family with no horizontal overflow
- [ ] L.02 Axe across all routes; keyboard-only walkthroughs; focus traps; status announcements; contrast audit; touch targets; zoom and reflow
- [ ] L.03 Reduced-motion audit; remove constant or decorative motion
- [ ] L.04 Performance: bundle sizes, lazy routes and charts, logo and font loading
- [ ] L.05 Complete /design-system: all logo variants, colours, type, spacing, radii, elevation, components, evidence and capability components, charts, states, light, dark, mobile, Tamil, Devanagari, long text, focus
- [ ] L.06 Gates and commit

## Phase M - Testing, cleanup and production validation

Status: NOT_STARTED
Gates: -
Commit: -

- [ ] M.01 Repository search for gold, amber, indigo, purple, slate-950, emerald, raw hex, PRISM NEXT, Verified Prism Score, emoji UI, old logo, legacy gradients; each occurrence evaluated and resolved or justified
- [ ] M.02 Dead CSS, duplicate components, obsolete helpers and unused imports removed
- [ ] M.03 Full suites: build, unit, server, static audit, complete Playwright on all projects
- [ ] M.04 Visual QA of every major route at 1440, 1024, 768, 390 reviewed
- [ ] M.05 Final delivery report (what changed, architecture, shared components, routes, responsive, accessibility, removed legacy, tests, blockers, files changed, routes needing human approval, confirmation that scoring was not altered, completion statement)
- [ ] M.06 Commit, set Status COMPLETE and run_mode off

