# Prism UI/UX + Brand Transformation - Programme State

Live checklist for `.github/skills/prism-ui/references/master-spec.md`. Keep the header and the `## Phase` blocks in this exact format. Items: `- [ ]` open, `- [x] ... - evidence: ...` done.
Status values: NOT_STARTED, IN_PROGRESS, COMPLETE. run_mode values: off, phase, autopilot.

<!-- UI-STATE:BEGIN
run_mode: autopilot
active_phase: G
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

