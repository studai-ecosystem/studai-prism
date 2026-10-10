# HA-006 — Under-18 decision memo (guardian consent or explicit exclusion)

PROD-READY Phase 10. **DRAFT decision memo — no decision is recorded here.**
The decision belongs to the founder with counsel (register row HA-006, P2;
counsel review HA-005). Engineering prepared the options and the facts about
what exists. The register entry stays open until a signed memo is linked.

Related: [AGE_GATING_POLICY_v1.md](../../AGE_GATING_POLICY_v1.md) (policy +
Phase 8 addendum), [COUNSEL_PACKET_CONSENT_STRINGS.md](./COUNSEL_PACKET_CONSENT_STRINGS.md)
(every guardian and age string, exact text), decision P85 in
[PROD_READY_STATE.md](../PROD_READY_STATE.md).

## 1. The question

First-year college cohorts in India include learners who are 17 when the
academic year starts. Prism is 18+ today. Before any college pilot that may
include first-year students, decide one of:

- **Option A — Explicit exclusion.** Prism stays 18+ only. Institutions are
  told that learners under 18 cannot take part, and the existing hard gate
  stays the only path.
- **Option B — Guardian consent.** Learners under 18 may take part if a
  parent or guardian agrees, using the dark path built in Phase 8 (after the
  gaps in §4 are closed and counsel approves the copy and the verification
  method).

A third, interim position is possible and is today's effective state:
Option A in production while Option B stays dark and unused.

## 2. What exists today (code facts, branch `prod/p10-human-actions`)

### Live behaviour (flag `PRISM_UNDER18_PATH` OFF — registered OFF in `server/lib/flagRegistry.js`)

- Registration requires the 18+ declaration (`ageConfirmed === true`, else
  400) — `server/routes/auth.js` (the guardian branch is taken only when the
  flag is on). The checkbox label is `AGE_DECLARATION_TEXT`
  (`server/lib/sharedConstants.js:120`) plus "Prism is currently available
  to candidates aged 18 or older." (`src/pages/Auth.jsx:167`). No date of
  birth is collected.
- Commencement is hard-blocked without a declaration (403
  `AGE_CONFIRMATION_REQUIRED` + an `age_gate` audit row) across paid,
  invite, coupon and review-grant entitlements (AGE_GATING_POLICY_v1).
- Every guardian route answers 404 (`server/routes/guardianConsent.js`,
  `dark` middleware). Test: `server/test/guardianConsent.test.js`
  ("flag off…").

### Built dark in Phase 8 (works only with the flag on)

| Piece | Where | State |
| --- | --- | --- |
| Registration with `under18: true` + guardian email; no declaration written | `server/routes/auth.js` lines 39–97 | Built, dark |
| Single-use guardian link (hash stored only), 14-day decision window (`GUARDIAN_LINK_DAYS`) | `server/domain/guardian/service.js`, `copy.js` | Built, dark |
| Guardian page agree / decline / withdraw | `/guardian-consent/:token` → `src/features/guardian/GuardianConsentPage.jsx`; API `/api/guardian-consent` | Built, dark |
| Learner status + resend | `/api/auth/guardian-consent` (GET, POST `/resend`) | Built, dark (API only) |
| Declaration written on agreement: version `guardian-consent-u18-v0-draft`, basis `GUARDIAN_CONSENT` (never an 18+ confirmation); withdrawal removes it | `server/domain/guardian/copy.js`, `server/lib/db.js` | Built, dark |
| Storage: `guardian_consents` (migration 0062) — guardian email, copy version, link hash, state, request/expiry/decision/withdrawal times; nothing else | `server/db/migrations/0062_guardian_consents.sql` | Built (migration ships with the release, table empty) |
| Erasure: deleted with the learner's account (personal-data registry) | `server/domain/privacy/personalDataRegistry.js`, `server/domain/privacy/erasureCascade.js` | Built |
| Retention: unverified requests deleted 30 days after they end (`guardian_consents_unverified`, PROVISIONAL, HA-003), only under `PRISM_RETENTION_ENFORCEMENT` | `server/lib/retentionEnforcement.js:41,68` | Built, dark |
| Guardian email | `sendGuardianConsentEmail` in `server/lib/mailer.js:156` | Built; needs SMTP + `PUBLIC_APP_URL` |
| Copy | `server/domain/guardian/copy.js` (`GUARDIAN_CONSENT_COPY`), `src/lib/copy/guardianConsent.js` (`GUARDIAN_PAGE_COPY`) | **DRAFT**, pending HA-006 + HA-005 |

