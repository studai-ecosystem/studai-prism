# Prism Campus — Baseline Inventory (Phase 0)

Recorded 2026-09-25 on branch `campus/p00-baseline` at `63d320d` (= spec baseline). Paths are
relative to `studai-prism/`. This is a snapshot of the pre-campus code; later phases change it.

## 1. Frontend routes (`src/App.jsx`) — C0.03

All pages are eagerly imported (no lazy loading). `RequireAuth` (`src/App.jsx:66`) synchronously
checks `isAuthenticated()` from `src/lib/session.js` and redirects to `/register`.

| Path | Component | Guard |
| --- | --- | --- |
| `/` | `pages/LandingPage.jsx` | none |
| `/login`, `/register` | `pages/Auth.jsx` | none |
| `/research/science`, `/research/validity`, `/research/ai-evaluation` | `pages/research/*` | none |
| `/research/blog`, `/research/blog/:slug` | `pages/research/Blog.jsx`, `BlogPost.jsx` | none |
| `/about`, `/about/mission`, `/about/careers` | `pages/about/*` | none |
| `/privacy`, `/terms`, `/refund-policy`, `/security`, `/contact` | `pages/legal/LegalPages.jsx` | none |
| `/design-system` | `pages/DesignSystem.jsx` | admin token checked in-page |
| `/admin/login` | `pages/admin/AdminLogin.jsx` | none |
| `/admin` + 31 nested routes (admins, candidates[/:id], sessions[/:id], reports[/:sessionId], disputes[/:sessionId], payments, invites, margin, consents, verifications, integrity, bank, calibrations, raters, studies, prompts, psychometrics, credentials, replays, teamfit, exports, content, flags, system, privacy, audit) | `pages/admin/*` | AdminShell bootstrap via `lib/adminApi.js`; server RBAC |
| `/admin/legacy-ops` | `pages/Admin.jsx` | `x-admin-token` (sessionStorage) |
| `/app` | `pages/ShellHome.jsx` | in-page auth state |
| `/invite/:token` | `pages/InviteRedeem.jsx` | none |
| `/payment` | `pages/Payment.jsx` | RequireAuth |
| `/verify-identity` | `pages/VerifyIdentity.jsx` | RequireAuth |
| `/link-phone` | `pages/LinkPhone.jsx` | RequireAuth |
| `/m/:pairCode` | `pages/PhoneProctor.jsx` | none |
| `/room-scan` | `pages/RoomScan.jsx` | RequireAuth |
| `/briefing` | `pages/Briefing.jsx` | RequireAuth |
| `/assessment` | `pages/Assessment.jsx` | none (server checks session) |
| `/score` | `pages/ScoreReport.jsx` | none (server checks) |
| `/verify/:id` | `pages/Verify.jsx` | none (public credential) |
| `/rater` | `pages/RaterWorkbench.jsx` | rater token (sessionStorage) |
| `/profile` | `pages/Profile.jsx` | RequireAuth |
| `/explore` | `pages/ExploreMode.jsx` | none |
| `/workspace/:sessionId` | `pages/AssessmentWorkspace.jsx` | none |
| `/report/:sessionId/v2` | `pages/StudentReportV2.jsx` | none |
| `/report/:sessionId/employee` | `pages/EmployeeReportV2.jsx` | none |
| `/missions`, `/missions/:missionId` | `pages/DevelopmentMission.jsx` | none |
| `*` | `Navigate to /` | — |

## 2. Token and fetch call sites — C0.03

Token storage (`src/lib/session.js`): keys `prism_token`, `prism_user` (read `:9`, `:17`; write `:22`
and via private `persist` `:25` at `:32-33`; remove `:38-39`); exports `getUser`, `getToken`, `setToken`,
`clearUser`, `isAuthenticated`, `register`, `confirmAge`, `login`, `updateProfile`, `fetchMe`.
Change-password is a direct fetch in `src/pages/Profile.jsx:88`.

Every `localStorage` / `sessionStorage` access in `src/**`:

