// PostgreSQL-backed user store. Drop-in twin of dbJson.js (same signatures,
// same record shapes). Active only when PRISM_PG_STORE=true AND DATABASE_URL is
// set (db.js enforces dispatch). Table: v1_users (migration 0003_v1_store.sql).

import crypto from 'node:crypto'
import { query } from '../db/pool.js'

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    college: row.college || '',
    year: row.year || '',
    passwordHash: row.password_hash,
    candidateId: row.candidate_id || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

export async function findUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase()
  const r = await query('SELECT * FROM v1_users WHERE email = $1', [normalized])
  return rowToUser(r?.rows?.[0])
}

export async function findUserById(id) {
  const r = await query('SELECT * FROM v1_users WHERE id = $1', [id])
  return rowToUser(r?.rows?.[0])
}

export async function createUser(user) {
  const normalized = String(user.email).trim().toLowerCase()
  const existing = await query('SELECT 1 FROM v1_users WHERE email = $1', [normalized])
  if (existing?.rows?.length) throw new Error('EMAIL_TAKEN')
  const record = {
    id: crypto.randomUUID(),
    email: normalized,
    name: user.name || '',
    college: user.college || '',
    year: user.year || '',
    passwordHash: user.passwordHash,
    createdAt: new Date().toISOString(),
  }
  await query(
    `INSERT INTO v1_users (id, email, name, college, year, password_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [record.id, record.email, record.name, record.college, record.year, record.passwordHash, record.createdAt],
  )
  return record
}

export async function updateUser(id, fields) {
  const user = await findUserById(id)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (typeof fields.name === 'string') user.name = fields.name.trim()
  if (typeof fields.college === 'string') user.college = fields.college.trim()
  if (typeof fields.year === 'string') user.year = fields.year.trim()
  await query(
    'UPDATE v1_users SET name = $2, college = $3, year = $4 WHERE id = $1',
    [id, user.name, user.college, user.year],
  )
  // Track 0.1: candidate_id is write-once — set only when currently null.
  if (typeof fields.candidateId === 'string' && !user.candidateId) {
    await query(
      'UPDATE v1_users SET candidate_id = $2 WHERE id = $1 AND candidate_id IS NULL',
      [id, fields.candidateId],
    )
    user.candidateId = fields.candidateId
  }
  return user
}

export function publicUser(user) {
  if (!user) return null
  const { id, email, name, college, year, createdAt } = user
  return { id, email, name, college, year, createdAt }
}
