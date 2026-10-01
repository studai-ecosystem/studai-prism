# Prism UI Audit - Phase A (2026-10-01)

Scope: the whole frontend at `campus/p12-validation-rollout` @ `0d1c456` (branch `ui/prism-brand-transformation`). Read-only: no product code changed. Evidence: static counts (`src/`, non-test files, 277 files), the router (`src/app/AppRouter.jsx`), zod contracts in `src/api/*`, and 64 baseline screenshots (16 route families x 1440/1024/768/390, in `audit-results/ui/baseline/`, git-ignored).

## 1. Summary

What the master prompt assumed versus what the code actually is:

| Assumption in the brief | Reality in the repo |
| --- | --- |
| slate-950 "Prism Next" pages, indigo and emerald cards | Not present. 0 files use slate, indigo, violet, purple, cyan, teal or blue Tailwind classes; "PRISM NEXT" and "12-section" copy are already gone (campus Phase 2). |
| Gold accent system | Limited: 11 files, 34 lines (`index.css` legacy vars, shimmer, glow and hero-grid utilities; `PageLayout`; about/research/careers pages) plus the gold ribbon logo (`components/ui/PrismLogo.jsx`) and the old icons in `public/`. |
| Many one-off visual languages | The real fragmentation is TWO token systems running side by side: legacy `--color-*` (teal accent, cream paper, Fraunces serif; 78 files, 1558 lines) and campus `--prism-*` (indigo accent, Noto Sans; 104 files, 630 lines). The shell and campus use indigo; the landing, auth, assessment, report and admin use teal and cream. |
| 12 artifact components | 3 exist (`AnalyticsDashboard`, `BudgetModeler`, `CustomerTicketLog`) plus `ArtifactRenderer` and `ArtifactUnavailable`; nine unreachable fixtures were removed in campus C2.14. No artifact may be invented (scenario freeze). |

Top findings, by impact:

1. **No brand anywhere yet.** The logo is the gold ribbon at 24-34 px (below the brand minimum of 160 px wide) with a serif "PRISM" and "by StudAI One"; manifest and favicon are the old SVGs; `theme-color` is `#16181D`.
2. **Two token systems and two accents** (teal and indigo) mean a student moving from landing to app changes colour language. Because 182 of 277 files already use tokens (78 legacy-only, 104 campus-only, none mixing the two; the other 95 carry no colour), one token change re-skins about two thirds of the code without touching components.
3. **Fonts:** body default is DM Sans in `index.css` and in two inline styles (`Nav`, `PageLayout`); app pages use Noto Sans; headings use Fraunces (`font-serif`, 26 files); a second Google Fonts request loads Instrument Serif, DM Sans, Bricolage Grotesque and JetBrains Mono, of which only DM Sans is used. `ScoreReport.jsx` carries its own embedded stylesheet with a private `--pr*` variable set and hard-coded teal `rgba(14,124,123,...)`.
4. **Fabricated-looking production content:** the landing hero (`HeroThesis.jsx`) shows "Critical thinking - 74" with a quote and a SAMPLE tag; `StoryDimensions.jsx` shows dimension weight percentages. Both conflict with the no-fabricated-data law and the legacy "five skill dimensions" positioning; resolve in phase J (illustrative evidence thread with no score; copy under the claims ceiling).
5. **Layout defect at 1440 on the landing hero:** the evidence-quote column inside the sample card collapses to about 100 px and wraps one word per line; the eyebrow label touches the fixed nav border.
6. **Shell redundancy and focus defect:** the Home header repeats the workspace three times (switcher, "Personal" badge with lock, "Private to you" badge) and again as a badge next to the H1; the programmatic focus ring around the H1 is visible on every page load.
7. **Navigation does not match the target IA:** sidebar is Home, Assessments, My Capabilities, Evidence, Development, Growth, Explore Roles, Sharing, Help, Settings; the mobile bottom bar omits Capabilities (Home, Assess, Develop, Growth, More). Campus nav has 13 items (Overview, Students, Cohorts, Programs, Assessments, Development, Reassessments, Analytics, Reports, Team, Integrations, Billing, Settings).
8. **Campus overview is a wall of eight zero KPI cards** plus two "Data hidden because this segment is too small" panels: honest, but not actionable.
9. **Smaller debt:** 3 `alert()` calls (`ScoreReport.jsx` 456, 460, 472); emoji icons in `Nav.jsx` dropdowns (9) and `Briefing.jsx` ("Surprise me" dice) and arrow/check glyphs in 7 files; 22 files with ad-hoc `animate-spin` spinners; five different Tailwind radius values (`rounded-md/lg/xl/2xl/full`, 3/49/44/35/49 uses); `lib/characters.jsx` (persona avatar artwork, 22 hex values, allow-listed).
10. **One console error source:** 5 errors on `/` at every width, `<circle> attribute r: Expected length, "undefined"`, from the Framer Motion `r` animation in `components/story/StoryDimensions.jsx:64`.

