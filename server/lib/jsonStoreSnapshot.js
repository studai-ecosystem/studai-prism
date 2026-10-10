// Read-only pinning of the JSON store files (PROD-READY Phase 3, found by the
// realistic-size migration rehearsal). The JSON store re-reads and re-parses
// its whole file on every call; the cutover reconciliation reads every record
// through those public read paths, so at production size it was quadratic
// (tens of thousands of full-file parses). While a file is pinned, reads are
// served from ONE parse of it and every write to it is refused, so the
// reconciliation still goes through the unchanged read paths, sees exactly
// the quiescent file, and cannot change it. Only the migration CLI pins
// (runbook: the writer is stopped first); the live app never does.
import { promises as fs } from 'fs'
import { resolve } from 'path'

const pinned = new Map()

const keyOf = (file) => resolve(file).toLowerCase()

export async function pinJsonFiles(files) {
  for (const file of files) {
    let parsed = null
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf-8'))
    } catch {
      parsed = null // a missing/unreadable file reads as empty, as before
    }
    pinned.set(keyOf(file), { parsed })
  }
}

export function unpinJsonFiles() {
  pinned.clear()
}

// { parsed } when `file` is pinned (parsed may be null), else undefined.
export function pinnedJson(file) {
  return pinned.get(keyOf(file))
}

export function assertNotPinned(file) {
  if (pinned.has(keyOf(file))) throw new Error('JSON store file is pinned read-only (migration reconciliation in progress).')
}
