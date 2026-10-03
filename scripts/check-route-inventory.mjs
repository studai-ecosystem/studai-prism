import { access } from 'node:fs/promises'
import { CLASSES, inventoryRoutes } from './route-usage-inventory.mjs'

const inventory = await inventoryRoutes()
const rows = [...inventory.client, ...inventory.server]

if (inventory.deletionsPerformed !== 0) throw new Error('RETIREMENT_INVENTORY_MUST_NOT_DELETE')
for (const disposition of CLASSES) {
  if (!rows.some((row) => row.class === disposition)) throw new Error(`RETIREMENT_DISPOSITION_MISSING:${disposition}`)
}
for (const row of rows) {
  if (!CLASSES.includes(row.class)) throw new Error(`RETIREMENT_DISPOSITION_INVALID:${row.class}`)
}
if (inventory.drainWindow.status !== 'NOT_STARTED') throw new Error('RETIREMENT_DRAIN_MUST_REMAIN_NOT_STARTED')
await access(new URL('../server/test/legacyReadersRetained.test.js', import.meta.url))
console.log(JSON.stringify({ validator: 'P10_COMPATIBILITY_RETIREMENT', status: 'PASS', rows: rows.length, summary: inventory.summary }))
