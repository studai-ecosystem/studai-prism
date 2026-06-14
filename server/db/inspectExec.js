// Phase 1 executive telemetry inspector. node db/inspectExec.js <sessionId>
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { query, closePool } from './pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })
const sid = process.argv[2]

async function main() {
  const ae = await query(
    'SELECT exchange_no, theta_mean, theta_var FROM ability_estimates WHERE session_id=$1 ORDER BY exchange_no',
    [sid],
  )
  console.log('ABILITY_ESTIMATES (theta progression):')
  console.table(ae.rows)

  const au = await query(
    `SELECT event_type, payload->>'targetDimension' AS dim, payload->>'facet' AS facet,
            payload->>'challengerDeployed' AS challenger
     FROM audit_log WHERE session_id=$1 AND event_type='probe_selected' ORDER BY id`,
    [sid],
  )
  console.log('PROBE_SELECTED (steering decisions):')
  console.table(au.rows)

  const ml = await query(
    'SELECT exchange_no, (micro_levels IS NOT NULL) AS has_levels, micro_levels FROM item_responses WHERE session_id=$1 ORDER BY exchange_no',
    [sid],
  )
  console.log('ITEM_RESPONSES (micro_levels):')
  console.table(ml.rows.map((r) => ({ exchange_no: r.exchange_no, has_levels: r.has_levels, micro_levels: JSON.stringify(r.micro_levels) })))

  const ev = await query(
    "SELECT event_type, count(*)::int AS n FROM audit_log WHERE session_id=$1 GROUP BY event_type ORDER BY event_type",
    [sid],
  )
  console.log('AUDIT event counts:')
  console.table(ev.rows)
  await closePool()
}
main().catch((e) => { console.error(e); process.exit(1) })