Tests: `server/test/guardianConsent.test.js` (5), vitest
`src/features/guardian/guardianConsent.test.jsx` (4), `server/test/demoOrg.db.test.js`
(PostgreSQL repository, erasure, retention).

### Not built

1. **No control on the registration form.** `src/pages/Auth.jsx` offers
   only the 18+ checkbox; nothing sends `under18: true` or a guardian email.
   The form cannot know a server flag before sign-in. Option B needs a
   product change (a reviewed UI control, or an institution-invite variant
   that knows the flag).
2. **No age verification of any kind.** Age is self-declared (18+ checkbox)
   and the guardian is verified only by possession of the emailed link.
   Nothing checks that the address belongs to a parent or guardian.
3. **No institution-facing guardian view** (an institution cannot see which
   learners are waiting for guardian consent).
4. **No learner-facing status screen** in the web app; the status exists
   only as an API.
5. **No guardian name, relationship or identity document is collected**
   (data minimisation by design — this is a choice to confirm, not a gap to
   fill by default).

### Inconsistency found while preparing this memo

The public Terms of Service page (`src/pages/legal/LegalPages.jsx:96`,
route `/terms`) says: *"You must be at least 18 years old, or have the consent
of a guardian."* The live product does **not** offer a guardian path (the flag
is off and the registration form has no control), and AGE_GATING_POLICY_v1
says Prism is 18+ only. The sentence was not changed in this phase because
legal copy is a counsel decision (HA-003 / HA-005): under Option A it should
drop "or have the consent of a guardian"; under Option B it matches only
once the path is live. It is listed in the counsel packet.

## 3. What each option changes

| | Option A — explicit exclusion | Option B — guardian consent |
| --- | --- | --- |
| Engineering before a pilot | None. Optionally: institution notice copy naming the 18+ rule on invite/cohort surfaces (exists, AGE_GATING_POLICY "Institution notice"); onboarding runbook line | Close §2 "Not built" items 1 and 4 at least; decide on item 2 (verification strength); replace DRAFT copy with approved text under a **new version id**; staging test of the email path |
| Flag | `PRISM_UNDER18_PATH` stays OFF permanently; the dark code can be removed later or kept | Human flips `PRISM_UNDER18_PATH` (GO_LIVE "Stay OFF" row moves) after HA-006 + HA-005 close |
| Data processed | No data about minors (beyond self-declared adults) | Guardian email + consent record for each learner under 18; data of a minor (assessment transcript, report) |
| Counsel questions (HA-005) | Is a self-declared 18+ checkbox sufficient for the institution context? | DPDP: is verifiable parental consent required and is link possession enough? Is the "who sees" text right? Is 30 days right for unverified requests (HA-003)? Must tracking/behavioural monitoring be excluded for minors (proctoring flags are off by default)? |
| Pilot impact | First-year cohorts: some learners cannot take part; institutions must be told before roster import; cohort aggregates exclude them | Every learner can take part once a guardian agrees; participation for under-18 learners waits on guardian response |
| Reversibility | Easy to move to B later | Moving back to A needs a plan for existing guardian-consented accounts (withdrawal path exists) |

## 4. Facts the decision-makers will need (not available to engineering)

- How many learners in the target pilot cohorts are under 18 — **UNKNOWN**
  (no pilot roster exists; Prism collects no date of birth).
- Institutions' own consent arrangements for minors — **UNKNOWN**.
- Counsel's view on DPDP verifiable parental consent for this use — **PENDING
  (HA-005)**.

## 5. Decision record (to be completed by humans)

| Field | Value |
| --- | --- |
| Option chosen (A / B / interim) | `______` |
| Conditions (e.g. verification method, institution notice, cohort rules) | `______` |
| Counsel approval reference (HA-005) | `______` |
| Approved copy version id (replaces `guardian-consent-u18-v0-draft` for B) | `______` |
| Signed by (founder) / date | `______` |
| Counsel / date | `______` |

When signed, link this memo from register row HA-006. Under Option B the flag
flip is a separate human step (GO_LIVE_CHECKLIST, HA-020 workflow).
