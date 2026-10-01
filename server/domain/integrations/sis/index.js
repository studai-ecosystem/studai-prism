// Student-information-system adapters (spec §50 P11; C11.04). Every adapter
// turns an institution's roster source into the same table the Phase 7
// import validates (header row first, then one row per student), so a future
// direct SIS connection reuses the preview → commit flow unchanged.
//
// Interface: { id, kind: 'SIS', name, status(): 'AVAILABLE' | 'NOT_CONNECTED',
//              readRows(input): string[][] }
// Only the CSV adapter exists; nothing here pretends a live SIS connection.
import { parseCsv } from '../../campusAdmin/csv.js'

export const csvRosterAdapter = Object.freeze({
  id: 'csv',
  kind: 'SIS',
  name: 'Student roster (CSV file)',
  status: () => 'AVAILABLE',
  readRows: (text) => parseCsv(text),
})

const ADAPTERS = [csvRosterAdapter]

export function listSisAdapters() {
  return ADAPTERS.map((a) => ({ id: a.id, kind: a.kind, name: a.name, status: a.status() }))
}

export function getSisAdapter(id) {
  return ADAPTERS.find((a) => a.id === id) || null
}
