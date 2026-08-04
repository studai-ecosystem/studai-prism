# DESIGN — Runtime secret split by function (charter §4.2)

**Status**: DESIGN APPROVED FOR PHASE 4 IMPLEMENTATION — no production change yet.
The single secret `/studai/prism/aws-prod/runtime` (35 keys) remains live until the
Phase 4 cutover. This document is the implementation contract.

## 1. Why

One secret means one exposure compromises everything (see
[INCIDENT-2026-08-04](./INCIDENT-2026-08-04-credential-exposure.md)) and one rotation
restarts everything. Splitting by function gives least-privilege access, category-scoped
rotation, and a contained blast radius.

## 2. Target layout (AWS Secrets Manager, ap-south-1, account 158346964832)

| Secret name | Contents (key families) | Consumers |
| --- | --- | --- |
| `/studai/prism/aws-prod/database` | `DATABASE_URL`, `PGSSLMODE` | app, migrate job |
| `/studai/prism/aws-prod/ai` | `BEDROCK_*`, model routing overrides, `AZURE_SPEECH_*` (dormant) | app |
| `/studai/prism/aws-prod/payments` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | app |
| `/studai/prism/aws-prod/email` | `SMTP_*`, `MAIL_FROM_*` | app |
| `/studai/prism/aws-prod/signing` | `PRISM_CREDENTIAL_SIGNING_KEY` (Ed25519 PKCS8) | app |
| `/studai/prism/aws-prod/auth` | `JWT_SECRET`, `ADMIN_TOKEN` (until retired), TOTP AES key, CSRF/session keys | app |
| `/studai/prism/aws-prod/identity` | reserved — optional identity-verification provider (Level 3, feature-gated) | app (dark) |
| `/studai/prism/aws-prod/app-config` | remaining NON-secret `PRISM_*`/`CORS_ORIGIN`/`PUBLIC_BASE_URL` flags | app |

Notes:

- Non-secret flags move to `app-config` (still Secrets Manager, not ConfigMaps — keeps
  one loading path and avoids the deleted-configmap drift that was cleaned up 2026-07-24).
- Nothing enters Kubernetes ConfigMaps or source control (charter §4.2).

## 3. Loader change (server/lib runtime-secrets wrapper)

- `AWS_SECRETS_MANAGER_SECRET_ID` (single) → `AWS_SECRETS_MANAGER_SECRET_IDS`
  (comma-separated list, loaded in order, later keys must NOT override earlier —
  duplicate keys are a boot ERROR to prevent shadowing).
- Backward compatible: when only the legacy single id is set, behavior is unchanged
  (needed for the reversible cutover).
- Existing guards stay: bootstrap keys (`NODE_ENV`, `PORT`, `AWS_*`) rejected;
  `runWithRuntimeSecrets` argv rewrite for migrate/seed (bc367cd fix).
- Tests: duplicate-key refusal, multi-secret merge, legacy single-secret parity,
  fail-closed in production without secret ids (existing test extends).

## 4. IRSA least privilege

Current: role `…Role1-zQbgD65gR9wR` / policy `studai-prod-prism-runtime` grants
`secretsmanager:GetSecretValue` broadly plus Bedrock + KMS + Polly.

Target: `GetSecretValue` scoped to the exact ARNs of the eight secrets above; separate
statement for the migrate job (database + app-config only) if it ever gets its own SA.
Bedrock/Polly/KMS statements unchanged.

## 5. Rotation SOP per category

| Category | Trigger | Procedure | Restart scope |
| --- | --- | --- | --- |
| payments / email | Exposure, staff change, provider advisory, annual | [RUNBOOK-credential-rotation.md](./RUNBOOK-credential-rotation.md) pattern against the CATEGORY secret | rollout restart |
| database | Exposure, annual | Create new RDS password → update secret → restart → verify boot log "keys loaded" + a DB-backed endpoint (health does NOT exercise the DB — use admin login 401 path) | rollout restart |
| ai | Provider advisory | Bedrock uses IRSA (no static keys); Azure Speech keys dormant — rotate in place | none/rollout |
| signing | Compromise ONLY (rotation invalidates verification of already-issued credentials — requires keyId versioning and a governance decision first) | Governance + dual approval; publish new public key; keep old keyId verifiable | rollout + comms |
| auth | Exposure, staff change | Rotate; JWT rotation logs out sessions — schedule in a window; TOTP AES rotation requires re-encryption migration | rollout + comms |

## 6. Cutover plan (Phase 4, reversible)

1. Create the eight new secrets (values copied from the current 35-key secret; no values through chat).
2. Ship the multi-secret loader (flag-compatible, legacy path intact) + tests.
3. Dev rehearsal: boot with `AWS_SECRETS_MANAGER_SECRET_IDS` pointing at dev copies.
4. Prod: set the new env list on the deployment; rollout; verify boot log key count
   (must equal current 35 ± intentional moves), health, payment config, admin 401, TTS.
5. Rollback = restore the single `AWS_SECRETS_MANAGER_SECRET_ID` env and restart.
6. After 7 quiet days: scope IRSA to exact ARNs, then empty (do not delete) the legacy
   secret; delete after 30 days.
