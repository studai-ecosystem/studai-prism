// Quick telemetry inspector for Phase 0 verification.
//   node db/inspect.js <sessionId>
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { query, closePool } from './pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const sid = process.argv[2]

async function main() {
  const items = await query('SELECT count(*)::int n FROM items')
  console.log('items in bank:', items.rows[0].n)

  if (sid) {
    const a = await query(
      'SELECT event_type, count(*)::int n FROM audit_log WHERE session_id=$1 GROUP BY event_type ORDER BY event_type',
      [sid],
    )
    console.log('\nAUDIT_LOG for', sid)
    console.table(a.rows)

    const r = await query(
      `SELECT exchange_no, latency_ms, (item_id IS NOT NULL) AS linked,
              left(candidate_text, 32) AS text
       FROM item_responses WHERE session_id=$1 ORDER BY exchange_no`,
      [sid],
    )
    console.log('ITEM_RESPONSES for', sid)
    console.table(r.rows)
  }
  await closePool()
}
main().catch((e) => { console.error(e); process.exit(1) })