| File:line | Key | Note |
| --- | --- | --- |
| `src/lib/session.js:9, 17, 22, 32, 33, 38, 39` | `prism_user`, `prism_token` | the only real auth token |
| `src/pages/AssessmentWorkspace.jsx:31, 98, 142` | `localStorage 'token'` | wrong key — never set by the app, so workspace calls go unauthenticated |
| `src/pages/StudentReportV2.jsx:15` | `localStorage 'token'` | same wrong key |
| `src/pages/EmployeeReportV2.jsx:13` | `localStorage 'token'` | same wrong key |
| `src/lib/artifactStore.js:72` | `localStorage 'token'` | same wrong key |
| `src/pages/Admin.jsx:107, 151, 167` | `sessionStorage` admin token (`TOKEN_KEY`) | legacy ops cockpit |
| `src/pages/DesignSystem.jsx:46, 54` | `sessionStorage prismDsUnlocked` | design-system unlock |
| `src/pages/RaterWorkbench.jsx:82, 114` | `sessionStorage prismRaterToken` | study rater |
| `src/pages/Auth.jsx:47, 90`, `src/pages/InviteRedeem.jsx:23, 37` | `sessionStorage prismInviteToken` | invite handoff |
| `src/lib/proctorLink.js:44, 50, 58` | `sessionStorage` pair code per session | phone proctor pairing |
| `src/components/AppHandoff.jsx:20, 48` | `sessionStorage` dismiss flag | UI only |
| `src/pages/Briefing.jsx:46, 148`, `src/pages/Assessment.jsx:450, 825`, `src/pages/ScoreReport.jsx:251, 461` | `localStorage prismUserName` | display name; `Assessment.jsx:825` sends it to `/api/assessment/start` as `candidateName` (server tokenises it out of AI payloads — charter §5) |
| `src/pages/Briefing.jsx:159, 172`, `src/pages/Assessment.jsx:445, 824`, `src/pages/ScoreReport.jsx:462` | `localStorage prismCharacter` | avatar choice |
| `src/pages/Briefing.jsx:65, 109`, `src/pages/Assessment.jsx:834` | `localStorage prismLanguage` | language choice |

Every direct `fetch(` call site (no shared client exists at baseline). Admin pages call
`adminFetch()` (`src/lib/adminApi.js:53`, which wraps `fetch` at `:55` and `:117`) for every
`/api/admin/*` endpoint; those ~120 admin call sites are listed per file in §2.1.

