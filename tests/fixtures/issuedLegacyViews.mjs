import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { captureIssuedLegacyViews } from '../../server/lib/reportV2.js'

// State-only fixture: explicitly stores synthetic issued views. This is not
// assessment completion, evaluation or publication acceptance.
export async function storeSyntheticInsufficientViews(sessionId) {
  const root = process.env.PRISM_AUDIT_DATA_ROOT
  if (!root || !basename(root).startsWith('prism-p0-disposable-')) {
    throw new Error('Synthetic issued views require the isolated browser runner')
  }
  const matches = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('prism-audit-')) continue
    const path = join(root, entry.name, 'assessments.json')
    const database = JSON.parse(await readFile(path, 'utf8'))
    if (database.sessions?.[sessionId]) matches.push({ path, database })
  }
  if (matches.length !== 1) throw new Error('The synthetic legacy allocation must exist in exactly one audit store')
  const { path, database } = matches[0]
  const session = database.sessions[sessionId]
  if (!session.userEmail?.endsWith('@test.local') || database.reports?.[sessionId]) {
    throw new Error('Synthetic issued views cannot overwrite a report or use a real account')
  }
  const issuedAt = new Date().toISOString()
  const report = {
    sessionId, userId: session.userId, userEmail: session.userEmail, issuedAt,
    scenarioId: session.scenarioId,
    fixture: { kind: 'SYNTHETIC_STATE_ONLY', integratedJourney: false },
  }
  report.issuedViews = await captureIssuedLegacyViews(sessionId, session, report)
  if (report.issuedViews.studentV2.status !== 'INSUFFICIENT_EVIDENCE') {
    throw new Error('The synthetic empty-evidence fixture must not describe a capability')
  }
  database.reports[sessionId] = report
  const temporary = `${path}.${randomUUID()}.fixture.tmp`
  await writeFile(temporary, JSON.stringify(database), 'utf8')
  await rename(temporary, path)
  return structuredClone(report.issuedViews)
}
