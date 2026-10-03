# P0 - Verification results

## P9 screenshot review follow-up - 2026-10-03

Independent screenshot review found that never-assessed capabilities were labelled `Insufficient evidence`, making a neutral missing state look like a low result. `NO_EVIDENCE` now renders `Not yet measured` with the assistive explanation `This capability has not been measured yet`; genuinely measured-but-insufficient states retain `Insufficient evidence`. The Home snapshot now forwards governed reason codes to the badge.

Verification: focused Vitest **67/67**, build PASS, static audit PASS, P9 visual matrix **5 passed / 3 intentional project skips**; the regenerated 390 px capability-list screenshot was inspected.

## P9 programme validation and integrated reliability - 2026-10-03

Final commands were run from `studai-prism/` against local isolated processes.
No live model, live payment, production database, deployment or participant
session was used.

| Command | Result |
| --- | --- |
| `npm run build` | PASS in 14.98 s; existing >500 kB chunk advisory only |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | 38 files; **516 passed, 0 failed** |
| `npm --prefix server test` | **858 passed, 26 skipped, 0 failed** (884 total) |
| `npm run audit:static` | PASS; 1,623 files scanned, 113 review leads; leads are not vulnerability findings |
| `npm run test:e2e:critical` | **217 passed, 3 recovered on retry, 0 final failures** across Chromium, Firefox, WebKit and mobile Chromium |
| `node scripts/run-experience-baseline-tests.mjs database` | **21 passed, 0 failed, 0 skipped**; real HTTP + disposable PostgreSQL + workers/evidence/publication/report/practice |
| `C:\Users\studaione\AppData\Local\Programs\Python\Python312\python.exe -m pytest calibration\tests` | **64 passed, 0 failed**; Python 3.12.10, pytest 8.4.2 |
| `CI=1 node scripts/run-experience-baseline-tests.mjs browser-all` | **805 passed, 81 intentional skips, 6 recovered on retry, 0 final failures**; one full run only, all four configured projects |
| `node scripts/check-programme-validation.mjs` | PASS; T01-T60 = **56 PASS / 3 BLOCKED / 1 UNVERIFIED** |

The first direct critical invocation exposed that the old npm command did not
own a database and tried the unavailable `127.0.0.1:55433`. The command now
uses the existing isolated runner (`browser-critical`) and therefore owns its
throwaway PostgreSQL lifecycle. Its first isolated attempt then exposed a real
stale test selector: the protected draft offer correctly says “Continue with
an unpaid test session (not a purchase)”, not the old “Continue (free
preview)”. The test was corrected without changing product behaviour.

### Local controlled-adapter load observation

Hardware: Windows x64, AMD EPYC 7R13, 8 logical CPUs, 62.6 GiB RAM, Node
v24.12.0. Concurrency 5. Dataset: 20 history/report requests, 25 action and
provider-reply samples, 3 publication samples and 8 synthetic runs.

| Observation | p50 | p95 | Planning target |
| --- | ---: | ---: | ---: |
| History read | 62.15 ms | 82.14 ms | <1,500 ms |
| Report read | 44.53 ms | 57.59 ms | <1,500 ms |
| Durable action acknowledgement (persisted `accepted_at`; network completion excluded) | 5 ms | 13 ms | <1,000 ms |
| Controlled-provider reply | 23.09 ms | 33.06 ms | <8,000 ms |
| Report publication | 190 ms | 197 ms | <180,000 ms |
| Controlled 150 ms client-delay history observation | 177.98 ms | 185.55 ms | reported separately |

These are single-host, warm-process, loopback observations with a deterministic
provider. The low-bandwidth row is a controlled client delay, not packet
shaping or a real-device result. None is an SLA, real-provider or Layer C claim.

### Visual/accessibility evidence

Focused P9 matrix: 5 passed, 3 intentional project skips, 0 failed. It covered
1440, 1280, 1024, 768, 430, 390, 360 and 320 widths, all four projects, axe,
keyboard skip navigation and overflow checks. All 18 screenshots under
`audit-results/ui/p9/` were inspected. Repeated fixed navigation in stitched
mobile full-page captures is a Playwright capture artifact; runtime DOM,
keyboard, axe and overflow assertions passed. Screen-reader, forced-colour,
voice-control and real-device checks remain MANUAL UNVERIFIED; no WCAG
conformance is claimed.

Layer C remains BLOCKED and was not executed. Participant, payment, refund,
comprehension, transfer and human-rating result sets remain NOT RUN / empty.

## P8 remaining gaps closed - 2026-10-03

Commands (from `studai-prism/`, Windows, isolated processes; deterministic audit provider only —
NODE_ENV=test + PRISM_AUDIT_AI=true; provider TEST (dummy) payments only; no live model, no live
charge, no production data):

| Command | Layer | Result |
| --- | --- | --- |
| `cd server; npm test` | A/B (routes + memory repos) | 882: **856 pass, 0 fail**, 26 pre-existing DB skips (+14 new in `commerceGaps.test.js`) |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 38 files, **516 pass, 0 fail** (+3: public FAQ/illustration, server-blocked offer row, P8.2 intent disclosure) |
| `npm run build` | Build | PASS |
| `npm run audit:static` | Static | PASS (`audit-results/static-audit.md`, 1617 files, 429 routes, 112 review leads) |
| `node scripts/run-experience-baseline-tests.mjs database` | B | 6/6; **53 migrations** (new `0053_intent_display_and_research` + `.down.sql`; pre-existing `item_responses` FK log noise from the legacy path, not a failure) |
| `node scripts/run-experience-baseline-tests.mjs p8` | B in browser | **1 passed, 0 failed** on the final run (chromium, 26.3 s): `tests/e2e/p8-commercial-journey.spec.js`; earlier runs found defects 1–4 below |

