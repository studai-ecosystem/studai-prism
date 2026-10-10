// Phase 4 — platform resilience invariants (charter §20/§21/§4.2).
// No database required; these are structural guards.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import * as jsonStore from '../lib/storeJson.js'
import * as pgStore from '../lib/storePg.js'
import * as dbJson from '../lib/dbJson.js'
import * as dbPg from '../lib/dbPg.js'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = join(SERVER_ROOT, '..')

// ── §20: store twin contract parity ─────────────────────────────────────────

test('storeJson and storePg export the same function surface', () => {
  const jsonExports = Object.keys(jsonStore).filter((k) => typeof jsonStore[k] === 'function').sort()
  const pgExports = Object.keys(pgStore).filter((k) => typeof pgStore[k] === 'function').sort()
  assert.deepEqual(pgExports, jsonExports,
    'every JSON store function must have a PG twin (and vice versa) before cutover')
  assert.ok(jsonExports.includes('eraseSession'))
  assert.ok(jsonExports.includes('saveReport'))
  assert.ok(jsonExports.includes('getEntitlement'))
  assert.ok(jsonExports.includes('getDispute'))
})

test('dbJson and dbPg export the same user-store surface', () => {
  const jsonExports = Object.keys(dbJson).filter((k) => typeof dbJson[k] === 'function').sort()
  const pgExports = Object.keys(dbPg).filter((k) => typeof dbPg[k] === 'function').sort()
  assert.deepEqual(pgExports, jsonExports)
})

test('store.js dispatches every twin export', async () => {
  const source = await readFile(join(SERVER_ROOT, 'lib', 'store.js'), 'utf-8')
  for (const name of Object.keys(jsonStore)) {
    if (typeof jsonStore[name] !== 'function') continue
    assert.ok(source.includes(`export const ${name} = impl.${name}`),
      `store.js must dispatch ${name}`)
  }
})

// ── §20: single-writer invariant pinned until the multi-replica checklist ────
// PROD-READY Phase 7 (P71, P81): the manifest moved from infra/aws/prism-eks.yml
// to the kustomize tree infra/aws/eks/. The pin follows it, and no overlay may
// override replicas or the strategy.

const EKS_ROOT = join(REPO_ROOT, 'infra', 'aws', 'eks')

async function eksFiles(dir = EKS_ROOT) {
  const { readdir } = await import('node:fs/promises')
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await eksFiles(path))
    else if (/\.ya?ml$/.test(entry.name)) out.push(path)
  }
  return out
}

const uncommented = (text) => text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')

test('EKS manifest stays single-writer (replicas 1 + Recreate) until the multi-replica checklist holds', async () => {
  const manifest = await readFile(join(EKS_ROOT, 'base', 'deployment.yaml'), 'utf-8')
  assert.match(manifest, /replicas:\s*1\b/,
    'replicas must stay 1 until every multi-replica prerequisite holds (PG_MIGRATION_RUNBOOK_v1.md §6 + addendum 2026-10-10)')
  assert.match(manifest, /type:\s*Recreate\b/,
    'strategy must stay Recreate until PG cutover')
  for (const file of await eksFiles()) {
    const content = uncommented(await readFile(file, 'utf-8'))
    assert.ok(!/RollingUpdate/.test(content), `${file}: RollingUpdate is only allowed after the multi-replica checklist`)
    if (!file.endsWith(join('base', 'deployment.yaml'))) {
      assert.ok(!/^\s*replicas:/m.test(content) && !/\/spec\/replicas/.test(content), `${file}: overlays must not change replicas`)
    }
  }
})

// ── §20: migration tooling wiring ────────────────────────────────────────────

test('store migration CLI is wired through the runtime-secrets wrapper', async () => {
  const wrapper = await readFile(join(SERVER_ROOT, 'config', 'runWithRuntimeSecrets.js'), 'utf-8')
  assert.ok(wrapper.includes(`'db/migrateStore.js'`), 'migrateStore.js must be an allowed wrapper target')
  const pkg = JSON.parse(await readFile(join(SERVER_ROOT, 'package.json'), 'utf-8'))
  assert.equal(pkg.scripts['migrate:store'], 'node config/runWithRuntimeSecrets.js db/migrateStore.js')
})

