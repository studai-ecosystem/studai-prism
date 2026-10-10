// PROD-READY Phase 10 — the counsel packet (HA-C005 / HA-005 / HA-004) stays
// complete and current:
//   1. the committed packet equals a fresh export (no hand edits, no drift);
//   2. ratchet: every consent / disclosure / privacy / sharing / guardian /
//      employer copy export in server/domain, server/lib, server/routes and
//      src is either exported into the packet or explicitly excluded with a
//      reason — adding such a constant without listing it fails here;
//   3. every client copy module and every server copy.js is accounted for;
//   4. the packet never presents anything as approved (law 2).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  ROOT, PACKET_PATH, PACKET_SOURCES, NOT_COUNSEL_COPY, COPY_FILES_NOT_IN_PACKET,
  COPY_EXPORT_PATTERN, generate,
} from '../../scripts/export-consent-strings.mjs'

const rel = (p) => relative(ROOT, p).split(sep).join('/')

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules') continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(m?jsx?)$/.test(f) && !/\.test\.m?jsx?$/.test(f)) out.push(p)
  }
  return out
}

const SCAN_DIRS = ['server/domain', 'server/lib', 'server/routes', 'src']

// Exports that look like counsel copy but are covered by neither the packet
// nor an exclusion. `files` maps a repo-relative path to its source text.
export function unlistedCopyExports(files) {
  const moduleExports = new Set()
  const inlineFiles = new Set()
  for (const s of PACKET_SOURCES) {
    if (s.kind === 'module') for (const e of s.exports) moduleExports.add(`${s.file}:${e.split('.')[0]}`)
    else inlineFiles.add(s.file)
  }
  const missing = []
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(COPY_EXPORT_PATTERN)) {
      const key = `${file}:${m[1]}`
      if (moduleExports.has(key) || inlineFiles.has(file) || key in NOT_COUNSEL_COPY) continue
      missing.push(key)
    }
  }
  return missing
}

const repoFiles = () => {
  const files = {}
  for (const d of SCAN_DIRS) for (const p of walk(join(ROOT, d))) files[rel(p)] = readFileSync(p, 'utf8')
  return files
}

test('the committed counsel packet equals a fresh export', async () => {
  const committed = readFileSync(join(ROOT, PACKET_PATH), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(committed, await generate(), `${PACKET_PATH} is stale: run node scripts/export-consent-strings.mjs`)
})

test('ratchet: every consent / disclosure copy export is in the packet or excluded with a reason', () => {
  assert.deepEqual(unlistedCopyExports(repoFiles()), [])
})

test('ratchet discriminates: a new disclosure constant fails until it is listed', () => {
  const probe = { 'src/lib/copy/privacy.js': "export const CAMPUS_NEW_DISCLOSURE = 'x'\nexport const CAMPUS_CAN_SEE = []" }
  assert.deepEqual(unlistedCopyExports(probe), ['src/lib/copy/privacy.js:CAMPUS_NEW_DISCLOSURE'])
  const probe2 = { 'server/domain/x/copy.js': 'export function guardianWithdrawalNotice() {}\nexport const SHARE_NOTICE = 1' }
  assert.deepEqual(unlistedCopyExports(probe2), ['server/domain/x/copy.js:SHARE_NOTICE'], 'name match is by pattern; lowercase helper without a keyword is not copy')
})

test('every client copy module and every server copy.js is accounted for', () => {
  const listed = new Set(PACKET_SOURCES.map((s) => s.file))
  const copyFiles = walk(join(ROOT, 'src/lib/copy')).map(rel)
  const serverCopy = walk(join(ROOT, 'server/domain')).map(rel).filter((f) => /\/copy(Versions)?\.js$/.test(f))
  for (const f of [...copyFiles, ...serverCopy]) {
    assert.ok(listed.has(f) || f in COPY_FILES_NOT_IN_PACKET, `${f} is neither in PACKET_SOURCES nor in COPY_FILES_NOT_IN_PACKET`)
  }
  for (const f of Object.keys(COPY_FILES_NOT_IN_PACKET)) assert.ok(existsSync(join(ROOT, f)), `stale exclusion ${f}`)
})

test('exclusions are not stale and every listed source exists', () => {
  const files = repoFiles()
  for (const key of Object.keys(NOT_COUNSEL_COPY)) {
    const [file, name] = key.split(':')
    assert.ok(files[file], `excluded file missing: ${file}`)
    assert.match(files[file], new RegExp(`export\\s+(?:default\\s+)?(?:const|function|async\\s+function)\\s+${name}\\b`), `stale exclusion ${key}`)
  }
  for (const s of PACKET_SOURCES) assert.ok(existsSync(join(ROOT, s.file)), s.file)
  const ids = PACKET_SOURCES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length, 'source ids are unique')
})

test('the packet never presents copy as approved (law 2)', async () => {
  for (const s of PACKET_SOURCES) {
    assert.match(s.status, /DRAFT|no counsel approval|pending|review/i, `${s.id} status must say it is unapproved`)
    assert.ok(s.counsel.length > 0, `${s.id} names its review items`)
    assert.ok(s.where && s.policy, `${s.id} says where it appears and what policy it implements`)
  }
  const text = await generate()
  assert.match(text, /\*\*Nothing in this packet is approved\.\*\*/)
  assert.doesNotMatch(text, /\bapproved by counsel\b|\bcounsel[- ]approved\b|CLOSED \(evidence/i)
})
