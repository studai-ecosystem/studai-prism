import { access, readFile } from 'node:fs/promises'
import { CHANGE_LEDGER } from './change-ledger.mjs'
import { PROGRAMME_VALIDATION } from './programme-validation-ledger.mjs'

const root = new URL('../', import.meta.url)
const handover = JSON.parse(await readFile(new URL('docs/experience/P10_HANDOVER.json', root), 'utf8'))
const allowed = new Set(['PASS', 'BLOCKED', 'UNVERIFIED'])
const expectedChecklist = Array.from({ length: 10 }, (_, index) => `P10.${index + 1}`)
const failures = []

if (handover.schemaVersion !== 'p10.handover.v1') failures.push('schema version')
if (handover.allowedState !== 'CODE_IMPLEMENTED_WITH_VERIFICATION_BLOCKERS') failures.push('allowed state')
if (handover.verdict !== 'NO_GO') failures.push('verdict must remain NO_GO')
for (const key of ['productionActivated', 'deployed', 'manualApprovalClaimed', 'layerCClaimed']) {
  if (handover[key] !== false) failures.push(`${key} must be false`)
}
if (handover.migrationCount !== 54 || handover.migrationHead !== '0054_report_publication_note') failures.push('migration head/count')
if (handover.checklist.map((row) => row.id).join(',') !== expectedChecklist.join(',')) failures.push('checklist ids')
for (const row of handover.checklist) {
  if (!allowed.has(row.status)) failures.push(`${row.id} invalid status`)
  if (!row.evidence?.length) failures.push(`${row.id} missing evidence`)
  for (const pointer of row.evidence || []) {
    try { await access(new URL(pointer, root)) } catch { failures.push(`${row.id} missing evidence ${pointer}`) }
  }
}
if (handover.independentSignoffs.length !== 6 || handover.independentSignoffs.some((row) => row.status !== 'OPEN' || !row.ownerRole)) failures.push('six open independent signoffs')
if (handover.additionalApprovals.length !== 5 || handover.additionalApprovals.some((row) => row.status !== 'OPEN' || !row.ownerRole)) failures.push('five open additional approvals')
if (handover.externalGates.map((row) => `${row.id}:${row.status}`).join(',') !== 'T46:BLOCKED,T54:BLOCKED,T56:UNVERIFIED,T58:BLOCKED') failures.push('external gates')

const t = Object.fromEntries(['PASS', 'BLOCKED', 'UNVERIFIED'].map((status) => [status, PROGRAMME_VALIDATION.filter((row) => row.outcome === status).length]))
if (JSON.stringify(t) !== JSON.stringify({ PASS: 56, BLOCKED: 3, UNVERIFIED: 1 })) failures.push('T ledger reconciliation')
if (CHANGE_LEDGER.length !== 52) failures.push('CH ledger count')
if (handover.changeLedger.total !== CHANGE_LEDGER.length) failures.push('CH handover reconciliation')

console.log(JSON.stringify({
  validator: 'P10_FINAL_HANDOVER',
  status: failures.length ? 'FAIL' : 'PASS',
  verdict: handover.verdict,
  state: handover.allowedState,
  checklist: Object.fromEntries(['PASS', 'BLOCKED', 'UNVERIFIED'].map((status) => [status, handover.checklist.filter((row) => row.status === status).length])),
  independentSignoffs: { OPEN: handover.independentSignoffs.filter((row) => row.status === 'OPEN').length },
  failures,
}, null, 2))
if (failures.length) process.exitCode = 1