test('store migration is dry-run by default and never flips PRISM_PG_STORE', async () => {
  const cli = await readFile(join(SERVER_ROOT, 'db', 'migrateStore.js'), 'utf-8')
  assert.ok(cli.includes(`dryRun: !enforce`), 'enforce must be opt-in')
  const migration = await readFile(join(SERVER_ROOT, 'db', 'storeMigration.js'), 'utf-8')
  for (const source of [cli, migration]) {
    assert.ok(!/PRISM_PG_STORE\s*=/.test(source),
      'migration tooling must never assign the cutover flag (ONE LAW: humans flip flags)')
  }
})

// ── §21: one deployment path (PROD-READY Phase 7, P70) ─────────────────────
// The guarded ECS workflow and the broken Azure workflow were removed; no
// workflow may deploy anywhere. The ECS template stays only as the reference
// of the stack that owns the EFS/RDS ingress EKS uses, marked DO NOT DEPLOY.

test('legacy ECS / Azure deploy paths are gone and no workflow deploys', async () => {
  const { readdir } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')
  for (const removed of [
    join(REPO_ROOT, '.github', 'workflows', 'deploy-aws.yml'),
    join(REPO_ROOT, '.github', 'workflows', 'azure-webapp.yml'),
    join(REPO_ROOT, 'scripts', 'deploy-aws.ps1'),
  ]) assert.ok(!existsSync(removed), `${removed} must not come back (P70)`)
  const dir = join(REPO_ROOT, '.github', 'workflows')
  for (const name of await readdir(dir)) {
    const content = await readFile(join(dir, name), 'utf-8')
    assert.ok(!/cloudformation\s+deploy|aws\s+ecs\s|webapps-deploy|kubectl\s+(apply|set|rollout|create|scale)/i.test(content),
      `${name}: workflows build and test only; deployment is an operator step (DEPLOYMENT_RUNBOOK_v1.md)`)
  }
  const ecs = await readFile(join(REPO_ROOT, 'infra', 'aws', 'prism-ecs.yml'), 'utf-8')
  assert.ok(ecs.startsWith('# DEPRECATED AS A DEPLOYMENT PATH — DO NOT DEPLOY'), 'prism-ecs.yml carries its deprecation header')
  assert.match(ecs, /MinValue 1 \/ MaxValue 1/, 'the DesiredCount limitation is documented')
  // The old single-file manifest is a tombstone: applying it changes nothing.
  const tomb = await readFile(join(REPO_ROOT, 'infra', 'aws', 'prism-eks.yml'), 'utf-8')
  assert.ok(tomb.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('#')), 'prism-eks.yml must contain no Kubernetes objects')
})

test('build-image.yml: production from main only, CI must have passed, environment approval, no inline inputs in scripts', async () => {
  const wf = await readFile(join(REPO_ROOT, '.github', 'workflows', 'build-image.yml'), 'utf-8')
  assert.ok(wf.includes(`"$REF" != 'refs/heads/main'`), 'production builds must be refused outside main')
  assert.ok(wf.includes('actions/workflows/ci.yml/runs?head_sha=${COMMIT}&status=success'), 'a successful CI run for the commit is required')
  assert.ok(wf.includes('environment: ${{ inputs.target }}'), 'the AWS job runs in the protected environment (HA-024)')
  assert.ok(/needs:\s*preflight/.test(wf), 'the AWS job waits for the gate')
  assert.ok(wf.includes('STAGING_REPOSITORY: staging/prism') && wf.includes('role-to-assume: ${{ needs.preflight.outputs.role }}'),
    'builds of unreviewed refs go to a separate repository with a separate role')
  assert.equal(wf.split('\n').filter((l) => /id-token:\s*write/.test(l)).length, 1, 'only the build job may request an OIDC token')
  assert.match(wf, /^permissions:\s*\n\s+contents: read\s*\n\s*\n/m, 'workflow-wide permissions are read-only')
  const { readdir } = await import('node:fs/promises')
  const dir = join(REPO_ROOT, '.github', 'workflows')
  for (const name of await readdir(dir)) {
    const content = await readFile(join(dir, name), 'utf-8')
    for (const line of content.split('\n')) {
      if (!line.includes('${{ inputs.') && !line.includes('${{ github.event.inputs.')) continue
      assert.match(line, /^\s*([A-Z_]+:|environment:)\s*\$\{\{ (github\.event\.)?inputs\.[a-z_]+ \}\}\s*$/,
        `${name}: workflow inputs may reach scripts only through env (script injection): ${line.trim()}`)
    }
  }
})

// ── §21: no committed image tag can roll production back (P71) ───────────────

