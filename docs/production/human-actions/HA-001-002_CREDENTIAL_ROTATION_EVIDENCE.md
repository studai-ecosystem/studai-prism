# HA-001 / HA-002 — Credential rotation evidence template (P0)

PROD-READY Phase 10 (charter Phase 10, first bullet). **Close these two items
first.** They are step A1/A2 of [GO_LIVE_CHECKLIST.md](../GO_LIVE_CHECKLIST.md)
and block every step that touches money or mail.

> **Status of this document: TEMPLATE — no field below is filled.** As of
> 2026-10-11 the repository holds **no evidence that either rotation has
> happened**. The incident record
> [INCIDENT-2026-08-04-credential-exposure.md](../../remediation/INCIDENT-2026-08-04-credential-exposure.md)
> is still `OPEN`, its §4 steps 1–3 are `OPEN`, and neither
> [RELEASE_RECORDS.md](../../remediation/RELEASE_RECORDS.md) nor
> [PROGRAM_STATE.md](../../remediation/PROGRAM_STATE.md) nor any commit records
> a rotation. Do not assume one took place. The only rotation in the git log
> (`bcee48e`, "rotate leaked admin token") concerns the legacy admin token,
> not Razorpay or SendPulse.

Engineering prepared this template. Only a human with provider-console
access can fill it, and only real evidence closes HA-001 / HA-002
(register statuses change to `CLOSED (evidence linked)` by a human, never by
an agent).

## Operator checklist (in this order)

- [ ] **Do HA-001 and HA-002 before anything else on the go-live checklist.**
      No paid offer becomes purchasable, no Razorpay webhook secret is set and
      no SMTP credential is copied into a new secret (release C1, staging B5,
      secret split HA-022) until both are rotated.
- [ ] Follow [RUNBOOK-credential-rotation.md](../../remediation/RUNBOOK-credential-rotation.md)
      §A (Razorpay) and §B (SendPulse). Rule zero applies: **no secret value
      in chat, terminal echo, git, test output, this document or any
      screenshot** — old or new.
- [ ] Fill §1 and §2 below in a private copy, or fill them here with
      references only (ids, timestamps, file names in your evidence store).
- [ ] Write the provider activity review notes (§3). They are also the
      input for **HA-018** (provider-side incident conclusions).
- [ ] Update the register rows HA-001 / HA-002 with a link to the filled
      evidence and the incident record §4 table (steps 1–3, 6, 7).
- [ ] The incident closes only with HA-018's written conclusion.

Notes on the current platform that differ from the 2026-08-04 runbook:

- The production workload is still `deployment/prism` in namespace `prism`
  (`infra/aws/eks/overlays/production/kustomization.yaml`), so the runbook's
  restart command is unchanged. The runtime image is distroless; in-pod
  checks use `/nodejs/bin/node` only (runbook §B3).
- Since PROD-READY Phase 1S the payment path also uses
  `RAZORPAY_WEBHOOK_SECRET`, and `/verify` grants only **captured** orders
  (decision P12/P13). Set the webhook secret **after** the key rotation, from
  the regenerated webhook configuration (RELEASE_TEMPLATE_PROD_READY.md §3).
  Keep Razorpay auto-capture on (GO_LIVE D4).
- If the secret split (HA-022) has already happened when you rotate, the keys
  live in `/studai/prism/aws-prod/payments` and `/studai/prism/aws-prod/email`
  ([SECRET-SPLIT-DESIGN.md](../../remediation/SECRET-SPLIT-DESIGN.md)), not in
  the monolithic runtime secret. Record which secret id you updated.

## 1. HA-001 — Razorpay live key pair

