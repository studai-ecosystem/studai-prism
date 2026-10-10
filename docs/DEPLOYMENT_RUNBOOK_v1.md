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

---

## Addendum 2026-10-10 — PROD-READY Phase 7 (one deployment path, overlays, operator Jobs, HA-024)

Appended by PROD-READY Phase 7 (branch `prod/p07-deployment`); §0–§8 above are
unchanged as the record of the August procedure. Decisions P70–P81 in
[PROD_READY_STATE.md](production/PROD_READY_STATE.md). **Nothing in this
addendum has been executed**: no deploy, no cluster or AWS command, no workflow
run, no flag flipped (charter law 1). Release inputs (migrations, secrets,
flags, record template): [RELEASE_TEMPLATE_PROD_READY.md](production/RELEASE_TEMPLATE_PROD_READY.md).
Ordered human steps: [GO_LIVE_CHECKLIST.md](production/GO_LIVE_CHECKLIST.md).

### A. Corrections to §0 (topology)

| §0 said | Now |
| --- | --- |
| Single-writer JSON store on EFS | The next image refuses to start in production without `PRISM_PG_STORE=true` (since `63d320d`, DEF-07). The release therefore includes the PostgreSQL cutover (HA-023). EFS stays mounted for the CMS file and the read-only pre-cutover JSON store (rollback target) |
| Manifest `infra/aws/prism-eks.yml` | Kustomize tree `infra/aws/eks/`: `base/` (Deployment, Service), `overlays/production` (namespace `prism`, EFS volume, ingress), `overlays/staging` (namespace `prism-staging`), operator Jobs in `jobs/` with `overlays/*/jobs`. `prism-eks.yml` is a comment-only tombstone (it pinned `69363a6e6b9a`, older than production's `2b84e13c07f2`, so a re-apply would have rolled production back) |
| `deploy-aws.yml` PROHIBITED, guarded, kept | Removed with `scripts/deploy-aws.ps1` and `azure-webapp.yml` (P70). `infra/aws/prism-ecs.yml` stays, marked DO NOT DEPLOY, as the reference of stack `studai-prism-prod`, which owns the EFS file system/access point and RDS ingress EKS uses. Its `DesiredCount` parameter is MinValue 1 / MaxValue 1, so it cannot express the desired count 0 of the ECS service; never re-deploy it |
| `replicas: 1`, `Recreate` | Unchanged and still pinned by `server/test/platform.test.js`, now until the whole multi-replica checklist holds (PG runbook addendum 2026-10-10), not only the cutover |

Manifest changes this release carries (all in `base/deployment.yaml` and the
production ingress): readiness probe `/api/ready` (liveness stays
`/api/health`), ALB health check `/api/ready`, pod `runAsNonRoot` (65532) +
`seccompProfile: RuntimeDefault`, container `readOnlyRootFilesystem`,
`allowPrivilegeEscalation: false`, all capabilities dropped, `emptyDir` on
`/tmp`, explicit `DATA_DIR=/home/data/prism` and `PRISM_SHUTDOWN_TIMEOUT_MS=25000`,
`terminationGracePeriodSeconds: 40` (25 s drain + 3 s job-worker lease release
+ pool close), an optional read-only mount of ConfigMap `prism-rds-ca` at
`/etc/prism/rds-ca` (RDS CA bundle, P20). Resources are unchanged
(500m/512Mi requests, 1 CPU/1Gi limits). The only runtime writes are under
`DATA_DIR` (`lib/content.js`, `lib/storeJson.js`, `lib/dbJson.js`); uploads are
parsed in memory. Not verified on a live pod yet — staging stage A is the first
run with a read-only root filesystem (GO_LIVE_CHECKLIST B-steps).

### B. §1 Build — corrected

`build-image.yml` now takes an input `target`:

- `production`: refused unless the run is on `refs/heads/main`; ECR repository
  `prod/prism`; role `studai-prism-github-deploy`.
- `staging`: any ref; ECR repository `staging/prism`; role
  `studai-prism-github-build-staging`. Both are to be created by the operator;
  until then a staging build fails closed at AssumeRole. The normal promotion
  path needs neither: build once from `main` (target production) and deploy the
  same `prod/prism:<sha12>` image to staging first, then production.
- Both: a `preflight` job (no AWS credentials, `actions: read`) requires a
  SUCCESSFUL `ci.yml` run for the exact commit (`gh api
  repos/<repo>/actions/workflows/ci.yml/runs?head_sha=<sha>&status=success`);
  the AWS job runs in the GitHub environment named after the target
  (`environment: ${{ inputs.target }}`), so it waits for that environment's
  required reviewers; inputs reach scripts only through `env:`; `id-token: write`
  is granted to the build job only; tags are the 12-character commit SHA and an
  existing tag is reused, never overwritten. Optional repository variables
  `PRISM_RUNTIME_IMAGE` / `PRISM_BUILD_IMAGE` pass digest-pinned base images
  (Dockerfile header, P74).

A `workflow_dispatch` runs the workflow file **of the dispatched ref**, so a
branch can edit its own copy of these checks. The binding controls are
therefore GitHub's environment deployment-branch policy and the IAM trust
policy (§C) — the in-workflow checks are defence in depth and documentation.

### C. HA-024 — GitHub environment protection and the OIDC trust policy (operator steps)

Repository: `studai-ecosystem/studai-prism`. Needs repository admin and IAM
authority. Record evidence in the HA register (status stays with the human).

1. **Diagnose the failed run first (read-only).** Build Image run
   `37365615065` (2026-10-05) failed with `sts:AssumeRoleWithWebIdentity`
   AccessDenied for `studai-prism-github-deploy`. The runs from `main` on
   2026-10-01/02 (`36879290369`, `36978677257`) succeeded and the failed one ran
   on a branch, so the most likely cause is a trust policy whose `sub`
   condition only admits `repo:studai-ecosystem/studai-prism:ref:refs/heads/main`
   — the branch run presented `…:ref:refs/heads/<branch>` and was correctly
   refused. Confirm instead of assuming:
   - `aws iam get-role --role-name studai-prism-github-deploy --query Role.AssumeRolePolicyDocument`
   - CloudTrail (us-east-1 and ap-south-1), event `AssumeRoleWithWebIdentity`
     around 2026-10-05, `errorCode: AccessDenied`: compare the
     `subjectFromWebIdentityToken` / `sub` in the request with the policy.
   - Other possible causes to rule out: the OIDC provider
     `token.actions.githubusercontent.com` missing or its audience not
     `sts.amazonaws.com`; the repository renamed/transferred (the `sub` carries
     the owner/name).
2. **Create environment `production`** (Settings → Environments):
   - Required reviewers: at least one named person other than the dispatcher;
     tick "Prevent self-review".
   - Deployment branches and tags: "Selected branches and tags" → `main` only.
   - No environment secrets are needed (OIDC; no static keys).
3. **Create environment `staging`** (only if branch builds are wanted):
   deployment branches as needed; reviewers optional; it can only use the
   staging role/repository.
4. **Update the trust policy BEFORE this workflow reaches `main`.** With
   `environment:` set, GitHub's OIDC `sub` becomes
   `repo:studai-ecosystem/studai-prism:environment:production`, which does NOT
   match a `ref:refs/heads/main` condition — production builds would fail the
   same way as run 37365615065. Trust policy for `studai-prism-github-deploy`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "Federated": "arn:aws:iam::158346964832:oidc-provider/token.actions.githubusercontent.com" },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": {
           "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
           "token.actions.githubusercontent.com:sub": "repo:studai-ecosystem/studai-prism:environment:production"
         }
       }
     }]
   }
   ```

   Use `StringEquals`, not `StringLike` with wildcards. During the switch you
   may temporarily list both the old `ref:refs/heads/main` value and the new
   environment value in the `sub` array, then remove the old one after the
   first approved build. The staging role (`studai-prism-github-build-staging`)
   trusts only `…:environment:staging` and may push only to `staging/prism`
   (ECR resource ARN in its permissions policy).
5. **Branch protection on `main`** (Risks row "`main` has no branch
   protection"): require pull requests with at least one approval and the CI
   status checks (`test`, `dependency-audit`, `secret-scan`, `eks-manifests`,
   `Analyze (javascript-typescript)` from CodeQL), block force pushes and deletion.
6. **Verify:** dispatch Build Image on a non-main branch with target
   `production` → the preflight fails ("main only") and, if the branch removed
   that check, the environment's branch policy refuses the job; dispatch on
   `main` → the job waits for a reviewer; after approval it assumes the role
   and the scan gate runs. Record the run ids.

### D. §3 Migration gate — corrected

`kubectl exec deploy/prism -n prism -- npm run migrate` **cannot work**: the
runtime image is distroless (no shell, no `npm`). The image's node binary is
`/nodejs/bin/node` (the distroless entrypoint), WORKDIR is `/app`, and the
runtime-secrets wrapper's allow-list takes paths relative to `server/`
(`db/migrate.js`, not `server/db/migrate.js`).

Preferred — a one-off Job with the release image (`infra/aws/eks/jobs/ops/jobs.yaml`):

```bash
# 0. Render once per release (local; never `kubectl apply -k` a jobs overlay —
#    that would start every Job):
kubectl kustomize infra/aws/eks/overlays/production/jobs \
  | sed 's/:RELEASE_TAG_REQUIRED$/:<sha12>/' > prism-jobs.yaml