Baseline health: 0 horizontal overflow in 64 captures; 0 HTTP errors; the only console errors are the five above.

## 2. Route inventory and migration matrix

Router: `src/app/AppRouter.jsx` (332 lines, all routes lazy). Guard kinds: P public, RA legacy RequireAuth, AG AuthGuard, WG WorkspaceGuard, F feature flag. Decisions: KEEP, REDESIGN, MERGE, REPLACE, DEPRECATE. "Target" is the phase that restyles it.

### Public, marketing, research, legal

| Route | Component | Guard | Decision | Target | Note |
| --- | --- | --- | --- | --- | --- |
| `/` | LandingPage (Nav, HeroThesis, story/*, Pricing, FAQ, Footer) | P | REDESIGN | J | New narrative; remove sample score and weight percentages |
| `/research/science`, `/research/validity`, `/research/ai-evaluation`, `/research/blog`, `/research/blog/:slug` | research/* | P | REDESIGN | K | Editorial layout; gold usage here |
| `/about`, `/about/mission`, `/about/careers` | about/* | P | REDESIGN | K | Careers has 9 gold usages; "Verified Prism Score" in AboutStudAI |
| `/privacy`, `/terms`, `/refund-policy`, `/security`, `/contact` | LegalPages | P | REDESIGN | K | Documentation layout, ToC, last updated; text unchanged |
| `/design-system` | DesignSystem | admin-token in page | REPLACE | B then L | Rebuilt as the authoritative reference |
| `/verify/:id` | Verify | P | REDESIGN | F | Public credential check; 22 inline font styles |
| `/shared/:token` | SharedReportPage | P | REDESIGN | F | Selective-disclosure view |
| `/invite/:token` | InviteRedeem | P | REDESIGN | J | Institution invite context |
| `/login`, `/register` | Auth | P | REDESIGN | J | One component with a tab; signed-in users are sent to `/payment` (legacy flow, flag-off); with the shell flag on they should land in `/app` |

### Legacy candidate funnel (measurement-sensitive; presentation only)

| Route | Component | Guard | Decision | Target | Note |
| --- | --- | --- | --- | --- | --- |
| `/payment` | Payment | RA | REDESIGN | E | Price display is config-driven; do not change values |
| `/verify-identity`, `/link-phone`, `/room-scan`, `/m/:pairCode` | VerifyIdentity, LinkPhone, RoomScan, PhoneProctor | RA / P | REDESIGN | E | Integrity steps; PhoneProctor is mobile-first |
| `/briefing` | Briefing (646 lines) | RA | MERGE | E | Converge visually with V3 `BriefingPage`; keep until the V3 flag flips |
| `/assessment` | Assessment (1679 lines, dark room) | P | REDESIGN | E | Highest measurement risk; document stimulus, turn order, timing before touching |
| `/score` | ScoreReport (1430 lines, embedded CSS, 3 alert()) | P | REDESIGN | F | Issued legacy artifacts stay immutable: retoken, replace alert(), no content change |
| `/profile` | Profile | RA | MERGE | K | Into Settings |
| `/explore` | ExploreMode | P via LegacyAlias | REPLACE | H | V3 `ExplorePage` exists; alias already routes when the flag is on |
| `/workspace/:sessionId` | AssessmentWorkspace (legacy player) | LegacyAlias | REPLACE | E | V3 player `AssessmentPlayerPage` is the target |
| `/report/:sessionId/v2` | StudentReportV2 | LegacyAlias | REPLACE | F | V3 `StudentReportPage` |
| `/report/:sessionId/employee` | EmployeeReportV2 | P | REDESIGN | F | V3 has no employee view; decide keep-as-is or retire in F |
| `/missions`, `/missions/:missionId` | DevelopmentMission | LegacyAlias | REPLACE | G | V3 `MissionPlayerPage` |
| `/app` (flag off) | ShellHome | F | REPLACE | C | Flag-off fallback stays until the shell flag is permanent |
| `/rater`, `/rater/evidence` | RaterWorkbench, EvidenceRatingPage | P / token | REDESIGN | K | Internal, dense |

### Personal application (`/app/*`, flag `PRISM_APP_SHELL_V3`)

| Route | Component | Decision | Target | Note |
| --- | --- | --- | --- | --- |
| `/app/home` | HomePage | REDESIGN | D | Calm answer to "where am I, what do we know, what next" |
| `/app/assessments` (+ `/:assignmentId/briefing`, `/system-check`) | AssessmentsPage, BriefingPage, SystemCheckPage | REDESIGN | D, E | |
| `/app/capabilities` | CapabilitiesPage | REDESIGN | D | Add detail route (section 7) |
| `/app/evidence` | EvidencePage | REDESIGN | F | Becomes the evidence-system entry |
| `/app/development`, `/app/development/missions/:missionId` | DevelopmentPage, MissionPlayerPage | REDESIGN | G | |
| `/app/growth` | GrowthPage | REDESIGN | G | |
| `/app/explore` | ExplorePage | REDESIGN | H | |
| `/app/reports/:sessionId` | StudentReportPage | REDESIGN | F | |
| `/app/assessment/:sessionId` | AssessmentPlayerPage | REDESIGN | E | AssessmentShell dark theme |
| `/app/sharing` | SharingPage | MERGE | K | Secondary "Shared reports" |
| `/app/settings` | SettingsPage | REDESIGN | K | Consolidates Profile, Privacy, Accessibility |
| `/app/campus-invite/:token` | CampusInvitePage | REDESIGN | J | Invite context copy |
| `/app/campus/:organizationId/{home,assignments,assignments/:id/briefing,assignments/:id/system-check,development,development/missions/:id,growth,reports/:sessionId}` | StudentShell children | REDESIGN | I | Sponsored student workspace |

### Campus administration (`/campus/:organizationId/*`, flag `PRISM_CAMPUS_ENABLED`)

`overview`, `setup`, `students`, `students/:studentId`, `cohorts`, `cohorts/import`, `cohorts/:cohortId`, `programs`, `programs/:programId`, `assessments`, `assessments/assign`, `assessments/:assignmentId`, `members`, `settings`, `reports/:sessionId`, `development`, `reassessments`, `analytics`, `reports`, `integrations`, `billing`: all REDESIGN in phase I. IA regrouping (section 7) changes visible navigation, not API routes.

### Admin console (`/admin/*`, 30 routes plus `/admin/login`)

REDESIGN in phase K (dense and operational; the console already has its own `AdminShell` and `pages/admin/ui`). `/admin/legacy-ops` (Admin.jsx, 422 lines): DEPRECATE candidate in phase M after confirming nothing links to it; keep the route until then.
## 3. Component and shared-code matrix

| Area | Files | Decision | Target | Note |
| --- | --- | --- | --- | --- |
| Primitives components/ui (29 files) | Button, Card, Badge, Tabs, Modal, Drawer, DropdownMenu, DataTable, FormControls, Toast, Skeleton, EmptyState, ErrorState, Popover, Tooltip, Avatar, Breadcrumbs, PageHeader, ProgressBar, SegmentedControl, Notice, EvidenceThread ... | KEEP and re-token | B | Already on --prism-*; add StatusBadge, Metric, Panel variants only where repetition exists |
| PrismLogo.jsx | gold ribbon, hand-built SVG, 12 hex | REPLACE | B | Official assets only; removed from the hex allow-list |
| PricingCard, FAQItem, SectionLabel, measurement.jsx (ui) | marketing and legacy measurement widgets | REDESIGN | J / F | |
| Marketing: Nav, Footer, HeroThesis, Pricing, FAQ, AppHandoff, PageLayout, story/* (8) | legacy --color-*, DM Sans inline, emoji dropdown icons | REDESIGN | J | HeroThesis sample score and StoryDimensions weights removed or replaced with illustrative, number-free evidence |
| Navigation components/navigation (5), layouts (5: AppShell, StudentShell, CampusShell, AssessmentShell, PublicLayout) | | MERGE into one AppShell family | C | One shell, personal and campus nav configs, collapsed icon sidebar, no tagline in nav |
| eatures/workspaces/WorkspaceSwitcher, components/campus/* (3) | | REDESIGN | C | One context indicator instead of three |
| States components/states (9) | Skeleton, Empty, Error, Insufficient, Offline, Unauthorized, Expired, Partial | KEEP and consolidate | B | Add PageSkeleton, CardSkeleton, TableSkeleton, InlineSpinner, FullScreenLoading; replace 22 ad-hoc spinners |
| Capability and evidence components/capability (3), components/evidence (3), eatures/reports (6) | | REDESIGN | F | Build the Evidence UI family on top of the current EvidenceThread |
| Artifacts components/artifacts | AnalyticsDashboard, BudgetModeler, CustomerTicketLog, ArtifactRenderer, ArtifactUnavailable | REDESIGN | E | Common artifact shell; presentation only; no new artifacts |
| Campus eatures/campus (26 pages, charts, components) | | REDESIGN | I | recharts wrappers in campus/charts; add table equivalents (some exist) |
| Admin pages/admin (30 pages + ui) | | REDESIGN | K | Re-token, keep density |
| lib/characters.jsx | persona avatar artwork | KEEP | none | Artwork, allow-listed for hex |
| index.css | legacy vars --gold*, shimmer, glow, hero-grid, noise | DEPRECATE | B | Remove after migrating the 11 gold files |
| 	ailwind.config.js | gold, g-primary cream, legacy aliases | REPLACE | B | Brand and token colours; migrate usages first |
| index.html, public/manifest.webmanifest, public/prism-icon.svg, public/icons/* | old icons, 	heme-color #16181D, second font request | REPLACE | B | New favicon set, manifest PNG and maskable icons |

## 4. Backend response shapes the UI relies on

All client calls go through src/api/client.js and are validated with zod (invalid schema leads to ErrorState). The honesty states below are the vocabulary the UI may show; the UI renders no value the API does not return.

| Endpoint (client module) | Shape (top level) | Honesty vocabulary to preserve |
| --- | --- | --- |
| GET /api/v1/me (me.js) | user {id, email, name}, lags {PRISM_*: boolean}, permissions {global[]}, workspaces[] {id, type PERSONAL / CAMPUS_STUDENT / CAMPUS_ADMIN, name, organizationId, organizationName, visibilityPolicy, role, roles, permissions[]} | Workspace type and visibility policy drive the context indicator and privacy cue |
| GET /api/v1/me/home (student.js) | primary action (Cta.kind START, VIEW_BRIEFING, RESUME, VIEW_REPORT, NONE; 	o), capability focus, snapshot | Focus items carry level {band,label} or null and a sufficiency status |
| GET /api/v1/me/capabilities | items[] (Capability: level, sufficiency, summary {text,status SUPPORTED / PROVISIONAL / INSUFFICIENT,evidenceIds}), ssessedCount, excludedCount, levelLabels | Level bands EARLY / DEVELOPING / DEMONSTRATED / STRONG with labels (provisional); sufficiency INSUFFICIENT_EVIDENCE / PROVISIONAL / SUFFICIENT / HUMAN_REVIEW_REQUIRED |
| GET /api/v1/me/evidence | evidence items with provenance and filters | Provenance source CONVERSATION or WORK_MATERIAL, 	urn, rtifactId, eviewedBy AI or AI_AND_HUMAN, legacy |
| GET /api/v1/me/assessments, /assessment-assignments/:id | assignment cards (status, window, CTA), briefing (10 sections) | Reasons for blocked start are named by the server |
| GET /api/v1/me/development-plan | max 3 priorities, missions | Practice evidence separate from formal |
| GET /api/v1/me/growth | comparison, changes, reassessments, interventions | comparable flag; no delta unless comparable; band labels only |
| Report V3 (eports.js, GET /api/v1/assessment-sessions/:id/report) | disclosure SUMMARY or FULL, header {assessment, sponsor, scope PERSONAL or SPONSORED}, capabilities[], evidence[] {capability, candidateAction {quote, turn, artifactId}, rubricAnchor, evidenceStatus PROVISIONAL or SUFFICIENT, sufficiency {status, reasons, unitCount, opportunities}, provenance}, priorities[] with vailability {missions, reassessment} | Every conclusion carries claim status and evidence ids, or is marked insufficient |
| POST /api/v1/me/role-exploration | roles with reasons (DEMONSTRATED_CAPABILITY or SELF_REPORTED_INTEREST), unknowns, next step | No percentages; interests absent means no evaluation |
| /api/v1/organizations/:orgId/* (campusAdmin.js, nalytics.js, growth.js, illing.js) | overview counts and extras, students, cohorts, programs, assignments, analytics aggregates, cohort reports, contracts | Server-side suppression of groups below the minimum (default 10); price fields only for billing roles when approved |
| Legacy /api/assessment/*, /api/payment/* (ssessment.js, ccount.js) | candidate funnel and history | Frozen; presentation only |
| Evidence-status mapping for tokens | API states: INSUFFICIENT_EVIDENCE, PROVISIONAL, SUFFICIENT, HUMAN_REVIEW_REQUIRED, claim SUPPORTED, practice evidence kind | The brief's six labels map only where the API supports them: **Insufficient evidence**, **Provisional**, **Demonstrated** (SUFFICIENT or SUPPORTED), **Under review** (HUMAN_REVIEW_REQUIRED), **Practice / Developmental** (practice evidence). **Observed** is the provenance of an evidence item (candidateAction), not a status. **Inferred** and a free-standing **Verified/Governed** status are NOT in the API and are not rendered |

## 5. Brand token derivation

Source: StudAI_Prism_Complete_Brand_Pack/StudAI_Prism_Brand_Pack/10_Brand_Guide/colors.json (issued colours) and the logo SVGs (fills are exactly #0E255B and #03B67A, plus #FFFFFF on the reversed variants).

| Token | Value | Source |
| --- | --- | --- |
| brand.navy | #0E255B | issued |
| brand.green | #03B67A | issued |
| brand.white | #FFFFFF | issued |
| surface.soft (canvas) | #F6F8FB | issued ("Soft Surface") |
| brand.navy-strong (hover, pressed) | #081A45 | derived |
| brand.navy-deep (dark canvas) | #081633 | derived |
| brand.green-ink (green text, chart green on light) | #027A55 | derived, because issued green fails text contrast |
| brand.green-soft / brand.navy-soft (chips, selected rows) | #E6F7F0 / #E8EDF8 | derived tints |
| text.muted / text.subtle | #4A5878 / #566685 | derived from navy hue |
| border / border-strong | #DDE3EE / #76849F | derived; border-strong meets 3:1 for control boundaries |
| dark text muted / subtle / border-strong | #C5CFE6 / #A9B6D3 / #6F82B0 | derived for the navy surfaces |
| semantic partial / blocked / insufficient | #92400E on #FFFBEB / #B42318 on #FEF3F2 / #4A5878 on #EDF1F8 | kept from the current semantic set (insufficient re-hued to slate-navy); never brand colours |
| chart ordinal ramp (EARLY to STRONG) | #7189BD, #3F5C9E, #27408A, #0E255B | derived; all pass 3:1 on white and Soft Surface, bands also carry text labels and table equivalents |
| chart series | navy, green-ink, mid-navy #5B73A8, neutral #76849F | derived |

Logo rules to enforce in code and review: full lockup (with tagline) at 240 px wide or more, no-tagline lockup 160 px or more, icon 24 px or more (dedicated favicon files below 32 px); reversed files on navy or dark; clear space of one third of the icon width; no recolour, shadow, outline or effect. Shell logo: no-tagline lockup (at least 160 px wide) or the icon where space is short.

Contrast table (WCAG 2.2; measured on the exact values above):

| Pair | Foreground | Background | Ratio | Needs | Result |
| --- | --- | --- | --- | --- | --- |
| Body and headings: navy on white | #0E255B | #FFFFFF | 14.64:1 | 4.5:1 | pass |
| Body: navy on Soft Surface (page canvas) | #0E255B | #F6F8FB | 13.76:1 | 4.5:1 | pass |
| Secondary text: muted on Soft Surface | #4A5878 | #F6F8FB | 6.67:1 | 4.5:1 | pass |
| Tertiary text: subtle on subtle fill | #566685 | #EDF1F8 | 5.10:1 | 4.5:1 | pass |
| Primary button: white on navy | #FFFFFF | #0E255B | 14.64:1 | 4.5:1 | pass |
| Primary button hover: white on navy-strong | #FFFFFF | #081A45 | 16.88:1 | 4.5:1 | pass |
| Green button: navy on green | #0E255B | #03B67A | 5.56:1 | 4.5:1 | pass |
| Green text: green-ink on white | #027A55 | #FFFFFF | 5.36:1 | 4.5:1 | pass |
| Green text: green-ink on Soft Surface | #027A55 | #F6F8FB | 5.04:1 | 4.5:1 | pass |
| Green text on green-soft chip | #027A55 | #E6F7F0 | 4.83:1 | 4.5:1 | pass |
| Navy text on navy-soft chip | #0E255B | #E8EDF8 | 12.48:1 | 4.5:1 | pass |
| REJECTED: brand green as text on white | #03B67A | #FFFFFF | 2.63:1 | 4.5:1 | fails - never use |
| REJECTED: white text on brand green | #FFFFFF | #03B67A | 2.63:1 | 4.5:1 | fails - never use |
| Input and UI boundary: border-strong on white | #76849F | #FFFFFF | 3.77:1 | 3:1 | pass |
| Input boundary on Soft Surface | #76849F | #F6F8FB | 3.54:1 | 3:1 | pass |
| Focus ring: navy on Soft Surface | #0E255B | #F6F8FB | 13.76:1 | 3:1 | pass |
| Dark theme body: Soft Surface on navy-deep | #F6F8FB | #081633 | 16.83:1 | 4.5:1 | pass |
| Dark theme: white on brand navy surface | #FFFFFF | #0E255B | 14.64:1 | 4.5:1 | pass |
| Dark theme secondary: muted on navy surface | #C5CFE6 | #0E255B | 9.37:1 | 4.5:1 | pass |
| Dark theme tertiary: subtle on navy surface | #A9B6D3 | #0E255B | 7.19:1 | 4.5:1 | pass |
| Dark theme link or accent: green on navy-deep | #03B67A | #081633 | 6.80:1 | 4.5:1 | pass |
| Dark theme accent: green on navy surface | #03B67A | #0E255B | 5.56:1 | 4.5:1 | pass |
| Dark theme boundary: border-strong on navy surface | #6F82B0 | #0E255B | 3.83:1 | 3:1 | pass |
| Status partial: amber text on amber-soft | #92400E | #FFFBEB | 6.84:1 | 4.5:1 | pass |
| Status blocked: red text on red-soft | #B42318 | #FEF3F2 | 6.05:1 | 4.5:1 | pass |
| Status insufficient: slate text on its fill | #4A5878 | #EDF1F8 | 6.27:1 | 4.5:1 | pass |
| Chart band 1 (EARLY) vs white | #7189BD | #FFFFFF | 3.49:1 | 3:1 | pass |
| Chart band 2 (DEVELOPING) vs white | #3F5C9E | #FFFFFF | 6.49:1 | 3:1 | pass |
| Chart band 3 (DEMONSTRATED) vs white | #27408A | #FFFFFF | 9.60:1 | 3:1 | pass |
| Chart band 4 (STRONG) vs white | #0E255B | #FFFFFF | 14.64:1 | 3:1 | pass |
| Chart green series (green-ink) vs white | #027A55 | #FFFFFF | 5.36:1 | 3:1 | pass |
| Chart green series (green-ink) vs Soft Surface | #027A55 | #F6F8FB | 5.04:1 | 3:1 | pass |

Rules that follow: brand green is a fill, mark and rule colour; navy text sits on green fills; green text uses green-ink; the brand green is used as text only on navy surfaces (5.6:1 and above); control boundaries use border-strong; an ordinal chart band is never identified by colour alone.

## 6. Typography finding

The pack names no typeface. Current stack: Fraunces (display, 26 files via ont-serif), Noto Sans (body in the app), DM Sans (default body in index.css and two inline styles), IBM Plex Mono (utility), Noto Sans Devanagari and Tamil companions; a second font request (Instrument Serif, Bricolage Grotesque, DM Sans, JetBrains Mono) loads fonts that are unused. The wordmark is a heavy, tight geometric grotesque. Decision for phase B (recorded as U1): one sans for display and body with Latin coverage, Noto Sans Devanagari and Tamil kept as script companions, IBM Plex Mono kept for numerals and IDs, serif retired from headings, the unused font request removed. server/test/designSystem.test.js asserts the font families in index.html; update the list at equal strictness.

## 7. Proposed route and navigation hierarchy (mapped to the real router)

Principle: keep every public URL working. Add the new paths as the canonical ones and keep the old ones as redirects.

| Today | Proposed canonical | Change |
| --- | --- | --- |
| /app, /app/home | /app (redirects to /app/home) | none |
| /app/assessments, /app/assessments/:assignmentId/briefing | same, plus /app/assessments/:id for session or assignment detail | add detail route |
| /app/capabilities | same, plus /app/capabilities/:capabilityId | add detail route (data exists in /me/capabilities items) |
| /app/evidence | stays, entered from capability and report pages | re-home in nav under Capabilities |
| /app/development, /app/development/missions/:missionId | /app/development, /app/missions/:missionId with a redirect from the old path | shorter canonical mission URL |
| /app/growth, /app/explore, /app/reports/:sessionId | same | none |
| /app/sharing, /app/settings, /profile | /app/settings (sections Profile, Account, Workspaces, Privacy, Sharing, Preferences, Accessibility, Security); /profile redirects | merge |
| /app/campus/:organizationId/* | same (sponsored student workspace) | none |
| /campus/:organizationId/{overview,students,cohorts,programs,assessments,development,reassessments,analytics,reports,members,integrations,billing,settings} | IA regroup in nav only: Overview, Students, Cohorts, Assessments (with Programs), Capabilities (analytics), Development (with Interventions), Growth (reassessments), Reports, Settings (Team, Integrations, Billing inside); route paths unchanged, aliases /interventions, /growth, /capabilities added | nav regroup; no API change |
| /report/:id/v2, /workspace/:id, /missions/:id, /explore | unchanged (already LegacyAlias redirects when the V3 flag is on) | none |
| /login, /register | unchanged; signed-in users go to /app when the shell flag is on, /payment otherwise | later (phase J) |

Personal nav (target): Home, Assessments, Capabilities (with Evidence), Development, Growth, Explore, Profile; secondary in the account menu: Shared reports, Credentials, Settings, Privacy. Mobile bottom bar: Home, Assessments, Capabilities, Development, More.

## 8. Baseline health (before any change)

| Check | Result |
| --- | --- |
| Build | PASS (vite build, about 14 to 29 s) |
| Vitest | 226 passed, 21 files (one load-sensitive failure in campus/analytics.test.jsx on the first run; the file passes 3 of 3 in isolation and the full suite passed on rerun) |
| Server tests | 620 tests, 596 pass, 0 fail, 24 skipped (identical to the Phase 12 gate) |
| Static audit | PASS |
| Playwright @critical on chromium | 55 passed, 2.1 min (full 4-project run of 571 was recorded in Phase 12 on this same code) |
| Screenshots | 64 captured, 0 horizontal overflow, 0 HTTP errors, 5 console errors on / (StoryDimensions) |

Environment finding: server/.env on this machine now carries a local-campus block (campus flags on, DATABASE_URL to a local prism_local database) added for the local demo. The Playwright "flags off" server also loads that file, which made 6 @critical tests fail until the block was removed for the test run. Before every Playwright run, remove or neutralise that block (it is git-ignored, backup in %TEMP%\server-env-backup.txt for this run) or run e2e with the block commented out. Verified: with it removed, 55 of 55 pass.

## 9. Risks and open points carried into later phases

- Measurement-sensitive files (phase E): pages/Assessment.jsx, eatures/assessments/*, artifacts, lib/assessmentFlow.js, lib/turnSignals.js; presentation-only changes with a documented neutrality inventory first.
- Issued legacy report (ScoreReport.jsx): immutable content; restyle and replace lert() only.
- Tagline "Prove" versus claimsCeiling.test.js: the regex list does not ban the word, but the claim "prove growth" must stay within the registry; keep the tagline only in the logo artwork unless the owner approves text use (decision in phase J).
- "by StudAI One": naming decision for the owner; the new logo omits it.
- Desktop shell icons (desktop/src-tauri) need the 	auri icon tool; out of scope unless requested.
- The brand pack folder and zip are untracked in git; phase B copies only the needed files into public/brand/ and the pack stays outside the build.