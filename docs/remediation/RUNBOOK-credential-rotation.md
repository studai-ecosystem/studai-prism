# RUNBOOK — Production credential rotation (Razorpay + SendPulse)

**Charter §4.1 deliverable** · Companion to [INCIDENT-2026-08-04-credential-exposure.md](./INCIDENT-2026-08-04-credential-exposure.md)
**Rule zero: no secret value is ever typed into chat, echoed to a terminal transcript, committed, or screenshotted.** Move values via local files that are deleted afterwards.

## A. Razorpay live key pair (HA-001 — dashboard steps are HUMAN)

### A1. Provider console (human)

1. Sign in at dashboard.razorpay.com with the merchant account.
2. Settings → API Keys → **Regenerate live key**. Razorpay immediately invalidates the
   old pair on regeneration. Download the new key id + secret ONLY to a local file, e.g.
   `%TEMP%\rzp-new.json` as `{"RAZORPAY_KEY_ID":"...","RAZORPAY_KEY_SECRET":"..."}`.
3. While in the dashboard: export **payments, refunds and settlement activity since
   2026-07-30** and the API access logs if available. Save for the incident record
   (evidence for HA-018). Note anything unrecognised.

### A2. Update the runtime secret (operator/agent — no values in chat)

```powershell
$env:AWS_PROFILE = 'prod'   # re-set per terminal; verify account 158346964832
# Merge new keys into the existing secret WITHOUT echoing values:
$cur = aws secretsmanager get-secret-value --secret-id /studai/prism/aws-prod/runtime --query SecretString --output text | ConvertFrom-Json
$new = Get-Content $env:TEMP\rzp-new.json | ConvertFrom-Json
$cur.RAZORPAY_KEY_ID = $new.RAZORPAY_KEY_ID
$cur.RAZORPAY_KEY_SECRET = $new.RAZORPAY_KEY_SECRET
$out = Join-Path $env:TEMP 'runtime-secret-next.json'
[IO.File]::WriteAllText($out, ($cur | ConvertTo-Json -Compress))
aws secretsmanager put-secret-value --secret-id /studai/prism/aws-prod/runtime --secret-string file://$out | Out-Null
Remove-Item $out, $env:TEMP\rzp-new.json
```

### A3. Restart + verify

```powershell
kubectl rollout restart deployment/prism -n prism; kubectl rollout status deployment/prism -n prism
curl.exe -s https://prism.studai.one/api/payment/config   # keyId must show the NEW rzp_live_ id
```

- New pair works: run one real payment E2E (₹499 or the smallest viable amount; refund after).
- Old pair dead: `curl.exe -s -u <old_id>:<old_secret> https://api.razorpay.com/v1/payments?count=1`
  (run with values read from the saved old file, NOT typed in chat) must return 401.
  Razorpay regeneration normally guarantees this — verify anyway and capture the 401 as evidence.

## B. SendPulse SMTP password (HA-002 — dashboard steps are HUMAN)

### B1. Provider console (human)

1. Sign in at sendpulse.com → Settings → SMTP. Change/regenerate the SMTP password.
   Save to `%TEMP%\sp-new.txt` only.
2. Review **login history and sending activity since 2026-07-31** (SMTP + campaign logs).
   Export for the incident record. Note unrecognised sends/logins.

### B2. Update secret + restart (same merge pattern as A2)

Update the SMTP password key in `/studai/prism/aws-prod/runtime` (see the secret's
current key names — `SMTP_*`), then `kubectl rollout restart deployment/prism -n prism`.

### B3. Verify

- In-pod: data-URL module pattern → `transporter.verify()` OK, then one real report
  email delivered (the in-pod pattern from repo notes; distroless has `/nodejs/bin/node` only).
- Old password dead: SMTP AUTH with the old value (from local file) must fail.

## C. Evidence to capture (attach to the incident record)

1. Timestamped `/api/payment/config` output showing the new key id.
2. The 401 output for the old Razorpay pair (redact the secret).
3. Payment E2E result (order id, status; no secrets).
4. `transporter.verify` OK + message id of the verification email.
5. Provider activity-review notes (human).
6. `kubectl rollout` history line for the restart.

## D. After both rotations

- Update [HUMAN_ACTION_REGISTER.md](./HUMAN_ACTION_REGISTER.md) HA-001/HA-002 with evidence links.
- Update the incident record §4 table; incident closes only when steps 1–3 have provider-side evidence.
- Schedule the §4.2 [secret split](./SECRET-SPLIT-DESIGN.md) (Phase 4) so the next exposure has category-level blast radius.
