#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { PROGRAMME_VALIDATION, PROGRAMME_VALIDATION_VERSION } from './programme-validation-ledger.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const allowedOutcomes = new Set(['PASS', 'BLOCKED', 'UNVERIFIED'])
const allowedLayers = new Set(['A', 'B', 'C', 'MANUAL'])
const failures = []
const exists = async (path) => {
  try { await access(join(root, path), constants.R_OK); return true } catch { return false }
}

const expected = Array.from({ length: 60 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
const ids = PROGRAMME_VALIDATION.map((entry) => entry.id)
if (new Set(ids).size !== 60 || expected.some((id, i) => ids[i] !== id)) failures.push('Ledger must contain T01-T60 exactly once and in order.')

for (const entry of PROGRAMME_VALIDATION) {
  if (!allowedOutcomes.has(entry.outcome)) failures.push(`${entry.id}: invalid outcome ${entry.outcome}`)
  if (!entry.requirement || !Array.isArray(entry.layers) || !entry.layers.length || entry.layers.some((layer) => !allowedLayers.has(layer))) failures.push(`${entry.id}: invalid layer mapping`)
  if (!Array.isArray(entry.tests) || !entry.tests.length) failures.push(`${entry.id}: at least one concrete test is required`)
  for (const test of entry.tests || []) {
    if (!test.name || !allowedLayers.has(test.layer) || !(await exists(test.path))) failures.push(`${entry.id}: invalid test evidence ${test.path || '(missing path)'}`)
  }
  if (!Array.isArray(entry.evidence) || !entry.evidence.length) failures.push(`${entry.id}: evidence path is required`)
  for (const path of entry.evidence || []) if (!(await exists(path))) failures.push(`${entry.id}: missing evidence path ${path}`)
  if (entry.outcome === 'PASS' && entry.blocker) failures.push(`${entry.id}: PASS cannot carry a blocker`)
  if (entry.outcome !== 'PASS' && (!entry.blocker?.owner || !entry.blocker?.dependency || !entry.blocker?.evidenceNeeded)) failures.push(`${entry.id}: ${entry.outcome} requires owner, dependency and evidence needed`)
}

const requiredDocSections = {
  'docs/experience/RESEARCH_PROTOCOLS.md': [
    /12 students\s*\/\s*12 early-career professionals/i,
    /Observed product session and generic-AI role-play comparator/i,
    /Five-second summary task and two-minute next-action task/i,
    /blank template/i,
    /incentive/i,
    /compulsion/i,
  ],
  'docs/experience/VALIDATION_PLAN.md': [
    /intended use/i, /construct/i, /timing and accessibility/i, /confounds/i,
    /two independent raters/i, /third qualified/i, /held-out/i, /blinding/i,
    /\| A [—-] Feasibility/i, /\| B [—-] Elicitation/i, /\| C [—-] Evaluation/i, /\| D [—-] Development/i, /\| E [—-] Transfer/i,
    /suggested 40[–-]60/i, /not executed/i,
  ],
  'docs/experience/ROLLOUT.md': [
    /Engineering/i, /Content/i, /Measurement/i, /Security\s*\/\s*privacy/i,
    /Product(?:\s*\/\s*finance|-finance)/i, /Operations/i, /NO-GO/i,
  ],
}
for (const [path, patterns] of Object.entries(requiredDocSections)) {
  const text = await readFile(join(root, path), 'utf8')
  for (const pattern of patterns) if (!pattern.test(text)) failures.push(`${path}: missing required section/pattern ${pattern}`)
}

const summary = Object.fromEntries([...allowedOutcomes].map((outcome) => [outcome, PROGRAMME_VALIDATION.filter((entry) => entry.outcome === outcome).length]))
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const result = {
  schemaVersion: PROGRAMME_VALIDATION_VERSION,
  generatedAt: new Date().toISOString(),
  sourceCommit: sha,
  status: failures.length ? 'FAIL' : 'PASS',
  summary,
  failures,
  testsAreEvidenceReferencesNotExecutedResults: true,
  entries: PROGRAMME_VALIDATION,
}
const output = join(root, 'docs', 'experience', 'programme-validation-results.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures, output }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: 'PASS', summary, output }, null, 2))
