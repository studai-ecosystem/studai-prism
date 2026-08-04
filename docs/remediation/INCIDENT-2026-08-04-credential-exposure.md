# SECURITY INCIDENT — Payment and email credential exposure

**Incident ID**: INC-2026-08-04-01 · **Severity**: P0 · **Status**: OPEN — blocked on provider-console rotation (HA-001, HA-002)
**Opened**: 2026-08-04 (charter §4.1) · **Owner**: Operator (provider consoles) + remediation agent (platform side)

## 1. What happened

Two live production credentials were pasted into AI chat sessions on the development
workstation and remain **unrotated** as of 2026-08-04:

| Credential | Exposed | Where | Current state |
| --- | --- | --- | --- |
| Razorpay **live key pair** (key id + key secret) | 2026-07-30 (production-hardening session E2/E5) | Chat transcript on dev workstation | UNROTATED — the exposed key id (`rzp_live_TItHtKm7Qs0CPQ`, public by design; the *secret* is what matters) is confirmed serving live ₹499 payments via `/api/payment/config` on 2026-08-04 |
| SendPulse SMTP password (user `studaiedutech@gmail.com`, sender `career@studai.one`) | 2026-07-31 (email handover session) | Chat transcript on dev workstation | UNROTATED — SMTP path live in runtime secret |

Chat transcripts are stored by the AI tooling vendor and locally in session logs; the
exposure surface is not fully enumerable. Treat both secrets as compromised.

## 2. Impact assessment (worst case until provider logs say otherwise)

- Razorpay secret: ability to query/manipulate the merchant account via API within the
  key's scope — refunds, order creation, payment capture. No fraudulent activity has been
  *confirmed*; **no provider-side review has been performed yet** (HA-018).
- SendPulse password: ability to send mail as `career@studai.one` (phishing risk) and
  read/change sender settings. No provider-side review performed yet.

## 3. Timeline

| When | Event |
| --- | --- |
| 2026-07-30 | Razorpay live keys placed in runtime secret during E2/E5 payments go-live; key pair pasted into chat. Rotation flagged same day in repo notes ("⚠ ROTATE"). |
| 2026-07-31 | SendPulse SMTP password pasted into chat during email handover; rotation suggested in notes. |
| 2026-08-04 | Charter §4.1 declares P0 incident. Phase 0 confirmed exposed key pair still serving production payments. This record opened; runbook prepared; register entries HA-001/HA-002 re-confirmed. |

## 4. Remediation sequence (charter §4.1 — status per step)

| # | Step | Actor | Status |
| --- | --- | --- | --- |
| 1 | Revoke + regenerate Razorpay key pair (dashboard) | HUMAN (HA-001) | OPEN |
| 2 | Review Razorpay activity since 2026-07-30 (payments, refunds, API logs) | HUMAN (HA-001/HA-018) | OPEN |
| 3 | Change SendPulse password + review auth/sending activity since 2026-07-31 | HUMAN (HA-002/HA-018) | OPEN |
| 4 | Update AWS Secrets Manager `/studai/prism/aws-prod/runtime` (keys `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, SMTP password key) | Agent/operator — [runbook](./RUNBOOK-credential-rotation.md) | PREPARED |
| 5 | Restart workload (`kubectl rollout restart deployment/prism -n prism`) | Agent/operator | PREPARED |
| 6 | Verify new credentials work (live `/api/payment/config` shows new key id; in-pod `transporter.verify`; one real payment E2E; one real report email) | Agent/operator | PREPARED |
| 7 | Verify old credentials dead (Razorpay API auth check returns 401 for old pair; old SMTP login fails) | Agent/operator | PREPARED |
| 8 | Record provider-side findings + close incident | HUMAN | BLOCKED on 1–3 |

**This incident must NOT be closed until steps 1–3 have provider-side evidence.**
No provider-side conclusions are asserted here — none exist yet.

## 5. Process failure and preventive control

- **Failure**: secret values were pasted into chat for convenience during live
  operations work. Chat is an uncontrolled, third-party-retained channel.
- **Existing partial control**: bootstrap passwords already go to local files
  (`%TEMP%\prism-admin-bootstrap.txt`), never chat.
- **Controls adopted (effective immediately, encoded in the remediation skill and
  copilot-instructions)**:
  1. Secret values never appear in chat, terminal echo, Git, test output, docs or
     screenshots — old or new. Transfers use local files or the AWS CLI reading from
     files/stdin.
  2. Every rotation follows the written [rotation runbook](./RUNBOOK-credential-rotation.md).
  3. The [secret-split design](./SECRET-SPLIT-DESIGN.md) (charter §4.2) limits the blast
     radius of any single future exposure to one functional category.
