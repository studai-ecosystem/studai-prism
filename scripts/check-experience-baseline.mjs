import { createRequire } from 'node:module'
import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { checkStudentFlowFlags } from './check-student-flow-flags.mjs'

const require = createRequire(new URL('../server/package.json', import.meta.url))
const { z } = require('zod')
const FLAGS = [
  'PRISM_APP_SHELL_V3', 'PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3',
  'PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_PG_STORE', 'PRISM_CAMPUS_ENABLED',
  'PRISM_CAMPUS_ANALYTICS', 'PRISM_DEVELOPMENT_V2', 'PRISM_GROWTH_ENABLED',
]
const COLUMNS = {
  schema_migrations: ['name'],
  v1_users: ['id'],
  v1_sessions: ['session_id', 'user_id', 'data', 'completed_at'],
  v1_reports: ['session_id', 'user_id'],
  v1_payments: ['session_id', 'user_id'],
  behavioral_evidence_units: ['session_id', 'legacy_row', 'rubric_level', 'evidence_status'],
  student_report_versions: ['session_id', 'version'],
}
const count = z.number().int().nonnegative().safe()
const Ownership = z.object({
  MATCHED: count, CONFLICTING: count, UNCLAIMED: count,
  DELETED: z.null(), EXCLUDED: z.null(),
}).strict()
const Records = z.object({
  sessions: count, reports: count, sessionsWithHistory: count,
  completedWithoutHistory: count, evidenceUnits: count, judgedStrictUnits: count,
  reportVersions: count,
}).strict()
const Database = z.object({
  status: z.enum(['AVAILABLE', 'INCOMPATIBLE']),
  missingColumns: z.array(z.string().refine((value) =>
    Object.entries(COLUMNS).some(([table, columns]) => columns.some((column) => value === `${table}.${column}`)))),
  migrations: z.object({ appliedKnown: count, pending: count, unknown: count }).strict().nullable(),
  records: Records.nullable(),
  ownership: Ownership.nullable(),
}).strict()

function configuration(env) {
  const issues = checkStudentFlowFlags(env)
  for (const flag of FLAGS) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag]) && !issues.some((issue) => issue.startsWith(`${flag} `))) {
      issues.push(`${flag} must be exactly true or false when configured.`)
    }
  }
  return {
    issues,
    flags: Object.fromEntries(FLAGS.map((flag) => [flag, {
      configured: env[flag] !== undefined,
      enabled: ['true', 'false'].includes(env[flag]) ? env[flag] === 'true' : null,
    }])),
  }
}

async function knownMigrations() {
  return (await readdir(new URL('../server/db/migrations/', import.meta.url)))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .map((name) => name.slice(0, -4)).sort()
}

function numberRow(schema, row) {
  if (!row) throw new Error('DIAGNOSTIC_INVALID_RESULT')
  return schema.parse(Object.fromEntries(Object.keys(schema.shape).map((key) => [key,
    row[key] === null ? null : typeof row[key] === 'string' && /^\d+$/.test(row[key]) ? Number(row[key]) : row[key],
  ])))
}