| File:line | Method + endpoint |
| --- | --- |
| `src/api/evidence.js:4` | GET `/api/evidence/claims` (moved here from `src/components/ui/measurement.jsx:26` in Phase 0, K13) |
| `src/components/story/StoryHonesty.jsx:23` | GET `/api/evidence/adversarial` |
| `src/lib/session.js:49` | POST `/api/auth/register`, `/api/auth/login` (`postJSON` helper) |
| `src/lib/session.js:77` | POST `/api/auth/confirm-age` |
| `src/lib/session.js:99` | PATCH `/api/auth/me` (`updateProfile`) |
| `src/lib/session.js:123` | GET `/api/auth/me` (`fetchMe`) |
| `src/lib/artifactStore.js:76` | POST `/api/assessment/artifacts/:sessionId` |
| `src/lib/voice.js:199` | POST `/api/assessment/speech` |
| `src/lib/adminApi.js:36` | POST `/api/admin/auth/refresh` |
| `src/lib/adminApi.js:55` | any `/api/admin/*` (adminFetch) |
| `src/lib/adminApi.js:88` | POST `/api/admin/auth/login` |
| `src/lib/adminApi.js:104` | POST `/api/admin/auth/mfa/setup` |
| `src/lib/adminApi.js:117` | POST `/api/admin/auth/mfa/confirm` or `/mfa/verify` |
| `src/pages/admin/AdminShell.jsx:109` | POST `/api/admin/auth/refresh` (probe) |
| `src/pages/Admin.jsx:26` | GET `/api/pilot/*` via `useAdminFetch` (`:129-132` dashboard, sentinels, flip-check, report/weekly; `:183` incident/:id) |
| `src/pages/Admin.jsx:148, 165` | GET `/api/pilot/dashboard` |
| `src/pages/DesignSystem.jsx:52` | GET `/api/pilot/dashboard` (unlock probe) |
| `src/pages/Assessment.jsx:500` | GET `/api/assessment/stt-status` |
| `src/pages/Assessment.jsx:511` | GET `/api/assessment/tts-status` |
| `src/pages/Assessment.jsx:534, 692` | POST `/api/assessment/event` |
| `src/pages/Assessment.jsx:552` | GET `/api/payment/config` |
| `src/pages/Assessment.jsx:826` | POST `/api/assessment/start` |
| `src/pages/Assessment.jsx:889` | GET `/api/assessment/evaluate-status/:sessionId` |
| `src/pages/Assessment.jsx:900, 913` | POST `/api/assessment/evaluate` |
| `src/pages/Assessment.jsx:980` | POST `/api/assessment/message` |
| `src/pages/Assessment.jsx:1046` | POST `/api/assessment/transcribe` |
| `src/pages/AssessmentWorkspace.jsx:36` | GET `/api/assessment/artifacts/:sessionId` |
| `src/pages/AssessmentWorkspace.jsx:44` | POST `/api/assessment/start` |
| `src/pages/AssessmentWorkspace.jsx:102` | POST `/api/assessment/message` |
| `src/pages/AssessmentWorkspace.jsx:146` | POST `/api/assessment/evaluate` |
| `src/pages/Briefing.jsx:92` | GET `/api/assessment/languages` |
| `src/pages/Briefing.jsx:99` | GET `/api/auth/me` |
| `src/pages/Briefing.jsx:184` | POST `/api/assessment/consent` |
| `src/pages/Briefing.jsx:200` | POST `/api/assessment/calibrate` |
| `src/pages/Briefing.jsx:610` | POST `/api/assessment/accommodation` |
| `src/pages/DevelopmentMission.jsx:21` | GET `/api/missions/:missionId` |
| `src/pages/DevelopmentMission.jsx:46` | POST `/api/missions/:missionId/submit` |
| `src/pages/EmployeeReportV2.jsx:17` | GET `/api/assessment/report/:sessionId/employee` |
| `src/pages/ExploreMode.jsx:98` | POST `/api/job-families/explore` |
| `src/pages/InviteRedeem.jsx:30` | POST `/api/payment/invite/redeem` |
| `src/pages/InviteRedeem.jsx:40` | GET `/api/payment/config` |
| `src/pages/LinkPhone.jsx:41` | POST `/api/device/pair` |
| `src/pages/LinkPhone.jsx:57` | GET `/api/device/network-info` |
| `src/pages/Payment.jsx:49` | POST `/api/payment/verify` |
| `src/pages/Payment.jsx:86` | POST `/api/payment/invite/redeem` |
| `src/pages/Payment.jsx:93, 104, 118` | GET `/api/payment/config` |
| `src/pages/Payment.jsx:128` | POST `/api/payment/create-order` |
| `src/pages/Payment.jsx:143` | POST `/api/payment/dev-session` |
| `src/pages/Profile.jsx:88` | POST `/api/auth/change-password` |
| `src/pages/Profile.jsx:110` | DELETE `/api/assessment/candidate-data` |
| `src/pages/Profile.jsx:164` | GET `/api/assessment/history` |
| `src/pages/Profile.jsx:183` | GET `/api/payment/licence` |
| `src/pages/RaterWorkbench.jsx:19` | GET/POST `/api/studies/rater/*` |
| `src/pages/RoomScan.jsx:163` | POST `/api/assessment/event` |
| `src/pages/ScoreReport.jsx:221` | GET `/api/assessment/report/:sessionId` |
| `src/pages/ScoreReport.jsx:261` | GET `/api/ecosystem/aligned-jobs` |
| `src/pages/ScoreReport.jsx:274` | POST `/api/ecosystem/handover-token` |
| `src/pages/ScoreReport.jsx:434` | POST `/api/assessment/dispute` |
| `src/pages/ScoreReport.jsx:460` | DELETE `/api/assessment/data/:sessionId` |
| `src/pages/ScoreReport.jsx:602` | POST `/api/assessment/send-report` |
| `src/pages/ShellHome.jsx:25` | GET `/api/payment/licence` |
| `src/pages/StudentReportV2.jsx:19` | GET `/api/assessment/report/:sessionId/v2` |
| `src/pages/Verify.jsx:90` | GET `/api/credentials/:id/verify` |
| `src/pages/VerifyIdentity.jsx:193` | POST `/api/assessment/verify-identity` |
| `src/pages/VerifyIdentity.jsx:215` | GET `/api/payment/config` |
| `src/pages/VerifyIdentity.jsx:216` | GET `/api/assessment/accommodation/:sessionId` |
| `src/pages/research/Blog.jsx:11` | GET `/api/content/blog` |
| `src/pages/research/BlogPost.jsx:13` | GET `/api/content/blog/:slug` |
| `src/pages/about/Careers.jsx:16` | POST `/api/content/careers/:id/apply` |
| `src/pages/about/Careers.jsx:129` | GET `/api/content/careers` |