`p8` runner mode: embedded throwaway PostgreSQL for the 4174 campus audit server with
`PRISM_AUDIT_DRAFT_CONTENT=true` in that process only (payments stay in provider TEST/dummy mode as
the audit server always does); desktop Chromium, screenshots at 1440 and 390 under
`audit-results/ui/p8/` (`01-public-landing` … `08-history-no-package`, 16 files, gitignored), axe
serious/critical clean and no horizontal overflow at both widths on every step; no console errors.
The journey is REAL end to end: public page (h1 "Understand how you work. / Practise what matters
next.", hero card labelled "Illustration, not a real result" with no two/three-digit number, primary
"Try a short situation" → `/try`, secondary "See how Prism works", separate institution mailto, offer
table with the exact allowance "Formal assessment ×1 · missions ×4, two attempts each · fresh
challenge ×1", "Test price, pending approval", server-driven "Not yet purchasable" line, professional
pack "Not yet available", privacy line; FAQ opened by keyboard Enter/Space with `aria-expanded` and
`aria-controls`) → `/try` unauthenticated (briefing + prompt, no rubric/level/score text; weak answer
→ "Not found yet" observation visible without any account; one retry → "Observed · practice"
quoting the learner's own sentence; package explanation with the exact allowance and status "Not yet
purchasable" from `/api/payment/config`; no token in the URL) → register → `/app/home` intent step
(audience/intention/mode only; disclosure "Speaking (speech): not yet available", "English:
supported", "No CV, grades, employer, photograph or college is needed"; research checkbox unchecked
and separate; after Continue the API shows `researchPermission: null`, `displayName: null`) →
explicit "Save it to my account" → `/me/previews` 1 PRACTICE item; a guessed attempt id → **404** →
`/payment` (configured ₹499 labelled "Proposed test price, pending finance approval", "Tax: as
configured by finance — not yet approved", 30-day window, policy proposed, three named blockers,
"Not yet purchasable" disabled, unpaid test session clearly "not a purchase", test-mode notice;
`POST /api/payment/create-order` → **409 OFFER_NOT_PURCHASABLE**) → Assessments › History tab
readable with no active package (`/me/history` 200).

Real defects found and fixed by this pass:

1. **Concurrent Begin requests could double-reserve a seat.** `ledger.reserve` ignored the
   repository's own idempotency replay flag after its async pre-check, so three simultaneous
   reservations with one key each reported `replayed: false` (memory repo; the PG repo relies on
   the same flag). It now returns the repository's verdict (T53/T55 test "concurrent starts take one
   seat").
2. **Razorpay keys were read once at import**, so a process that started without keys could never
   verify a signature later (and the new verify tests could not run). `routes/payment.js` reads
   `RAZORPAY_KEY_ID/SECRET` lazily; behaviour with keys present is unchanged.
3. **Live offer counted zero reviewed missions** because `liveOfferAvailability` de-duplicated the
   library by `id` while missions carry `mission_id`; checkout said "0 of 4". Fixed; the test now
   asserts the live count equals the real published count (1 of 4).
4. **FAQ question hover used brand green text on the surface** (fails contrast; axe flagged it on
   hover) and the disclosure had no `aria-controls`/`type="button"`/focus ring/reduced-motion
   handling. Hover is now an underline; panel is `role=region` referenced by `aria-controls`.
5. Hero illustration: a long claim in `EvidenceThread`'s `max-content` column squeezed the quote
   into a one-word-per-line sliver at 1440 and the label overlapped the caption at 390. Claim is a
   bounded two-line block; the label is static on small screens.
6. `/try` at 390: header link wrapped onto two lines and the board's Due column broke "Tuesda/y";
   short label below `sm`, `whitespace-nowrap` on Due.
7. A guessed preview attempt id (or a token with a wrong signature) answered 422 "not valid",
   hinting at shape; it is now **404** like any unknown resource.

### T07, T43, T47, T48, T53–T55, T57–T59 coverage (this phase)

| Test ID | Requirement | Where it is proven | Layer | Outcome |
| --- | --- | --- | --- | --- |
| T07 | Personal/Campus history: no cross-scope rows, credits or cached results | `commerceGaps.test.js` P8.7 (sponsor → 404 on preparation/practice/previews/grants/exports paths); `commerce.test.js` P8.7 static scan of every Campus read surface; p8 journey (Personal shell; history 200 in PERSONAL only) | A/B, B-browser | PASS |
| T43 | Preparation privacy; no Campus/raw analytics leakage | `commerceGaps.test.js` P8.9 serializer (transcript/preparation text/names/institution ids/JWT/payment secrets dropped; metrics `validateEvent` rejects them); P8.2 static scan: no scoring/evaluation/report/preparation module imports the preferences plane | A | PASS |
| T47 | Report and evidence authorization at every read/export | existing `reportsV3.test.js` / `reports.test.js` owner/sponsor/share matrix (P5, green); `commerceGaps.test.js` T55 (report/history reads never consult grants); `commerce.test.js` (report service and history source contain no commerce reference) | A/B | PASS (unchanged surface; full audience/export acceptance remains P9/P10) |
| T48 | Revoked/expired share stops hosted access | existing `campusStudent.test.js` C4.11 (owner-only revoke, no `tokenHash` in list) and P1/P5 share tests, all green this run | A/B | PASS (unchanged) |
| T53 | Payment/webhook retries: exactly one grant, no duplicated consumption | `commerce.test.js` (replay/reorder/bad signature/unconfigured); `commerceGaps.test.js`: forged verify → 400 and **no grant**; abandoned checkout → no grant; correctly signed verify → one grant; verify retried after network loss → same grant id; webhook before verify (provider delay) → verify returns the webhook's grant; webhook-only (network loss) delivered twice → one grant with product version, policy version, funding source PAID, purchase ref, expiry; concurrent Begin ×3 → one reservation; repeated finish → `replayed: true`, `consumedQuantity` stays 1; `create-order` 409 when unpurchasable; p8 journey step 6 | A/B, B-browser | PASS (test mode / fixtures; live provider is a human gate) |
| T54 | System failure credit policy consistent and auditable | `commerce.test.js` (release audited, policy PROPOSED, no refund, replay no-op); `commerceGaps.test.js` T54/finance (grants not in the erasure cascade; `payment_records` named in the retention registry) | A/B | PASS for the code path; **policy approval pending** (no issuance authorized) |
| T55 | Package expiry gates NEW activity; issued history readable | `commerceGaps.test.js` T55 (window ends mid-run → completion still finalizes the reserved seat; new start → ENTITLEMENT_EXPIRED/PACKAGE_EXPIRED with "Reports you already received stay available"); `commerce.test.js` (history served after expiry); p8 journey step 7 (history readable with no package) | A/B, B-browser | PASS (expiry fixture is Layer A/B; the browser proves readability without a package) |
| T57 | Existing direct and Campus regression | `commerceGaps.test.js` T57 snapshot: legacy `v1_payments` record keys/values byte-identical (`sessionId, paymentId, orderId, amount, mode, userId, userEmail, consumed, createdAt`); a Campus contract entitlement row JSON-identical before/after a grant; `commercial.test.js` §22 ₹499 pinned; full server suite 0 fail | A/B | PASS |
| T58 | Cost and trace coverage without sensitive payloads | `commerce.test.js` P8.8 (tags: mode, hashed run id, method version, product code); `commerceGaps.test.js` T58 (soft budget: UNCONFIGURED/UNKNOWN_SPEND/OK/ALERT/NEW_STARTS_LIMITED; `interruptActiveRun` always false; evidence/evaluator unchanged; p50/p95 with unknowns counted; HYPOTHESIS vs ACTUAL basis) | A | PASS (unit economics are formulas over actual figures; no revenue exists yet) |
| T59 | Synthetic data isolation | `commerceGaps.test.js` T59 (`previewMetrics()` memory + PG query count real rows only and report `syntheticExcluded`; synthetic previews emit no product events, `preview.test.js`) | A (PG query shape exercised in the isolated DB run via the same repository module) | PASS |

## P7 remaining gaps closed - 2026-10-03

Commands (from `studai-prism/`, Windows, isolated processes; deterministic audit provider
`auditConverse` only — NODE_ENV=test + PRISM_AUDIT_AI=true; no live model, no production data):

| Command | Layer | Result |
| --- | --- | --- |
| `cd server; npm test` | A/B (routes + memory repos) | 868: **842 pass, 0 fail**, 26 pre-existing DB skips (`preparation.test.js` 16 incl. new gateway-policy test; `growthEligibility.test.js` T46 rules; `aiModelRouter.test.js` unchanged) |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 38 files, **513 pass, 0 fail** (`preparation.test.jsx` rewritten 7 → 11 against the new UI; `growth.test.jsx` three groups; `history.test.jsx` +1 → 8 private groups) |
| `npm run build` | Build | PASS |
| `npm run audit:static` | Static | PASS (`audit-results/static-audit.md`, 1611 files, 429 routes, 110 review leads) |
| `node scripts/run-experience-baseline-tests.mjs database` | B | 6/6; **52 migrations** (new `0052_preparation_hardening` + `.down.sql`) |
| `node scripts/run-experience-baseline-tests.mjs p7` | B in browser | **1 passed, 0 failed** (chromium, 26.6 s): `tests/e2e/p7-preparation-journey.spec.js`; the first runs found defects 1–3 below |

`p7` runner mode: embedded throwaway PostgreSQL for the 4174 campus audit server, with
`PRISM_AUDIT_DRAFT_CONTENT=true` and `PRISM_AUDIT_PREPARATION=true` (→ `PRISM_PREPARATION_V1`) in
that process only; desktop Chromium, screenshots at 1440 and 390 under `audit-results/ui/p7/`
(`01-prepare-empty` … `09-growth-groups`, 18 files), axe serious/critical clean and no horizontal
overflow at both widths on every step. The journey is REAL end to end for a learner with **no
formal baseline**: register → Prepare from the nav (private by default, allowance stated) → wizard
(six situations, one field per step; an email typed into the counterpart field comes back as
`[email removed]`; sanitized summary with six restated assumptions; one assumption removed; confirm
sends only the edits) → untimed rehearsal (opening sent with Tab + Enter, T56; deterministic
counterpart pushback labelled AI-GENERATED; a requested sample sentence appears only under
"Need a hand?" with `data-authorship=ASSISTANT`, never in the log; revised line; "Your lines: 3 of
40 · AI suggestions: 1 of 5") → rename → pause → resume from the list → finish → card labelled
"AI assistance" with plan / opening / questions / trade-offs / boundary / self-check; one
observation "Clarified a constraint" quoting the learner's opening verbatim and neither the
counterpart's nor the assistant's words → card edited ("You adjusted this card…") → application
suggestion from the practice target, edited ("Your wording"), in-app reminder opted in and shown on
the Prepare list only → SELF_REPORT check-in saved → History groups "Private preparation" and
"Your own note (self-reported)", no Formal or Practice group → Growth: Formal history "No published
formal result yet" with the not-comparable rule, Practice history (PREPARATION row), Application
reflections (the note), no arrow/delta/trend. API: `assessedCount` 0, `/me/evidence` **empty**,
history modes exactly `PREPARATION` + `SELF_REPORT`, learner turns = the three typed lines,
campus workspace header on list/detail/check-ins → 403/404 with no learner text in the body,
`mode: FORMAL` in a check-in body → 422 `VALIDATION_FAILED`.

Real defects found by this pass (all fixed, re-verified):

1. **Every rehearsal line failed with PROVIDER_ERROR on the real gateway.** `modelRouter.js` had no
   routing policy for `preparation_participant` / `preparation_assist` / `preparation_action_card`,
   so `createCompletion` threw "Unknown AI task"; unit tests passed because they stubbed `complete`.
   Policies added (conversation model with fallback for the two spoken tasks; primary, **no
   fallback**, for the strict card); `preparation.test.js` now asserts each task is routable with a
   bounded timeout and that a client model override is refused.
2. Counterpart role label under replies cut the learner's description mid-word
   (`…reach them at [emai`). `RehearsalView.jsx` now cuts on a word boundary with an ellipsis.
3. The sanitized summary capitalised mid-sentence ("with The project lead…", "want to Agree…");
   `summaryOf` lower-cases an ordinary capitalised first word, leaving acronyms/names alone.
4. History cards for a preparation or a note carried the scope badge **"Personal assessment"** and
   a "Completed" status chip. They now say "Personal · Private to you" and "Finished" /
   "Self-reported" (`HistoryList.jsx`, copy in `student.js`; `history.test.jsx` +1).
5. Housekeeping from the interrupted pass: `preparation_action_card.v1.md` and
   `preparation_participant.v1.md` restored (old prompt versions stay for version-aware adapters);
   `preparation.test.jsx` restored and rewritten rather than deleted; UTF-8 mojibake a previous pass
   wrote into `growth/service.js`, `src/api/student.js` and `GrowthPage.jsx` reversed byte-exactly.

### T07, T41, T43–T47, T52, T56 coverage (this phase)

| Test ID | Requirement | Where it is proven | Layer | Outcome |
| --- | --- | --- | --- | --- |
| T07 | Personal/Campus history: no cross-scope rows, credits or cached results | `preparation.test.js` (campus workspace → NOT_FOUND on every preparation/check-in route; history in PERSONAL only; static scan: no analytics/report/evidence/growth/campus/sharing module names a preparation table); p7 journey step 10 (foreign workspace header on list, detail, check-ins) ; hooks keyed `['ws', workspaceId, …]` dropped on switch | A/B, B-browser | PASS |
| T41 | Practice retry leaves the formal snapshot unchanged | `missionsEndToEnd.test.js`, `practiceReplay.test.js` (P6, unchanged, green) | A/B | PASS |
| T43 | Preparation privacy: Personal by default; no Campus/raw analytics leakage | `preparation.test.js` (telemetry serializer carries ids/counts only — ZEBRA probe; prompt builder keeps learner text out of the system role); `preparation.test.jsx` campus workspace explains scope and makes no call; p7 journey (Personal shell, "Private to you" on every screen) | A, B-browser | PASS |
| T44 | Preparation output attribution: suggestions never scored as learner responses | `preparation.test.js` (AI_ASSISTANT turns excluded from the transcript sent to the card; observations quoting counterpart/assistant/paraphrase dropped, verbatim learner lines kept); `preparation.test.jsx` sample sentence apart from the log; p7 journey steps 3–4 (API: `authorship` LEARNER/ASSISTANT per turn) | A/B, B-browser | PASS |
| T45 | Application check-in clearly SELF_REPORT; cannot raise formal capability | `preparation.test.js` (check-ins SELF_REPORT/PERSONAL, sanitized, editable, deletable, never evidence; `mode` in body → VALIDATION_FAILED); p7 journey steps 6 and 9 (`/me/evidence` empty, `assessedCount` 0 after a check-in) | A/B, B-browser | PASS |
| T46 | Growth not approved: no comparative claim or delta; separate dated snapshots | `growthEligibility.test.js` (unapproved pair never comparable; fixture-approved pair applies equivalence/spacing/retirement/correction; a new result is an added snapshot); `growth.test.jsx` (formal snapshots with comparability text, no deltas/arrows/trends); p7 journey step 8 | A, B-browser | PASS (fixture approval only — a real comparison approval is a human gate) |
| T47 | Report and evidence authorization at every read/export | `preparation.test.js` (foreign source id on a check-in → NOT_FOUND; owner checks on get/list/edit/delete/card/application); p7 journey step 10 | A/B, B-browser | PASS (preparation slice) |
| T52 | Deletion with an active worker: no resurrection | `preparation.test.js` "deleting a preparation while the model is working cancels the result; nothing is recreated and linked check-ins go too" (re-read after the model returns; late result discarded) | A/B | PASS |
| T56 | Keyboard/screen reader/zoom end to end | p7 journey (Tab to the composer + Enter sends; radios/checkbox by accessible name; axe clean at 1440/390; no overflow at 390) ; `preparation.test.jsx` semantic queries throughout | B-browser, A | PASS (slice; full programme rerun in P9/P10) |

## P6 screenshot review follow-up - 2026-10-03

Independent review of the `p6` screenshots found two copy/layout defects, fixed and re-verified:

- A partial attempt was headed "Mission completed — 1 of 2 …". Now only all-shown attempts say "Mission completed";
  partial verified attempts say "Attempt reviewed — n of N target behaviours demonstrated." (`evaluate.js`;
  `campus-development.spec.js` copy updated; the `completed` only-when-verified guard in `campusDevelopment.test.js` still holds).
- The board's task-name column scrolled out of view while editing owner / done-when cells; the first column is now sticky
  (`MissionArtifactEditor.jsx`).

Re-run: `server npm test` 830 pass / 0 fail; `vitest src/features/development` 20/20; build PASS; audit:static PASS;
`node scripts/run-experience-baseline-tests.mjs p6` 1 passed (screenshots regenerated under `audit-results/ui/p6/`).

## P6 remaining gaps closed - 2026-10-03

Commands (from `studai-prism/`, Windows, isolated processes; deterministic audit provider
`auditConverse` only — NODE_ENV=test + PRISM_AUDIT_AI=true; no live model, no production data):

| Command | Layer | Result |
| --- | --- | --- |
| `cd server; npm test` | A/B (routes + memory repos) | 856: **830 pass, 0 fail**, 26 pre-existing DB skips (new `missionsEndToEnd.test.js` 16 — one acceptance test per mission M01–M10 plus M09/M10 escalation, unsupported quote, provider failure, replay/history, copy/compare units; `practiceReplay.test.js` P6.7 updated to the transfer-first rule) |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 38 files, **508 pass, 0 fail** (`development.test.jsx` +4 → 18: catalogue card facts + goal filter, first view + focus + examples drawer, comparison + copied label, transfer scene; `history.test.jsx` +1 → 7: finished practice opens read-only, fresh challenge from history) |
| `npm run build` | Build | PASS |
| `npm run audit:static` | Static | PASS |
| `node scripts/run-experience-baseline-tests.mjs database` | B | 6/6; 51 migrations (no new migration: provenance extends `assistance_json` from 0046) |
| `node scripts/run-experience-baseline-tests.mjs p6` | B in browser | **1 passed, 0 failed** (chromium, 29.8 s): spec `tests/e2e/p6-practice-journey.spec.js`; the first two runs found defects 2 and 3 below |

`p6` runner mode: embedded throwaway PostgreSQL for the 4174 campus audit server (campus +
development flags on in that process only, `PRISM_AUDIT_DRAFT_CONTENT=true` for that process
only), desktop Chromium, screenshots at 1440 and 390. The journey is REAL end to end: a synthetic
learner registers, chooses the Execution goal, opens M09 from the first view, edits the board and
writes the handover (one owner left empty), submits through the real evaluator pipeline
(deterministic rules + meaning harness), reads the focused feedback, opens the examples drawer,
retries with the scaffold hint, submits a complete handover, reads the criterion comparison, starts
a fresh uncoached challenge (M09's transfer setting — the client-call follow-up — not the demo
script), and finds the three practice records in History, apart from formal ones. No formal run
exists for this learner: `assessedCount` 0, every evidence item `PRACTICE`, every history item
`PRACTICE`, finished attempts `permittedAction.kind = VIEW`.

### T39–T42 coverage (this phase)

| Test ID | Requirement | Where it is proven | Layer | Outcome |
| --- | --- | --- | --- | --- |
| T39 | Development recommendation: reviewed, relevant, reachable; no invented deficit | `recommendations.test`/P5 (unchanged); `development.test.jsx` "Choose a different goal" filters by family and the catalogue infers nothing from the choice; p6 journey step 1 | A, B-browser | PASS |
| T40 | Mission meaningfulness: paraphrase accepted, keywords alone do not prove behaviour | `missionsEndToEnd.test.js` per-mission step 2 (paraphrase keeps every meaning criterion), step 3 (300-char filler → `MEANING_NOT_EXPRESSED` / `RULES_NOT_MET`, no praise), `evaluatorMeaning.test.js` (keyword stuffing → `KEYWORDS_ONLY`) | A/B | PASS (harness semantics; live-model wording is Layer C, not run) |
| T41 | Practice retry: new practice attempt; original formal snapshot unchanged | `missionsEndToEnd.test.js` (retry → new attempt with `retryOrigin`, earlier attempt byte-identical, formal snapshot + ledger unchanged), `practiceHandover.test.js`, p6 journey steps 5 and 7 | A/B, B-browser | PASS |
| T42 | Fresh challenge: no hidden coaching; exposure metadata recorded | `practiceReplay.test.js` (hints and examples 409, transfer setting, `exposureTags`/`excludedExposure` recorded), `missionsEndToEnd.test.js` replay/history test, p6 journey step 6 | A/B, B-browser | PASS |
| T55 | Package expiry gates new activity; issued history readable | `practiceReplay.test.js` P6.8, `missionsEndToEnd.test.js` provider-failure test (finished attempt readable after the allowance is spent) | A/B | PASS (slice) |
| T57 | Direct and Campus regression | `campusDevelopment.test.js`, `campusPermissions.test.js` unchanged and green | A/B | PASS |

### Per-mission acceptance matrix (`server/test/missionsEndToEnd.test.js`, real `/api/v1` router, memory repos, deterministic provider)

Fixtures: `server/test/fixtures/p6Missions.js` (synthetic learner work only). Each row is one test
that runs start → valid → paraphrase → filler → examples → copied example, through the stored
attempt and the evaluator boundary.

| Mission | Valid: ≥1 behaviour, focus quotes learner | Paraphrase accepted | 300-char filler not met, no praise | Copied example → `COPIED_ASSISTANCE`, not counted | Package complete (17 fields) | Transfer: different setting, same behaviours, empty start |
| --- | --- | --- | --- | --- | --- | --- |
| M01 Find the missing fact | PASS (4/4 criteria) | PASS | PASS | PASS | PASS | PASS |
| M02 Check the confident recommendation | PASS (4/4) | PASS | PASS | PASS | PASS | PASS |
| M03 Explain your recommendation | PASS (4/4) | PASS | PASS | PASS | PASS | PASS |
| M04 Make the brief clear (handover v2) | PASS (3/4; `C-FIRST-STEP` is BOTH → UNCERTAIN under the harness, as designed) | PASS | PASS | PASS | PASS | PASS |
| M05 Disagree without giving up | PASS (4/4) | PASS | PASS (filler passes only the literal length check; no behaviour demonstrated) | PASS | PASS | PASS |
| M06 Negotiate a realistic boundary | PASS (4/4) | PASS | PASS | PASS | PASS | PASS |
| M07 Replan after a change | PASS (4/4) | PASS | PASS | PASS | PASS | PASS |
| M08 Recover after a mistake | PASS (4/4) | PASS | PASS | PASS | PASS | PASS |
| M09 Make the handover usable | PASS (4/4); missing owner → `C-OWNERS` is the next change; escalation "I cannot assign … escalating to Priya because …" → all criteria met, no flaw invented | PASS | PASS | PASS | PASS | PASS (client-call follow-up board) |
| M10 Choose what not to do | PASS (4/4); escalation counts for `C-DEFER` | PASS | PASS | PASS | PASS | PASS |

Cross-cutting (same file): unsupported evaluator quote (`PRISM_AUDIT_AI_FAULT=mismatch`) →
meaning criteria `UNCERTAIN / QUOTE_NOT_VERIFIED`, work preserved, no practice unit; provider
failure (`throw`) → `EVALUATION_UNAVAILABLE`, `focus.reviewIncomplete`, attempt readable, allowance
`used` unchanged, retry is a free reissue (`retryOrigin.reissued = true`), same key → same attempt,
two simultaneous retries → one new attempt (2 rows total); replay carries only the presented
stimulus of that opportunity (a never-presented later-stage stimulus and a rubric anchor string
never appear), formal units/report/session/ledger byte-identical before and after.

Screenshots inspected (`audit-results/ui/p6/*-{1440,390}.png`, 16 files; no horizontal overflow,
axe serious/critical empty at both widths for every step): `01-catalogue-goal` shows the Execution
family only after the goal filter, each card with target behaviour, situation, "About 15 minutes,
untimed · Text, English", Draft label and Open mission; `02-first-view` shows focus / duration /
mode / "No limit on attempts here", the scene, What to do, What you know and "What will be
checked" folded; `04-feedback` leads with "One thing you did" (meaning check, the learner's own
sentence) and "One thing to change next" (the unowned task) with all checks folded;
`06-retry-comparison` shows "Shown now, not before: Every task has an owner…" and the no-growth
note; `07-fresh-challenge` shows the uncoached notice, "A different setting for the same
behaviours", the client follow-up board and no Hints/Show examples buttons; `08-history` groups
Practice records with Open and fresh-challenge actions and no Formal group.

Defects found and fixed during this run:

1. **Summary praised nothing** — `evaluate.js` said "Mission completed — 0 of 2 target behaviours
   demonstrated" for filler. Now "Attempt reviewed — none of the N target behaviours shown yet."
   (found by the M01–M10 acceptance loop).
2. **Board table overflowed at 390** (`expectNoHorizontalOverflow` 59 px) — `<fieldset>` has
   `min-width: min-content`; fixed with `min-w-0` on the artifact fieldsets, `max-w-full` on the
   scroll region and `min-w-0` on the work column. A second pass found the task column crushed to
   one character per line; the table is now `w-max min-w-full` with a `min-w-[9rem]` row header so
   it scrolls inside its region.
3. **Fresh challenge on the same mission did not switch attempts** — the player read `?attempt=`
   only on mount, so a challenge that chose the same mission's transfer setting kept showing the
   finished attempt. The page now follows a changed `?attempt=` (and only a change, so a retry
   started on the page is never undone).
4. **Next-change panel repeated itself / quoted a cell** — the failed rule's description equalled
   the criterion text, and "Your words" quoted a one-word board cell. `buildFocus` now falls back
   to "Not met by the automatic check…" and quotes the learner only for meaning checks and only
   for ≥ 4-word text.
5. Fixed-clock test worlds tie every `createdAt`, so "the newest finished attempt" was ambiguous;
   retry now follows the retry-chain tip and the memory repo breaks timestamp ties by insertion.

Not run / not claimed: live-model (Layer C) meaning judgements; firefox/webkit/mobile projects for
the p6 spec (chromium only; the 390 viewport is exercised by resize); human content, measurement
and accessibility approval of M01–M10 (all DRAFT, `review_record.approval = NOT_APPROVED`).

## P5 remaining gaps closed - 2026-10-03

Commands (from `studai-prism/`, Windows, isolated processes; deterministic audit provider only; no
live model, no production data):

| Command | Layer | Result |
| --- | --- | --- |
| `cd server; npm test` | A | 839: **813 pass, 0 fail**, 26 pre-existing DB skips (new `reportReviewCorrection.test.js` 5, `reportAudiences.test.js` 3; `experienceBaseline.db.test.js` now expects 51 migrations) |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 38 files, **503 pass, 0 fail** (new `src/features/capabilities/capabilityDetail.test.jsx` 9 replacing the 3 older detail tests in `studentPages.test.jsx`; `reports.test.jsx` +2 → 25) |
| `npm run build` | Build | PASS |
| `npm run audit:static` | Static | PASS (1598 files scanned) |
| `node scripts/run-experience-baseline-tests.mjs database` | B | 6/6; **51 migrations** applied (0051 `report_review_decisions`) |
| `node scripts/run-experience-baseline-tests.mjs p5` | B in browser | **40 passed, 0 failed** across chromium, firefox, webkit, mobile-chromium (1.4 min); the first run found defect 1 below (4 failed) |

`p5` runner mode: embedded throwaway PostgreSQL for the 4174 campus audit server,
`PRISM_AUDIT_DRAFT_CONTENT=true` for that process only, spec `tests/e2e/p5-report-states.spec.js`,
all four projects. READY is real (NO route fixture): register, `POST /api/payment/dev-session`,
server-pinned DRAFT universal form, Begin, one learner message, early Finish, the in-process
`EVALUATE_RUN` worker, published Report V3, then the capability detail bound to that snapshot
through `GET /me/capabilities/:id`. Every other state is a labelled SYNTHETIC API fixture.

State matrix proven in the browser (1440 and 390; no horizontal overflow; axe serious/critical
empty at both widths for every state; no `%` on any owner page):

| State | Source | Checked |
| --- | --- | --- |
| ready | real run | header, moments quote the learner's own words only, no band from a small DRAFT slice, no per-row "Not enough evidence" chip, second GET serves the same version/createdAt, capability detail `latestSnapshot = {session, version 1}` with ONE plain state |
| partly described | fixture | EARLY band on one row, others "Not yet measured"; 2 moments; next practice |
| wholly insufficient | fixture | one "Not enough evidence yet" callout; 0 × exact "Not enough evidence"; no `.bg-prism-blocked`; no moments |
| technical-incomplete / processing / under-review | fixture 409 | named title, reference id, Check again, Contact support, no map, no "insufficient" wording |
| corrected version | fixture v2 | "Corrected after a review" badge, "Corrected version 2, replacing version 1", pending-review chip |
| legacy `/score` | fixture on 4173 | original stored blob and stored dates, no Capability Map |
| summary share vs full share | fixture `/shared/:token` | summary: no moments, no quote, no Evidence tab, no Share; full: 2 moments with quotes; neither shows review state or recommendations |
| expired share / access denied | fixture 404 | link invalid copy / "This page is not available"; no header, no map, no SYNTHETIC text |

Screenshots inspected (`audit-results/ui/p5/*-{1440,390}.png`, 26 files): `ready` shows one
bounded moment card with the learner's words, the single "Not enough evidence yet" callout and the
draft-labelled practice recommendation at 390; `capability-detail-390` shows meaning → single state
→ moment → next behaviour → practice → scope → Details → Ask for a review; `corrected-version-1440`
shows both banners and the header badges; `insufficient` has no red and no duplicate badge.

Defects found and fixed during this run:

1. **New-run completions were invisible to every directory-backed read model** (`sessionDirectory`
   set `hasReport` only from a legacy report row): after a real draft run the home, capabilities,
   capability detail and history projections showed PROCESSING → TECHNICAL_FAILED although Report V3
   was published. A DONE `EVALUATE_RUN` job now counts as a report, with `completedAt` from the
   worker's stored time and `reportIssuedAt` from the stored V3 version (never the clock). Covered by
   `reportReviewCorrection.test.js` T35 and the real `p5` READY run.
2. The "Not enough evidence yet" callout carried two near-identical sentences for the owner (CH-27);
   now one sentence per audience.
3. The bounded-only capability detail exposed `BELOW_MINIMUM_…` reason codes in its first
   explanation; the codes stay under Details (`statusReasons`) and the limitation is plain.
4. The single-assessment capability timeline repeated the state as an "Insufficient evidence" chip
   below the page; it is shown only when more than one assessment measured the capability.

| ID | Requirement | Covered by | Layer | Result |
| --- | --- | --- | --- | --- |
| T29 | Missing/contradictory evidence | `reportReviewCorrection` (HUMAN_REVIEW_REQUIRED units → UNDER_REVIEW detail, no deficit, no recommendation); `judgeDisagreement.test.js` | A | PASS |
| T30 | Clear developing behaviour | `reportReviewCorrection` CAP_B bounded-only (one moment, next behaviour, honest no-practice); `p5` READY bounded moment in the browser | A, B browser | PASS (deterministic provider) |
| T31 | Evaluator/schema/write outage | `p5` technical-incomplete / processing states (409 named, recovery, no deficit); `sliceEvaluator.test.js` | B browser, A | PASS |
| T32 | Source quote mismatch | `reportMoments` (no invented quote), `p5` READY (every quote ⊂ learner message); withheld unit never cited after correction | A, B browser | PASS |
| T33 | Judge disagreement | `judgeDisagreement.test.js`; `capabilityDetail.test.jsx` under-review state | A | PASS |
| T35 | Publish without legacy report | `reportReviewCorrection` T35 (DONE job → history COMPLETED/V3, capabilities, detail snapshot); `p5` READY | A, B browser | PASS (was failing before defect 1) |
| T36 | Historical snapshot | `reportReviewCorrection` (version 1 byte-identical after CORRECT; version 2 reason `REVIEW_CORRECTION`, prior 1; GET publishes nothing; decide twice → 409; decision rows frozen); `p5` READY second GET; `reportAudiences` CH-28 dates | A, B browser | PASS |
| T37 | Report map semantics | `p5` partly/insufficient rows (`data-band`, "Not yet measured", no red); `reports.test.jsx` map tests | B browser, A | PASS |
| T38 | Duplicate insufficient badges | `p5` insufficient (0 × exact chip, 1 callout); `capabilityDetail.test.jsx` insufficient/bounded single state | B browser, A | PASS |
| T39 | Development recommendation | `reportReviewCorrection` P5.6 (behaviour-matched mission, DRAFT only behind flag, allowance exhausted, NO_REVIEWED_PRACTICE, legacy mission never); resolver purity test | A | PASS |
| T47 | Report and evidence authorization | `reportAudiences` (sponsor SUMMARY: no quotes/moments/recommendations/review; nested owner endpoints 404 for staff; evidence drawer and capability detail scoped to caller; `/shared/:token/*` 404; staff share 404/422) | A over /api/v1 | PASS |
| T48 | Revoked/expired share | `reportAudiences` (expiry, revoke); `p5` expired-share | A, B browser | PASS |
| T51 | Report-version race | `campusReports` immutable/dedup; `persist` CONFLICT → `findByHash` (unchanged) | A | PASS (unchanged) |
| T56 | Keyboard/screen reader/zoom | axe serious/critical empty on every `p5` state at 1440/390; map rows are buttons; Details is a native disclosure | B browser | PASS (automated only; manual AT pass still pending) |
| CH-26/CH-27 | Meaning → evidence → next behaviour → practice; one insufficient state | `capabilityDetail.test.jsx` (section order, separate chips, Details-only vocabulary, one state), `p5` capability-detail | A, B browser | PASS |
| CH-29 | Interpretation challenge / reviewed correction | `reportReviewCorrection` + `routes/admin/reportReviews.js` (403/401, validation, append-only, new version) | A | PASS (reviewer UI is a minimal admin panel; no live reviewer has used it) |

Remaining (unchanged human gates): five-second / two-minute comprehension study (protocol and
recording sheet prepared in `RESEARCH_PROTOCOLS.md` §3a; NOT run; no figure exists), manual
AT/zoom passes, content / measurement approvals (CORE-TEAMREADY-A and all P6 missions stay DRAFT),
Layer C live-model wording.

## P4 remaining gaps closed - 2026-10-03

Commands (from `studai-prism/`, Windows, isolated processes; deterministic audit provider only; no
live model, no production data):

| Command | Layer | Result |
| --- | --- | --- |
| `npm --prefix server test` | A | 829: **803 pass, 0 fail**, 26 DB skips (new `contentTooling.test.js` 7, `judgeDisagreement.test.js` 3, `calibrationPurpose.test.js` 3; `commerce.test.js` P8.7 strengthened for the pilot gate) |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 37 files, **495 pass, 0 fail** (new `src/pages/admin/AdminContentForms.test.jsx` 4, artifact-store stale-contract regression 1); one earlier run showed a 9.8 s load-time flake in `campusExperience.test.jsx` (passes alone in 1.1 s; unrelated file); final run clean |
| `npm run build` | Build | PASS |
| `npm run audit:static` | Static | PASS (1589 files scanned) |
| `node scripts/run-experience-baseline-tests.mjs database` | B | 6/6; **50 migrations** applied (0050 `content_review`) |
| `node scripts/run-experience-baseline-tests.mjs p4` | B in browser | **1 passed, 0 failed** (chromium, 15.9 s, final run); two earlier runs found defects 1-2 below |

`p4` runner mode: embedded throwaway PostgreSQL for the 4174 campus audit server,
`PRISM_AUDIT_DRAFT_CONTENT=true` for that process only, spec `tests/e2e/p4-six-stages.spec.js` on
desktop Chromium with 1440/390 viewport screenshots. NO route fixtures: real register, two real
`POST /api/payment/dev-session`, real consent, server-pinned DRAFT universal form, Begin, seven
authored answers through the real player, one board edit, early Finish at stage 5, the in-process
`EVALUATE_RUN` worker with the audit provider, published Report V3.

Proven in the browser: the six stage labels appear in authored order and move `(now)` → `(done)`
as each stage is answered (stage strip names tasks only); the stage-3 world change shows the
"What changed: Sam is unavailable…Your board is unchanged" notice and the learner's earlier board
edit (`R2.due`, "Your edit") survives it on screen and in the contract; the stage-4 recommendation
carries the visible `AI-generated` label and the "AI-generated recommendation (not checked by a
person)" wording; finishing early leaves `coverage { planned 11, presented 8, answered 7,
notPresented 3, stagesPresented 5, reviewRequired false }` on the owner contract, "Review coverage:
8 of 11 planned moments were presented." in the processing view and in the report, and no unit,
quote or claim references any stage-5/6 opportunity; T19 unknown requested scenario id on the dev
path → `422 SCENARIO_NOT_FOUND`, no substitution; T21 `/calibrate` answers `purpose: CALIBRATION`
with the label "Difficulty calibration (not part of your assessment context)" while the session
contract is `purpose: FORMAL` and never carries a tier.

Screenshots inspected (`audit-results/ui/p4/`: `stage3-what-changed-{1440,390}.png`,
`stage4-ai-label-{1440,390}.png`): change notice, preserved "Your edit" due value and AI label are
legible at both widths; no horizontal overflow; axe serious/critical empty at both widths.

Defects found and fixed during this run:

1. The task stage strip did not advance after an answer (it came only from the session contract,
   which the player does not refetch after a message). The message response of a universal run now
   carries the task-only `stages` strip and the player merges it (`useAssessmentSession.applyTurn`).
2. A board edit saved during the run visually disappeared after the next message: `applyTurn`
   re-applied the contract's stale `artifacts` (fetched before the save) and `artifactStore.load`
   replaced a SAVED newer item with the older data (and could rewind the `If-Match` version of a
   dirty one). `load` now keeps an item whose known server version is newer than the contract's.
   Regression test in `player.test.jsx`; the server data was always correct.
3. The commerce P8.7 fixture approved a pilot with no reviewer decisions; the registry now refuses
   that (409), and the test was strengthened to record a CONTENT and a MEASUREMENT approval first.

Observations, not defects of this phase (content review items, CONTENT_REVIEW.md): the authored
stage-3 fact text says "The board the learner has built is unchanged" inside Sam's line (third
person); the fact boundary's neutral pointer answered a question containing "room" with the venue
fact although the question was about covering the list (trigger precision, P4.7 review).

| ID | Requirement | Covered by | Layer | Result |
| --- | --- | --- | --- | --- |
| T19 | Requested scenario | `p4-six-stages` (dev path unknown id → 422, no substitution); `p2Slice.db`; `player.test.jsx` | B browser, B, A | PASS |
| T21 | Calibration vs context | `calibrationPurpose.test.js` (purpose fields, distinct label, universal run refuses calibration 409, contract carries no tier); `p4-six-stages` API; legacy Briefing copy | A server, B browser | PASS (legacy calibration behaviour unchanged) |
| T22 | Opportunity coverage | `universalRun.test.js` (11 required, render hashes); `p4-six-stages` (stage strip order, counts-only coverage); `contentTooling` preview/coverage matrix | A, B browser | PASS |
| T23 | Opportunity independence | `universalRun.test.js` clarification + group count; `sliceEvaluator.independentOpportunityCount` | A | PASS |
| T24 | Candidate attribution | `universalRun.test.js` (engine text never shown); `p4-six-stages` ("Provided" vs "Your edit", AI label) | A, B browser | PASS |
| T27 | Dialogue evidence | `universalRun.test.js`, `judgeDisagreement.test.js` (verified excerpt kept) | A | PASS |
| T28 | Artifact evidence | `universalRun.test.js` board patch → unit; `p4-six-stages` board edit linked | A, B browser | PASS |
| T29 | Missing/contradictory evidence | `universalRun.test.js` (no units for unanswered); `judgeDisagreement` (contrary/ambiguity → review, never consensus) | A | PASS |
| T30 | Clear developing behaviour | audit provider level-2 units stay PROVISIONAL (`universalRun`, `p4-six-stages` Reasoning described, others insufficient) | A, B browser | PASS (deterministic provider) |
| T31 | Evaluator/schema/write outage | `sliceEvaluator.test.js` faults throw/malformed/evidence-write → TECHNICAL_FAILURE | A | PASS |
| T32 | Source quote mismatch | `sliceEvaluator.test.js` mismatch → HUMAN_REVIEW_REQUIRED, no excerpt | A | PASS |
| T33 | Judge disagreement | `judgeDisagreement.test.js`: marker → exactly 2 samples; ≥2 levels apart or rated/abstain → `HUMAN_REVIEW_REQUIRED` `JUDGE_DISAGREEMENT`, no level, learner words kept; audited; queued to the rating queue when `PRISM_V3_RATING_QUEUE` on; report describes nothing | A (end to end over /api/v1) | PASS |
| T34 | Malicious learner prompt | `factBoundary.test.js` validateGeneratedAction; `universalRun.test.js` board action outside schema → 422 | A | PASS |
| P4.8 | Content review tooling | `contentTooling.test.js`: version package, diff, preview (no writes), coverage, attachments, comments, role-checked decisions, pilot gate 409, draft → NEW version, immutability, audit per mutation; `AdminContentForms.test.jsx` | A server, A UI | PASS (no content approved: CORE-TEAMREADY-A stays DRAFT) |

Remaining: manual AT/zoom passes, T18 approved adjustments, Layer C live-model wording, content /
measurement / accessibility approvals (human gates), firefox/webkit/mobile runs of `p4-six-stages`
(chromium only in this runner mode).

## P3 acceptance gaps closed - 2026-10-03

Commands (from `studai-prism/`, Windows, isolated processes; no live model, no production data):

| Command | Layer | Result |
| --- | --- | --- |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 36 files, **490 pass, 0 fail** (new `src/features/assessments/p3Player.test.jsx` 13, Home practice/preparation 2, report header 1) |
| `npm --prefix server test` | A | 816: **790 pass, 0 fail**, 26 DB skips (new `server/test/homeStates.test.js` 5) |
| `npm run build` | Build | PASS |
| `npm run audit:static` | Static | PASS (1580 files scanned) |
| `node scripts/run-experience-baseline-tests.mjs p3` | B in browser + A UI | **164 passed, 0 failed, 0 flaky** (41 per project x 4; 5.5 min; final run) |

`p3` runner mode: embedded throwaway PostgreSQL for the 4174 campus audit server,
`PRISM_AUDIT_DRAFT_CONTENT=true` (the audit server sets `PRISM_DRAFT_CONTENT` in its own process
only), specs `p3-real-journey`, `flow-player-layout`, `flow-recovery`, `campus-shell` on chromium,
firefox, webkit and mobile-chromium. `p3-real-journey.spec.js` uses NO route fixtures: real register,
real `POST /api/payment/dev-session`, server-pinned DRAFT universal form, real start, intro, Escape
(`timing.begun` stays false), Begin, real message (authored replies), keyboard-only board edit
(Tab from the work-material tab, then typing), reload (same session, identical `deadlineAt`,
message and `R2.due` persisted, "Your edit"/"Provided" attribution), Finish, the in-process
`EVALUATE_RUN` worker with the audit provider, published Report V3 (every quote is the learner's own
words; no capability band for the small DRAFT slice). Chromium also saves screenshots at
1440/1024/768/390/360 for intro, active player and report into `audit-results/ui/p3/` with no
horizontal overflow, and axe (serious/critical) is empty at 1440 and 390 for each.

Earlier runs of the same mode: run 1 164 tests, 2 flaky + mobile journey failure (defects 2-3
below); run 3 stopped after a screenshot-loop race in the new spec (layout read before the
resize settled; fixed) and one pre-existing `campus-shell` /app/settings axe navigation flake.

Screenshots inspected (intro 1440/360, active 1440/768/390, report 1440/1024/390). Defects found and
fixed during this run:

1. Report header repeated the title ("Get the team ready — Get the team ready") when the scenario
   title equals the assessment title (also in the PDF). Fixed in `ReportView.jsx`/`reportPdf.js`
   with a unit test.
2. Closing the Briefing returned focus on a later animation frame, which could steal focus the
   learner had already moved (flow-player-layout compact test failed first try in chromium and
   mobile-chromium). Focus now returns synchronously; opening only moves focus when it is still on
   the toggle.
3. The mobile journey could not switch to the Workspace pane through the visually hidden radio
   (its label takes the pointer, as for a real user); the spec now uses the label.
4. `campusCopyCeiling` flagged `|| \`Task …\`` fallbacks in the new PlanBoard; replaced with
   explicit helpers (no fallback content).

