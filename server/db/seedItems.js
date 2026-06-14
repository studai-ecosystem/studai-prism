// Prism v2 (MASA-2) — Phase 0 item seeder.
//
//   node db/seedItems.js
//
// Backfills the items table from the existing v1 scenario bank: one 'scenario'
// item per scenario, plus one 'probe' item per scoring dimension within that
// scenario (the facet = the dimension, since v1 probes are dimension-targeted by
// the director, not facet-templated yet). All rows enter status='provisional'
// with the legacy tier_label preserved — the exact Duolingo item lifecycle the
// spec calls for. Idempotent: re-running updates nothing it already created
// (ON CONFLICT DO NOTHING), so it is safe on every boot.

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getPool, isDbConfigured, closePool } from './pool.js'
import { SCENARIOS } from '../routes/assessment.js'
import { DIMENSION_KEYS } from '../lib/behavioralFeatures.js'
import { scenarioUuid, scenarioItemId, probeItemId } from '../lib/itemIds.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

// Build the full row set (scenario items + probe items) for the current bank.
export function buildItemRows() {
  const rows = []
  for (const s of SCENARIOS) {
    const sid = scenarioUuid(s.id)
    rows.push({
      item_id: scenarioItemId(s.id),
      scenario_id: sid,
      scenario_key: s.id,
      kind: 'scenario',
      dimension: null,
      facet: null,
      tier_label: s.difficulty || null,
      status: 'provisional',
    })
    for (const dim of DIMENSION_KEYS) {
      rows.push({
        item_id: probeItemId(s.id, dim),
        scenario_id: sid,
        scenario_key: s.id,
        kind: 'probe',
        dimension: dim,
        facet: dim, // v1 probes are dimension-targeted; richer facets arrive in Phase 1+
        tier_label: s.difficulty || null,
        status: 'provisional',
      })
    }
  }
  return rows
}

export async function seedItems() {
  const pool = getPool()
  if (!pool) throw new Error('DATABASE_URL not configured — cannot seed items.')
  const rows = buildItemRows()
  let inserted = 0
  for (const r of rows) {
    const res = await pool.query(
      `INSERT INTO items
         (item_id, scenario_id, scenario_key, kind, dimension, facet, tier_label, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (item_id) DO NOTHING`,
      [r.item_id, r.scenario_id, r.scenario_key, r.kind, r.dimension, r.facet, r.tier_label, r.status],
    )
    inserted += res.rowCount
  }
  return { total: rows.length, inserted }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL not set. Configure it in server/.env to seed items.')
    process.exit(1)
  }
  seedItems()
    .then(({ total, inserted }) => {
      console.log(`Seeded items: ${inserted} new of ${total} total (scenarios=${SCENARIOS.length}).`)
      return closePool()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message)
      closePool().finally(() => process.exit(1))
    })
}