test('EKS manifests carry the image placeholder, never a concrete tag', async () => {
  const files = await eksFiles()
  assert.ok(files.length >= 10)
  let images = 0
  let tags = 0
  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    for (const line of content.split('\n')) {
      if (line.trim().startsWith('#')) continue
      const image = line.match(/^\s*-?\s*image:\s*(\S+)/)
      if (image) { images += 1; assert.equal(image[1], 'prism-app', `${file}: images are set by the overlays' images transformer only`) }
      const tag = line.match(/^\s*newTag:\s*(\S+)/)
      if (tag) { tags += 1; assert.equal(tag[1], 'RELEASE_TAG_REQUIRED', `${file}: a committed concrete tag would roll the environment back on re-apply`) }
      assert.ok(!/prod\/prism:[0-9a-f]{7,}/.test(line), `${file}: concrete image reference ${line.trim()}`)
    }
  }
  assert.equal(images, 9, 'the Deployment and the 8 operator Jobs')
  assert.equal(tags, 4, 'production, staging and their two jobs overlays')
  const { readdir } = await import('node:fs/promises')
  const workflows = join(REPO_ROOT, '.github', 'workflows')
  for (const name of await readdir(workflows)) {
    assert.ok(!/prod\/prism:[0-9a-f]{7,}/.test(await readFile(join(workflows, name), 'utf-8')), `${name}: no pinned image`)
  }
})

test('EKS hardening: non-root, read-only root filesystem, readiness on /api/ready, grace above the shutdown budget', async () => {
  const d = await readFile(join(EKS_ROOT, 'base', 'deployment.yaml'), 'utf-8')
  for (const required of ['runAsNonRoot: true', 'readOnlyRootFilesystem: true', 'allowPrivilegeEscalation: false', 'type: RuntimeDefault', 'mountPath: /tmp', 'name: DATA_DIR']) {
    assert.ok(d.includes(required), `base deployment must set ${required}`)
  }
  assert.match(d, /readinessProbe:\s*\n\s*httpGet:\s*\n\s*path: \/api\/ready/, 'readiness depends on the database (P19)')
  assert.match(d, /livenessProbe:\s*\n\s*httpGet:\s*\n\s*path: \/api\/health/, 'liveness must not depend on the database (P19)')
  const { DEFAULT_SHUTDOWN_TIMEOUT_MS } = await import('../lib/gracefulShutdown.js')
  const grace = Number(d.match(/terminationGracePeriodSeconds:\s*(\d+)/)[1])
  assert.ok(grace * 1000 >= DEFAULT_SHUTDOWN_TIMEOUT_MS + 3000 + 5000, 'the pod must outlive the drain, the job-worker release and the pool close')
  assert.ok(d.includes(`value: "${DEFAULT_SHUTDOWN_TIMEOUT_MS}"`), 'PRISM_SHUTDOWN_TIMEOUT_MS is explicit and equal to the code default')
  for (const env of ['production', 'staging']) {
    const ing = await readFile(join(EKS_ROOT, 'overlays', env, 'ingress.yaml'), 'utf-8')
    assert.ok(ing.includes('alb.ingress.kubernetes.io/healthcheck-path: /api/ready'), `${env} ALB health check uses /api/ready`)
  }
})

test('staging overlay is isolated from production (namespace, secret, IAM, ingress)', async () => {
  const k = await readFile(join(EKS_ROOT, 'overlays', 'staging', 'kustomization.yaml'), 'utf-8')
  const kj = await readFile(join(EKS_ROOT, 'overlays', 'staging', 'jobs', 'kustomization.yaml'), 'utf-8')
  for (const content of [k, kj]) {
    assert.match(content, /^namespace: prism-staging$/m)
    assert.ok(content.includes('/studai/prism/aws-staging/runtime'))
    assert.ok(!content.includes('aws-prod'), 'staging must never reference the production secret')
  }
  assert.ok(!uncommented(kj).includes('cutover'), 'the JSON-store cutover Jobs are production-only')
  const sa = await readFile(join(EKS_ROOT, 'overlays', 'staging', 'serviceaccount.yaml'), 'utf-8')
  assert.ok(sa.includes('role/studai-prism-staging-runtime'))
  const ing = await readFile(join(EKS_ROOT, 'overlays', 'staging', 'ingress.yaml'), 'utf-8')
  assert.ok(ing.includes('host: prism-staging.studai.one') && !ing.includes('host: prism.studai.one'))
  const prod = await readFile(join(EKS_ROOT, 'overlays', 'production', 'kustomization.yaml'), 'utf-8')
  assert.match(prod, /^namespace: prism$/m)
  assert.ok(prod.includes('/studai/prism/aws-prod/runtime'))
})