| Field | Value (fill in; references only, never secret values) |
| --- | --- |
| Performed by (name, role) | `______` |
| Second person present / reviewer | `______` |
| Date and time of regeneration (IST and UTC) | `______` |
| Razorpay dashboard action used (Settings → API Keys → Regenerate live key) | `______` |
| New key id (the `rzp_live_…` id is public by design; record it) | `______` |
| Secret updated: secret id + new **version id** (never the value) | `______` |
| Restart: `kubectl rollout history deployment/prism -n prism` line | `______` |
| **New key verified**: timestamped `GET /api/payment/config` output showing the new key id | evidence ref `______` |
| **New key verified**: one real payment end to end (order id, payment id, status `captured`; refund id if refunded) | evidence ref `______` |
| **Old key returns 401**: `GET https://api.razorpay.com/v1/payments?count=1` with the old pair (values read from the saved old file, never typed) — HTTP status and timestamp, secret redacted | evidence ref `______` |
| Webhook secret regenerated and set after the rotation (P13) | yes / no / not yet — ref `______` |
| Local files holding old/new values deleted (`rzp-new.json`, old-pair file) | yes / no — date `______` |
| Screenshot / log references (redacted; store outside git if they show account data) | `______` |

## 2. HA-002 — SendPulse SMTP password

| Field | Value (fill in; references only, never secret values) |
| --- | --- |
| Performed by (name, role) | `______` |
| Second person present / reviewer | `______` |
| Date and time of the password change (IST and UTC) | `______` |
| SendPulse account / SMTP user the change applied to | `______` |
| Secret updated: secret id + new **version id** (key `SMTP_PASS`; never the value) | `______` |
| Restart: `kubectl rollout history deployment/prism -n prism` line | `______` |
| **New password verified in-pod**: `transporter.verify()` OK (timestamp) | evidence ref `______` |
| **New password verified**: message id of one real delivered report or verification email | evidence ref `______` |
| **Old password rejected**: SMTP AUTH with the old value fails (response code, timestamp; value never shown) | evidence ref `______` |
| Local file holding the new value (`sp-new.txt`) deleted | yes / no — date `______` |
| Screenshot / log references (redacted) | `______` |

## 3. Provider activity review notes (input to HA-018)

Fill one block per provider. Write what was actually seen. If an export was
not available, say so; do not write "no suspicious activity" unless the
review covered the full period.

### Razorpay — period 2026-07-30 (exposure) to the rotation time

| Field | Value |
| --- | --- |
| Reviewed by, date | `______` |
| Exports reviewed (payments, refunds, settlements, API access logs, team/user changes, webhook changes) — file names in the evidence store | `______` |
| Period actually covered (from – to) | `______` |
| Unrecognised payments / refunds / orders / captures | none found / list: `______` |
| Unrecognised API access (IP, user agent, endpoint) | none found / list / logs not available: `______` |
| Account setting changes not made by the team | none found / list: `______` |
| Open questions for Razorpay support | `______` |

### SendPulse — period 2026-07-31 (exposure) to the rotation time

| Field | Value |
| --- | --- |
| Reviewed by, date | `______` |
| Exports reviewed (SMTP sending log, login history, sender/domain settings, campaign log) | `______` |
| Period actually covered (from – to) | `______` |
| Unrecognised sends (recipient domains, volume, subjects) | none found / list: `______` |
| Unrecognised logins or setting changes | none found / list / not available: `______` |
| Bounce / complaint spikes in the period | `______` |
| Open questions for SendPulse support | `______` |

## 4. Sign-off (human)

| Item | Name | Date | Evidence link |
| --- | --- | --- | --- |
| HA-001 evidence complete | `______` | `______` | `______` |
| HA-002 evidence complete | `______` | `______` | `______` |
| HA-018 written conclusion (separate document) | `______` | `______` | `______` |

Until §4 is signed with links, HA-001 and HA-002 stay
`PREPARED (materials ready)` in
[HUMAN_ACTION_REGISTER.md](../../remediation/HUMAN_ACTION_REGISTER.md), the
incident stays `OPEN`, and the go-live checklist does not move past section A
for anything that touches payments or email.
