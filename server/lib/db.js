// Lightweight JSON-file-backed user store.
// Persists accounts to server/data/users.json. Good enough for development and
// small deployments. Swap for Postgres/Mongo in production without changing the
// route layer — keep the same async function signatures.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { promises as fs } from 'fs'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
// DATA_DIR env override lets deployments point at persistent storage
// (e.g. /home/data on Azure App Service, which survives redeploys).
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const DB_FILE = join(DATA_DIR, 'users.json')

// Simple in-process write lock to avoid concurrent-write corruption.
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
  // Serialize writes through a chain so concurrent calls don't clobber each other.
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

// Update editable profile fields (name, college, year) for a given user id.
// Ignores undefined fields so callers can do partial updates.
export async function updateUser(id, fields) {
  const db = await readDB()
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (typeof fields.name === 'string') user.name = fields.name.trim()
  if (typeof fields.college === 'string') user.college = fields.college.trim()
  if (typeof fields.year === 'string') user.year = fields.year.trim()
  await writeDB(db)
  return user
}

// Return only safe, non-sensitive fields for API responses.
export function publicUser(user) {
  if (!user) return null
  const { id, email, name, college, year, createdAt } = user
  return { id, email, name, college, year, createdAt }
}