### 2.1 Admin `adminFetch` call sites (all `/api/admin/*`, server `server/routes/admin/*`)

`AdminAdmins.jsx:44, 45, 46, 70, 87, 99` · `AdminAudit.jsx:37, 91, 169` · `AdminBank.jsx:23, 29` ·
`AdminCalibrations.jsx:24, 35, 51` · `AdminCandidateDetail.jsx:27, 76, 188` ·
`AdminContent.jsx:46, 63, 72, 84, 93, 139, 197, 223, 275, 315, 322` ·
`AdminCredentials.jsx:29, 30, 56, 63, 70, 76` · `AdminDashboard.jsx:33, 34` ·
`AdminDisputes.jsx:79, 117, 168, 181, 192, 224` · `AdminExports.jsx:19, 32` ·
`AdminFlags.jsx:21, 41, 103, 111, 119, 126` · `AdminInvites.jsx:31, 41, 69, 81` · `AdminMargin.jsx:35, 36, 45` ·
`AdminPayments.jsx:22` · `AdminPrivacy.jsx:41, 94, 140, 147, 156, 165, 177, 188, 213, 224` ·
`AdminPrompts.jsx:28, 37, 44, 67, 78, 86, 95` · `AdminPsychometrics.jsx:35` · `AdminRaters.jsx:23, 24, 25, 50, 64` ·
`AdminRecords.jsx:56, 125` · `AdminReplays.jsx:20, 31, 42, 56` · `AdminReports.jsx:69, 106` ·
`AdminSessionDetail.jsx:21, 226` · `AdminShell.jsx:118, 275` · `AdminStudies.jsx:28, 29, 51, 62, 71, 77, 87, 156` ·
`AdminSystem.jsx:30, 31, 32` · `AdminTeamfit.jsx:22, 48, 60, 67, 75, 160` · `ui.jsx:94, 213` ·
`lib/adminApi.js:132, 143` (password change, logout).

## 3. Backend endpoints used by the frontend — C0.04

Mounts in `server/app.js` (after helmet → cors → request logger → rate limits → JSON parser),
then SPA fallback, then `404 { error: 'Not found' }`, then the 500 handler. Handlers (file:line of
the `router.<method>(` call):

