// P10.3 — migration rehearsal on a NEW throwaway embedded-postgres cluster.
// migrateUp all → record head → migrateDown the last N (0040..0049, one by
// one) → migrateUp again → assert the result is idempotent and every new
// migration has a .down.sql. Prints one JSON report. Connection strings are
// never arguments and the application DATABASE_URL is never read.
//
//   node scripts/rehearse-migrations.mjs            (N = every 004x migration)
//   node scripts/rehearse-migrations.mjs --steps 3
import { createRequire } from 'node:module'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:net'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../server/package.json', import.meta.url))
const MIGRATIONS = join(root, 'server', 'db', 'migrations')

function parseArgs(argv) {
  let steps = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--steps' && /^\d+$/.test(argv[i + 1] || '')) { steps = Number(argv[i + 1]); i += 1; continue }
    throw new Error('REHEARSAL_INVALID_ARGUMENTS')
  }
  return { steps }
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  return port
}

const sortedUps = async () => (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).map((f) => f.slice(0, -4)).sort()
const applied = async (pool) => (await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name)
const tables = async (pool) => (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")).rows.map((r) => r.table_name)
const columns = async (pool) => (await pool.query("SELECT table_name || '.' || column_name || ':' || data_type AS c FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1")).rows.map((r) => r.c)
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

let cluster
let dir
let stage = 'PARSE_ARGUMENTS'
let exitCode = 0
const report = { kind: 'P10_MIGRATION_REHEARSAL_DISPOSABLE_CLUSTER', liveDatabaseUsed: false, steps: [] }
try {
  if (process.env.DATABASE_URL && process.argv.slice(2).some((a) => /postgres(ql)?:\/\//i.test(a))) throw new Error('REHEARSAL_INVALID_ARGUMENTS')
  const { steps } = parseArgs(process.argv.slice(2))
  const ups = await sortedUps()
  const fresh = ups.filter((n) => /^00[4-9]\d_/.test(n))
  const down = await readdir(MIGRATIONS)
  report.newMigrations = fresh
  report.missingDown = fresh.filter((n) => !down.includes(`${n}.down.sql`))
  if (report.missingDown.length) throw new Error('REHEARSAL_MISSING_DOWN_SQL')
  const rollbackCount = steps == null ? fresh.length : Math.min(steps, fresh.length)

  stage = 'LOAD_EMBEDDED_POSTGRES'
  const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href)
  dir = await mkdtemp(join(tmpdir(), 'prism-p10-rehearsal-'))
  const port = await freePort()
  cluster = new EmbeddedPostgres({
    databaseDir: join(dir, 'cluster'), user: 'p10_rehearsal', password: 'synthetic-test-only',
    port, persistent: true, postgresFlags: ['-h', '127.0.0.1'], initdbFlags: ['--encoding=UTF8'],
    onLog: () => {}, onError: () => {},
  })
  stage = 'INITIALIZE_DISPOSABLE_CLUSTER'
  await cluster.initialise()
  stage = 'START_DISPOSABLE_CLUSTER'
  await cluster.start()
  stage = 'CREATE_DISPOSABLE_DATABASE'
  await cluster.createDatabase('prism_p10_rehearsal')
  // The migration runner reads DATABASE_URL from its own env; this process
  // sets it to the throwaway cluster only, and only after refusing any live one.
  process.env.DATABASE_URL = `postgresql://p10_rehearsal:synthetic-test-only@127.0.0.1:${port}/prism_p10_rehearsal`
  process.env.PGSSLMODE = 'disable'
  const { migrateUp, migrateDown } = await import(pathToFileURL(join(root, 'server', 'db', 'migrate.js')).href)
  const { getPool, closePool } = await import(pathToFileURL(join(root, 'server', 'db', 'pool.js')).href)
  const silent = console.log
  console.log = () => {}
  try {
    stage = 'MIGRATE_UP_ALL'
    const appliedFirst = await migrateUp()
    const pool = getPool()
    const headAfterUp = (await applied(pool)).at(-1)
    const tablesAfterUp = await tables(pool)
    const columnsAfterUp = await columns(pool)
    report.steps.push({ step: 'MIGRATE_UP_ALL', applied: appliedFirst, head: headAfterUp, tables: tablesAfterUp.length })
    if (headAfterUp !== ups.at(-1)) throw new Error('REHEARSAL_HEAD_MISMATCH')

    stage = 'MIGRATE_UP_IDEMPOTENT'
    const appliedAgain = await migrateUp()
    if (appliedAgain !== 0) throw new Error('REHEARSAL_UP_NOT_IDEMPOTENT')
    report.steps.push({ step: 'MIGRATE_UP_IDEMPOTENT', applied: appliedAgain })

    stage = 'MIGRATE_DOWN_ONE_BY_ONE'
    const rolledBack = []
    for (let i = 0; i < rollbackCount; i += 1) {
      const before = await applied(pool)
      await migrateDown()
      const after = await applied(pool)
      const removed = before.filter((n) => !after.includes(n))
      if (removed.length !== 1) throw new Error('REHEARSAL_DOWN_STEP_INVALID')
      rolledBack.push(removed[0])
    }
    const legacyTables = (await tables(pool))
    report.steps.push({ step: 'MIGRATE_DOWN_ONE_BY_ONE', rolledBack, head: (await applied(pool)).at(-1) || null, tablesRemaining: legacyTables.length })
    for (const t of ['v1_sessions', 'v1_reports', 'student_report_versions', 'behavioral_evidence_units']) {
      if (!legacyTables.includes(t)) throw new Error('REHEARSAL_LEGACY_TABLE_LOST')
    }

    stage = 'MIGRATE_UP_AGAIN'
    const reapplied = await migrateUp()
    const headFinal = (await applied(pool)).at(-1)
    const tablesFinal = await tables(pool)
    const columnsFinal = await columns(pool)
    report.steps.push({ step: 'MIGRATE_UP_AGAIN', applied: reapplied, head: headFinal, tables: tablesFinal.length })
    if (reapplied !== rolledBack.length) throw new Error('REHEARSAL_REAPPLY_COUNT_MISMATCH')
    if (headFinal !== headAfterUp) throw new Error('REHEARSAL_HEAD_MISMATCH')
    if (!same(tablesFinal, tablesAfterUp) || !same(columnsFinal, columnsAfterUp)) throw new Error('REHEARSAL_SCHEMA_NOT_IDEMPOTENT')

    stage = 'MIGRATE_UP_FINAL_IDEMPOTENT'
    if ((await migrateUp()) !== 0) throw new Error('REHEARSAL_UP_NOT_IDEMPOTENT')
    report.head = headFinal
    report.rolledBack = rolledBack.length
    report.idempotent = true
    report.verdict = 'REHEARSED_ON_DISPOSABLE_CLUSTER'
    report.notProduction = 'This is a schema rehearsal with no data; backup/restore and production migration-resume evidence remain operator-owned.'
  } finally {
    console.log = silent
    await closePool().catch(() => {})
  }
} catch (error) {
  exitCode = 1
  report.verdict = 'FAILED'
  report.stage = stage
  report.code = /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'SETUP_OR_RUN_ERROR'
  if (error.message?.startsWith('Migration ') || error.message?.startsWith('Rollback ')) report.detail = String(error.message).replace(/postgres(ql)?:\/\/\S+/g, '[redacted]').slice(0, 300)
} finally {
  if (cluster) {
    try { await cluster.stop() } catch { report.cleanup = 'CLUSTER_STOP_FAILED_OPERATOR_CLEANUP_REQUIRED'; exitCode = 1 }
  }
  if (dir && report.cleanup !== 'CLUSTER_STOP_FAILED_OPERATOR_CLEANUP_REQUIRED') {
    try { await rm(dir, { recursive: true, maxRetries: 10, retryDelay: 200 }) } catch { report.cleanup = 'TEMPORARY_DIRECTORY_CLEANUP_FAILED'; exitCode = 1 }
  }
}
console.log(JSON.stringify(report, null, 2))
process.exit(exitCode)
