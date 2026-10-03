// P10.3 read-only candidate reconciliation. Connection strings are accepted
// only through the environment. Output is aggregate state and table presence;
// it never emits learner rows, report content, tokens or identifiers.
import { createRequire } from 'node:module'

const require = createRequire(new URL('../server/package.json', import.meta.url))
const TABLES = Object.freeze([
  'schema_migrations',
  'assessment_forms',
  'assessment_candidate_actions',
  'assessment_jobs',
  'assessment_erasure_markers',
  'assessment_run_timing',
  'assessment_opportunities',
  'student_report_versions',
  'report_review_requests',
  'report_review_decisions',
  'practice_allowances',
  'product_grants',
  'share_grants',
  'share_grant_resources',
  'admin_approvals',
  'admin_incidents',
])

if (process.argv.length > 2) throw new Error('reconcile-release-candidate takes no arguments; connection strings are never arguments.')
const url = process.env.PRISM_RECONCILE_DATABASE_URL
if (!url) {
  console.error(JSON.stringify({ error: 'RECONCILE_DATABASE_NOT_CONFIGURED', readOnly: true }))
  process.exit(1)
}

const { Client } = require('pg')
const client = new Client({ connectionString: url })
await client.connect()
try {
  await client.query('BEGIN READ ONLY')
  const tables = {}
  for (const table of TABLES) {
    const exists = Boolean((await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`])).rows[0].table_name)
    tables[table] = { exists, rows: exists ? Number((await client.query(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count) : null }
  }
  const migrationHead = tables.schema_migrations.exists
    ? (await client.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]?.name || null
    : null
  await client.query('ROLLBACK')
  console.log(JSON.stringify({
    kind: 'P10_RELEASE_CANDIDATE_RECONCILIATION',
    mode: 'READ_ONLY',
    migrationHead,
    expectedMigrationHead: '0053_intent_display_and_research',
    tables,
    rawRowsIncluded: false,
  }))
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