grep -c RELEASE_TAG_REQUIRED prism-jobs.yaml                   # must print 0
# 1. Check the selection lists exactly one Job:
kubectl create -f prism-jobs.yaml -l prism.studai.one/job=migrate-status --dry-run=server -o name
# 2. Run, wait, keep the log as release evidence:
kubectl create -f prism-jobs.yaml -l prism.studai.one/job=migrate-status
kubectl wait -n prism --for=condition=complete job/prism-migrate-status --timeout=600s
kubectl logs -n prism job/prism-migrate-status > migrate-status-before.txt
kubectl create -f prism-jobs.yaml -l prism.studai.one/job=migrate-up
kubectl wait -n prism --for=condition=complete job/prism-migrate-up --timeout=1800s
kubectl logs -n prism job/prism-migrate-up > migrate-up.txt
# 3. Re-run status (delete the finished status Job first; fixed names prevent concurrent runs):
kubectl delete -n prism job/prism-migrate-status
kubectl create -f prism-jobs.yaml -l prism.studai.one/job=migrate-status
```

A failed Job (`backoffLimit: 0`) ABORTS the release — do not apply the new
manifest. Jobs: `migrate-status`, `migrate-up`, `sessions-pin-forms-dry-run`,
`sessions-pin-forms-enforce`, `import-rows-retention-dry-run`,
`erasure-ledger-open` (all environments) and, production only,
`store-migration-dry-run`, `store-migration-enforce` (HA-023; mount the EFS
claim). They use the `studai-prism` service account, the same runtime secret,
the read-only root filesystem and labels that keep them out of the `prism`
Service.

Alternative while a pod of the **new** image is running (not during the
cutover, when the app is scaled to 0):

```bash
kubectl exec -n prism deploy/prism -- /nodejs/bin/node server/config/runWithRuntimeSecrets.js db/migrate.js status
```

### E. §4 Rollout — corrected

Two cases:

- **The manifest changed** (this release: probes, security context, volumes,
  env, ALB health check): render the overlay with the release tag, review the
  diff, apply. With `replicas: 1` and `Recreate` the apply is the rollout.

  ```bash
  kubectl kustomize infra/aws/eks/overlays/production \
    | sed 's/:RELEASE_TAG_REQUIRED$/:<sha12>/' > prism-production.yaml
  grep -c RELEASE_TAG_REQUIRED prism-production.yaml   # must print 0
  kubectl diff -f prism-production.yaml                # review every line
  kubectl apply -f prism-production.yaml
  kubectl rollout status deployment/prism -n prism --timeout=300s
  ```

- **Only the image changed** (later releases): `kubectl set image` as in §4
  above is still valid, provided the live template already matches the
  overlay (`kubectl diff` of a render with the CURRENT tag shows nothing).

Never `kubectl apply -k` an overlay (the tag is a placeholder) and never apply
`infra/aws/prism-eks.yml` (a tombstone). Optional cluster guard, installed once
by a cluster admin (Kubernetes ≥ 1.30): `infra/aws/eks/policies/reject-unrendered-image.yaml`
(a ValidatingAdmissionPolicy that refuses the placeholder, `:latest`, and
`staging/prism` images in namespace `prism`, before the running pod is touched).

### F. §5 Health verification — extended

Run the post-deploy smoke battery (read-only; RELEASE_TEMPLATE_PROD_READY.md §5):

```bash
node scripts/post-deploy-smoke.mjs --base-url https://prism.studai.one --dry-run
PRISM_SMOKE_ADMIN_TOKEN=<console access token> node scripts/post-deploy-smoke.mjs \
  --base-url https://prism.studai.one --expect-bundle <index-*.js>