Observation, not a defect of this phase: the plain statement uses the audit provider's stub wording
("The candidate addressed the opportunity…"); live wording is a Layer C item.

| ID | Requirement | Covered by | Layer | Result |
| --- | --- | --- | --- | --- |
| T09 | New-run canonical player | `p3-real-journey` (new run opens `/app/assessment/:id`, V3 only); `player.test.jsx` | B browser, A | PASS |
| T10 | No work materials | `p3Player.test.jsx` (centred conversation); `player.test.jsx`; `flow-player-layout` conversation widths | A, A browser (fixture) | PASS |
| T11 | Required material unavailable | `p3Player.test.jsx` (null data → recovery + retry reloads the contract; unsupported type → support) | A | PASS (browser fault not injected) |
| T12 | Long transcript | `flow-player-layout` (fixed frame, independent scroll, 7 widths); jump-to-latest in `p3Player.test.jsx` | A browser (fixture), A | PASS |
| T13 | Long artifact and mobile | `flow-player-layout` materials; `p3-real-journey` mobile-chromium Workspace switch | A browser, B browser | PASS; on-device soft keyboard: manual |
| T14 | Scenario intro | `p3-real-journey` (pinned title/situation/role/participants, 25-min proposed policy, typing only, Begin focused, Escape does not begin); `player.test.jsx` | B browser, A | PASS |
| T15 | Begin replay/concurrency | `server/test/runTiming.test.js` (repeated + concurrent begins, one start); `p2Slice.db`; `player.test.jsx` one key | A server, B | PASS |
| T16 | Timer refresh/reconnect | `p3-real-journey` reload: identical `deadlineAt`; `flow-player-layout` countdown | B browser | PASS |
| T17 | Deadline vs grace | `runTiming.test.js` "after the answer cutoff the server refuses new formal answers"; `p3Player.test.jsx` late draft visible, read-only, "not submitted", never sent | A server, A | PASS |
| T18 | Approved timing adjustment | `runTiming.test.js` policy/version persisted; no adjustment is approved yet | A server | PARTIAL - no approved adjustment exists (HA gate) |
| T19 | Requested scenario | `p2Slice.db` (body cannot swap the form); `player.test.jsx` unknown scenario never substituted | B, A | PASS |
| T20 | Resume existing session | `p3-real-journey` reload: same session, transcript, board value | B browser | PASS |
| T21 | Calibration vs context | contract never carries rubric/calibration (`homeStates.test.js` contract check); intro wording is task context only | A server | PARTIAL - separate calibration purpose copy not built (P4+) |
| T24 | Candidate attribution | `p2Slice.db` (units only from CANDIDATE actions); PlanBoard "Provided" vs "Your edit" (`p3Player.test.jsx`, `p3-real-journey` data-origin) | B, A, B browser | PASS |
| T56 | Keyboard/screen reader/zoom | `p3-real-journey` keyboard board edit + axe at 1440/390; Briefing focus return and jump-to-latest keyboard (`p3Player.test.jsx`); `campus-shell` keyboard/axe | B browser, A | PASS (automated); manual AT (NVDA/VoiceOver) and 200-400 % zoom remain manual |

