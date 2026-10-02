// P10.3 — every migration of the experience programme (0040 onwards) is
// additive and reversible: a .down.sql exists for each, and neither the up
// nor the down drops a table that existed before 0040 (expand-and-contract;
// schema rollback never deletes legacy evidence/report/session tables).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const NEW = /^00[4-9]\d_[a-z0-9_]+\.sql$/
const createdTables = (sql) => [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([a-z0-9_]+)"?/gi)].map((m) => m[1].toLowerCase())
const droppedTables = (sql) => [...sql.matchAll(/DROP TABLE(?: IF EXISTS)?\s+(?:public\.)?"?([a-z0-9_]+)"?/gi)].map((m) => m[1].toLowerCase())

async function inventory() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql'))
  const ups = files.filter((f) => !f.endsWith('.down.sql')).sort()
  const legacyTables = new Set()
  for (const f of ups.filter((f) => f < '0040')) for (const t of createdTables(await readFile(join(DIR, f), 'utf8'))) legacyTables.add(t)
  return { files, ups, legacyTables }
}

test('P10.3: every 0040+ migration has a .down.sql companion', async () => {
  const { files, ups } = await inventory()
  const fresh = ups.filter((f) => NEW.test(f))
  assert.ok(fresh.length >= 10, `expected the 0040-0049 range, found ${fresh.length}`)
  for (const f of fresh) assert.ok(files.includes(f.replace(/\.sql$/, '.down.sql')), `${f} has no .down.sql`)
})

test('P10.3: no 0040+ up or down migration drops a pre-0040 table, and each down drops at most what its up created', async () => {
  const { ups, legacyTables } = await inventory()
  assert.ok(legacyTables.has('v1_sessions') && legacyTables.has('student_report_versions') && legacyTables.has('behavioral_evidence_units'))
  for (const f of ups.filter((f) => NEW.test(f))) {
    const up = await readFile(join(DIR, f), 'utf8')
    const down = await readFile(join(DIR, f.replace(/\.sql$/, '.down.sql')), 'utf8')
    for (const t of [...droppedTables(up), ...droppedTables(down)]) assert.ok(!legacyTables.has(t), `${f} drops pre-0040 table ${t}`)
    const created = new Set(createdTables(up))
    for (const t of droppedTables(down)) assert.ok(created.has(t), `${f}.down drops ${t}, which its up did not create`)
    assert.doesNotMatch(up, /\bDROP TABLE\b/i, `${f} (up) must be additive`)
    assert.doesNotMatch(up + down, /\bTRUNCATE\b|\bDELETE FROM\s+(v1_|behavioral_evidence|student_report)/i, `${f} must not purge data`)
  }
})