| Mount | Handlers |
| --- | --- |
| `/api/auth` → `server/routes/auth.js` | POST `/register` `:35` (201 `{ token, user }` `:79`) · POST `/confirm-age` `:90` · POST `/login` `:121` · GET `/me` `:153` · PATCH `/me` `:188` · POST `/change-password` `:240` |
| `/api/payment` → `server/routes/payment.js` | GET `/config` `:58` · POST `/create-order` `:76` · POST `/verify` `:107` · POST `/dev-session` `:159` · POST `/invite/redeem` `:178` · GET `/licence` `:230` |
| `/api/assessment` → `server/routes/assessment.js` | POST `/start` `:535` · POST `/message` `:845` · POST `/evaluate` `:1160` · GET `/evaluate-status/:sessionId` `:1211` · POST `/verify-identity` `:1624` · GET `/verify-identity/:sessionId` `:1658` · GET `/stt-status` `:1668` · GET `/tts-status` `:1676` · POST `/speech` `:1701` · GET `/languages` `:1756` · POST `/transcribe` `:1766` · POST `/event` `:1796` · GET `/report/:sessionId` `:1833` · GET `/report/:sessionId/v2` `:1842` · GET `/report/:sessionId/employee` `:1857` · GET `/artifacts/:sessionId` `:1872` · POST `/artifacts/:sessionId` `:1895` · POST `/send-report` `:1953` · GET `/history` `:2009` · POST `/calibrate` `:2101` · POST `/consent` `:2211` · POST `/accommodation` `:2248` · GET `/accommodation/:sessionId` `:2276` · POST `/dispute` `:2291` · DELETE `/data/:sessionId` `:2338` · DELETE `/candidate-data` `:2357` |
| `/api/device` → `server/routes/device.js` | POST `/pair` `:34` · GET `/pair/:pairCode` `:48` · GET `/network-info` `:57` |
| `/api/content` → `server/routes/content.js` | GET `/blog` `:23` · GET `/blog/:slug` `:34` · GET `/careers` `:47` · POST `/careers/:id/apply` `:58` |
| `/api/credentials` → `server/routes/credentials.js` | GET `/:sessionId/verify` `:88` (public) |
| `/api/studies` → `server/routes/studies.js` | rater: GET `/rater/me` `:165` · GET `/rater/training/next` `:179` · POST `/rater/training/:refId` `:191` · GET `/rater/queue/next` `:232` · POST `/rater/rate/:sessionId` `:249` |
| `/api/evidence` → `server/routes/evidence.js` | GET `/claims` `:25` · GET `/adversarial` `:69` |
| `/api/ecosystem` → `server/routes/ecosystem.js` | GET `/aligned-jobs` `:72` · POST `/handover-token` `:112` |
| `/api/job-families` → `server/routes/jobFamilies.js` | GET `/` `:8` · GET `/:id` `:18` · GET `/:id/neighborhood` `:33` · POST `/explore` `:48` |
| `/api/missions` → `server/routes/missions.js` | GET `/` `:87` · GET `/:id` `:104` · POST `/:id/submit` `:122` |
| `/api/pilot` → `server/routes/pilot.js` | GET `/dashboard` `:141` · GET `/sentinels` `:151` · GET `/incident/:sessionId` `:169` · GET `/report/weekly` `:214` · GET `/flip-check` `:257` |
| `/api/assessments/catalog`, `/api/catalog` → `server/routes/catalog.js` | GET `/` `:74` |
| `/api/admin` → `server/routes/admin/index.js` | every `adminFetch` path (dark unless `PRISM_ADMIN_CONSOLE`) |
| `/api/psychometrics`, `/api/replay`, `/api/teamfit`, `/.well-known` | not called by candidate UI (admin/dark/public keys) |
| `/api/health` | inline in `server/app.js` |

Auth: each router carries its own `getAuthUser` copy (`server/routes/assessment.js:89`,
`server/routes/payment.js:218`) — JWT via `getJwtSecret()`, returns `{ id, email }`, no token-version check.

## 4. Feature flags — C0.05

`server/lib/flagRegistry.js` `FLAG_CATALOGUE` entries `{ key, risk, owner, description, dataGate }`;
`liveFlagState(key)` reads `process.env[key] === 'true'`. Science-gated flags additionally live in
`server/lib/flagMap.js` (`checkFlag` returns GO / NO-GO / ESCALATE from DB preconditions).

