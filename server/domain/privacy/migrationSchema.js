// Reads the committed migrations (forward files only) and reconstructs the
// column inventory: every column a CREATE TABLE or ALTER TABLE ... ADD COLUMN
// introduces, with its declared type. Used by the personal-data ratchet test
// (server/test/personalDataRegistry.test.js) and by the operator script that
// prints the inventory. Pure text parsing; no database needed.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = path.resolve(HERE, '../../db/migrations')

// Remove dollar-quoted bodies (functions, DO blocks), comments and string literals
// so that statement splitting on ';' is safe.
export function stripSql(sql) {
  let out = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
  out = out.replace(/\/\*[\s\S]*?\*\//g, ' ')
  out = out.replace(/--[^\n]*/g, ' ')
  out = out.replace(/'(?:[^']|'')*'/g, "''")
  return out
}

function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

const NON_COLUMN = /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|EXCLUDE|LIKE)\b/i
const unquote = (s) => s.replace(/^"|"$/g, '').replace(/^public\./i, '').toLowerCase()

function columnFrom(def) {
  if (NON_COLUMN.test(def)) return null
  const m = def.match(/^("?[A-Za-z_][A-Za-z0-9_]*"?)\s+([\s\S]+)$/)
  if (!m) return null
  const type = m[2].trim().split(/\s+(?=(?:NOT|NULL|DEFAULT|PRIMARY|REFERENCES|UNIQUE|CHECK|GENERATED|CONSTRAINT|COLLATE)\b)/i)[0]
  return { column: unquote(m[1]), type: type.trim().toUpperCase().replace(/\s+/g, ' ') }
}

// Returns [{ table, column, type, migration }] in migration order; a column added
// twice (IF NOT EXISTS) is reported once, at its first migration.
export function parseMigrationColumns(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f) && !f.endsWith('.down.sql')).sort()
  const seen = new Map()
  const dropped = new Set()
  const tables = new Set()
  for (const file of files) {
    const sql = stripSql(readFileSync(path.join(dir, file), 'utf8'))
    for (const raw of sql.split(';')) {
      const stmt = raw.trim()
      const create = stmt.match(/^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_.]*"?)\s*\(([\s\S]*)\)[^)]*$/i)
      if (create) {
        const table = unquote(create[1])
        // CREATE TABLE IF NOT EXISTS on a table an earlier migration created is
        // a no-op in PostgreSQL: its column list never reaches the database.
        if (tables.has(table) && /IF\s+NOT\s+EXISTS/i.test(stmt)) continue
        tables.add(table)
        for (const def of splitTopLevel(create[2])) {
          const col = columnFrom(def)
          if (!col) continue
          const key = `${table}.${col.column}`
          dropped.delete(key)
          if (!seen.has(key)) seen.set(key, { table, ...col, migration: file })
        }
        continue
      }
      const alter = stmt.match(/^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?("?[A-Za-z_][A-Za-z0-9_.]*"?)\s+([\s\S]+)$/i)
      if (alter) {
        const table = unquote(alter[1])
        for (const action of splitTopLevel(alter[2])) {
          const add = action.match(/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i)
          if (add && !/^ADD\s+(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(action)) {
            const col = columnFrom(add[1])
            if (!col) continue
            const key = `${table}.${col.column}`
            dropped.delete(key)
            if (!seen.has(key)) seen.set(key, { table, ...col, migration: file })
            continue
          }
          const drop = action.match(/^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/i)
          if (drop) dropped.add(`${table}.${unquote(drop[1])}`)
        }
        continue
      }
      const dropTable = stmt.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_.]*"?)/i)
      if (dropTable) {
        const table = unquote(dropTable[1])
        tables.delete(table)
        for (const key of seen.keys()) if (key.startsWith(`${table}.`)) dropped.add(key)
      }
    }
  }
  return [...seen.entries()].filter(([key]) => !dropped.has(key)).map(([, v]) => v)
}
