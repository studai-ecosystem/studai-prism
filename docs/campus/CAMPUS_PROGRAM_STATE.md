# Prism Campus + Personal V1 — Programme State

Living document and the ONLY live checklist for
[PRISM_CAMPUS_MASTER_IMPLEMENTATION_SPEC.md](../../PRISM_CAMPUS_MASTER_IMPLEMENTATION_SPEC.md)
(the spec itself is frozen — record interpretations and deviations here, never there).

Machine-read by `.github/hooks/scripts/*.cjs` (workspace root `PRISM/`). Keep the formats exactly:

- Header block below: `key: value` lines between the CAMPUS-STATE markers.
- Phase heading: `## Phase <N> — <title>` followed by `Status:`, `Gates:`, `Commit:` lines.
- Items: `- [ ] C<N>.<nn> ...` (open), `- [x] C<N>.<nn> ... — evidence: ...` (done),
  `- [H] C<N>.<nn> ... — HA-C<nnn>` (human-gated; MUST cite a register id in
  [CAMPUS_HUMAN_ACTIONS.md](./CAMPUS_HUMAN_ACTIONS.md)).
- Status values: `NOT_STARTED` | `IN_PROGRESS` | `COMPLETE`.
- run_mode values: `off` | `phase` | `autopilot`. The Stop hook only enforces continuation when not `off`.

<!-- CAMPUS-STATE:BEGIN
run_mode: autopilot
active_phase: 2
target_phase: 12
branch: campus/p02-measurement
last_updated: 2026-09-25
CAMPUS-STATE:END -->

## Baseline

| Field | Value |
| --- | --- |
| Spec baseline commit | `63d320db7949bdf7e9c3526228d8e732e51becbd` (2026-09-21) |
| Starting HEAD | `63d320db7949bdf7e9c3526228d8e732e51becbd` on `main` (= spec baseline; 0 commits delta) |
| Uncommitted at start | untracked `PRISM_CAMPUS_MASTER_IMPLEMENTATION_SPEC.md`, `docs/campus/` (programme files; committed in Phase 0, K12) |
| Baseline server tests | 396 tests · 383 pass · 1 fail · 12 skipped (DB suites) — the fail was a cross-process JSON-store race in `governance2.test.js` (passes alone); fixed at root by K11 → 410 · 387 pass · 0 fail · 12 skipped · 11 todo |
| Baseline python tests | 57 passed |
| Baseline build | PASS (vite build) |
| Baseline e2e critical | 10 passed (chromium) → 12 with campus baseline smoke |
| Baseline static audit | PASS; campus-scan 1 violation (`src/components/ui/measurement.jsx:26` RAW_FETCH) → fixed (K13) |

## Phase 0 — Baseline safety and regression lock

Status: COMPLETE
Gates: PASS 2026-09-25T17:03:55.732Z @ 63d320d (skipped: server-db-tests, frontend-unit)
Commit: 388d459

- [x] C0.01 Record git state (branch, HEAD, dirty files) in Baseline table; create branch `campus/p00-baseline` — evidence: Baseline table; `git switch -c campus/p00-baseline` from `63d320d`
- [x] C0.02 Run baseline gates and record counts in Baseline table — evidence: Baseline table; `audit-results/campus-gates/phase-00.json`
- [x] C0.03 Frontend inventory: every route, page, fetch call site, token access → `docs/campus/BASELINE_INVENTORY.md` — evidence: `docs/campus/BASELINE_INVENTORY.md` §1–§2
- [x] C0.04 Backend inventory: every endpoint the frontend calls (method, path, handler file) → same doc — evidence: `docs/campus/BASELINE_INVENTORY.md` §3
- [x] C0.05 Flag inventory: all FLAG_CATALOGUE entries + the 9 planned campus flags → same doc — evidence: `docs/campus/BASELINE_INVENTORY.md` §4
- [x] C0.06 Register the 9 campus flags in `server/lib/flagRegistry.js` (all OFF) + test they default off — evidence: `server/lib/flagRegistry.js`; tests: `server/test/campusFlags.test.js` (3 tests)
- [x] C0.07 Playwright smoke of the current direct flow tagged `@critical @campus-baseline` — evidence: `tests/e2e/campus-baseline.spec.js` (CAMPUS-BASELINE-01/02; gate run chromium 12/12; manual run `--project=chromium --project=mobile-chromium` 6/6 passed 2026-09-25)
- [x] C0.08 Known-unsafe regression tests as `todo` (evidence defaults, rubric default, reportV2 fallbacks, default RIASEC, hard-coded scenario, unknown-scenario fallback, mission Level-4-on-length, fallback dialogue) — evidence: `server/test/campusKnownUnsafe.test.js` (11 todo; each fails on its intended assertion — behavioural for scenario-bank lookup, `/artifacts` unknown + `test-mkt-session-` sessions, evidence write, reportV2, explore API, missions; source scans for client-only items)
- [x] C0.09 Baseline screenshots of key UI (desktop + mobile) → `audit-results/campus-baseline/` — evidence: `tests/e2e/campus-screenshots.spec.js` (`@campus-screens`); 14 PNGs (chromium @1440×900 + mobile-chromium Pixel 7 × landing, login, app, briefing, report-v2, explore, mission)
- [x] C0.10 Record spec↔charter conflict resolutions K1–K10 in Decisions log (confirm or refine) — evidence: K1–K10 confirmed against code (router v7 `package.json`; no vitest; JSON store SoR; frozen bank); K11–K16 added
- [x] C0.11 Gates PASS, reviewer PASS, commit `chore(campus-p00): baseline + regression lock` — evidence: gates `audit-results/campus-gates/phase-00.json` PASS; Prism Campus Reviewer PASS on 3rd pass (inventory line fixes); commit on `campus/p00-baseline`

## Phase 1 — Frontend foundation, design system, central API/auth/workspace layer

Status: COMPLETE
Gates: PASS 2026-09-25T18:26:43.833Z @ 388d459 (skipped: server-db-tests)
Commit: 24c0b75

