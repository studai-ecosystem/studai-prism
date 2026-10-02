// P1.3 ownership reconciliation (CH-07/CH-08). Dry run by default. Applies ONLY
// proven mappings: every stored owner reference on a session (v1_sessions,
// v1_reports, v1_payments) agrees or is null, at least one is set, and that
// account exists. Never moves an already-owned conflicting record; never
// claims from email text, display name or link possession. Idempotent and
// resumable: each applied row is recorded with a reconciliation version,
// source hashes and reason in assessment_ownership_reconciliation.
//
//   PRISM_RECONCILE_DATABASE_URL=... node scripts/reconcile-ownership.mjs          (dry run)
//   PRISM_RECONCILE_DATABASE_URL=... node scripts/reconcile-ownership.mjs --apply  (disposable/approved only)
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../server/package.json', import.meta.url))
export const RECONCILIATION_VERSION = 'ownership-reconciliation.v1'

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

export function classify(row, userExists) {
  const refs = [row.session_owner, row.report_owner, row.payment_owner].filter((v) => v != null && v !== '')
  const distinct = [...new Set(refs)]
  if (distinct.length === 0) return { category: 'UNCLAIMED', reason: 'NO_OWNER_REFERENCE' }
  if (distinct.length > 1) return { category: 'CONFLICTING', reason: 'OWNER_REFERENCES_DISAGREE' }
  if (!userExists(distinct[0])) return { category: 'UNCLAIMED', reason: 'OWNER_ACCOUNT_MISSING' }
  const missing = ['session_owner', 'report_owner', 'payment_owner'].filter((k) => row[`has_${k.split('_')[0]}`] && (row[k] == null || row[k] === ''))
  return { category: 'MATCHED', owner: distinct[0], fill: missing, reason: missing.length ? 'PROVEN_FILL' : 'ALREADY_CONSISTENT' }
}

export async function reconcile(client, { apply = false } = {}) {
  await client.query(`CREATE TABLE IF NOT EXISTS assessment_ownership_reconciliation (
    session_id TEXT NOT NULL, version TEXT NOT NULL, source_hash TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    filled TEXT[] NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, version))`)
  const { rows } = await client.query(`
    SELECT s.session_id, s.user_id AS session_owner, r.user_id AS report_owner, p.user_id AS payment_owner,
           (s.session_id IS NOT NULL) AS has_session, (r.session_id IS NOT NULL) AS has_report, (p.session_id IS NOT NULL) AS has_payment
    FROM v1_sessions s FULL OUTER JOIN v1_reports r ON r.session_id = s.session_id
    FULL OUTER JOIN v1_payments p ON p.session_id = COALESCE(s.session_id, r.session_id)`)
  const users = new Set((await client.query('SELECT id FROM v1_users')).rows.map((u) => u.id))
  const done = new Set((await client.query('SELECT session_id FROM assessment_ownership_reconciliation WHERE version = $1', [RECONCILIATION_VERSION])).rows.map((d) => d.session_id))
  const summary = { version: RECONCILIATION_VERSION, apply, MATCHED: 0, CONFLICTING: 0, UNCLAIMED: 0, DELETED: null, EXCLUDED: null, fillable: 0, applied: 0, alreadyApplied: 0 }
  for (const row of rows) {
    const sid = row.session_id || null
    const c = classify(row, (id) => users.has(id))
    summary[c.category] += 1
    if (c.category !== 'MATCHED' || !c.fill.length) continue
    summary.fillable += 1
    if (!apply) continue
    if (done.has(sid)) { summary.alreadyApplied += 1; continue }
    await client.query('BEGIN')
    try {
      if (c.fill.includes('report_owner')) await client.query('UPDATE v1_reports SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL', [sid, c.owner])
      if (c.fill.includes('session_owner')) await client.query('UPDATE v1_sessions SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL', [sid, c.owner])
      if (c.fill.includes('payment_owner')) await client.query('UPDATE v1_payments SET user_id = $2 WHERE session_id = $1 AND user_id IS NULL', [sid, c.owner])
      await client.query(
        'INSERT INTO assessment_ownership_reconciliation (session_id, version, source_hash, owner_user_id, filled, actor, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [sid, RECONCILIATION_VERSION, hash(row), c.owner, c.fill, process.env.PRISM_RECONCILE_ACTOR || 'operator', c.reason],
      )
      await client.query('COMMIT')
      summary.applied += 1
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply')
  if (process.argv.some((a) => a.startsWith('postgres'))) throw new Error('Connection strings are never arguments.')
  const url = process.env.PRISM_RECONCILE_DATABASE_URL
  if (!url) { console.error(JSON.stringify({ error: 'RECONCILE_DATABASE_NOT_CONFIGURED' })); process.exit(1) }
  const { Client } = require('pg')
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    console.log(JSON.stringify(await reconcile(client, { apply })))
  } finally {
    await client.end()
  }
}
