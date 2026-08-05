# DEPLOYMENT_RUNBOOK v1 — Prism production release procedure

Charter §21 (MASTER-2026-08-04). The ONLY supported release path is
**build-image.yml → `kubectl set image`** described below. Everything here is
strictly serial: one release at a time, never concurrent.

## 0. Topology facts

- AWS account `158346964832`, region `ap-south-1`.
- EKS cluster `StudAI-Prod-EKS-Cluster`, namespace `prism`, deployment
  `prism` (manifest: `infra/aws/prism-eks.yml`).
- Single-writer JSON store on EFS → `replicas: 1`, strategy `Recreate`
  (do not change until PG cutover; see
  [PG_MIGRATION_RUNBOOK_v1.md](./PG_MIGRATION_RUNBOOK_v1.md) §6).
- The EKS API endpoint is PRIVATE. GitHub runners CANNOT reach it — the
  rollout step is executed by an operator through the SSM bastion
  (`i-0bb638223e538e767`) port-forward. Until a runner inside the VPC (or an
  approved gateway) exists, a fully automated pipeline cannot replace this.
- CloudFormation stack `studai-prism-prod` owns EFS + RDS ingress used by
  EKS. NEVER delete or modify it during deployments.
- The legacy ECS pipeline `deploy-aws.yml` is PROHIBITED (second writer on
  the same EFS store). It is guarded with a fail-fast confirmation input and
  retained for audit only.

## 1. Build (CI, signed identity, immutable tag)

1. All changes land on `main` via the normal review flow. No hot patches on
   pods; images are built from committed source only.
2. Run the **Build image** workflow (`build-image.yml`, workflow_dispatch).
   - Auth: OIDC → `studai-prism-github-deploy` role (no static keys).
   - Tag: `${GITHUB_SHA::12}` — immutable; an existing tag is reused, never
     overwritten.
   - Gate: the workflow refuses the release if the ECR scan fails, times
     out, or reports ANY critical vulnerability.
3. Record the image URI from the run output.

**[HUMAN prepared step]** Configure a GitHub *environment* with required
reviewers for this workflow so every build/release needs an explicit approval
(register HA-024). Until then, the manual dispatch itself is the approval.

## 2. Pre-deploy gates (operator, serial)

- [ ] CI suites green on the exact commit being shipped (Node + Python + build).
- [ ] Pending DB migrations reviewed (`server/db/migrations/`); migrations are
      additive-only per repo law.
- [ ] No other release in progress; previous release record closed.
- [ ] Rollback target known: current image tag from
      `kubectl get deployment/prism -n prism -o jsonpath='{.spec.template.spec.containers[0].image}'`.

## 3. Migration gate

Run schema migrations BEFORE the new image serves traffic:

```bash
kubectl exec deploy/prism -n prism -- npm run migrate
```

(Or a one-off job with the runtime secret.) Migrations are idempotent and
additive; a failed migration ABORTS the release — do not set the new image.

## 4. Rollout

```bash
kubectl set image deployment/prism prism=<ECR_URI>:<sha12> -n prism
kubectl rollout status deployment/prism -n prism --timeout=300s
```

Strategy is `Recreate` (single writer): expect a brief gap; deploy in a low
traffic window.

## 5. Health verification (every release)

- [ ] Pod Ready; no crash loops (`kubectl get pods -n prism`).
- [ ] Boot log shows the expected store backend and
      `runtime_secrets_loaded` with the expected key count.
- [ ] `https://prism.studai.one` serves the new bundle (hash/version check).
- [ ] Login + start-assessment smoke test.
- [ ] No new error-level log lines in the first 10 minutes.

## 6. Rollback

Rollback = set the PREVIOUS immutable tag (recorded in §2) and re-verify:

```bash
kubectl set image deployment/prism prism=<ECR_URI>:<previous_sha12> -n prism
kubectl rollout status deployment/prism -n prism
```

Schema migrations are additive-only, so the previous image runs safely
against the migrated schema. Never roll back the database.

## 7. Immutable release record

Append one entry per release (including failed/rolled-back ones) to
`docs/remediation/RELEASE_RECORDS.md` — append-only, entries are never edited:

```text
## <UTC timestamp> — <sha12>
- image: <ECR_URI>:<sha12>
- commit: <full sha> (<one-line subject>)
- migrations applied: <list or none>
- verified by: <operator>
- health checks: pass|fail (+notes)
- rollback: not needed | rolled back to <sha12> (+cause)
```

## 8. Secrets discipline

- Secrets live ONLY in AWS Secrets Manager (runtime secret(s) loaded at boot
  by `server/config/runtimeSecrets.js`). Never in ConfigMaps, manifests,
  source, or workflow logs.
- Secret changes are not deploys: update the secret, then restart the pod
  (`kubectl rollout restart deployment/prism -n prism`) inside the same
  serial-release discipline.
- Rotation: per-category SOPs in
  [remediation/SECRET-SPLIT-DESIGN.md](./remediation/SECRET-SPLIT-DESIGN.md)
  and [remediation/RUNBOOK-credential-rotation.md](./remediation/RUNBOOK-credential-rotation.md).