Pre-existing (27): `PRISM_V2_EXECUTIVE`, `PRISM_V2_DUAL_SCORER`, `PRISM_V2_EQUATING`, `PRISM_V2_EARLY_STOP`,
`PRISM_PRESSURE`, `PRISM_STANDARDIZED_CORE`, `PRISM_IDENTITY_L3`, `PRISM_UNDER18_PATH`,
`PRISM_PROCTOR_PHONE_CAM`, `PRISM_PROCTOR_GAZE`, `PRISM_DEMOGRAPHICS`, `PRISM_RETENTION_ENFORCEMENT`,
`PRISM_LANG`, `PRISM_VELOCITY`, `PRISM_REPLAY`, `PRISM_TEAMFIT`, `PRISM_V2_TELEMETRY`, `PRISM_GLASS_BOX`,
`PRISM_ADMIN_CONSOLE`, `PRISM_ADMIN_PROMPT_REGISTRY`, `PRISM_CMS_DB`, `PRISM_TTS_NEURAL`, `PRISM_PG_STORE`,
`PRISM_DUMMY_PAYMENTS`, `PRISM_SKIP_VERIFICATION`, `PRISM_DRIFT_HARD`, `PRISM_STUDY_STEERING_AB`.

Campus flags registered in Phase 0 (C0.06), all OFF, flip = HA-C001:

| Flag | Risk | Owner |
| --- | --- | --- |
| `PRISM_APP_SHELL_V3` | medium | product |
| `PRISM_EVIDENCE_FAIL_CLOSED` | high | psychometrics |
| `PRISM_STUDENT_REPORT_V3` | high | psychometrics |
| `PRISM_ASSESSMENT_WORKSPACE_V3` | medium | engineering |
| `PRISM_CAMPUS_ENABLED` | high | product |
| `PRISM_CAMPUS_ANALYTICS` | high | psychometrics |
| `PRISM_DEVELOPMENT_V2` | high | psychometrics |
| `PRISM_GROWTH_ENABLED` | high | psychometrics |
| `PRISM_ROLE_EXPLORATION_V2` | medium | product |

Test: `server/test/campusFlags.test.js`.

## 5. Hard-coded / unsafe values (fixed in Phase 2 unless noted)

