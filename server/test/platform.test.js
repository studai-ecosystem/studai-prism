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

// ── §20: single-writer invariant pinned until PG is authoritative ────────────

test('EKS manifest stays single-writer (replicas 1 + Recreate) until PG cutover', async () => {
  const manifest = await readFile(join(REPO_ROOT, 'infra', 'aws', 'prism-eks.yml'), 'utf-8')
  assert.match(manifest, /replicas:\s*1\b/,
    'JSON/EFS store is single-writer: replicas must stay 1 until PROGRAM_STATE records PG as authoritative (PG_MIGRATION_RUNBOOK_v1.md §6)')
  assert.match(manifest, /type:\s*Recreate\b/,
    'strategy must stay Recreate until PG cutover')
  assert.ok(!/RollingUpdate/.test(manifest),
    'RollingUpdate is only allowed after PG is the authoritative store')
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

// ── §21: prohibited ECS pipeline stays guarded ───────────────────────────────

test('deploy-aws.yml is guarded against casual dispatch', async () => {
  const workflow = await readFile(join(REPO_ROOT, '.github', 'workflows', 'deploy-aws.yml'), 'utf-8')
  assert.ok(workflow.includes('PROHIBITED'), 'workflow must be labelled prohibited')
  assert.ok(workflow.includes('confirm_prohibited_ecs_deploy'), 'confirmation input required')
  assert.ok(workflow.includes('I-UNDERSTAND-THIS-STARTS-A-SECOND-WRITER'), 'exact-match override phrase required')
  const guardIndex = workflow.indexOf('Refuse prohibited ECS deploy')
  const checkoutIndex = workflow.indexOf('Check out committed source')
  assert.ok(guardIndex !== -1 && guardIndex < checkoutIndex, 'guard step must run before anything else')
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

test('EKS manifest and workflows contain no inline secret material', async () => {
  const files = [
    join(REPO_ROOT, 'infra', 'aws', 'prism-eks.yml'),
    join(REPO_ROOT, '.github', 'workflows', 'build-image.yml'),
    join(REPO_ROOT, '.github', 'workflows', 'deploy-aws.yml'),
  ]
  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    assert.ok(!/AWS_SECRET_ACCESS_KEY\s*[:=]/.test(content), `${file} must not carry static AWS keys`)
    assert.ok(!/JWT_SECRET\s*[:=]\s*['"]?\w/.test(content), `${file} must not carry app secrets`)
    assert.ok(!/RAZORPAY[A-Z_]*\s*[:=]\s*['"]?\w/.test(content), `${file} must not carry payment secrets`)
  }
})
