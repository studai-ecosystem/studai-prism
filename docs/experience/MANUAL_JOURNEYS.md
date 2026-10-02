# Manual journeys (P10.7) — environment-relative URLs

Status: **PREPARED, UNTESTED IN PRODUCTION.** These URLs are relative to the
environment under test (`<base>` = the deployment candidate's origin). Every
`<...>` placeholder is resolved during testing from an authorized synthetic or
consented test identity; nothing here is a production session id, and no URL
below is asserted to work until a tester records the result in
`TEST_RESULTS.md` with environment, build id and outcome.

Placeholders

| Placeholder | Meaning | Resolution rule |
| --- | --- | --- |
| `<owned-session-id>` | A V3/universal run started by the signed-in test identity | Taken from the `/api/v1` start response during the test, never typed by hand |
| `<legacy-session-id>` | An older owned report of the same identity | From the owned history view |
| `<assignment-id>` | An assignment visible to the identity in its active workspace | From `/app/assessments` |
| `<mission-id>` | A reviewed Development Mission | From `/app/development` |
| `<preparation-attempt-id>` | An owned preparation attempt | Only when `PRISM_PREPARATION_V1` is on in that environment |
| `<share-token>` | A share created by the tester in this run | From the share action; expire/revoke it in the same session |
| `<org-id>` | The test institution | Campus staff test identity only |

Record the test identity indirectly (role + environment + workspace type), never
a password, token or e-mail.

## 1. Account entry

| Step | URL | Expected | Evidence to capture |
| --- | --- | --- | --- |
| Discovery/offer | `<base>/` | Clear benefit before any payment; pricing shows only the configured amount or "to be confirmed" | Screenshot; no invented claims |
| Sign in (returning) | `<base>/login` | Lands on `/app/home`; old redirect `/dashboard` → `/app/home` | Screenshot of landing |
| Register (new) | `<base>/register` | Intent onboarding; no formal run created | Screenshot |
| Profile | `<base>/profile` → `/app/settings#profile` | Correct student/professional context | Screenshot |

## 2. History and owned reports

| Step | URL | Expected | Evidence |
| --- | --- | --- | --- |
| History | `<base>/app/assessments` | Owned sessions, legacy reports and practice attempts only; empty state honest | Screenshot (counts, no names of others) |
| Old owned report (legacy reader) | `<base>/report/<legacy-session-id>/v2` | Renders for the owner; non-owner → not found | Owner + non-owner result |
| Legacy score reader | `<base>/score` (owner context) | Still available | Screenshot |
| Non-owner access | same URLs with a second test identity | Denied, no data leak | HTTP status + screenshot |

## 3. New canonical run (formal — no coaching, no rubric)

| Step | URL | Expected | Evidence |
| --- | --- | --- | --- |
| Assignment briefing | `<base>/app/assessments/<assignment-id>/briefing` | Scenario shown before Begin; no rubric | Screenshot |
| System check | `<base>/app/assessments/<assignment-id>/system-check` | Pass/fail honest | Screenshot |
| Start (allocation) | action from briefing | If readiness is not READY: `RUN_NOT_ALLOCATABLE` (503) and **no credit moved**; otherwise `<owned-session-id>` issued and pinned | API response code; ledger shows no reservation on 503 |
| Player | `<base>/app/assessment/<owned-session-id>` | Stable header/composer, explicit timed Begin, real timer, board edits saved with versions | Screenshot before/after Begin |
| Refresh/resume | reload the same URL | Saved responses and board survive; timer not reset; Start not re-run | Screenshot + `exchanges` count unchanged |
| Finish | action in player | SCORING → COMPLETE, or a technical-failure message (never "insufficient evidence" for a fault) | Final state |

## 4. Report, capabilities, development

| Step | URL | Expected | Evidence |
| --- | --- | --- | --- |
| Report V3 | `<base>/app/reports/<owned-session-id>` | Immutable issued version, source-backed moments, neutral insufficient state where applicable, review/correction entry | Screenshot of version label |
| Selected version | `<base>/app/reports/<owned-session-id>?version=<n>` | Earlier issued version readable | Screenshot |
| Capabilities | `<base>/app/capabilities` and detail | Formal only; practice never raises formal | Screenshot |
| Development | `<base>/app/development` → `/app/development/missions/<mission-id>` | Reviewed mission, source-linked replay, fresh challenge; coaching labelled Practice | Screenshot |
| Preparation (if on) | `<base>/app/prepare` → `/app/prepare/<preparation-attempt-id>` | Private; never visible to Campus | Screenshot + Campus staff view shows nothing |
| Growth/history | `<base>/app/home` growth area | Comparison unavailable unless `PRISM_GROWTH_ENABLED` and approval | Screenshot of unavailable state |

## 5. Campus and sharing

| Step | URL | Expected | Evidence |
| --- | --- | --- | --- |
| Campus learner assignment/report | `<base>/app/assessments/<assignment-id>` in the Campus workspace | Disclosure acknowledged before start; sponsor named | Screenshot |
| Staff programme view | `<base>/campus/<org-id>/...` (staff identity) | Only authorized aggregate/roster data; no preparation/practice | Screenshot |
| Share preview | share action from the report | Bounded preview shown to the owner before creation | Screenshot |
| Shared link | `<base>/shared/<share-token>` | Approved scope only | Screenshot |
| Expired/revoked | same URL after revoke | Denied | HTTP status |
| Non-owner report | `<base>/app/reports/<owned-session-id>` with another identity | Not found | HTTP status |

## Final human sequence (record in this order)

discovery/offer → sign-in → previous report → actual new scenario → explicit
timed start → real decisions and board edits → refresh/resume → finish →
source-backed report → relevant practice/retry → private preparation where
available → return/history → optional safe sharing.

## Evidence rules

- Screenshots are inspected, not merely saved; crop out any real name or e-mail.
- Record build id, environment, flag set and `release.stage` from
  `node scripts/check-experience-baseline.mjs --stage <stage>`.
- A pending approval or an un-run step is **BLOCKED/NOT RUN**, never a pass.