- [x] C1.01 Dependencies: @tanstack/react-query, zod, react-hook-form, recharts, date-fns; dev: vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom; `test:unit` script + vitest config — evidence: `package.json` (+ `@testing-library/dom`), `server/package.json` (zod), `vitest.config.js`, `src/test/setup.js`, `.github/workflows/ci.yml` vitest step; `npm audit --omit=dev` 0 vulnerabilities
- [x] C1.02 Folder structure per spec §5.4 (`src/app`, `layouts`, `components/*`, `features/*`, `api`, `hooks`, `lib`, `styles`) — evidence: `src/app/{providers,guards}`, `src/layouts`, `src/components/{ui,navigation,states}`, `src/features/{home,assessments,capabilities,evidence,development,growth,sharing,settings,campus,workspaces,shared,designSystem}`, `src/api`, `src/hooks`, `src/lib/copy`, `src/styles`; remaining component folders arrive with their phase (no empty placeholders)
- [x] C1.03 Backend `/api/v1` router skeleton: request-id middleware, standard error envelope, `GET /api/v1/health`, `GET /api/v1/me` (user + client-visible flags + permissions stub) + tests — evidence: `server/domain/http/{errors,asyncHandler,requestId,pagination,idempotency}.js`, `server/domain/auth/requireUser.js`, `server/domain/flags/index.js`, `server/domain/workspaces/personal.js`, `server/routes/v1/{index,me}.js`, `server/app.js` mount + v1 error envelope + CORS headers; tests: `server/test/v1Foundation.test.js` (11), `server/test/v1Http.test.js` (4)
- [x] C1.04 `src/api/client.js` per §32.1 (base URL, auth, workspace header, request id, error normalisation, 401/403, safe-only retry, idempotency keys) + unit tests — evidence: `src/api/client.js`; tests: `src/api/client.test.js` (13)
- [x] C1.05 Providers: QueryProvider, AuthProvider (single token accessor wrapping `lib/session.js`), FeatureFlagProvider, WorkspaceProvider (personal-only until Phase 3) — evidence: `src/app/providers/{QueryProvider,AuthProvider,FeatureFlagProvider,WorkspaceProvider,index}.jsx`, `src/api/{me,auth}.js`, `src/lib/session.js` session-change event; tests: `src/app/providers/providers.test.jsx` (11 — incl. cross-account cache isolation, direct A→B switch, signIn)
- [x] C1.06 Guards: AuthGuard, WorkspaceGuard, RoleGuard, EntitlementGuard (UX only; server enforces) — evidence: `src/app/guards/*.jsx`; tests: `src/app/guards/guards.test.jsx` (8 — EntitlementGuard renders children only for ACTIVE)
- [x] C1.07 `src/app/AppRouter.jsx` with route-level lazy loading; `App.jsx` becomes thin wrapper; every existing route preserved — evidence: `src/app/AppRouter.jsx` (all BASELINE_INVENTORY §1 routes, `React.lazy` + Suspense), `src/App.jsx`; `src/main.jsx` imports `design/tokens.css` globally (was only reached through eager imports); `src/app/RouteErrorBoundary.jsx` (`lazyWithRetry` + boundary); tests: `src/app/AppRouter.test.jsx` (15 — incl. focus + title on V3 shell routes, retryable /me error), `src/app/RouteErrorBoundary.test.jsx` (4), e2e baseline + legacy suites green
- [x] C1.08 Design tokens: light neutral app theme + semantic colours + scoped dark assessment theme, without regressing legacy pages — evidence: `src/design/tokens.css` (`--prism-*` palette + `.theme-assessment`, the only hex-allowed source), `src/styles/tokens.css` (app frame/focus/reduced motion), `tailwind.config.js` `prism.*` colours; legacy tokens untouched; `designSystem.test.js` green
- [x] C1.09 UI primitives §8.1 (all 33) accessible, keyboard-operable, reduced-motion aware — evidence: `src/components/ui/{Button(Button,IconButton,LinkButton),Badge(Badge,StatusChip),Card(Card,Panel,StatCard),ProgressBar,Tabs,SegmentedControl,Tooltip,Popover,Modal,Drawer,DropdownMenu,Avatar,FormControls(Input,Select,Textarea,Checkbox,RadioGroup,Switch),DataTable(DataTable,Pagination),Breadcrumbs,PageHeader,EmptyState,ErrorState,Skeleton,Notice(InlineNotice,Callout),Toast,index}.jsx`, `src/hooks/useFocusTrap.js`; tests: `src/components/ui/primitives.test.jsx` (27)
- [x] C1.10 State components: Skeleton/Loading, EmptyState, ErrorState, PartialDataNotice, UnauthorizedState, ExpiredEntitlementState, OfflineReconnectBanner — evidence: `src/components/states/*.jsx`; tests: `src/components/states/states.test.jsx` (7)
- [x] C1.11 Layouts: PublicLayout, AppShell (§7.1 nav, top bar, skip link), StudentShell, CampusShell (§19.1 nav, role-aware), AssessmentShell (dark) — evidence: `src/layouts/*.jsx`, `src/components/navigation/{navConfig,SideNav,BottomNav,TopBar,SkipLink}.jsx`, `src/features/workspaces/components/WorkspaceSwitcher.jsx`; tests: `src/layouts/layouts.test.jsx` (9 — campus nav filtering none/some/all, CampusShell + mobile drawer, StudentShell campus scoping + PERSONAL reset, WorkspaceSwitcher keyboard/switch/toast, AssessmentShell dark + no nav, page title + h1 focus)
- [x] C1.12 Responsive navigation incl. student mobile bottom nav (§7.3) — evidence: `BottomNav.jsx` (Home, Assess, Develop, Growth, More → drawer), campus drawer nav; tests: e2e CAMPUS-SHELL-01 at 360/768/1024/1440
- [x] C1.13 `/app/*` routes (§6.2) behind `PRISM_APP_SHELL_V3` rendering honest empty states (no fake data); flag off → legacy `/app` unchanged — evidence: `src/features/*/pages/*.jsx`, `src/lib/copy/emptyStates.js` (spec §40 copy); tests: AppRouter.test.jsx, CAMPUS-SHELL-04
- [x] C1.14 Legacy redirects §6.5 (targets resolve to legacy pages until replaced) — evidence: `src/app/routing.jsx` (`LegacyAlias`, `V3Route`, `ParamRedirect`), AppRouter aliases for `/workspace/:sessionId`, `/report/:sessionId/v2`, `/missions/:missionId`, `/explore`; tests: AppRouter.test.jsx (V3 URL → legacy with params; legacy stays legacy while flag off; report-on/shell-off no loop; all-on placeholders link to legacy `?legacy=1`), e2e CAMPUS-SHELL-05
- [x] C1.15 Migrate ShellHome/Profile raw token + fetch boilerplate to the API client (no behaviour change) — evidence: `src/api/account.js`, `src/pages/ShellHome.jsx`, `src/pages/Profile.jsx`, `src/api/evidence.js` (now on the client); e2e CAMPUS-BASELINE-01 + CAMPUS-SHELL-04 green
- [x] C1.16 DesignSystem page showcases new primitives — evidence: `src/features/designSystem/CampusShowcase.jsx` in `src/pages/DesignSystem.jsx` (existing admin gating kept)
- [x] C1.17 Tests: unit (client, providers, guards, primitives), Playwright shell at 360/768/1024/1440, keyboard nav, axe on shell; legacy direct assessment flow still green — evidence: vitest 94 tests (8 files); `tests/e2e/campus-shell.spec.js` (21 @critical: 4 widths, keyboard, axe on all 14 new routes, flags-off legacy, legacy escape hatch) against the campus harness server (`playwright.config.js` second webServer :4174, `scripts/start-audit-server.mjs` `PRISM_AUDIT_CAMPUS`), `tests/e2e/campusHelpers.js`; e2e critical 33/33 (chromium) and campus-shell 42/42 on chromium + mobile-chromium
- [x] C1.18 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p01): ...` — evidence: gates `audit-results/campus-gates/phase-01.json` PASS (server 428/405 pass/0 fail/12 skipped/11 todo; vitest 94; e2e critical 33); Prism Campus Reviewer: all code findings fixed over 3 passes, final FAIL was evidence counts only (corrected); Prism Campus UX Auditor PASS on 3rd pass; commit on `campus/p01-foundation`

## Phase 2 — Measurement integrity (fail closed)

Status: COMPLETE
Gates: PASS 2026-09-25T20:00:40.150Z @ 24c0b75 (server 468/454 pass/0 fail/14 skipped/0 todo; DB 12/12 on PGlite; python 57; vitest 122; build; static audit; campus-scan clean; e2e critical 37 — 74/74 on --repeat-each=2; legacy prism-next specs 35/35)
Commit: see C2.17

- [x] C2.01 Migration: evidence ledger strict/nullable semantics + §30.8 columns + `evidence_status`; legacy rows untouched; down file — evidence: `server/db/migrations/0025_evidence_fail_closed.sql` + `.down.sql` (defaults/NOT NULL dropped, new columns, `legacy_row` flag-only UPDATE, 5 CHECK constraints, index); `server/test/campusMigrations.db.test.js` up→down→up on PGlite (K26): legacy row values unchanged + `legacy_row=true`, CHECKs reject INSUFFICIENT-with-level / status-less / unprovenanced / `VERIFIED` rows, rollback refuses to invent values; all 11 DB suites pass; added to CI DB step
- [x] C2.02 Evidence write path strict: no defaults; missing provenance → `INSUFFICIENT_EVIDENCE`, `rubric_level NULL` — evidence: `server/domain/evidence/evidenceUnit.js` (zod, `normalizeEvidenceUnit`, legacy `readEvidenceRow` adapter), `server/lib/evidenceGraph.js` (only writer; PG path fixed K32), artifact writer in `routes/assessment.js` records action+provenance only; `server/test/evidenceSufficiency.test.js` (7 unit tests)
- [x] C2.03 Capability sufficiency engine (`server/domain/evidence/sufficiency.js`) with §33.2 rule config + exhaustive tests — evidence: `sufficiencyRules.js` (`sufficiency-rules.v1-provisional`, HA-C002), `sufficiency.js` pure `evaluateCapability`/`evaluateProfile`; tests: empty, inadmissible, two rows never SUFFICIENT, each threshold named, review → HUMAN_REVIEW_REQUIRED, legacy → ≤ PROVISIONAL, uncalibrated/unapproved → PROVISIONAL, SUFFICIENT only when all rules met, deterministic/order-independent (K35)
- [x] C2.04 Remove `VERIFIED` wording from capability claims (SUFFICIENT/PROVISIONAL/INSUFFICIENT_EVIDENCE/HUMAN_REVIEW_REQUIRED) — evidence: evidence ledger writes `evidence_status` (never `VERIFIED_CONSENSUS`); single legacy mapping constant in `evidenceUnit.js` (`campus-allow VERIFIED_CLAIM`); report V2 has no verification status; ecosystem example roles and ScoreReport copy no longer claim "verified strengths"/matching (K30); credential-integrity "verified" (signature/hash) is a different, true claim and stays
- [x] C2.05 Scenario registry fails explicitly for unknown ids (`SCENARIO_NOT_FOUND`); remove every marketing fallback (reportV2, assessment routes, missions) — evidence: `scenarioBank.getScenarioOrThrow`/unknown→null; `/start` unknown id → 422 + audit; `test-mkt-session-` revive removed; artifacts unknown session → 404; reportV2 no fallback; workspace sends no scenario (K31); known-unsafe tests 8–10 pass
- [x] C2.06 reportV2 fallback scores/quotes/archetypes/strengths/precision removed → fail closed; issued legacy blobs untouched — evidence: `server/lib/reportV2.js` `2.1.0-fail-closed` (status + reasons per capability, verbatim-only quotes, claim ids, no SEM/CI/readiness/percent/weights); `/report/:id/v2` + `/employee` 404 when neither report nor session; issued reports untouched (`toExternalReport` path unchanged)
- [x] C2.07 Role recommendations: no percentages, no default interest vectors — evidence: `server/lib/roleAffinityEngine.js` (`sanitizeInterests`, reasons typed DEMONSTRATED_CAPABILITY / SELF_REPORTED_INTEREST, unknowns, nextStep; no score); `/api/job-families/explore` 422 on invalid interests, ignores client capability profile; `failClosed.test.js` Journey D explore cases
- [x] C2.08 Report claim registry (`server/domain/reports/claims.js`) with provenance schema; renderer rejects unsupported claims — evidence: `buildClaim` (deterministic id), `validateClaims` rejecting NO_EVIDENCE_IDS / UNKNOWN_EVIDENCE_ID / EVIDENCE_CAPABILITY_MISMATCH / QUOTE_NOT_VERBATIM / QUOTE_ON_INSUFFICIENT_CLAIM / MALFORMED; used by reportV2; `server/test/reportClaims.test.js` (6 tests incl. invented-quote rejection and a quote copied from the opening prompt — only `[Candidate]:` turns count)
- [x] C2.09 Mission evaluator interim fail-closed (no Level 4 on length; no unverified behaviours) until Phase 8 — evidence: `routes/missions.js` submit → 404 unknown mission, deterministic HYPOTHESIS_FRAME check only, `status` PRACTICE_FEEDBACK_UNAVAILABLE / INSUFFICIENT_EVIDENCE, `evidenceType: PRACTICE`, no `levelAchieved`/`observableBehaviors`
- [x] C2.10 Convert Phase 0 `todo` regression tests into passing real assertions — evidence: `server/test/campusKnownUnsafe.test.js` 11/11 pass, `todo 0`
- [x] C2.11 Frontend: EvidenceSufficiencyBadge, CapabilityLevelBadge, insufficient-evidence state — evidence: `src/components/evidence/EvidenceSufficiencyBadge.jsx`, `src/components/capability/CapabilityLevelBadge.jsx`, `src/components/states/InsufficientEvidenceState.jsx`, `src/components/reports/CapabilityCard.jsx`, governed copy `src/lib/copy/evidence.js`; `src/components/evidence.test.jsx` (12 tests: gray never red, unknown → insufficient, no numbers, reasons in plain language)
- [x] C2.12 Remove fake precision/percentages in StudentReportV2, ExploreMode (blank defaults, no auto-evaluate), DevelopmentMission (no Level-4 claim) — evidence: all three pages + `EmployeeReportV2.jsx` rebuilt on the design system and `src/api/{assessment,development}.js`; `src/pages/failClosedPages.test.jsx` (13 tests) + `campusCopyCeiling.test.js` bans SEM/CI/percent/rubric numbers/readiness/levelAchieved (K33)
- [x] C2.13 Remove customer-visible "PRISM NEXT", "12-section", emoji headers; extend claims ceiling test to ban them — evidence: `server/test/campusCopyCeiling.test.js` (5 tests: no programme name/section-count anywhere in `src`, no emoji in fail-closed pages + campus strict zones, no precision/percent, API client only, no scripted dialogue)
- [x] C2.14 AssessmentWorkspace minimal fix: no fallback dialogue, no hard-coded scenario (session metadata or explicit error state) — evidence: `src/pages/AssessmentWorkspace.jsx` (scenario only from `/start` payload, ErrorState + retry when absent, consent/age/409 states, "Not sent — retry" keeps draft, empty reply adds no participant line, finish navigates only on server ack incl. 202 polling; fixed render/fetch loop from unstable store actions); Briefing forwards explicit `?assessment=` only (K31); work materials render only server data (`ArtifactRenderer` + data-driven dashboard/tickets/budget; nine unreachable fixture components removed, K37), saves go through `src/api/assessment.js` `saveArtifact` and show "Saved" only on server ack, else "Not saved — retry" with input kept; `src/components/artifacts/artifacts.test.jsx` (3) + copy-ceiling scan of `src/components/artifacts/**` and `artifactStore.js`
- [x] C2.15 Audit events for evidence-status decisions — evidence: `auditLog('evidence.status.decided', …)` on every artifact evidence write (capabilityId, status, reasons, source) and on every report V2 and workplace-view build (`auditSufficiencyDecisions`: surface, ruleVersion, per-capability status/reasons); `server/test/evidenceAudit.db.test.js` proves both surfaces land in `audit_log` (PGlite; in CI DB step)
- [x] C2.16 Tests incl. Journey D (insufficient evidence → no fabricated score) at API + UI level — evidence: `server/test/failClosed.test.js` (5 API tests: deep scan for score/percent/precision keys, statuses, no strengths/roles/missions, unknown ids fail, explore, missions); `tests/e2e/campus-insufficient.spec.js` (4 @critical incl. axe + 360px); legacy `prism-next-marketing.spec.js` / `prism-next-reality.spec.js` rewritten to fail-closed truth (35/35, K29)
- [x] C2.17 Gates PASS, reviewer PASS, commit `feat(campus-p02): ...` — evidence: gates `audit-results/campus-gates/phase-02.json` PASS; Prism Campus Reviewer FAIL (3 blocking) → all fixed → PASS (non-blocking notes fixed: K41, K42, key on ArtifactRenderer; pre-existing issues logged as Risks); e2e helper `api()` moved to Playwright request context (flake root cause: page.evaluate raced a client redirect); commit on `campus/p02-measurement`

## Phase 3 — Organization, workspace, membership, entitlement foundation

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C3.01 Migration: organizations, campuses, academic_departments, academic_programs, academic_batches, cohorts, cohort_members
- [ ] C3.02 Migration: organization_memberships, workspaces
- [ ] C3.03 Migration: entitlements + immutable entitlement_consumptions (trigger-enforced append-only)
- [ ] C3.04 Migration: consent_records, share_grants, share_grant_resources, data_access_audit_events, assessment_session_scopes
- [ ] C3.05 Repository layer (PG + in-memory adapter) for all Phase 3 tables
- [ ] C3.06 Permission service (§29 roles/matrix, deny-by-default, scope resolution) + exhaustive matrix tests
- [ ] C3.07 Entitlement resolver (§31.1) + ledger + read-only adapter mapping legacy paid/invite/coupon to PERSONAL_PURCHASE / PROMO / ADMIN_GRANT
- [ ] C3.08 Middleware: `requireAuth`, `resolveWorkspace` (X-Prism-Workspace), `requireOrgPermission`, data-access audit
- [ ] C3.09 APIs: `GET /api/v1/workspaces`, `POST /api/v1/workspaces/:id/activate`
- [ ] C3.10 Campus invite + membership acceptance with existing-account linking (no duplicate identity)
- [ ] C3.11 Session scope attachment on sponsored start; legacy sessions resolve as PERSONAL
- [ ] C3.12 `PRISM_CAMPUS_ENABLED` gate: all org routes 404 when off; require DATABASE_URL
- [ ] C3.13 Frontend: WorkspaceSwitcher (query invalidation, context confirmation), workspace-namespaced query keys
- [ ] C3.14 Frontend: campus invite acceptance page, SponsoredByCard, PrivacyScopeBadge, ConsentScopePanel
- [ ] C3.15 Isolation integration tests: campus admin denied personal report; other org denied; expired sponsor entitlement; personal credits never consumed by campus
- [ ] C3.16 E2E Journey B (partial): existing user → invite → accept → switch workspace → privacy disclosure
- [ ] C3.17 Gates PASS, reviewer PASS, commit `feat(campus-p03): ...`

## Phase 4 — Student application V3

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C4.01 Migration: assessment_definitions, assessment_forms, assessment_assignments, assessment_assignment_targets, assessment_assignment_students (map the frozen scenario bank; no new scenarios)
- [ ] C4.02 Personal assignments derived from personal entitlements (idempotent, no data mutation of legacy)
- [ ] C4.03 Read APIs: `/api/v1/me/home`, `/me/capabilities`, `/me/evidence`, `/me/assessments`, `/me/development-plan`, `/me/growth` (workspace-scoped, fail closed)
- [ ] C4.04 Student Home §9 (primary action priority, capability snapshot, development focus, sponsor card)
- [ ] C4.05 Assessments list §10 (Active/Completed/Upcoming, scope labels)
- [ ] C4.06 Assessment Briefing §11 + system check route (reuse existing device checks); sponsored disclosure acknowledgement persisted in consent_records
- [ ] C4.07 Capabilities page §13
- [ ] C4.08 Evidence explorer §15 (formal vs practice visually distinct, filters)
- [ ] C4.09 Development overview (plan read; missions arrive Phase 8) and Growth page honest states
- [ ] C4.10 Explore Roles V2 §18 (self-reported vs demonstrated, no %, no auto-evaluate)
- [ ] C4.11 Sharing (list/revoke grants) + Settings (profile, privacy, accessibility preferences)
- [ ] C4.12 Campus student routes `/app/campus/:organizationId/*` with scoped data only
- [ ] C4.13 Product telemetry events §46 (no PII/transcripts)
- [ ] C4.14 Tests: API read models, component tests, Playwright student journeys, axe, mobile widths
- [ ] C4.15 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p04): ...`

## Phase 5 — Assessment Workspace V3

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C5.01 Migration: assessment_client_events (idempotency), assessment_artifact_versions
- [ ] C5.02 Session metadata contract `GET /api/v1/assessment-sessions/:id` (scenario, job family, capabilities, artifacts, personas, progress, integrity policy, server clock) via adapters over the existing engine
- [ ] C5.03 `GET /api/v1/assessment-assignments/:id`, `POST .../start` (entitlement reserve, Idempotency-Key)
- [ ] C5.04 `POST /api/v1/assessment-sessions/:id/messages` idempotent by client_event_id; server controls next prompt
- [ ] C5.05 `PATCH .../artifacts/:artifactId` with version/ETag and 409 conflict
- [ ] C5.06 `POST .../finish` with required-opportunity check, early-exit, insufficient evidence instead of fabrication; resume support
- [ ] C5.07 Frontend feature module per §12.5 (AssessmentPlayerPage, header, panes, composer, save status, exit dialog, hooks, api)
- [ ] C5.08 artifactStore refactor §39.3 (server snapshot, optimistic mutation, unsaved queue, version, conflict)
- [ ] C5.09 Data-driven artifact components (no Lumina/marketing constants in generic components)
- [ ] C5.10 Autosave, saved indicator, reconnect banner, resume after refresh/disconnect
- [ ] C5.11 Mobile: supported-device warning + Conversation/Workspace tabs where permitted
- [ ] C5.12 Routes `/app/assessment/:sessionId` + `/workspace/:sessionId` redirect behind `PRISM_ASSESSMENT_WORKSPACE_V3`
- [ ] C5.13 Tests: idempotency, conflict, resume, Journey E (network interruption), static scan proves no hard-coded scenario
- [ ] C5.14 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p05): ...`

## Phase 6 — Student Report V3

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C6.01 Report V3 builder (`server/domain/reports/v3`) from evidence + sufficiency + claim registry; composite-free; external boundary
- [ ] C6.02 `GET /api/v1/assessment-sessions/:id/report` (owner + authorised sponsor only; audited)
- [ ] C6.03 Share grants API: create (resources, recipient scope, expiry), revoke, public token view with selective disclosure, audit
- [ ] C6.04 Sponsored-report sharing restriction §14.5
- [ ] C6.05 Frontend StudentReportPage: Summary / Evidence / Development / Methodology tabs, EvidenceTracePanel, max 3 priorities
- [ ] C6.06 Share dialog + revoke + expiry; PDF export (sanitised)
- [ ] C6.07 Routes `/app/reports/:sessionId`, `/report/:sessionId/v2` redirect; remove employee-switch link; unsupported readiness language gone
- [ ] C6.08 Tests: every displayed conclusion has evidence ids or is marked insufficient/provisional; Journey A + Journey D full E2E
- [ ] C6.09 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p06): ...`

## Phase 7 — Prism Campus administration

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C7.01 Migration: campus_programs (+ cohorts/assignments/interventions joins), student_import_jobs, student_import_rows, org_onboarding_progress, notifications
- [ ] C7.02 Org APIs: overview, students (server pagination + filters), student detail (authorised scope only)
- [ ] C7.03 Cohort + academic structure CRUD APIs
- [ ] C7.04 Student import: CSV upload → validated preview → commit; invite dispatch; no duplicate identities
- [ ] C7.05 Programs CRUD
- [ ] C7.06 Assessment assignment service (approved definitions only, window, integrity policy, accommodations, reminders, consent preview, completion monitoring)
- [ ] C7.07 Team/member management with role changes audited; limited org audit log API
- [ ] C7.08 Notifications (in-app + email via existing mailer) for invites/assignments
- [ ] C7.09 Frontend: Campus Overview (participation), Students directory, Student detail (privacy note)
- [ ] C7.10 Frontend: Cohorts + detail + import wizard with error preview
- [ ] C7.11 Frontend: Programs + detail, Campus Assessments (assignment wizard, completion)
- [ ] C7.12 Frontend: Members, Settings, onboarding wizard §37.1 (resumable)
- [ ] C7.13 Tests: RBAC per role, tenant isolation, 250-student import, Journey C E2E
- [ ] C7.14 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p07): ...`

## Phase 8 — Development Engine V2

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C8.01 Migration: development_plans, development_plan_items, development_missions, mission_versions, mission_attempts, practice_evidence_units, interventions, intervention_memberships
- [ ] C8.02 Mission schema §16.2 validation + versioning; existing seeded mission migrated as governed v1 practice content
- [ ] C8.03 Deterministic artifact validators
- [ ] C8.04 Structured evaluator via NEW versioned prompt file + existing AI gateway; identity-free payloads
- [ ] C8.05 Evidence extraction → practice_evidence_units only; uncertainty check; criterion feedback only for observed behaviours
- [ ] C8.06 Development APIs §32.2 + plan generation from Report V3 priorities
- [ ] C8.07 Campus interventions APIs (assign to cohort; completion never modifies formal scores)
- [ ] C8.08 Frontend: DevelopmentPage (plan, catalogue, completed), MissionPlayerPage (deliverable, artifacts, hint drawer, save, submit review, criterion feedback, retry)
- [ ] C8.09 Frontend: CampusDevelopmentPage intervention builder
- [ ] C8.10 Tests: formal/practice separation, evaluator never claims unobserved behaviour, idempotent attempts
- [ ] C8.11 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p08): ...`

## Phase 9 — Reassessment and growth

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C9.01 Migration: reassessment_cycles, assessment_form_equivalence, capability_growth_snapshots
- [ ] C9.02 Equivalence registry API (approval restricted + audited; agent approves nothing)
- [ ] C9.03 Reassessment cycle APIs (campus create/schedule; student list/start)
- [ ] C9.04 Growth snapshot generation only for APPROVED comparable forms
- [ ] C9.05 `/api/v1/me/growth` real data + campus outcome read model (comparable only)
- [ ] C9.06 Frontend: GrowthPage, GrowthDeltaCard, GrowthTimeline, non-comparable warning; campus Reassessments page
- [ ] C9.07 Tests: no delta for unapproved forms; approval RBAC + audit
- [ ] C9.08 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p09): ...`

## Phase 10 — Campus analytics and reporting

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C10.01 Analytics read models: capability distribution, evidence sufficiency, department/cohort comparison, completion funnel, mission completion, intervention outcome, insufficient-evidence rates
- [ ] C10.02 Small-group suppression (org-configurable, default 10) applied server-side to every aggregate
- [ ] C10.03 Analytics APIs + audited CSV export
- [ ] C10.04 Executive + department cohort report generation (no private personal data)
- [ ] C10.05 Frontend: CampusAnalyticsPage (lazy recharts), heatmap, distribution, intervention outcome, filter bar, sample sizes, accessible tables
- [ ] C10.06 Frontend: Campus Reports page; Overview capability + top-needs sections
- [ ] C10.07 Tests: suppression, no ranking, no composite, accessible table equivalents, export audit
- [ ] C10.08 Gates PASS, reviewer + UX auditor PASS, commit `feat(campus-p10): ...`

## Phase 11 — Billing, operations, integrations

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C11.01 Migration: campus_contracts (configurable components, pricing nullable/finance-only), usage ledger views, invoice export records
- [ ] C11.02 Contract → sponsorship entitlements; configurable billable event (default completed eligible assessment)
- [ ] C11.03 Usage ledger + invoice CSV export integration point
- [ ] C11.04 SSO-ready auth provider interface (no live SSO) + SIS import adapter interface (CSV adapter implemented)
- [ ] C11.05 Ops tooling: admin console pages for organizations, memberships, entitlements (existing admin RBAC)
- [ ] C11.06 Frontend: CampusBillingPage (usage/seats), Integrations page (honest "not connected"), student "Sponsored · No payment required"
- [ ] C11.07 Tests: B2C ₹499 flow and campus sponsorship independent; no price exposure to students
- [ ] C11.08 Gates PASS, reviewer PASS, commit `feat(campus-p11): ...`

## Phase 12 — Validation and controlled rollout hardening

Status: NOT_STARTED
Gates: NOT_RUN
Commit: —

- [ ] C12.01 Human double-rating queue for V3 evidence (reuse studies/rater workbench) + AI-human agreement computation wired to calibration
- [ ] C12.02 Claims register updated to actual validation state (unearned = PENDING)
- [ ] C12.03 Rollout plan: flag order, internal QA, test cohort, design partner, rollback per flag → `docs/campus/ROLLOUT_PLAN.md`
- [ ] C12.04 Security review pass (OWASP checklist, dep audit, CSP without unsafe-eval, sanitisation, secrets scan)
- [ ] C12.05 Performance review (route bundle sizes, lazy charts, local API p95 via loadtest script)
- [ ] C12.06 Accessibility: automated axe across all new routes + manual keyboard checklist recorded
- [ ] C12.07 Full E2E Journeys A–E across all Playwright projects
- [ ] C12.08 Definition of Done §58 matrix (30 items) with evidence or HA reference each
- [ ] C12.09 Final campus report → `docs/campus/CAMPUS_FINAL_REPORT.md`
- [ ] C12.10 Gates PASS, reviewer PASS, commit `feat(campus-p12): ...`

## Decisions log

Format: date · id · decision · reason · spec/charter § · reversible.

| Date | Id | Decision | Reason | § | Reversible |
| --- | --- | --- | --- | --- | --- |
| 2026-09-25 | K1 | Scenario freeze holds: agent builds scenario registry, metadata contract and fail-closed lookup; no new scored scenario content. §34 scenario families = HA-C003 | Charter §19 freeze + calibration law outrank a build spec | Spec §34, charter §19 | Yes |
| 2026-09-25 | K2 | All 9 campus flags registered DEFAULT OFF; tests/E2E enable them via env in the harness only; any real-environment flip = HA-C001 | ONE LAW | Spec §49, charter ONE LAW | Yes |
| 2026-09-25 | K3 | One stacked branch per phase `campus/pNN-<slug>`, one commit per phase, never pushed by the agent | Charter one-phase-per-branch + no shared-system actions | Spec §50, charter §28 | Yes |
| 2026-09-25 | K4 | New campus domains are PostgreSQL repositories with an in-memory adapter for unit tests; user ids are TEXT refs without FK to users (JSON store remains SoR until HA-023) | PG cutover not executed | Spec §30, charter §20 | Yes |
| 2026-09-25 | K5 | Contract pricing columns exist but stay NULL; agent never writes price values; students never receive prices; values = HA-C006 | Prior §22 decision: prices never enter DB until approved | Spec §38, charter §22 | Yes |
| 2026-09-25 | K6 | Fabrication removal is UNCONDITIONAL (claim-reducing, AIDF precedent 2026-08-04); `PRISM_EVIDENCE_FAIL_CLOSED` gates only new V3 status vocabulary on surfaces | Unflagged fabrication would persist otherwise | Spec §33, charter §7.2 | Yes |
| 2026-09-25 | K7 | Issued legacy reports stay immutable; Report V3 is a new builder; legacy V2 blobs render as issued on legacy/admin routes | Legacy immutability law | Spec §14, charter §6 | Yes |
| 2026-09-25 | K8 | Identity-out-of-models extends to organization, campus, cohort and programme names in every AI payload | Charter §5 names institution | Charter §5 | Yes |
| 2026-09-25 | K9 | react-router-dom v7 already installed; keep declarative `<Routes>` API, add lazy routes; no data-router migration | Minimise churn | Spec §5.4 | Yes |
| 2026-09-25 | K10 | No frontend unit runner exists; Phase 1 adds vitest + Testing Library; gates run `npm run test:unit --if-present` | Spec §48.3 requires component tests | Spec §48 | Yes |
| 2026-09-25 | K11 | Server test files that write the JSON store import `server/test-support/isolatedDataDir.js` first (own temp `DATA_DIR`); fixes the baseline cross-process lost-update race instead of re-running | Root-cause fix; no assertion weakened | Quality gates | Yes |
| 2026-09-25 | K12 | The frozen spec and `docs/campus/` (untracked at start) are committed in the Phase 0 commit so every later phase branch carries its programme state | State must travel with the stacked branches | Spec §50 | Yes |
| 2026-09-25 | K13 | Pre-existing strict-zone RAW_FETCH (`src/components/ui/measurement.jsx`) moved behind `src/api/evidence.js` in Phase 0 (identical behaviour) so the campus-scan gate is green from the start; Phase 1 re-bases `src/api/*` on the central client | Gate must pass; zero behaviour change | Spec §32 | Yes |
| 2026-09-25 | K14 | Gate runner test-count parser accepts the node spec reporter's `ℹ` prefix as well as TAP `#` (counts were printed as `?`) | Honest counts in evidence | Quality gates | Yes |
| 2026-09-25 | K15 | `PRISM/.github/**` (skill, gate runner, hooks) is not inside the `studai-prism` git repo and the workspace root is not a repository; those files are versioned by the workspace owner, not by campus phase commits | Scope rule: commits only in `studai-prism/` | Spec §50 | Yes |
| 2026-09-25 | K16 | Pre-existing swallowed errors in legacy UI (e.g. `ClaimsProvider` `.catch(() => {})`) are left unchanged in Phase 0 (zero behaviour change) and replaced by explicit error states when the component moves onto the Phase 1 API client | Phase 0 forbids behaviour change | Spec §53 | Yes |
| 2026-09-25 | K17 | `audit-results/` is git-ignored: gate JSON/logs and baseline screenshots are local evidence regenerated by the gate runner / `@campus-screens` spec, not committed | Existing `.gitignore` convention | Quality gates | Yes |
| 2026-09-25 | K18 | The PERSONAL workspace is derived per authenticated user with the stable id `personal` (no DB row); `workspaces` rows hold CAMPUS_* contexts only. Direct customers therefore work with or without the campus store | Contract §4 "lazily created" would make B2C depend on PG | Spec §4.2, contract §4 | Yes |
| 2026-09-25 | K19 | App shells own `<main id="main">` (skip-link target always exists); pages render sections inside it. `claimsCeiling` route-identifier exemption extended from `App.jsx` to `src/app/AppRouter.jsx` because the identical route table moved there | Structural move, no copy change | Spec §8.3, charter claims ceiling | Yes |
| 2026-09-25 | K20 | Campus e2e runs against a SECOND isolated audit server (:4174, `PRISM_AUDIT_CAMPUS=true` sets the 9 flags in that throwaway process only); legacy specs keep the flags-off server (:4173) so the direct flow is always re-proven | K2: flags on only inside test processes | Spec §48.4 | Yes |
| 2026-09-25 | K21 | Campus navigation permission keys (`org.overview.read`, `students.read`, `cohorts.read`, `programs.read`, `assignments.read`, `interventions.read`, `reassessments.read`, `analytics.read`, `reports.read`, `team.read`, `integrations.read`, `billing.read`, `org.settings.read`) are the UI visibility contract; the Phase 3 permission matrix must define them | Role-aware nav §19.1 before RBAC lands | Spec §19.1, §29 | Yes |
| 2026-09-25 | K22 | V3 routes enabled before their phase's page exists render an honest "not available yet" page linking to the working legacy page (never a mock); unreachable in real environments while flags are OFF | No fake content; legacy stays reachable | Spec §6.5, §53 | Yes |
| 2026-09-25 | K23 | Phase 1 empty-state copy ("No assessments yet" etc.) is unconditional only while `PRISM_APP_SHELL_V3` is dark; Phase 4 replaces every Phase 1 section page with data-backed read models before the shell can be proposed for a flip | Copy must not assert facts the page did not check | Spec §40, §52 | Yes |
| 2026-09-25 | K24 | A 401 from `GET /api/v1/me` signs the browser out on any page (the token is invalid/revoked server-side, so every later call would fail too); other `/me` failures leave flags OFF on legacy pages and show a retryable ErrorState on shell/campus routes | Fail closed without breaking legacy B2C when v1 has an outage | Spec §32.1, §40 | Yes |
| 2026-09-25 | K25 | Dark `/app/*` (shell off) and `/campus/*` (campus off) URLs redirect to `/` exactly like unknown legacy URLs, so a dark route is indistinguishable from a missing one; V3 placeholders link to legacy with `?legacy=1`, which `LegacyAlias` always honours. Flip precondition (Phase 3/4): shell/campus gating must become anonymous-safe so signed-out deep links reach `/login?next=` instead of `/` | Dark-route parity + no redirect loops | Spec §6.5 | Yes |
| 2026-09-25 | K26 | DB-gated suites run locally against PGlite (`PRISM/.tools/pglite/serve.mjs`, in-memory, `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres`) — a throwaway test database only, outside the repo; CI keeps real Postgres | No local Postgres/Docker; DB suites must not be SKIPPED | Spec §48, campus-testing rules | Yes |
| 2026-09-25 | K27 | `adminPhase2.db.test.js` asserted the internal composite (`overall === 63`) on the external admin report; updated to `undefined` (charter §6 composite hidden) — the test was stale since the remediation programme, not weakened | Charter §6 outranks a stale assertion | Charter §6 | Yes |
| 2026-09-25 | K28 | `0025_evidence_fail_closed.down.sql` restores the 0024 `VERIFIED_CONSENSUS` default with an inline `campus-allow SQL_DEFAULT_VERIFIED` (exact reversal, rollback only); rollback deliberately fails while strict rows with NULL judgement fields exist | Down must reverse exactly and never invent values | Campus DB rules | Yes |
| 2026-09-25 | K29 | Legacy e2e specs `prism-next-marketing.spec.js` / `prism-next-reality.spec.js` asserted fabricated content (scripted Lumina dialogue, "±3.1 pts", "82%", "Rubric Level 4 Achieved!") and seeded sessions into the Playwright process's own store; rewritten to assert the fail-closed truth through the real API (35 tests) | K6 fabrication removal; tests must test reality | Spec §33, §53 | Yes |
| 2026-09-25 | K30 | Ecosystem example roles (`routes/ecosystem.js`) and the ScoreReport opportunities block no longer claim "verified strengths" or matching; they are labelled as example roles not matched to the result | No capability-level verification/match claims (C2.04) | Spec §18, §33 | Yes |
| 2026-09-25 | K31 | The legacy workspace sends only `sessionId` to `/start` (server chooses the scenario); an explicit `?assessment=<id>` is forwarded untouched from Briefing and validated server-side (422 `SCENARIO_NOT_FOUND`). The marketing simulation is reachable only by explicit id until Phase 4 assignments supply it | Scenario identity from server session metadata, never client constants | Spec §12.2, §34.3 | Yes |
| 2026-09-25 | K32 | `evidenceGraph`, `occupationalGraph` and `routes/missions` imported `getPool` from `lib/dbPg.js`, which does not export it — every PG path threw and silently fell back to memory. Fixed to `db/pool.js`; with `DATABASE_URL` set, evidence units persist and blueprints/missions read from their tables | Latent defect surfaced by the 0025 DB test | Spec §30.8 | Yes |
| 2026-09-25 | K33 | Legacy practice-mission page keeps one response box (the only input the interim evaluator checks); the marketing-specific sliders that were never evaluated and the 20-minute countdown were removed | Inputs that are never checked imply feedback that does not exist | Spec §16, §33 | Yes |
| 2026-09-25 | K34 | Report V2 on legacy routes is on-demand and fail closed; it renders the new server shape (status + reasons, verbatim quotes, claim-backed strengths) and Phase 6 Report V3 supersedes it | K6/K7 | Spec §14, §33 | Yes |
| 2026-09-25 | K35 | Default sufficiency rules ship `UNCALIBRATED` + approval `PROVISIONAL`, so no capability can reach SUFFICIENT until HA-C002 approves thresholds; PROVISIONAL is the ceiling and is labelled as such | Fail closed until measurement governance decides | Spec §33.2, HA-C002 | Yes |
| 2026-09-25 | K36 | The gate runner's concurrent server suite runs with `TEST_DATABASE_URL` blanked (as CI does); DB suites share one database and run only in the serial DB step — running them concurrently races (migration walk-down vs store tests) | Mirror CI; no test weakened | Quality gates | Yes |
| 2026-09-25 | K37 | Legacy work-material components: only types present in governed content (analytics dashboard, ticket log, budget modeler) are kept, rebuilt to render only artifact data (no sample figures, hints, keyword tags, client-side CAC/ROAS projections or emoji). The nine unreachable fixture-filled primitives (email, chat, memo, brief, calendar, board, spreadsheet, transcript, policy) were removed (git history keeps them); unknown types render "cannot be displayed". Data-driven primitives for every type arrive with Workspace V3 (C5.09) | Reviewer finding: fixtures shipped as fallbacks and false "recorded/deployed" confirmations | Spec §12.2, §33, §53 | Yes |
| 2026-09-25 | K38 | With a database configured, a failed evidence-unit insert now throws (logged) instead of silently falling back to memory — the artifact save returns 500 and the UI shows "Not saved — retry" | A memory fallback bypassed the 0025 CHECKs and lost evidence on restart | Spec §33.1 | Yes |
| 2026-09-25 | K39 | Sufficiency thresholds have non-overridable floors (`RULE_FLOORS`: ≥ 3 units, ≥ 2 independent opportunities) applied in `rulesFor` and inside `evaluateCapability` | "Two rows alone never produce SUFFICIENT" must hold for any configuration | Spec §33.2 | Yes |
| 2026-09-25 | K40 | Legacy marketing copy "Verified result" / "Verified Prism Score" reworded to "verifiable" (credential integrity is the true claim; measurement verification is not claimed) | Reviewer note; claim-reducing | Spec §33, charter claims ceiling | Yes |
| 2026-09-25 | K41 | The ScoreReport `?demo=1` sample (named person, invented dimension scores) was removed; the page shows only issued reports | K6 unconditional fabrication removal | Spec §33, §53 | Yes |
| 2026-09-25 | K42 | Artifact saves: unknown `artifactId` → 404 `ARTIFACT_NOT_FOUND` (never `ok:true`); the evidence write happens before the session state changes; an evidence-ledger PG read failure now throws (outage ≠ insufficient evidence) | Reviewer notes; fail closed on errors | Spec §33.1, §53 | Yes |

## Risks

| Risk | Severity | Owner | Mitigation | Blocking |
| --- | --- | --- | --- | --- |
| Local Postgres unavailable → DB-gated suites SKIPPED locally | P2 | Operator | PGlite throwaway DB runs them locally (K26); CI Postgres service runs them in CI | No |
| Capability level labels not yet finalised by measurement governance | P1 | Psychometrics (HA-C002) | Labels live in one governed constant marked PROVISIONAL | Campus rollout |
| Legacy `/explore` had 21 serious axe issues and "Prism Next" copy | P3 | Engineering | Resolved in Phase 2: page rebuilt on the design system; axe-clean in `campus-insufficient.spec.js`; Explore V2 (C4.10) replaces it | No |
| No capability can be SUFFICIENT until sufficiency thresholds are approved | P1 | Psychometrics (HA-C002) | Reports show PROVISIONAL / INSUFFICIENT honestly (K35) | Campus rollout |
| With `DATABASE_URL` set, PG reads for blueprints/missions/evidence now actually execute (K32) — behaviour depends on seeded tables | P2 | Engineering | Memory fallback kept when a table is empty; DB suites cover the evidence table | No |
| Legacy `/api/assessment/report/:id/v2` and `/employee` have no authentication/ownership check (pre-existing): anyone with a session id sees the candidate name and, once judged evidence exists, verbatim quotes | P1 | Engineering | Phase 3 scope/permission middleware + Phase 6 owner/sponsor-only report API (C6.02) replace these routes | Campus rollout |
| Legacy workspace calls `/start` on every load, so a refresh restarts the conversation (pre-existing) | P2 | Engineering | Phase 5 resume/idempotent session contract (C5.02, C5.06, C5.10) | Workspace V3 flip |
| `ScoreReport` `?demo=1` sample hard-codes a name and invented scores; server maps `jobFamilyId` STUDAI-JF-MKT-L1 → marketing scenario at `/start` (pre-existing) | P2 | Engineering | Phase 4 assignment catalogue supplies assessment ids; Phase 6 report rebuild removes the demo sample | Campus rollout |

## Session handoff

1. Read this file, then [CAMPUS_HUMAN_ACTIONS.md](./CAMPUS_HUMAN_ACTIONS.md), then the spec sections for the active phase.
2. `git -C studai-prism status` — never overwrite uncommitted human work.
3. Resume with `/campus-status` (read-only) or the active phase prompt.