Remaining: manual screen-reader and zoom passes (MANUAL_JOURNEYS.md), on-device mobile soft
keyboard, T18 approved adjustments (human gate), T21 calibration-purpose copy, a browser-injected
T11 fault, and Layer C live-model wording. Universal opportunity coverage T22-T23 stays with P4.

## P2.9 Layer B checkpoint - 2026-10-03

Real disposable PostgreSQL (embedded cluster, 49 migrations), `buildApp()` HTTP, PG campus + legacy
store (`PRISM_PG_STORE=true`), `PRISM_DRAFT_CONTENT=true`, in-process evaluation worker, strict
evidence writer, V3 publication. Only the external provider is stubbed (`NODE_ENV=test` +
`PRISM_AUDIT_AI=true` → `services/ai/auditConverse.js`; faults via test-only `PRISM_AUDIT_AI_FAULT`).
No evidence/report/job row is inserted by the test.

| Check | Layer | Result |
| --- | --- | --- |
| `node scripts/run-experience-baseline-tests.mjs p2` (`server/test/p2Slice.db.test.js`) | B | **14/14 pass** (1 parent + 13 sub-tests), 9 fresh runs |
| `node scripts/run-experience-baseline-tests.mjs database` | B | 6/6 pass, 49 migrations (no migration added) |
| `npm --prefix server test` | A | 811: 785 pass, 0 fail, 26 DB skips (p2Slice skips outside the runner) |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 35 files, 474 pass |
| `npm run audit:static` | Static | PASS |