test('operator Jobs run the distroless node binary on allow-listed wrapper targets and stay out of the Service', async () => {
  const wrapper = await readFile(join(SERVER_ROOT, 'config', 'runWithRuntimeSecrets.js'), 'utf-8')
  const allowed = new Set([...wrapper.matchAll(/'(db\/[A-Za-z]+\.js)'/g)].map((m) => m[1]))
  let jobs = 0
  for (const dir of ['ops', 'cutover']) {
    const content = await readFile(join(EKS_ROOT, 'jobs', dir, 'jobs.yaml'), 'utf-8')
    for (const doc of content.split(/^---$/m).filter((d) => /kind: Job/.test(d))) {
      jobs += 1
      assert.match(doc, /command:\s*\n\s*- \/nodejs\/bin\/node/, 'distroless entrypoint')
      const target = doc.match(/- server\/config\/runWithRuntimeSecrets\.js\s*\n\s*- (db\/[A-Za-z]+\.js)/)
      assert.ok(target && allowed.has(target[1]), `${target?.[1]} must be in the wrapper allow-list`)
      assert.ok(!/^\s+app: prism$/m.test(doc), 'a Job pod must never match the prism Service selector')
      for (const required of ['backoffLimit: 0', 'restartPolicy: Never', 'runAsNonRoot: true', 'readOnlyRootFilesystem: true']) assert.ok(doc.includes(required), required)
    }
  }
  assert.equal(jobs, 8)
  const cut = await readFile(join(EKS_ROOT, 'jobs', 'cutover', 'jobs.yaml'), 'utf-8')
  assert.ok(!/PRISM_PG_STORE/.test(uncommented(cut)), 'the cutover Jobs never set the flag (ONE LAW)')
})

// ── §21: runbooks exist with the required safety content ─────────────────────

test('deployment and migration runbooks carry the charter safety requirements', async () => {
  const deploy = await readFile(join(REPO_ROOT, 'docs', 'DEPLOYMENT_RUNBOOK_v1.md'), 'utf-8')
  for (const required of ['kubectl set image', 'Rollback', 'strictly serial', 'RELEASE_RECORDS.md', 'Secrets Manager', 'ConfigMap']) {
    assert.ok(deploy.includes(required), `DEPLOYMENT_RUNBOOK_v1.md must mention: ${required}`)
  }
  const pg = await readFile(join(REPO_ROOT, 'docs', 'PG_MIGRATION_RUNBOOK_v1.md'), 'utf-8')
  for (const required of ['[HUMAN]', 'Back up', 'Rollback', 'PRISM_PG_STORE', 'RollingUpdate', 'studai-prism-prod']) {
    assert.ok(pg.includes(required), `PG_MIGRATION_RUNBOOK_v1.md must mention: ${required}`)
  }
  const records = await readFile(join(REPO_ROOT, 'docs', 'remediation', 'RELEASE_RECORDS.md'), 'utf-8')
  assert.ok(records.includes('append-only'))
})

// ── §21/§4.2: no secret values in manifests or workflows ─────────────────────

test('EKS manifests, the ECS reference template and every workflow contain no inline secret material', async () => {
  const { readdir } = await import('node:fs/promises')
  const workflows = join(REPO_ROOT, '.github', 'workflows')
  const files = [
    join(REPO_ROOT, 'infra', 'aws', 'prism-eks.yml'),
    join(REPO_ROOT, 'infra', 'aws', 'prism-ecs.yml'),
    ...(await eksFiles()),
    ...(await readdir(workflows)).map((name) => join(workflows, name)),
  ]
  assert.ok(files.some((f) => f.endsWith('build-image.yml')))
  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    assert.ok(!/AWS_SECRET_ACCESS_KEY\s*[:=]/.test(content), `${file} must not carry static AWS keys`)
    assert.ok(!/JWT_SECRET\s*[:=]\s*['"]?\w/.test(content), `${file} must not carry app secrets`)
    assert.ok(!/RAZORPAY[A-Z_]*\s*[:=]\s*['"]?\w/.test(content), `${file} must not carry payment secrets`)
  }
})
