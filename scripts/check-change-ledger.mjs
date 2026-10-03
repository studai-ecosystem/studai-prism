#!/usr/bin/env node
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHANGE_LEDGER, CHANGE_LEDGER_VERSION, CHANGE_STATUS } from './change-ledger.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const expected = Array.from({ length: 52 }, (_, index) => `CH-${String(index + 1).padStart(2, '0')}`)
const decisions = new Set(['K', 'U', 'A', 'R', 'D'])
const ids = CHANGE_LEDGER.map((entry) => entry.id)

if (new Set(ids).size !== 52 || expected.some((id, index) => ids[index] !== id)) {
  failures.push('Ledger must contain CH-01 through CH-52 exactly once and in order.')
}

async function exists(path) {
  try {
    await access(join(root, path), constants.R_OK)
    return true
  } catch {
    return false
  }
}

for (const entry of CHANGE_LEDGER) {
  if (!decisions.has(entry.decision)) failures.push(`${entry.id}: invalid decision ${entry.decision}`)
  if (!CHANGE_STATUS.includes(entry.status)) failures.push(`${entry.id}: invalid status ${entry.status}`)
  for (const key of ['implementation', 'evidence', 'blockers']) {
    if (!Array.isArray(entry[key])) failures.push(`${entry.id}: ${key} must be an array`)
  }
  if (!entry.implementation.length || !entry.evidence.length) failures.push(`${entry.id}: implementation and evidence pointers are required`)
  for (const path of [...entry.implementation, ...entry.evidence]) {
    if (!(await exists(path))) failures.push(`${entry.id}: missing evidence reference ${path}`)
  }
  if (entry.status === 'EXTERNAL_GATE' && !entry.blockers.length) failures.push(`${entry.id}: external gate requires blockers`)
}

const summary = Object.fromEntries(CHANGE_STATUS.map((status) => [status, CHANGE_LEDGER.filter((entry) => entry.status === status).length]))
const result = { schemaVersion: CHANGE_LEDGER_VERSION, status: failures.length ? 'FAIL' : 'PASS', summary, failures }
console.log(JSON.stringify(result, null, 2))
if (failures.length) process.exit(1)