Chain proven on PG: register → dev entitlement → personal assignment server-pinned to the DRAFT
universal form → `POST /api/v1/assessment-assignments/:id/start` (session created through the legacy
store, no model history, request body cannot swap the form) → Begin twice (idempotent, same timestamps)
→ authored stimulus + meaningful messages + learner board patch (`R2.owner`) → finish → `EVALUATE_RUN`
job DONE → strict units with `actionId/opportunityId/rubricRef/methodVersion/snapshotHash`, excerpts
only from accepted CANDIDATE actions, never stimulus/TEMPLATE text (T24/T27/T28), no `v1_reports` row
(T35) → `v1_sessions.data.history` purged → report GET twice: same stored version + `evidence_set_hash`,
bounded observation/moment quotes verified learner words (T32/T36); versions list + review request
leave the version unchanged → replay + handover mission with ASSESSMENT_MOMENT origin, criterion
feedback, retry = new attempt, formal version/hash unchanged, `/me/history` FORMAL vs PRACTICE typed
and linked (P2.8).

Faults verified (fresh runs): provider failure after save (actions APPLIED, job FAILED
TECHNICAL_FAILURE, `SCORING_FAILED`, report 409, retry → attempt 2, no learner-deficit unit);
malformed output (technical, 0 units); quote mismatch (HUMAN_REVIEW_REQUIRED, no excerpt, no
replacement quote); evidence-write failure (PG rejects a NUL byte from the stub output → technical,
0 units); worker crash (claim with 50 ms lease, reclaim, stale fencing token rejected, one applied
result); repeated client key (replay 200, changed payload 409); concurrent report GETs (6 → one
version); erasure while LEASED (completion rejected, no resurrection, late write 404); sparse input
(INSUFFICIENT_EVIDENCE TOO_SPARSE/NOT_ADDRESSED, job DONE, no quote).

