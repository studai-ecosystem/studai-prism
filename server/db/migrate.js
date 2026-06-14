// Minimal SQL migration runner for the Prism v2 Postgres store.
//
//   node db/migrate.js        — apply all pending "up" migrations
//   node db/migrate.js up      — same as above
//   node db/migrate.js down    — roll back the most recently applied migration
//   node db/migrate.js status  — list applied / pending migrations
//
// Migrations live in db/migrations as NNNN_name.sql (up) with an optional
// NNNN_name.down.sql (rollback). Applied migrations are tracked in the
// schema_migrations table so re-running is safe (idempotent).

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { getPool, isDbConfigured, closePool } from './pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const MIGRATIONS_DIR = join(__dirname, 'migrations')

async function ensureTracking(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT now()
    )
  `)
}

async function appliedSet(pool) {
  const { rows } = await pool.query('SELECT name FROM schema_migrations')
  return new Set(rows.map((r) => r.name))
}

// All up-migration base names (without extension), sorted.
async function upMigrations() {
  const files = await readdir(MIGRATIONS_DIR)
  return files
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort()
}

export async function migrateUp() {
  const pool = getPool()
  if (!pool) throw new Error('DATABASE_URL not configured — cannot run migrations.')
  await ensureTracking(pool)
  const done = await appliedSet(pool)
  const names = await upMigrations()
  let applied = 0
  for (const name of names) {
    if (done.has(name)) continue
    const sql = await readFile(join(MIGRATIONS_DIR, `${name}.sql`), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
      applied++
      console.log(`✓ applied ${name}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`Migration ${name} failed: ${err.message}`)
    } finally {
      client.release()
    }
  }
  if (!applied) console.log('No pending migrations.')
  return applied
}

export async function migrateDown() {
  const pool = getPool()
  if (!pool) throw new Error('DATABASE_URL not configured — cannot run migrations.')
  await ensureTracking(pool)
  const { rows } = await pool.query(
    'SELECT name FROM schema_migrations ORDER BY applied_at DESC, name DESC LIMIT 1',
  )
  if (!rows.length) {
    console.log('Nothing to roll back.')
    return 0
  }
  const name = rows[0].name
  const downSql = await readFile(join(MIGRATIONS_DIR, `${name}.down.sql`), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(downSql)
    await client.query('DELETE FROM schema_migrations WHERE name = $1', [name])
    await client.query('COMMIT')
    console.log(`✓ rolled back ${name}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw new Error(`Rollback ${name} failed: ${err.message}`)
  } finally {
    client.release()
  }
  return 1
}

async function status() {
  const pool = getPool()
  if (!pool) throw new Error('DATABASE_URL not configured.')
  await ensureTracking(pool)
  const done = await appliedSet(pool)
  for (const name of await upMigrations()) {
    console.log(`${done.has(name) ? '[x]' : '[ ]'} ${name}`)
  }
}

// CLI entry point.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL not set. Configure it in server/.env to run migrations.')
    process.exit(1)
  }
  const cmd = process.argv[2] || 'up'
  const run = cmd === 'down' ? migrateDown : cmd === 'status' ? status : migrateUp
  run()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message)
      closePool().finally(() => process.exit(1))
    })
}