// A dedicated connection is essential: SET TRANSACTION must cover every probe.
export async function inspectDatabase(client) {
  let begun = false
  let workFailed = false
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    begun = true
    await client.query("SET LOCAL statement_timeout = '5s'")
    const { rows } = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [Object.keys(COLUMNS)],
    )
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`))
    const missingColumns = Object.entries(COLUMNS).flatMap(([table, columns]) =>
      columns.filter((column) => !present.has(`${table}.${column}`)).map((column) => `${table}.${column}`))
    if (missingColumns.length) return Database.parse({
      status: 'INCOMPATIBLE', missingColumns, migrations: null, records: null, ownership: null,
    })

    const names = await knownMigrations()
    const applied = await client.query(
      `SELECT COUNT(*) FILTER (WHERE name = ANY($1::text[])) AS known,
              COUNT(*) FILTER (WHERE NOT (name = ANY($1::text[]))) AS unknown
       FROM public.schema_migrations`, [names],
    )
    const migrationCounts = numberRow(z.object({ known: count, unknown: count }).strict(), applied.rows[0])
    const records = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM public.v1_sessions) AS sessions,
        (SELECT COUNT(*) FROM public.v1_reports) AS reports,
        (SELECT COUNT(*) FROM public.v1_sessions WHERE jsonb_typeof(data->'history') = 'array'
          AND jsonb_array_length(CASE WHEN jsonb_typeof(data->'history') = 'array' THEN data->'history' ELSE '[]'::jsonb END) > 0) AS "sessionsWithHistory",
        (SELECT COUNT(*) FROM public.v1_sessions WHERE completed_at IS NOT NULL
          AND NOT COALESCE(data ? 'history', false)) AS "completedWithoutHistory",
        (SELECT COUNT(*) FROM public.behavioral_evidence_units) AS "evidenceUnits",
        (SELECT COUNT(*) FROM public.behavioral_evidence_units WHERE NOT legacy_row
          AND rubric_level IS NOT NULL AND evidence_status IN ('PROVISIONAL', 'SUFFICIENT')) AS "judgedStrictUnits",
        (SELECT COUNT(*) FROM public.student_report_versions) AS "reportVersions"
    `)
    const owners = await client.query(`
      WITH sources AS (
        SELECT session_id, user_id FROM public.v1_sessions
        UNION ALL SELECT session_id, user_id FROM public.v1_reports
        UNION ALL SELECT session_id, user_id FROM public.v1_payments
      ), grouped AS (
        SELECT session_id, COUNT(DISTINCT NULLIF(user_id, '')) AS owners,
          MIN(NULLIF(user_id, '')) AS owner FROM sources GROUP BY session_id
      )
      SELECT
        COUNT(*) FILTER (WHERE owners = 1 AND EXISTS
          (SELECT 1 FROM public.v1_users u WHERE u.id = g.owner)) AS "MATCHED",
        COUNT(*) FILTER (WHERE owners > 1) AS "CONFLICTING",
        COUNT(*) FILTER (WHERE owners = 0 OR (owners = 1 AND NOT EXISTS
          (SELECT 1 FROM public.v1_users u WHERE u.id = g.owner))) AS "UNCLAIMED",
        NULL AS "DELETED", NULL AS "EXCLUDED"
      FROM grouped g
    `)
    return Database.parse({
      status: migrationCounts.known === names.length && migrationCounts.unknown === 0 ? 'AVAILABLE' : 'INCOMPATIBLE',
      missingColumns,
      migrations: { appliedKnown: migrationCounts.known, pending: names.length - migrationCounts.known, unknown: migrationCounts.unknown },
      records: numberRow(Records, records.rows[0]),
      ownership: numberRow(Ownership, owners.rows[0]),
    })
  } catch (error) {
    workFailed = true
    throw error
  } finally {
    if (begun) {
      try {
        await client.query('ROLLBACK')
      } catch (error) {
        if (!workFailed) throw error
      }
    }
  }
}

export function baselineReport(env, database = null) {
  const config = configuration(env)
  return {
    kind: 'P0_DIAGNOSTIC_NOT_RELEASE_APPROVAL',
    configuration: config,
    database: database === null ? { status: 'UNVERIFIED' } : Database.parse(database),
    build: 'OPERATOR_PROVENANCE_REQUIRED',
    worker: 'UNVERIFIED_NO_DURABLE_WORKER_PROBE',
    contentApproval: 'HUMAN_REVIEW_REQUIRED',
    reconciliationLimits: {
      MATCHED: 'Existing account and agreeing stored owner references; not an ownership grant.',
      DELETED: 'Not counted without an authoritative deletion manifest.',
      EXCLUDED: 'Not counted without an authoritative synthetic/research exclusion manifest.',
    },
  }
}

export async function runDiagnostic({ args = [], env = process.env, clientFactory, write = console.log } = {}) {
  let client
  let output
  let failed = false
  try {
    if (args.some((arg) => arg !== '--database') || args.length > 1) throw new Error('DIAGNOSTIC_INVALID_ARGUMENTS')
    if (args.includes('--database')) {
      if (!env.PRISM_DIAGNOSTIC_DATABASE_URL?.trim()) throw new Error('DIAGNOSTIC_DATABASE_NOT_CONFIGURED')
      const factory = clientFactory || ((connectionString) => {
        const { Client } = require('pg')
        return new Client({ connectionString, connectionTimeoutMillis: 5000 })
      })
      client = factory(env.PRISM_DIAGNOSTIC_DATABASE_URL)
      await client.connect()
      output = baselineReport(env, await inspectDatabase(client))
    } else output = baselineReport(env)
  } catch (error) {
    failed = true
    const allowed = ['DIAGNOSTIC_INVALID_ARGUMENTS', 'DIAGNOSTIC_DATABASE_NOT_CONFIGURED']
    output = { ...baselineReport(env), database: {
      status: 'ERROR', code: allowed.includes(error.message) ? error.message : 'DIAGNOSTIC_READ_FAILED',
    } }
  } finally {
    if (client) {
      try { await client.end() } catch {
        failed = true
        output = { ...baselineReport(env), database: { status: 'ERROR', code: 'DIAGNOSTIC_CONNECTION_CLOSE_FAILED' } }
      }
    }
  }
  write(JSON.stringify(output))
  return failed || output.configuration.issues.length || output.database.status !== 'AVAILABLE' ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runDiagnostic({ args: process.argv.slice(2) })
}