```

plus the boot-log lines and the human checks listed there.

### G. §6 Rollback — corrected for this release

`kubectl set image … <previous_sha12>` alone is NOT a safe rollback across this
release: image `2b84e13c07f2` has no `/api/ready`, so with the new readiness
probe its pod would never become Ready. Roll back the whole pod template:

```bash
kubectl scale deployment/prism -n prism --replicas=0
# restore the pre-release runtime secret version (PRISM_PG_STORE back to false/absent):
aws secretsmanager update-secret-version-stage --secret-id /studai/prism/aws-prod/runtime \
  --version-stage AWSCURRENT --move-to-version-id <pre-release version id> --remove-from-version-id <release version id>
kubectl rollout undo deployment/prism -n prism            # previous template: old image + old probes
kubectl annotate ingress prism -n prism --overwrite alb.ingress.kubernetes.io/healthcheck-path=/api/health
kubectl scale deployment/prism -n prism --replicas=1
kubectl rollout status deployment/prism -n prism
```

Then PG_MIGRATION_RUNBOOK §5 (confirm `backend: json`; the JSON store was
quiescent and untouched). Migrations stay applied; that the old image runs on
the 0060 schema with the JSON store must be rehearsed in staging first
(GO_LIVE_CHECKLIST). After the next release that ships no manifest change, the
§6 `kubectl set image` rollback applies again.

### H. Staging (ROLLOUT_PLAN stage A) — bring-up, operator steps

1. Create the staging runtime secret `/studai/prism/aws-staging/runtime`
   (every key of RELEASE_TEMPLATE §3 with staging values: its own
   `DATABASE_URL` — a separate database and role, never the production
   database; its own `JWT_SECRET`, `PRISM_ERASURE_PSEUDONYM_KEY`; Razorpay TEST
   keys only; `PRISM_PG_STORE=true`; SMTP to a test mailbox or none).
2. Create the IRSA role `studai-prism-staging-runtime` (trust: the cluster OIDC
   provider, `sub = system:serviceaccount:prism-staging:studai-prism`; policy:
   `GetSecretValue` on the staging secret only, plus the Bedrock/Polly actions).
3. DNS: `prism-staging.studai.one` → the staging ALB (created by the ingress;
   group `studai-staging`). Decide whether to restrict it with
   `alb.ingress.kubernetes.io/inbound-cidrs`.
4. Render and apply `infra/aws/eks/overlays/staging` with the `prod/prism:<sha12>`
   release candidate; run `migrate-up` from `overlays/staging/jobs`.
5. Run the smoke battery against `https://prism-staging.studai.one`, then
   ROLLOUT_PLAN stage A (flags flipped in staging only, by a human, HA-C001).
6. Rehearse the production rollback (§G) in staging.

### I. Secrets and pod restarts

§8 still holds. A secret change takes effect only after a restart
(`kubectl rollout restart deployment/prism -n prism`); with `Recreate` that is
a brief outage — schedule it.
