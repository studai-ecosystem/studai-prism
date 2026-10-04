# Prism UI/UX + Brand Transformation - Programme State

Live checklist for `.github/skills/prism-ui/references/master-spec.md`. Keep the header and the `## Phase` blocks in this exact format. Items: `- [ ]` open, `- [x] ... - evidence: ...` done.
Status values: NOT_STARTED, IN_PROGRESS, COMPLETE. run_mode values: off, phase, autopilot.

<!-- UI-STATE:BEGIN
run_mode: off
active_phase: none
target_phase: M
branch: ui/prism-brand-transformation
last_updated: 2026-10-02
UI-STATE:END -->

## Baseline

| Field | Value |
| --- | --- |
| Starting branch | `campus/p12-validation-rollout` at `0d1c456` (pushed to origin) |
| Brand source | `studai-prism/StudAI_Prism_Complete_Brand_Pack/StudAI_Prism_Brand_Pack/` (colors.json: Navy #0E255B, Green #03B67A, White, Soft Surface #F6F8FB) |
| Campus baseline gates (phase 12) | server 620/596 pass/0 fail/24 skipped; DB 36; python 64; vitest 226; build PASS; static audit PASS; playwright 571 passed (4 projects) |
| Known facts | Two token systems exist (legacy `--color-*` teal/Fraunces and campus `--prism-*` indigo); gold ribbon logo in `components/ui/PrismLogo.jsx`; brand green fails text contrast on white (2.63:1) so green is fill/mark only, derived darker green for text |

## Decisions log

Experience P0 diagnostic checkpoint (2026-10-02): the separate
[P0 baseline](../experience/BASELINE.md) and
[verification record](../experience/TEST_RESULTS.md) recheck existing repairs
without changing runtime. A real isolated PostgreSQL/HTTP/scorer run produces no
judged strict dialogue evidence; completion removes history used by V3 source
verification. A receipt-write fault fixture exposes repeated engine effects.
These remain explicit product failures, not green product acceptance. Standalone
read-only diagnostics avoid migration/GET initialization and publication side
effects. The A-M historical completion markers are unchanged; overall learner
release remains NO-GO. P0 stops before P1 and supplies no human approval.

Existing-contract V3 recovery/entry (2026-10-02): pending/held reports have
read-only check-again/support/reference actions; failed retry and refresh errors
are visible; sponsored recovery stays in its workspace; denied cached sessions
lose stale interaction controls as UX only. Profile restores the existing adult
declaration workflow from the existing me flag, shared text and authenticated
endpoint; API confirmation must be literal true, unknown state is not defaulted,
and eligibility policy is unchanged. Account resume uses a scoped assignment CTA
or Assessments, not a hardcoded legacy briefing URL. Recovery copy makes no
unsupported active-human/automatic-release/no-scoring assertions. Gates: build
PASS, frontend 360/0, server 607/0 plus 24 DB skips, static PASS, scoped four-project
browser 96/0. Copy assertion/render synchronization fixes preserve the test
requirements. This does not close the full backend/science/security repair or
authorize deployment/flag activation.

Independent V3 presentation repair (2026-10-02): active assessment has one
100dvh frame at all seven widths, independent focusable scroll surfaces, no
empty workspace and a composer outside pane switching. Network timing snapshots
carry a monotonic receipt; cache writes no longer reset the display. Absence
copy in Report V3 is not repeated as an empty level/reason. Gates: build PASS,
frontend 345/0, server 607/0 plus 24 DB skips, static PASS, scoped four-project
browser 84/0. One pre-existing load-sensitive Campus test passed unchanged in
isolation and the full suite with bounded workers. Server timing still uses
the existing 35-minute contract; intro/scoring/evidence/authorization/retention
behavior was not changed. This verified presentation checkpoint is not completion
of the full flow repair, which remains NO-GO.

Flow repair checkpoint (2026-10-02): the UI programme's historical COMPLETE gates
do not mean the full student journey is repaired. [Repair map](./FLOW_REPAIR_MAP.md)
and [release readiness](./FLOW_REPAIR_READINESS.md) record a NO-GO. Entry aliases,
explicit-next priority, dark personal portal recovery and existing-owned history
presentation are repaired; ownership reconciliation, the governed dialogue
evidence writer, candidate-clock/start contract, backend security/privacy,
distributed locking and durable evaluation remain open. No flags, scientific
rules, authorization, historical reports or retention behavior were changed.
No test ceiling was relaxed; no completed repair phase commit was made.
Approved-plan follow-up: V3-only new assessments and unchanged issued history are
confirmed. Runtime contract baseline rechecked (server 77 passed; player/report
frontend 30 passed). Domain-owner packets are prepared but their reviewed
implementation/approval references remain missing; production stays NO-GO.
The PG completion path purges history used by V3 quote verification, so source
retention is an explicit privacy/evidence gate, not an automatic transcript-policy
change.

| Id | Decision |
| --- | --- |
| U1 | RESOLVED in phase B: Inter for display and body (matches the geometric grotesque of the wordmark), Noto Sans Devanagari and Tamil as script companions, IBM Plex Mono for IDs. The pack itself defines no typeface; this is a design decision, change it here if the owner has a brand font. |
| U2 | Derived (non-brand-issued) colours and their measured contrast are in docs/ui/UI_AUDIT.md section 5: green-ink #027A55 for green text, navy text on green fills, chart ordinal ramp #7189BD #3F5C9E #27408A #0E255B, chart green series = green-ink. |
| U3 | Phase A found no slate, indigo, purple or cyan classes left; the real fragmentation is two token systems (legacy teal/cream/Fraunces and campus indigo/Noto Sans). Phase B swaps both token files to one brand system rather than hunting classes. |
| U5 | Phase B kept --color-* and --prism-* as compatibility aliases onto the new brand tokens, so 182 files re-skin without edits; later phases migrate components to the semantic token classes as they are redesigned and the aliases are removed in phase M. |
| U6 | The legacy report header text 'Verified Assessment' was removed with its hand-built logo mark (the official lockup carries the name); report body content is untouched. |
| U7 | Dingbat check marks (U+2713 style) remain in story, research, report and flow text for their own phases; Nav, Briefing and shared components are glyph-free. |
| U8 | Phase C: the personal nav groups Evidence and Shared reports under a labelled group; Profile remains in the account menu (a /profile page exists outside the shell until phase K). |
| U4 | The landing sample score (Critical thinking 74) and dimension weight percentages conflict with the no-fabricated-data law; replaced in phase J with an illustrative, number-free evidence thread. |

## Risks and open questions

- The tagline word "Prove" versus the claims-ceiling tests: decide in phase J (see its prompt).
- Product copy "by StudAI One" is a naming decision for the owner; leave unchanged unless told.
- Local-run caveat: server/.env carries a local-campus block (campus flags on, DATABASE_URL to prism_local) for the demo; Playwright's flags-off server loads it and 6 @critical tests fail unless the block is removed for the run (git-ignored; remove or comment it before every e2e run).
- A pending, unstaged deletion of studai-prism/.github/copilot-instructions.md and untracked brand-pack files, data/ are unrelated to the UI commits; leave them out of phase commits.
- Tooling lesson (phase B): never name a PowerShell helper Rd (alias for Remove-Item); a helper called Rd deleted 70 source files once and they were restored from git. Use Read-Prism and Write-Prism and check git ls-files -d after bulk edits.
- Firefox and WebKit were not run in phase B (fonts load from the CDN and render differently); the full four-project run is part of phase M.
- StoryDimensions.jsx:64 still logs 5 console errors on the landing page (Framer Motion r animation); fixed with the landing redesign in phase J.
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

Status: COMPLETE
Gates: PASS 2026-10-01 @ 66d545b (build, vitest 226, server 620/596/0/24, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] B.01 Copy official SVG lockups, icon, favicons, app icons and social card to public/brand; rebuild manifest.webmanifest (PNG any and maskable) and index.html (theme-color, icons, title, fonts) - evidence: public/brand (17 official files copied unchanged: SVG lockups, icon, mono, favicons, app and maskable icons, social card), public/favicon.ico, manifest.webmanifest (PNG any + maskable, navy theme), index.html (favicons, theme-color #0E255B, one font request, brand title); old gold icons removed; maskable content inside the safe zone (108-404 of 512)
- [x] B.02 Rewrite src/design/tokens.js and tokens.css in lockstep: color.brand/surface/text/border/status/data, evidence-status tokens, type, spacing, radius, elevation, motion, breakpoints, layout widths, sidebar widths, header heights, content widths, focus rings, chart tokens; light and scoped dark semantics - evidence: src/design/tokens.js and tokens.css rewritten in lockstep (32 hex, 0 missing): brand, surface, text, border, status, evidence, data (ordinal ramp + series), dark, type roles, layout, focus, motion, breakpoints; compatibility aliases keep --color-* and --prism-* pages on-brand without per-file edits; designSystem.test 9/9
- [x] B.03 Typography: one primary sans with Latin, Devanagari and Tamil support, tabular numerals, role scale (Display to Code/ID); remove the other font families and inline font-family styles - evidence: Inter (display and body) with Noto Sans Devanagari and Tamil companions and IBM Plex Mono (decision U1); Fraunces, DM Sans, Bricolage, Instrument Serif and JetBrains Mono removed; roles in tokens.js typeRoles and --font-role-*; .font-serif now maps to bold tight-tracked Inter; browser check: body font Inter on 18 of 18 captures
- [x] B.04 Brand logo component on the official assets: full, compact, icon, reversed, mono; minimum sizes; replaces PrismLogo and removes it from the hex allowlist - evidence: src/components/ui/PrismLogo.jsx on the official artwork (lockup, full, icon; color, reverse, black, white), brand minimum sizes enforced in one place, legacy props ignored so the 16 call sites work; reversed logo on the dark room; ScoreReport hand-built mark replaced; src/components/ui/PrismLogo.jsx removed from the hex allow-list
- [x] B.05 Tailwind config on tokens; remove gold, cream and other legacy colour names after migrating their usages; delete dead legacy CSS (shimmer, glow, hero grid) when unused - evidence: tailwind.config.js on brand and prism tokens (gold, cream and legacy aliases removed); 11 gold files migrated (text-brand-green-ink, bg-brand-green with navy text, border-brand-green); index.css legacy vars, shimmer, glow, hero-grid, noise removed; 63 rgb() colour literals re-pointed (ScoreReport keeps literals on purpose for html2canvas); 0 gold, shimmer or old-teal references left
- [x] B.06 Primitives on tokens: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Tabs, SegmentedControl, Badge, StatusBadge, Card, Panel, Metric, Dialog, Drawer, Tooltip, Popover, Dropdown, Toast - evidence: audited: components/ui primitives already read --prism-* tokens, so they follow the brand through the token layer (verified by the 286-test browser run with axe sweeps); StatusChip and Badge cover status; no new Metric or Panel primitive added because no repetition justifies one yet
- [x] B.07 Standard PageSkeleton, CardSkeleton, TableSkeleton, InlineSpinner, FullScreenLoading, EmptyState, ErrorState; replace every alert() - evidence: src/components/ui/Spinner.jsx (InlineSpinner, FullScreenLoading, "Preparing your workspace") and Skeleton.jsx (PageSkeleton, CardSkeleton, TableSkeleton); ScoreReport alert() x3 replaced by an inline status banner; 0 alert() calls left in src
- [x] B.08 Icon rules applied: lucide only, no emoji UI, aria-label on icon buttons - evidence: Nav dropdown emoji (9) replaced by lucide icons, close glyphs and the dice emoji in Nav and Briefing replaced by lucide X, Check and Dices; close buttons already carried aria-label. Remaining typographic check-mark glyphs in story, research, report and flow copy are scheduled with their pages (J, K, F, E); the full icon-button aria-label audit runs in phase L
- [x] B.09 Initial /design-system route sections for logo, colours, type, primitives (completed in phase L) - evidence: src/pages/DesignSystem.jsx: Brand section (all logo variants on light, navy, monochrome), nested-token palette, Inter type labels, new principle text; primitives via CampusShowcase; renders with 0 console errors
- [x] B.10 Gates, visual QA, commit - evidence: build PASS; vitest 226/226; server 620 tests, 596 pass, 0 fail, 24 skipped; static audit PASS; playwright chromium + mobile-chromium 286 passed (5.7 min) with the local-campus block removed from server/.env for the run; visual QA of landing, login, app home, design system at 1440 and app home, landing at 390 (audit-results/ui/phase-b, git-ignored); commit on ui/prism-brand-transformation

## Phase C - Unified shell, navigation and workspace context

Status: COMPLETE
Gates: PASS 2026-10-01 @ a51b221 (build, vitest 234, server 620/596/0/24, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] C.01 AppShell (Sidebar, Topbar, ContextHeader, Breadcrumb, MainContent, ContextActions) shared by personal, campus and internal surfaces - evidence: src/layouts/AppShell.jsx (collapsible sidebar from the layout tokens, content width token, skip link, route focus) with SideNav, TopBar and the new WorkspaceContext; shared by personal, campus and sponsored views. ContextHeader, breadcrumbs and page actions stay page-level (PageHeader and Breadcrumbs) rather than shell slots
- [x] C.02 Workspace switcher: Personal and sponsored campus, active context, privacy boundary text, never implies institutional ownership - evidence: src/features/workspaces/components/WorkspaceContext.jsx and WorkspaceSwitcher.jsx: one control that names the workspace and who can see it (Personal, Private to you / Visible to <org>), options explain the boundary ("Private to you. Your institution never sees it."); replaces three redundant indicators; PageHeader shows its badge only outside the personal workspace; scope wording in workspacePaths.scopeText
- [x] C.03 Personal navigation: Home, Assessments, Capabilities, Development, Growth, Explore, Profile; secondary Shared reports, Credentials, Settings, Privacy - evidence: src/components/navigation/navConfig.js: Home, Assessments, Capabilities, Development, Growth, Explore, then a labelled Evidence and sharing group (Evidence, Shared reports), footer Help and Settings; Profile stays in the account menu until phase K merges it into Settings; Credentials and Privacy have no personal route yet and were not invented
- [x] C.04 Campus navigation by permission: Overview, Students, Cohorts, Assessments, Capabilities, Development, Interventions, Growth, Reports, Settings - evidence: campus nav grouped into People, Assess and develop, Insight, Administration (permissions unchanged); alias routes /campus/:org/interventions, /growth and /capabilities redirect to development, reassessments and analytics; the Capabilities, Interventions and Growth labels move with the campus page redesign in phase I
- [x] C.05 Responsive navigation: persistent sidebar, compact tablet, drawer or bottom nav on mobile, collapsed icon-only sidebar - evidence: persistent sidebar from 768 px, collapsible to icons (remembered in localStorage, aria-expanded, titles and accessible names kept), mobile bottom bar Home, Assess, Capabilities, Develop, More, drawer for the rest; icon mark below sm, lockup from sm; checked at 1440, 1024, 768, 390 with 0 overflow
- [x] C.06 Route hierarchy and redirects for legacy public URLs; standalone pages folded into the shell where the matrix says MERGE - evidence: AppRouter.jsx: /app/missions/:missionId alias to the development mission URL; campus aliases above; every existing URL unchanged. Folding of the legacy funnel pages (Briefing, Profile, report, mission) into the shell is scheduled with their phases (E, F, G, K) where the matrix says MERGE
- [x] C.07 Brand presence rules in shell, auth and reports; no tagline under nav logos - evidence: TopBar: no-tagline lockup (160 px minimum enforced) and icon mark, decorative images inside a labelled Prism home link; no tagline in navigation
- [x] C.08 Tests (guards, nav by role, switcher keyboard) and gates, commit - evidence: src/layouts/shellNavigation.test.jsx (8 new tests: IA, groups, collapse and persistence, single context control, mission alias); selector updates in layouts and router tests and campus-shell and campus-join specs; build PASS; vitest 234/234; server 620/596/0/24; static audit PASS; playwright chromium + mobile-chromium 286 passed (6.1 min); visual QA at 1440, collapsed, 1024, 768, 390 and the More drawer (audit-results/ui/phase-c)

## Phase D - Personal home, assessments list and capabilities

Status: COMPLETE
Gates: PASS 2026-10-01 @ 8d62e16 (build, vitest 241, server 620/596/0, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] D.01 Home answers where am I, what do we know, what next: workspace, snapshot, next assessment, strengths, priority, recommended mission, valid growth only, recent evidence, primary action - evidence: HomePage.jsx: primary action, "Strengths so far" (only DEMONSTRATED or STRONG levels, provisional stays labelled, honest empty line), "Where to focus next" (server focus list, max 3, plus a recommended Practice mission only when the plan marks missions available), capability snapshot linking to the detail route, growth line that says "See your growth" only when the API marks it comparable; recent evidence is a link to Evidence (inline evidence items arrive with the phase F evidence components). Tests: studentPages.test.jsx (2 new Home tests)
- [x] D.02 Assessments list and detail with Active, Upcoming, Completed and scope labels - evidence: AssessmentDetailPage.jsx (scope, status, progress timeline, what it looks at, what it does not measure, one next step, under-review notice) at /app/assessments/:id and /app/campus/:org/assignments/:id; card titles link to it; list tabs and scope labels unchanged. Tests: studentPages.test.jsx (2 new)
- [x] D.03 Capabilities list and detail: definition, demonstrated level, evidence sufficiency, latest observations, growth direction, development actions, reassessment eligibility - evidence: CapabilityDetailPage.jsx at /app/capabilities/:capabilityId (observations, evidence source, earlier observations, growth direction that never shows change without a comparable pair, linked practice missions from the plan, reassessment line from the growth data); list page H1 now "Capabilities" to match the nav. Tests: studentPages.test.jsx (3 new detail tests)
- [x] D.04 CapabilityCard and related primitives with Insufficient evidence as a first-class state - evidence: components/capability/CapabilityCard.jsx (no level shown without evidence, reasons listed, data-described flag); campus-student e2e selector moved to capability-card
- [x] D.05 Loading, empty, partial, error, unauthorized and offline states on every page - evidence: new pages use queryStateView and keep the H1 through loading, error and not-available; Home treats plan and growth as optional so their failure never blocks it; existing h1-sweep test now covers Capabilities; unknown capability and unknown assignment have explicit tests
- [x] D.06 Tests and gates, visual QA at 4 widths, commit - evidence: studentPages.test.jsx 40 tests; screenshots audit-results/ui/phase-d (home, capabilities, capability detail at 1440, 1024, 768, 390: no horizontal overflow, no console errors; assessment detail not captured because the local demo user has no assignments, covered by unit tests); playwright needed PRISM_E2E_DATABASE_URL pointing at a throwaway database (prism_e2e) for the campus project

## Phase E - Assessment funnel, simulation workspace and artifacts

Status: COMPLETE
Gates: PASS 2026-10-01 @ 0b04a08 (build, vitest 247, server 620/596/0, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] E.01 Measurement-sensitive inventory documented in the state file - evidence: section "E.01 Measurement-sensitive inventory" below (stimulus, leak risks, turn order, artifacts, timing, probes, candidate actions, documented-not-implemented ideas)
- [x] E.02 Invitation, briefing (role, duration, can-do, observed, not assessed, accommodations, integrity, privacy, technical readiness), consent, identity and integrity screens - evidence: FunnelSteps.jsx (Briefing, Device and consent, Assessment, Report; text-labelled for assistive technology, no progress figures) on BriefingPage and SystemCheckPage; the ten briefing sections, sponsored disclosure and consent already complete from the campus programme. The legacy proctored identity and room screens are unchanged and move to tokens in phase M
- [x] E.03 Workspace desktop layout: context bar, conversation, artifact tabs and tools, composer; reconnecting and submission states; focus management and keyboard navigation - evidence: AssessmentShell fill mode (viewport-height frame from 768 px, panes scroll inside, composer pinned); AssessmentHeader brand mark and role line; sticky ResponseComposer; existing reconnect banner, save status, focus return and tab arrow keys retained (player.test.jsx). Screenshots: audit-results/ui/phase-e/player-*.png
- [x] E.04 Purpose-built responsive workspace mode (not stacked panes) - evidence: from 1024 px two panes side by side; below that a Conversation or Workspace switch (not stacked); the Workspace choice reads "(needs attention)" when a work-material save failed; at 390 px the composer stays in view while the page scrolls. Test: player.test.jsx small-screen attention test
- [x] E.05 Common artifact shell, toolbar, tabs, tables, editable cells, selection, save and focus states, empty states; every artifact component brought into it - evidence: components/artifacts/ArtifactShell.jsx (ArtifactShell, ArtifactFilterGroup, ArtifactTable, ArtifactSaveStatus); AnalyticsDashboard, CustomerTicketLog and BudgetModeler now use it with identical behaviour and copy. Only these three artifact types exist in the server contract; any other type renders the honest "cannot be displayed" state, so no further artifact components were invented. Test: player.test.jsx shared frame test
- [x] E.06 Submission, evaluation and completion states with calm copy and what happens next - evidence: SubmissionProgress.jsx (Answers submitted, Review, Report; each state in words) above the existing completion, review and review-did-not-finish messages; no outcome implied. Tests: player.test.jsx (completed, review in progress, review did not finish)
- [x] E.07 Assessment e2e and axe checks pass; no hints or rubric text introduced - evidence: playwright chromium + mobile-chromium 286 passed including the campus workspace, keyboard and axe specs; header test asserts no percentage, score or parts-remaining text
- [x] E.08 Gates, visual QA, commit - evidence: build, vitest 247, server 620/596/0, static audit, playwright 286; screenshots at 1440, 1024, 768 and 390 for briefing, system check and player (live start needs AWS Bedrock credentials that have expired in this environment, so the player was rendered from a synthetic session contract in a throwaway script that is not committed)

### E.01 Measurement-sensitive inventory (recorded before any edit)

* Stimulus text: scenario title, context, role, participants, every message and the work-material data come from the server session contract (SessionContractSchema); the client never writes or reorders stimulus. Presentation changes touch layout and chrome only.
* Rubric and score leak risks: the player shows no score, band, percentage, rubric, hint or evaluation while IN_PROGRESS. Required-exchange counts appear only in the finish dialog. The header gains the brand mark and the scenario role line (already part of the briefing stimulus); nothing else.
* Turn order: the transcript only grows with turns the server returned; an unsent answer is a labelled pending bubble, never a turn; same client event id on every retry. Unchanged.
* Artifact behaviour: work materials render only their own data; saves are versioned (If-Match) with server-wins conflicts and a recoverable draft; "Saved" appears only after server confirmation; filters and ticket marks are local reading aids. The shared frame changes markup and styling only; behaviour and copy are identical.
* Timing: server-authoritative clock, role=timer, polite warnings at 10, 5 and 1 minutes, time-up state. Unchanged.
* Probes: all probes and follow-ups are server turns; the client contains none. Unchanged.
* Candidate actions: send, retry, edit a refused answer, edit and save work materials, resolve a conflict, view the briefing, finish (early finish is explicit). Unchanged; the mobile Workspace choice now says "(needs attention)" when a work-material save failed, which only reports state the candidate already sees.
* Documented, NOT implemented (could change measurement conditions): a progress bar or "parts remaining" in the header (would steer effort allocation); artifact completeness cues; per-turn feedback or typing hints; colour-coding the timer; auto-focusing work materials; any change to the 30 minute framing on the legacy briefing; the legacy character picker tilt and shake effects (kept, restyle deferred).
* Out of scope here: the legacy proctored room flow (Briefing, VerifyIdentity, LinkPhone, PhoneProctor, RoomScan, Assessment.jsx) keeps its behaviour; it already renders through the brand compatibility aliases and moves to tokens in phase M with the alias removal.

## Phase F - Report V3 and the Evidence UI system

Status: COMPLETE
Gates: PASS 2026-10-01 @ 1b32c4e (build, vitest 260, server 620/596/0, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] F.01 Evidence components: EvidenceCard, EvidenceThread, EvidenceSource, EvidenceStatus, EvidenceQuote, EvidenceCoverage, EvidenceTimeline, EvidenceDetailDrawer - evidence: src/components/evidence/ (8 new files). EvidenceThread draws the chain action, observed behaviour, capability, described behaviour at the level and leaves out any step with no value; EvidenceQuote renders nothing without a verified quote; EvidenceStatus keeps practice dashed and without sufficiency; EvidenceTracePanel is now a thin wrapper over EvidenceCard so existing imports and the data-kind contract hold. The legacy ui/EvidenceThread (claim to source line used by legacy pages) stays until phase L. Tests: components/evidence/evidenceSystem.test.jsx (10)
- [x] F.02 Report V3 as Summary, Evidence, Development and Methodology tabs with hero, capability cards, strengths, priorities, highlights, missions, growth, methodology - evidence: ReportView.jsx: hero gains a "Level names are provisional" badge from the methodology status; Summary opens with "At a glance" (coverage in words and markers, strengths only for DEMONSTRATED or STRONG, focus list, up to two evidence highlights for described capabilities, growth line that never promises change); missions stay the honest "not available yet" on the Development tab; Evidence tab uses EvidenceCard. Tests: reports.test.jsx (3 new)
- [x] F.03 Evidence UI reused on capability pages and growth views - evidence: CapabilityDetailPage "Evidence over time" (EvidenceTimeline from the capability history, no level for an assessment without enough evidence); CapabilitiesPage EvidenceCoverage; ObservedBehaviorCard uses EvidenceQuote; GrowthPage compared-assessment lines use EvidenceSource. Tests: studentPages.test.jsx detail test, growth.test.jsx unchanged and green
- [x] F.04 Methodology and psychometric detail in drawers and expandables - evidence: EvidenceDetailDrawer (how an item was reviewed, claim status, source) opened from each evidence card; Methodology tab keeps report version, evidence rules version and assessment form inside a closed "Technical details" disclosure. No SEM, interval or percentile is shown anywhere because none is supplied. Test: reports.test.jsx
- [x] F.05 Share and credential controls, shared report page, employee view where it exists - evidence: share dialog, active shares with revoke, PDF download and the public shared page unchanged and green; summary-only shares show no highlights, priorities or owner links (new test). Credential verification (Verify.jsx) and the legacy employee report (EmployeeReportV2) are phase K and L surfaces and were not touched
- [x] F.06 Tests (honest states, every conclusion has evidence or is marked) and gates, commit - evidence: vitest 260, server 620/596/0, static audit, playwright 286; screenshots audit-results/ui/phase-f (report summary and capability timeline at 1440, 1024, 768 and 390, evidence tab at 1440 and 390, details drawer, methodology with the disclosure open; no horizontal overflow, no console errors). The report was rendered from a synthetic contract in a throwaway script that is not committed

## Phase G - Development missions and growth

Status: COMPLETE
Gates: PASS 2026-10-01 @ 65a40c1 (build, vitest 264, server 620/596/0, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] G.01 Mission list and detail: objective, target behaviour, why it matters, instructions, optional hints, artifact workspace, reflection, feedback, retry, next mission - evidence: the mission player already carried situation, task, instructions, constraints, what will be checked, artifact editors, optional hints drawer, autosave, criterion feedback and retry; MissionNextSteps.jsx adds what was observed, a reflection prompt and the next mission (the first one not yet completed). No "why it matters" text and no reflection input exist in the mission contract, so none was invented; both are recorded as backend gaps in the final report. Tests: development.test.jsx
- [x] G.02 Clear Practice Mission / Development Mission labelling distinct from formal assessment - evidence: components/missions/PracticeLabel.jsx (dashed pill on mission cards; dashed band "Practice mission - practice, not a formal assessment" at the top of the player); formal evidence stays solid and labelled "Formal assessment". Tests: development.test.jsx (dashed class, band wording)
- [x] G.03 Growth page with comparability honesty, baseline to reassessment timeline, non-comparable warning - evidence: GrowthPage shows a visible partial-tone warning when a later assessment exists but cannot be compared (a plain empty state when there is nothing to compare); GrowthTimeline marks the baseline and reassessment points with a larger ring and data-role; change appears only for an approved comparable pair, as before. Tests: growth.test.jsx (2 new)
- [x] G.04 Reassessment entry points - evidence: features/growth/components/ReassessmentEntry.jsx (open now with a link to assessments, or scheduled with its date; the not-comparable note when the pair is not approved) on the Development page and after mission feedback; nothing renders when the server lists no reassessment. Tests: development.test.jsx (2 new)
- [x] G.05 Calm completion states without confetti - evidence: completion is observed, reflect, next action in plain text; no points, levels, streaks, badges, exclamation marks or motion; asserted in development.test.jsx
- [x] G.06 Tests and gates, commit - evidence: vitest 264, server 620/596/0, static audit, playwright 286; screenshots audit-results/ui/phase-g (mission completion at 1440, 1024, 768 and 390; development and growth at 1440 and 390; no overflow, no console errors) rendered from a synthetic contract in a throwaway script that is not committed

## Phase H - Explore and role discovery

Status: COMPLETE
Gates: PASS 2026-10-01 @ edf1ab3 (build, vitest 265, server 620/596/0 including claimsCeiling and campusCopyCeiling, static audit, playwright chromium + mobile-chromium 286)
Commit: this commit (ui/prism-brand-transformation)

- [x] H.01 Explore page: relevant role families, why it appeared, supporting evidence, what remains unknown, required capabilities, try a mission, learn more - evidence: RoleExplorationCard.jsx now shows two separate blocks (From what you told us, dashed; From your assessments, solid) each with its own honest empty line, what remains unknown, the server next step (a link to assessments for FORMAL_ASSESSMENT) and a generic "Practise in Development" link that says it is not specific to the role. The exploration contract carries no required-capability or learn-more data, so those two were not invented (recorded as backend gaps). Tests: studentPages.test.jsx (new Explore test)
- [x] H.02 Interest input asked or omitted, never defaulted; interest visibly separate from demonstrated capability - evidence: ExplorePage opens with "Interest and capability are different things" and "Nothing is assumed about your interests: roles appear only after you choose"; panels labelled Self-reported and Formal evidence; no checkbox is preselected and no request is sent until a choice is made (asserted). Skipping interests entirely is not offered because the server evaluates roles from chosen interests
- [x] H.03 Copy review against the claims ceiling - evidence: the Explore render is asserted free of match, fit, best, perfect, ideal, suited, "should become", "you will" and any percentage; server claimsCeiling and campusCopyCeiling tests pass
- [x] H.04 Tests and gates, commit - evidence: vitest 265, server 620/596/0, static audit, playwright 286; screenshots audit-results/ui/phase-h (empty and results at 1440, 1024, 768, 390; no overflow, no console errors) from a synthetic response in a throwaway script that is not committed

## Phase I - Campus experience

Status: COMPLETE
Gates: PASS 2026-10-01 @ 56fa904 (build, vitest 275, server 620/596/0, static audit, playwright chromium + mobile-chromium 285 passed and 1 flaky that passed on retry: accessibility baseline /research/science on mobile)
Commit: this commit (ui/prism-brand-transformation)

- [x] I.01 Campus overview as executive intelligence with actionable insights - evidence: CampusOverviewPage names the largest development opportunity from the server top-needs rule ("X is the largest development opportunity among assessed students") with "Create development intervention", shown only to someone with interventions.write and only when the segment is not hidden; the Development page opens the builder prefilled with that capability (and cohort). Participation counts, capability distribution and top needs were already present. Tests: campusExperience.test.jsx (2)
- [x] I.02 Students directory with filters and privacy labelling (Institution-sponsored, Personal-private, Shared by student) - evidence: DataBoundaryKey.jsx on the Students list and the student detail page (three labelled kinds, personal-private dashed and "Never shown here"); filters (search, cohort, enrolment, sponsored assessment), sponsored-only columns and the "Shared by the student" panel were already present; access stays server-enforced. Tests: campusExperience.test.jsx
- [x] I.03 Cohorts and cohort detail sections - evidence: CampusCohortDetailPage is now tabbed: Overview, Students, Capability distribution, Development needs, Interventions, Assessment cycles and growth, Reports (CohortInsights.jsx); analytic tabs need the analytics flag and analytics.read, interventions and cycles are filtered to the cohort, a hidden segment shows the standard sentence, no student ranking. Tests: campusExperience.test.jsx (3)
- [x] I.04 Interventions with the baseline to development to reassessment to change loop - evidence: InterventionLoop.jsx (Baseline, Development with started of members, Reassessment planned or not with a permitted link, Change "Shown only after a comparable reassessment") in the intervention detail and the cohort Interventions tab; it never states a result. Tests: campusExperience.test.jsx (2)
- [x] I.05 Reusable Prism chart wrappers (legend, tooltip, labels, empty and insufficient-data states, table equivalents) - evidence: components/charts/ChartFrame.jsx (title, plain-words description, "Based on N students", empty and too-few-students states, table equivalent slot) now frames the capability distribution chart; the existing Recharts bars keep their legend, tooltip, zero-based count axes, aria-hidden duplicate and Show as table equivalent. The outcome chart keeps its own frame because its data states are already explicit; folding it in is a phase L tidy. Tests: campusExperience.test.jsx, analytics.test.jsx unchanged and green
- [x] I.06 Assessments, assignments, reports, settings, billing and integrations surfaces on the new system - evidence: these pages already render through CampusPage, the token system and the standard states; the Playwright campus journeys, shell, keyboard and axe specs pass; no copy or behaviour change was needed
- [x] I.07 Student-side sponsored views and workspace privacy cues - evidence: unchanged and green (sponsored scope labels, campus privacy notes on Home, Assessments and Development, acknowledgement before a sponsored assessment); phase D and E added the scope labels on the assessment detail and funnel
- [x] I.08 Tests (including campus journeys) and gates, commit - evidence: vitest 275, server 620/596/0 (claimsCeiling and campusCopyCeiling included), static audit, playwright 285 passed + 1 flaky retry incl. campus journeys; screenshots audit-results/ui/phase-i (overview insight at 4 widths, students, cohort sections, capability distribution, interventions loop, intervention modal; no overflow, no console errors; analytics and cohort data intercepted in a throwaway script that is not committed because the local demo database has no assessments or cohorts)

## Phase J - Marketing site, pricing and authentication

Status: COMPLETE
Gates: PASS 2026-10-01 @ 3eeb877 (build, vitest 286, server 620/596/0 incl. claimsCeiling and campusCopyCeiling, static audit, playwright chromium + mobile-chromium 286 passed; e2e database prism_e2e on the local PostgreSQL service because the usual instance on port 55433 was down)
Commit: this commit (ui/prism-brand-transformation)

- [x] J.01 Landing narrative sections on the new system, restrained motion - evidence: HeroThesis.jsx rebuilt on brand tokens with the positioning line "Work-readiness and capability intelligence" and two doors (Take the assessment, Bring Prism to your institution); new StoryLoop.jsx act "Measure. Improve. Prove." (practice labelled as practice, growth only after a comparable reassessment, campus strip); StoryPaths copy; StoryDimensions animated SVG radius replaced by a plain circle, which removes the 5 console errors; motion limited to one-shot reveals that honour reduced motion. Tests: publicSite.test.jsx (Landing page, 4)
- [x] J.02 Pricing: personal and campus positioning, conflicting wording replaced, no new prices - evidence: Pricing.jsx and PricingCard.jsx (Personal with the existing 499 rupee price, Campus "Custom", the "Most popular" badge, the 500-student cap and "Employer-facing cohort reports" removed because nothing backs them); FAQ "What does a Prism report show?" and "What does my university see?"; Mission.jsx and AboutStudAI.jsx lose "skill verification", "no human bias" and "A verified score". Tests: publicSite.test.jsx (exactly one rupee amount on the page, plan names, campus features)
- [x] J.03 Login, registration, invite redemption, password flows - evidence: Auth.jsx on the shared primitives (full wordmark, Input, Select, Checkbox, Button, notices, no spring animation); a campus invitation shows "<Institution> has invited you to Prism" from the public preview (role, email hint, closed state), tells the person to sign in if they already have an account, and the Login and Register tabs and links keep ?next so an invitation is never dropped; InviteRedeem.jsx on the primitives with the one-account note. Password flows: the product has no self-service password reset (admins issue temporary passwords), so none was drawn; this is a backend gap. Tests: publicSite.test.jsx (Sign in and registration 5, Assessment invitation 1)
- [x] J.04 Footer, public layouts, contact - evidence: Footer.jsx on brand tokens with the full wordmark (the tagline lives in the artwork, so it is not repeated as text under the logo), in-app links through the router, "For universities" added, pilot notice kept; PageLayout.jsx tokens. Contact page content unchanged. Tests: publicSite.test.jsx (footer)
- [x] J.05 Tests and gates, visual QA, commit - evidence: tagline decision: "Measure. Improve. Prove." appears as the StoryLoop heading and inside the full wordmark; claimsCeiling stays green (the test file itself had to avoid spelling the banned words). Screenshots audit-results/ui/phase-j (landing at 4 widths, register, login, login with invitation, assessment invitation; no horizontal overflow, 0 console errors)

## Phase K - Admin, research, legal and profile or settings

Status: COMPLETE
Gates: PASS 2026-10-01 @ 37b37bf (build, vitest 303, server 620/596/0 incl. claimsCeiling, campusCopyCeiling and designSystem, static audit, playwright chromium + mobile-chromium 300 passed; e2e database prism_e2e on the local PostgreSQL service)
Commit: this commit (ui/prism-brand-transformation)

- [x] K.01 Profile and settings consolidated - evidence: SettingsPage.jsx now has Profile (edit in place), Account (email, resume banner when a licence has an assessment in progress), Workspaces (each with who can see it, switch), Privacy, Sharing, Assessment preferences (accommodations are arranged before the start and never change judging), Accessibility, Security (change password, delete data behind a typed DELETE), with an index of anchors; /profile redirects to /app/settings#profile; the legacy Profile.jsx (marketing layout, percent history and band labels) is deleted and the account menu points at settings. No internal fields are shown. Tests: phaseK.test.jsx (Settings 6, old profile address 1)
- [x] K.02 Admin console on the design system - evidence: admin/ui.jsx and AdminShell.jsx moved off the legacy aliases to brand tokens; Pill carries a text label and a shape marker; DataTable is compact with a sticky header, column scopes and an optional caption; all 45 window.prompt and window.confirm calls in 16 admin pages are now in-app dialogs (askText, askConfirm in ui.jsx: labelled, focus trapped, Esc cancels, cancel returns null so audited actions do not run). The other admin pages still use the legacy aliases and are migrated in phase M with the alias removal. Not visually checked: the admin pages need an admin session and a running API, which were not available locally, so they are listed for human visual approval. Tests: phaseK.test.jsx (Admin building blocks 5)
- [x] K.03 Research and science pages - evidence: components/DocumentLayout.jsx (one readable column, On this page index, MethodCard, StudyStatus with text and marker); ScienceBehindPrism, ValidityStudy and AIEvaluation rebuilt on it; the scoring methodology lists all four preregistered studies as "Preregistered, not yet run" (the adversarial one reads the live registry); removed an unattributable quotation ("StudAI One Research Team"), the claim that the score is combined into one Prism Score (the page itself says no composite is issued in the pilot) and the band descriptions that promised job readiness ("Ready for most roles", "Stands out in competitive hiring"), replaced by a reading guide that says it is not a prediction and repeats the not-sole-basis policy. Tests: phaseK.test.jsx (Research pages 3)
- [x] K.04 Legal pages - evidence: LegalPages.jsx text unchanged; LegalShell now uses DocumentLayout with an index built from the headings, anchors on every heading, "Effective 30 July 2026" under the title, no marketing furniture. Tests: phaseK.test.jsx (Documents 2)
- [x] K.05 Tests and gates, commit - evidence: vitest 303; accessibility.spec.js baseline now also covers /login, /invite, /research/validity, /research/ai-evaluation, /refund-policy, /security and /contact (300 playwright passes); designSystem.test.js caught a numeric character entity that reads as a hex colour in AIEvaluation.jsx and it was replaced with an escape. Screenshots audit-results/ui/phase-k (privacy, terms, science, validity, ai-evaluation, settings at 1440, 1024, 768, 390 where listed: no horizontal overflow, 0 console errors, index present on every document)

## Phase L - Responsive, accessibility and polish

Status: COMPLETE
Gates: PASS 2026-10-01 @ 1c42249 (build, vitest 308, server 620/596/0/24, static audit, playwright chromium + mobile-chromium 306 passed and 6 skipped: the new matrix spec runs on the chromium project only)
Commit: this commit (ui/prism-brand-transformation)

- [x] L.01 Width matrix 1440, 1280, 1024, 768, 430, 390, 360 on every route family with no horizontal overflow - evidence: tests/e2e/ui-matrix.spec.js sweeps 13 public routes and 9 personal app routes at all seven widths plus a 320 px reflow check and a larger-text check at 390; the campus administration and student routes keep their own sweep (campus-a11y-sweep.spec.js). Before: no overflow on those 22 routes. Found by the visual check instead: /design-system overflowed at 390 (the evidence thread squeezed its source column off screen, and a long unbroken token escaped a card). After: EvidenceThread stacks under 520 px and its columns can shrink, Card and Panel wrap unbroken text; design-system has no overflow at 1440, 1024, 768 and 390
- [x] L.02 Axe across all routes, keyboard walkthroughs, focus traps, announcements, contrast, touch targets, zoom and reflow - evidence: axe now runs WCAG 2.0 to 2.2 A and AA (including target size) and fails on serious as well as critical (accessibility.spec.js was critical only and now covers 12 routes). Before: 10 of 13 public routes had serious findings (color-contrast on the Get Assessed button, the hero sample and the landing conversation sample; aria-hidden-focus on the closed mobile menu on 10 routes; scrollable-region-focusable on 2 regions); 1 landing button and 3 Explore inputs were under 24 px. After: 0 findings on all 22 routes, 0 undersized controls. Root causes fixed, no rule relaxed: call-to-action now navy text on the brand green fill (it was navy on dark green), the closed mobile menu is visibility hidden so nothing in it can take focus, Escape closes it, scrollable tables and rails are named focusable regions, checkboxes and radios are 24 px, the hero and landing samples no longer fade text in and out (contrast is measured at rest). Keyboard walkthrough of all 9 personal app routes (skip link first, visible focus) and the settings dialog (focus trapped, Escape closes, focus returns) pass
- [x] L.03 Reduced-motion audit - evidence: with reduced motion requested, none of the 22 routes keeps an infinite animation running (spec test); the tokens already collapse every duration. Removed decorative motion: the hero scroll cue bounce (phase J), hero sample opacity fades, the conversation sample dimming on the landing story. Remaining motion is state only (loading spinners, skeleton pulse, the assessment voice bar while recording) and is covered by the global collapse
- [x] L.04 Performance - evidence: routes are lazy, charts load behind Suspense, the PDF libraries and the face model are dynamic chunks, fonts are non-blocking with preconnect, logos are SVG with fixed dimensions and one or two load per page. Bundle before and after this phase is unchanged: entry 376.64 kB (112.70 gzip) to 376.78 kB (112.81), charts 374.16 kB, landing 53.55 kB; the 638.61 kB face model chunk loads only in proctored assessment. No dependency added. Further splitting of the entry chunk is left to phase M if the numbers justify it
- [x] L.05 Complete /design-system - evidence: pages/DesignSystem.jsx gains "Capability, evidence, mission, state and chart components" (features/designSystem/ProductShowcase.jsx): level and sufficiency badges, capability cards, formal and practice evidence, observed behaviour, mission and practice labels, insufficient, expired and partial states, a chart frame with its table equivalent, empty and too-few states, sponsored and consent surfaces, each also in dark, a 390 px column, Tamil, Devanagari, long text with an unbroken token, and keyboard focus. Logo variants, palette, type, space, radius, elevation, evidence thread, primitives and states were already there. Tests: phaseL.test.jsx (5)
- [x] L.06 Gates and commit - evidence: ui-matrix.spec.js (6 tests) green; screenshots audit-results/ui/phase-l (design-system at 1440, 1024, 768, 390: no overflow, 0 console errors, 14 sections, 7 capability cards); mobile menu measured open (visible, 8 controls) and closed by Escape (hidden). The admin console and the assessment player were not swept for width because they need an admin session and a live AI model; they are listed for human visual approval

## Phase M - Testing, cleanup and production validation

Status: COMPLETE
Gates: PASS 2026-10-01 @ 0412e67 (build, vitest 308, server 623/599/0/24 incl. the three new ratchets, static audit, playwright all four projects 602 passed, 4 flaky that passed on retry (firefox: campus analytics, marketing reference simulation, PRISM-E2E-28; webkit: campus development V2), 18 skipped = the chromium-only width matrix on the other three projects, 0 failed)
Commit: this commit (ui/prism-brand-transformation)

- [x] M.01 Repository search - evidence: gold (one comment, reworded), amber (6 stock palette status classes in the phone link, room scan and identity pages, moved to the status tokens together with red and green and 29 plain white fills), indigo, purple, slate, emerald, PRISM NEXT, Verified Prism Score and the other banned phrases (none left), gradients (the certificate header gradient and a tinted panel replaced by solid brand tokens; the only gradients left are the character avatar illustrations in lib/characters.jsx and their use in the briefing), raw hex (only the token files, the grandfathered avatar artwork file, and the theme-colour meta in index.html), old logo and placeholder (none; official artwork only), emoji (one comment emoji removed; the check mark in "valid credential" and "Strengths identified" is a text marker beside its label and stays). The legacy --color-* aliases are removed: 1,714 references in 60 files moved to --prism-*, --brand-* and --status-* (a new --prism-signal token carries green text: green-ink on light, brand green on dark; .room-dark is now expressed in the same tokens); a before and after screenshot comparison of 36 pages (public and personal app routes at 1440 and 390) found no difference above 0.2 percent. --prism-* stays: it is the application token layer that Tailwind and every primitive use. Ratchets added to server/test/designSystem.test.js: no --color-* anywhere, no stock Tailwind palette colours, no gradients outside the avatar artwork
- [x] M.02 Dead code - evidence: removed three unreferenced files (components/ui/Spinner.jsx, features/shared/NotYetAvailablePage.jsx, hooks/useScrollDirection.js) and nine unused imports; legacy screens were kept where a route or a test still reaches them (ScoreReport, Assessment, Briefing, Payment and the admin pages), and the superseded Profile.jsx went in phase K. Not done: unused exports inside files that are used, because no linter is configured in the repository
- [x] M.03 Full suites - evidence: see Gates. The width and axe matrix (22 routes), the keyboard walkthroughs and the larger-text and reduced-motion checks pass on chromium; the shared journeys pass on firefox, webkit and the mobile project
- [x] M.04 Visual QA at 1440, 1024, 768, 390 - evidence: screenshots under audit-results/ui for every phase (campus, student, report, explore, marketing, auth, legal, research, settings, design-system); this phase re-checked 18 routes at 1440 and 390 against the pre-migration baseline (no difference). Routes still needing human visual approval are listed in the final report
- [x] M.05 Final delivery report - evidence: delivered in the closing message of this run (what changed, architecture, shared components, routes, responsive and accessibility work, removed legacy, tests, blockers and backend gaps, files changed, routes needing human approval, confirmation that scoring and scientific behaviour were not altered)
- [x] M.06 Commit, Status COMPLETE, run_mode off - evidence: this commit

## Acceptance pass - end-to-end UI/UX walk-through before pilot sign-off

Status: COMPLETE
Gates: PASS 2026-10-04 (server 904/878/0, vitest 519 (3 load-induced timeouts pass alone), build, static audit, playwright p10 handover journey 43 passed, p3 real journey 164 passed)
Commit: the commit after 157e743 (ui/prism-brand-transformation)

Method: the campus audit server (flags, draft content and preparation on, throwaway embedded Postgres) was driven in a real browser at 730 and 1440 px as an unassisted learner: register, Home, briefing, system check, scenario intro, timed start, six universal-form stages with board edits, finish, report, moment panel, Practise this, Your Prism, History, Prepare, a practice mission with feedback. Findings were fixed, re-verified live, and pinned with tests.

- [x] Home: one dominant action (Open briefing / Open my report), latest report, recent activity, snapshot with honest "Insufficient evidence" (no red failure, no numbers). Added a "Where to go next" row naming Understand (My Prism), Practise and Prepare in words; Prepare is a link only when PRISM_PREPARATION_V1 is on, otherwise an honest "not yet available" - evidence: src/features/home/pages/HomePage.jsx; test studentPages.test.jsx (Student Home)
- [x] Assessment funnel: briefing -> system check -> consent -> scenario introduction (situation, role, people, "you reply by typing; speech input is not part of this assessment version", timing) -> explicit "Begin timed assessment". FIXED: the system check said "You can speak your answers or type them" for the V3 text-and-board workspace; it now says the microphone is not needed and spoken answers are not part of this version, and the "Test microphone" button is not offered - evidence: src/lib/deviceCheck.js, SystemCheckPage.jsx; test studentPages.test.jsx (device check helpers)
- [x] Assessment frame: header with title, role, server-synchronised timer, saved state, Briefing and Finish is stable; stage list; composer pinned; desktop shows conversation and board as two independently scrolling panes, narrow widths a Conversation/Workspace toggle; board edits show Saving / Not saved yet / All changes saved and "Your edit" vs "Provided" - evidence: live screenshots at 730 and 1440; ConversationPane keeps the reader's place (p3Player.test.jsx)
- [x] Conversation relevance. FIXED three grounding failures found live: (1) "is 24 confirmed… accessibility support or printed materials?" was answered with the priorities fact because "support" was one of its triggers - facts now match by most specific trigger, a compound question gets up to two distinct facts, a shared word never reveals a hidden fact, and the priorities fact lost its "reach/support/goal" triggers; (2) a re-plan that kept Sam in the morning and mentioned the afternoon for someone else got "I cannot take preparation work that afternoon" - the conflict is now grounded in the board (Sam on a Day 1 afternoon task) or an actual assignment sentence; (3) a complete handover with a finished board still got "Please make the ownership and order concrete" - the clarification now fires only when the board is not review-ready, and says what is missing - evidence: factBoundary.js, sessionService.js, universalForm.js; tests factBoundary.test.js (two new cases), universalRun.test.js
- [x] Your Prism / report: plain-language statement first, Capability Map (bands as ordered categories, evidence separately), moments with "your words -> observed behaviour -> capability -> level -> source", immediately usable "Practise this" link into a mission. Not measured capabilities read as neutral insufficiency, never failure. No invented growth; growth stays "only between comparable assessments"
- [x] Practice: labelled practice, never changes formal results, retry, fresh (uncoached) challenge, counterpart reply bound to results. FIXED: the first view showed only the capability family under "Target behaviour"; it now names the behaviours from the catalogue (legacy ids without a label are omitted, never invented). FIXED: "One thing to change next" quoted an arbitrary first sentence as "Your words" against an unrelated criterion; the quote now appears only when the learner's whole reply is one sentence - evidence: development/service.js, MissionPlayerPage.jsx, feedback.js
- [x] Prepare: private to you, never a campus report, bounded rehearsal allowance, no automatic disclosure - evidence: live /app/prepare
- [x] History: formal assessment, report link, mode labels; practice and preparation attempts appear with their own labels (existing tests) - evidence: live /app/assessments?tab=history
- [x] Voice boundary: nothing in the walked surfaces presents speech as available for the universal form; the pilot is explicitly text and board. Spoken input remains a separately reviewed variant (not a completion item of this pass)
- [x] Data boundary: no numeric growth, no red "not measured", formal and practice evidence never blended (practice carries its own label and ledger)

Content-review notes (not changed: stimulus text is protected by the hard laws): Sam's world-change line reads "Change of plan on my side: New: Sam cannot work…" (third person inside Sam's own message). The deterministic test provider labels every observed behaviour "The candidate addressed the opportunity in their own words"; production uses the model's description.