Root cause fixed: draft/universal `start()` called the legacy engine, which cannot load a DRAFT
scenario (and board saves went through the engine's `loadSession`). Draft runs now create their
session through the legacy store and save board changes there; the handover segment answers only
from pinned conditional facts. PG repository bugs found: none (job claim/fencing, run timing,
opportunity ledger, `listActions`, report `listVersions`/reviews all behaved on PG). Observed PG
difference: JSONB reorders board-patch keys, so the stub now judges the longest changed value
instead of the "first line" (test provider only). Remaining blocker: Layer C live-model run
(authorization/credentials/budget) — unchanged, not fabricated.

## P9-P10 checkpoint - 2026-10-03

| Check | Layer | Result |
| --- | --- | --- |
| `npm --prefix server test` | A | 808: 783 pass, 0 fail, 25 DB skips (new: metricsDefinitions 12, qualityViews 4, faultInjection 12, metricsAlerts 5, release/rollback/migrationsReversible/legacyReadersRetained 37) |
| `npm run test:unit` | A | 35 files, 474 pass |
| `npm run build`, `audit:static`, `audit:flow-flags` | Build/static/config | PASS |
| `node scripts/rehearse-migrations.mjs` | B (disposable cluster) | REHEARSED: up 49, idempotent re-up 0, down 0049→0040 one by one, up again 10, schema identical, missingDown [] |
| `check-experience-baseline.mjs --stage INTERNAL_CANARY` | Diagnostic | allocatable:false; blockers listed (flags off, checks UNVERIFIED); no secrets |
| `live-model-smoke.mjs` | C | BLOCKED (6 named blockers); no transcript fabricated |
| `load-pilot.mjs` | - | REFUSED without target + --synthetic (by design) |
| `browser-all` (4 projects, isolated) | A UI + journeys | **803 passed, 0 failed, 3 flaky (passed on retry: one axe timing, two firefox navigation timeouts), 18 skipped (ui-matrix non-chromium / DB-gated)** — 35.4 min, commit ace35a2 |


## P4-P5 checkpoint - 2026-10-03

| Check | Layer | Result |
| --- | --- | --- |
| `npm --prefix server test` | A | 712: 687 pass, 0 fail, 25 DB skips (new: universalForm 7, director 7, factBoundary 4, contentGovernance 3, universalRun 3, reportMoments 4) |
| `npm run test:unit` | A | 33 files, 449 pass |
| `run-experience-baseline-tests.mjs database` | B | 6/6, 45 migrations applied |
| `run-experience-baseline-tests.mjs browser-p1` (chromium/firefox/webkit/mobile) | A UI | 124 passed, 0 failed, 0 flaky (7.2 min) — p1-legacy-report 96, p1-account-entry, flow-entry |
| `npm run build`, `npm run audit:static` | Build/static | PASS |
| Live model (Layer C) | C | NOT RUN |


## P3 checkpoint - 2026-10-03

| Check | Layer | Result |
| --- | --- | --- |
| `npm --prefix server test` | A | 684: 659 pass, 0 fail, 25 DB skips (new runTiming 8) |
| `npm run test:unit` | A | 33 files, 446 pass (new: intro/begin 2, Home intent states 9, nav updates) |
| `npm run build` | Build | PASS |
| Note | - | A test fixture literal `1500000` false-matched the §22 pricing-leak regex; changed to `25 * 60000`. No pricing content involved. |


## P2 checkpoint - 2026-10-03

| Check | Layer | Result |
| --- | --- | --- |
| `npm --prefix server test` | A | 676 tests: 651 pass, 0 fail, 25 DB skips (new: sliceEvaluator 8, practiceHandover 4, durableActions 9, studentHistory 2, ownershipReconciliation 4) |
| `npm run test:unit` | A | 33 files pass (new: reports P2.6/P2.7 cases, handoverMission 2, history 6) |
| `run-experience-baseline-tests.mjs database` | B | 6/6 pass: 42 migrations, read-only probe, real scorer, V2 reader, durable actions immutable, erasure cascade + late write 404 |
| browser-all (first attempt) | A UI | Invalidated: a concurrent `npm run build` removed `dist/` mid-run → 404s/timeouts. Lesson: never build while the audit server serves `dist/`. |
| browser-p1 (isolated) | A UI | p1-legacy-report.spec.js locator strict-mode failures (empty toast live region also has role=alert) — spec fix in progress; app behaviour correct per error-context snapshots |
| Live-model slice (Layer C) | C | NOT RUN — no credentials/budget authorised |


## P1 checkpoint - 2026-10-02 (final)

| Check | Layer | Result |
| --- | --- | --- |
| Complete frontend `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 434 tests: 433 passed, 1 failed under load (Campus overview); same test 10/10 in isolation (known load-sensitive case, see P0) |
| Complete server `npm --prefix server test` | A | 664 tests: 639 passed, 0 failed, 25 DB skips |
| `node scripts\run-experience-baseline-tests.mjs database` | B | 6 passed, 0 skipped: 40 migrations, read-only probe, real scorer/report, V2 owner read + denials, durable APPLIED actions with immutable payload, erasure cascade zero rows + late write 404 |
| `npm run build`, `npm run audit:static`, `git diff --check` | Build/static | PASS |
| Full four-project `browser-all` | A UI + isolated journeys | Running in background at commit time; first interrupted run reached 377 passes with no failures; result appended below when complete |

New P1 tests: `durableActions.test.js` (9), `studentHistory.test.js` (2), `ownershipReconciliation.test.js` (4), `experienceBaseline.test.js` T25/T26 now PASS invariant, `history.test.jsx` (6), `legacyReport.test.jsx` (24), `authDestination.test.js` (27), `session.test.js` (5), `p1-account-entry.spec.js`, `p1-legacy-report.spec.js`.
Known noise: with telemetry enabled in the isolated DB test the legacy engine logs `item_responses` FK errors (unseeded item bank); non-fatal, pre-existing, unrelated to P1 changes.


Starting code checkpoint `ff6002c`, including the preserved dirty work described
in BASELINE. The historical P0 results below remain historical. P1 is not a
completed durable-acceptance/ownership/erasure phase.

| Current check | Layer | Fresh P1 result |
| --- | --- | --- |
| Targeted auth destinations/session/client/providers/public entry/player | A | 114 passed |
| Legacy presentation + existing V3 report unit tests | A | 24 + 15 passed (included in full suite) |
| Legacy copy/report-policy checks | A | 30 passed (included in server regression) |
| Complete frontend `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 427 passed, 31 files; 0 failed |
| Complete server `npm --prefix server test` | A + unavailable DB suites | 624 passed, 0 failed, 25 skips; skips remain UNVERIFIED |
| `node scripts\run-experience-baseline-tests.mjs database` | B | 4 passed, no skips; real normal scorer/report storage, issued V2 owner read, non-owner/anonymous denial, original blob unchanged |
| `npm run build` and `npm run audit:static` | Build/static | PASS |
| Full four-project `node scripts\run-experience-baseline-tests.mjs browser-all` | A UI + existing isolated journeys | PENDING |

Intentional contract changes: bare registration assertion now requires supported
`/app`, not mandatory checkout. Existing paid browser journeys now explicitly
request `next=/payment`; their checkout/consent/start assertions remain strict.
No copy-ceiling/scientific/authorization test was relaxed.

Development regression fixed before checkpoint: initial full frontend run had
9 failures from a stale workspace accessor at root initialization and over-broad
workspace remounting that discarded confirmation/focus. Cleanup resets the
accessor; missing workspace maps to the existing personal default; page-content
scope resets preserve shell/switcher/toast state. The affected 117 tests and then
the complete 427-test suite passed unchanged except new requirement tests.

The PG check does not backfill old customer ownership, pre-save before the model,
implement durable jobs or prove erasure/restart safety. T25/T26/T27/T32/T36
diagnostic failures from P0 remain explicit, not fixed by these passing UI/read
checks. No live model, real customer, migration of production data or human
approval occurred. Logs: TEMP `prism-p1-target-ui.log`, `prism-p1-scope-regressions.log`,
`prism-p1-ui-final.log`, `prism-p1-server-final.log`, `prism-p1-build-final.log`,
`prism-p1-static.log`, `prism-p1-database.log`.

Environment: local checkout starting at `f40bd1c`, Node v24.12.0, npm 11.6.2,
including preserved pre-existing dirty work. All results below are fresh P0
execution results, not inherited historical counts.

**A green diagnostic test is not a green product invariant.** The completed
synthetic learner run has no judged strict dialogue evidence. The failure-window
fixture duplicates an engine effect on retry. These remain explicit FAILs below.
No live model, production database or real customer was used.

## Commands and exact outcomes

Run from the repository unless `server` working directory is specified.

| Command/check | Layer | Result | Interpretation |
| --- | --- | --- | --- |
| Editor `runTests` on two Node server files | A | No tests discovered | Editor provider does not discover these Node tests; used repository Node runner instead |
| `node --test test\experienceBaseline.test.js test\studentFlowFlags.test.js test\campusSessions.test.js test\campusReports.test.js test\legacyReportGuard.test.js test\evaluateAsync.test.js test\sessionLocks.test.js` from server | A | 60 pass, 0 fail, 0 skip at initial checkpoint | Existing memory/HTTP fixtures and initial 8 diagnostic tests, before the ninth fault-window test |
| `node --test test\experienceBaseline.test.js` from server, final diagnostic selector | A | 9 pass, 0 fail, 0 skip | Correct diagnostic/redaction/error behavior; T25/T26 fixture invariant separately FAIL |
| `npm run test:unit -- --maxWorkers=2 --minWorkers=1` | A | 28 files, 360 tests pass; 0 fail | Full frontend suite, bounded workers; no frontend source changes |
| `npm --prefix server test` (equivalent `npm test` from server), final | A / DB checks unavailable | 649 tests: 624 pass, 0 fail, 25 skip | Includes claims/Campus-copy/design-system gates; skipped DB tests are UNVERIFIED |
| `npm run build` | Build | PASS | Existing large-chunk warning retained; no unrelated bundle repair |
| `npm run audit:static` | Static | PASS | Existing audit output generated; not a security or pipeline certification |
| `npm run audit:flow-flags` with explicitly dark test-process flags | Configuration | PASS | Safe configuration consistency only; no real flags loaded or changed |
| `node scripts\check-experience-baseline.mjs` with that test environment | Diagnostic | Expected exit 1; DB UNVERIFIED | No DB connection attempted; worker/build/content approvals stay unknown |
| `node scripts\run-experience-baseline-tests.mjs database`, final | B | 3 tests pass, 0 fail, 0 skip | New UTF-8 PostgreSQL cluster, all 39 actual migrations, real HTTP/store/report path; external model stub only |
| `node scripts\run-experience-baseline-tests.mjs browser`, initial | A UI fixtures + isolated account API | 92 browser tests pass across 4 projects; wrapper exit 1 during cleanup | Test assertions passed; Windows EBUSY cleanup required a bounded-retry fix; not reported as a fully successful command |
| Same browser command, cleanup-fix rerun | A UI fixtures + isolated account API | 91 pass + 1 flaky, 0 final failures; runner exit 0 | Firefox materials at 360 had an initial `page.goto` load timeout in sign-in setup; unchanged retry passed; cleanup completed |
| `node scripts\run-experience-baseline-tests.mjs browser-smoke` after audit-data-root support | A test harness | 8 pass, 0 fail; runner exit 0 | Both audit servers use independent stores beneath the runner cleanup root; that root is removed; not a replacement for the 92-test baseline |
| P0 script/server-test editor diagnostics | Static | No errors | Four new JS/MJS files checked |
| Ledger source reconciliation | Documentation | 52 CH + 60 T unique rows; 13 ADR; 13 HA-C; zero reported source/phase/path mismatches | Traceability, not product acceptance |
| Calibration Python suite / full unrelated browser suite | Not run | NOT RUN | No Python/scientific/router/shell changes; scoped browser baseline used |
| Live-model staging / real-user research / production support lookup | C / human | NOT AUTHORIZED / NOT RUN | Budget, consent, operator and reviewer gates remain open |

The normal server suite's 25 skips include the dedicated P0 DB test, which
requires the self-owned-database runner marker, plus existing DB-dependent tests.
The separate 3-test P0 database invocation ran with no skips. It does not verify
every previously skipped DB suite, deletion, distributed leases or active-run rollback.

## Measured product invariants and limits

| Requirement | Fresh observation | Status |
| --- | --- | --- |
| T01/T02/T03/T04 | Returning login/alias/deep-link/dark/recovery frontend checks remain green | FIXTURE_TESTED; registration commercial choices remain later work |
| T05/T47 | A report saved by the real isolated scorer is discoverable in owned completed history; second owner gets 404 for session/report | PARTIAL INTEGRATION_VERIFIED; not an old customer report or complete audience matrix |
| T06 / CH-41 | Separate source-only conflict/unclaimed fixtures classify correctly; no owner is transferred | INTEGRATION_VERIFIED DIAGNOSTIC, not an approved claiming workflow |
| T10/T12/T13/T16 | Fixed viewport/panes/composer and deadline receipt tested at seven widths, compact viewport and four browser projects | FIXTURE_TESTED; no formal administration change |
| T14/T19/T20 | Existing requested marketing form appears consistently; server clock already started and exposes existing 35-minute window | BASELINED; separate pre-clock intro remains OPEN |
| T25 | Three real accepted messages are stored in PostgreSQL history and have receipts before finish | PARTIAL; no live-model failure/crash recovery proof |
| T25/T26 | Injecting one receipt-write failure after the current service's engine effect then retrying the same event yields 2 engine effects and 1 receipt | FAIL, Layer A diagnostic reproduction; not a process-crash/multi-instance test |
| T27 | Dialogue-only real HTTP/scorer completion yields 0 judged strict evidence units | FAIL, Layer B; no evidence or completed report was preseeded |
| T32 | Normal PG completion removes session history used by V3 source-quote verification | FAIL for that source dependency; separate telemetry retention is not equivalent to builder source access |
| T36 | V3 report GET appends a stored version in the isolated run | DIAGNOSTIC SIDE EFFECT; not a safe read-only support probe |
| T31 | Probe/schema/read/cleanup failures produce explicit nonzero/error states; existing UI scoring-retry failure remains visible | Diagnostic/UI verified; durable processing-state repair remains OPEN |
| T59 | With telemetry enabled only inside the isolated DB test, the real dev-run timeline row is marked synthetic | PARTIAL INTEGRATION_VERIFIED; full conversion/research exclusion manifest not supplied |
| CH-41 | An attempted write on the same diagnostic connection is rejected with SQLSTATE 25006; record count unchanged | INTEGRATION_VERIFIED read-only enforcement |
| T49/T50/T60 | Existing locking fixtures pass; legacy evaluation jobs remain process-local; flag-only fallback can strand V3 runs | OPEN; no durable worker/restart/rollback claim |

## Visual inspection

Manually inspected generated fixture screenshots:

- Desktop conversation at 1440: centered conversation-only surface, fixed context
  header and reachable composer; no reserved empty half-screen.
- Material pane at 390: narrow tabbed layout, independently scrollable material
  and one docked composer retaining the synthetic draft.
- WebKit scoring-error at 390: visible failed retry, support reference and recovery
  actions; no invented report or learner capability state.

Paths: `audit-results/ui/flow-player/chromium-conversation-1440.png`,
`chromium-materials-390.png`, and
`audit-results/ui/flow-recovery/webkit-scoring-390.png`.
These contain labelled synthetic UI fixtures, not governed results. No new UI
design was delivered and no human accessibility conformance claim is made.

## Failed development attempts retained

1. Windows ESM dependency loading initially failed because an absolute Windows
   path was passed to `import`; fixed with `pathToFileURL`.
2. First embedded cluster used Windows default WIN1252, causing migration 0003
   to reject an existing Unicode SQL comment. The new test launcher explicitly
   initializes UTF-8; historical migration files were unchanged.
3. The embedded package's exit hook could mask the runner verdict. The launcher
   now keeps a local exit status and explicitly exits with it after cleanup.
4. A test looked for ownership at the wrong output nesting; corrected to
   `snapshot.database.ownership`, without changing diagnostic schema/runtime.
5. The timeline assertion initially ran with telemetry deliberately disabled.
   The isolated test now explicitly enables existing telemetry and waits for its
   asynchronous write; this is a test-process flag, not production activation.
6. The first complete browser run passed all 92 tests but temporary-directory
   deletion hit Windows EBUSY. Cleanup is now bounded/retried and failures are
   explicit; final browser rerun is recorded separately above.
7. The final browser run retained one initial Firefox navigation timeout before
   reaching the fixture. The existing single automatic retry passed unchanged.
   This is disclosed as flaky, not counted as 92 clean first-attempt passes.

Final syntax checks (`node --check`) pass for all four new JS/MJS files.
`git diff --check` passes. Test ports 4173/4174 are free after the runner exits;
specifically created P0 temporary PostgreSQL directories are removed.
The first browser invocations used the existing audit harness's separately
allocated global temporary stores; their exact ownership paths were not captured,
so unrelated temporary stores were not guessed/deleted. The new optional audit
data root keeps subsequent stores inside the runner-owned cleanup boundary.

## Evidence storage

Long command output is under TEMP, named `prism-p0-target-server.log`,
`prism-p0-diagnostic-unit.log`, `prism-p0-frontend.log`, `prism-p0-build.log`,
`prism-p0-server-final.log`, `prism-p0-static.log`, `prism-p0-database.log`,
`prism-p0-browser.log`, `prism-p0-browser-final.log` and `prism-p0-browser-smoke.log`.
These ephemeral files are not committed or customer evidence.

`audit-results/p0/lineage.json` contains only safe synthetic aggregate metadata
and explicit PASS/PARTIAL/FAIL observations. Browser JSON/screenshots are ignored
audit artifacts. Temporary PostgreSQL/data directories belong to the isolated
runner and must be shut down/removed after checks; never delete an existing
application or shared database directory.