| Value | File:line | Captured by |
| --- | --- | --- |
| `scenarioId: 'prism-sim-mkt-l1'`, `jobFamilyId: 'STUDAI-JF-MKT-L1'` sent by the client | `src/pages/AssessmentWorkspace.jsx:49-50` | `campusKnownUnsafe` (C2.14) |
| Fallback stakeholder dialogue (Elena/Marcus turns) | `src/pages/AssessmentWorkspace.jsx:57-66, 111-128` | `campusKnownUnsafe` (C2.14) |
| "Lumina Botanicals" loading copy, title and briefing | `src/pages/AssessmentWorkspace.jsx:163, 182, 216` | `campusKnownUnsafe` (C2.14) |
| "PRISM NEXT" / "Prism Next" customer copy | `src/pages/AssessmentWorkspace.jsx:179`, `src/pages/StudentReportV2.jsx:87`, `src/pages/EmployeeReportV2.jsx:75`, `src/pages/DevelopmentMission.jsx:87`, `src/pages/ExploreMode.jsx:149` | C2.13 |
| "12-Section" customer copy | `src/pages/StudentReportV2.jsx:41` | C2.13 |
| Emoji icons / section headers | `src/pages/ExploreMode.jsx:10, 17, 24, 31, 38, 45, 226, 253, 257, 261, 283, 303, 321`, `src/pages/StudentReportV2.jsx:139, 143, 149, 288, 334, 357, 380, 548`, `src/pages/AssessmentWorkspace.jsx:214, 220, 226, 316, 317, 318, 337` (the check mark `✓` at `ExploreMode.jsx:214` and `StudentReportV2.jsx:449` falls inside the campus-scan `EMOJI_LABEL` range U+2600–U+27BF, so it is listed too and replaced by an icon component when the page moves into a strict zone) | C2.13 |
| Lumina literals in generic artifact components | `src/components/artifacts/BrandCreativeBrief.jsx:8`, `EmailThread.jsx:14, 21, 30, 42, 49`, `ExecutiveMemo.jsx:8`, `TeamChat.jsx:24` | C5.09 |
| Scenario-bank unknown-id fallback `\|\| PRE_APPROVED_SCENARIOS['prism-sim-mkt-l1']` | `server/lib/scenarioBank.js:110` | `campusKnownUnsafe` (C2.05, behavioural) |
| Start maps `jobFamilyId === 'STUDAI-JF-MKT-L1'` to the marketing scenario | `server/routes/assessment.js:651` | C2.05 |
| `findScenario` special-cases the marketing id | `server/routes/assessment.js:769-790` | C2.05 |
| `test-mkt-session-` prefix revives the marketing scenario for unknown sessions | `server/routes/assessment.js:814-826` | `campusKnownUnsafe` (C2.05, behavioural via `/artifacts`) |
| Unknown session → marketing artifacts + title from `GET /artifacts/:sessionId` | `server/routes/assessment.js:1876-1880` | `campusKnownUnsafe` (C2.05, behavioural) |
| `getScenarioByAssessmentId(... \|\| 'prism-sim-mkt-l1') \|\| { title: 'Lumina Botanicals' }`, fixed `STUDAI-JF-MKT-L1` | `server/lib/reportV2.js:17-19, 284` | `campusKnownUnsafe` (C2.05/C2.06) |
| reportV2 fallback scores `72 + idx*3`, `78 - idx*2`, levels `3 + idx%2`, `4 - idx%2`, invented quotes | `server/lib/reportV2.js:54-92` (layer 1 `:56-59`, layer 2 `:78-82`) | `campusKnownUnsafe` (C2.06) |
| reportV2 fixed archetype/readiness/strengths/SEM `±3.1`/CI `[73.2, 79.4]`/"Level 3.8"/role fallbacks/neighbourhood weights/fixed artifact findings | `server/lib/reportV2.js:105-275` | C2.06 |
| Evidence unit defaults `rubric_level \|\| 3`, `'Competent'`, `'VERIFIED_CONSENSUS'`, unanimous agreement, default behaviour text, default blueprint | `server/lib/evidenceGraph.js:12-27` | `campusKnownUnsafe` (C2.02) |
| `confidence_status DEFAULT 'VERIFIED_CONSENSUS'`, `rubric_level NOT NULL` | `server/db/migrations/0024_behavioral_evidence_ledger.sql:17` | `campusKnownUnsafe` (C2.01) |
| Default RIASEC `{ E: 0.6, I: 0.5, A: 0.4, S: 0.3, C: 0.3, R: 0.2 }`, preselected preferences, evaluate-on-mount | `src/pages/ExploreMode.jsx:62-72, 118-120` | `campusKnownUnsafe` (C2.12) |
| Default interest vector `{ E: 0.5, A: 0.3, I: 0.2 }`, default target weights, numeric `composite_score` | `server/routes/jobFamilies.js:51`, `server/lib/roleAffinityEngine.js:41, 49, 68, 122, 135` | `campusKnownUnsafe` (C2.07) |
| Mission `levelAchieved = 4` from hypothesis length > 15, fixed observable behaviours | `server/routes/missions.js:128-142` | `campusKnownUnsafe` (C2.09) |
| Seeded missions `job_family_id: 'STUDAI-JF-MKT-L1'`, Lumina context | `server/routes/missions.js:8-80` | C8.02 (governed practice content) |

## 6. Test harness facts

- Server: `npm --prefix server test` (`node --test`, files run in parallel processes). Files that
  import the JSON store without their own `DATA_DIR` shared `server/data/assessments.json`; the
  baseline run showed one lost-update race (`governance2.test.js` pruning). Phase 0 adds
  `server/test-support/isolatedDataDir.js` (side-effect import, always a fresh temp dir removed on
  exit) to `governance.test.js`, `governance2.test.js` and `campusKnownUnsafe.test.js` (K11).
- E2E: `playwright.config.js` starts `scripts/start-audit-server.mjs` (temp `DATA_DIR`,
  `PRISM_DUMMY_PAYMENTS=true`, `PRISM_SKIP_VERIFICATION=true`, `PRISM_AUDIT_AI=true`, isolated JWT secret
  and signing key) on `127.0.0.1:4173`, serving `dist/` (build before e2e). Projects: chromium, firefox,
  webkit, mobile-chromium (Pixel 7).
- Latest migration: `0024_behavioral_evidence_ledger.sql` (+ `.down.sql`); campus migrations start at 0025.
