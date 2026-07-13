// JSON-file-backed user store (the original, default implementation).
// Used unless PRISM_PG_STORE=true. The Postgres twin lives in dbPg.js; db.js
// dispatches between them.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const DB_FILE = join(DATA_DIR, 'users.json')

let writeChain = Promise.resolve()

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  try {
    await fs.access(DB_FILE)
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ users: [] }, null, 2))
  }
}

async function readDB() {
  await ensureFile()
  const raw = await fs.readFile(DB_FILE, 'utf-8')
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.users)) return { users: [] }
    return parsed
  } catch {
    return { users: [] }
  }
}

function writeDB(db) {
  writeChain = writeChain.then(() => fs.writeFile(DB_FILE, JSON.stringify(db, null, 2)))
  return writeChain
}

export async function findUserByEmail(email) {
  const db = await readDB()
  const normalized = String(email).trim().toLowerCase()
  return db.users.find((u) => u.email === normalized) || null
}

export async function findUserById(id) {
  const db = await readDB()
  return db.users.find((u) => u.id === id) || null
}

export async function createUser(user) {
  const db = await readDB()
  const normalized = String(user.email).trim().toLowerCase()
  if (db.users.some((u) => u.email === normalized)) {
    throw new Error('EMAIL_TAKEN')
  }
  const record = {
    id: crypto.randomUUID(),
    email: normalized,
    name: user.name || '',
    college: user.college || '',
    year: user.year || '',
    passwordHash: user.passwordHash,
    createdAt: new Date().toISOString(),
  }
  db.users.push(record)
  await writeDB(db)
  return record
}

export async function updateUser(id, fields) {
  const db = await readDB()
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (typeof fields.name === 'string') user.name = fields.name.trim()
  if (typeof fields.college === 'string') user.college = fields.college.trim()
  if (typeof fields.year === 'string') user.year = fields.year.trim()
  // Track 0.1: durable pseudonymous candidate id (set once; never overwritten).
  if (typeof fields.candidateId === 'string' && !user.candidateId) user.candidateId = fields.candidateId
  await writeDB(db)
  return user
}

export function publicUser(user) {
  if (!user) return null
  const { id, email, name, college, year, createdAt } = user
  return { id, email, name, college, year, createdAt }
}

// Admin Control Centre: aggregate counts only (no records leave the store).
export async function countUsers() {
  const db = await readDB()
  return db.users.length
}

// Admin Control Centre (Phase 2): paginated candidate list with substring
// search on name/email. Returns raw records — the admin route masks PII
// according to the caller's permissions before anything leaves the server.
export async function listUsers({ q, page, pageSize } = {}) {
  const db = await readDB()
  let rows = db.users
  if (q) {
    const needle = String(q).toLowerCase()
    rows = rows.filter(
      (u) => u.email.includes(needle) ||
             (u.name || '').toLowerCase().includes(needle) ||
             u.id === q || u.candidateId === q,
    )
  }
  rows = [...rows].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  const p = Math.max(1, Number(page) || 1)
  const size = Math.max(1, Math.min(100, Number(pageSize) || 25))
  return { rows: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pageSize: size }
}

// Admin-only account controls. accountState: 'active' | 'suspended'.
// bumpTokenVersion invalidates outstanding JWTs on strict-checked endpoints
// (auth /me); passwordHash supports the operator-assisted reset flow.
export async function updateUserAccount(id, { accountState, passwordHash, bumpTokenVersion } = {}) {
  const db = await readDB()
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (accountState === 'active' || accountState === 'suspended') user.accountState = accountState
  if (typeof passwordHash === 'string' && passwordHash) user.passwordHash = passwordHash
  if (bumpTokenVersion) user.tokenVersion = (user.tokenVersion || 0) + 1
  await writeDB(db)
  return user
}

// Privacy erasure (Phase 6): removes the account record itself. Only the
// dual-approved erasure workflow calls this — session data goes through the
// eraseSession/eraseTelemetry cascade first.
export async function deleteUser(id) {
  const db = await readDB()
  const before = db.users.length
  db.users = db.users.filter((u) => u.id !== id)
  await writeDB(db)
  return db.users.length < before
}
