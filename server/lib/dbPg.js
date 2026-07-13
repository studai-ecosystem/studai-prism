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
    accountState: row.account_state || 'active',
    tokenVersion: row.token_version != null ? Number(row.token_version) : 0,
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

// Admin Control Centre: aggregate counts only (no records leave the store).
export async function countUsers() {
  const r = await query('SELECT COUNT(*) FROM v1_users')
  return Number(r?.rows?.[0]?.count || 0)
}

// Admin Control Centre (Phase 2): twin of dbJson.listUsers.
export async function listUsers({ q, page, pageSize } = {}) {
  const p = Math.max(1, Number(page) || 1)
  const size = Math.max(1, Math.min(100, Number(pageSize) || 25))
  const params = []
  let clause = ''
  if (q) {
    params.push(`%${String(q).toLowerCase()}%`, String(q))
    clause = `WHERE email LIKE $1 OR LOWER(name) LIKE $1 OR id = $2 OR candidate_id::text = $2`
  }
  const total = await query(`SELECT COUNT(*) FROM v1_users ${clause}`, params)
  const r = await query(
    `SELECT * FROM v1_users ${clause} ORDER BY created_at DESC LIMIT ${size} OFFSET ${(p - 1) * size}`,
    params,
  )
  return {
    rows: (r?.rows || []).map(rowToUser),
    total: Number(total?.rows?.[0]?.count || 0),
    page: p,
    pageSize: size,
  }
}

// Admin-only account controls — twin of dbJson.updateUserAccount.
export async function updateUserAccount(id, { accountState, passwordHash, bumpTokenVersion } = {}) {
  const user = await findUserById(id)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (accountState === 'active' || accountState === 'suspended') {
    await query('UPDATE v1_users SET account_state = $2 WHERE id = $1', [id, accountState])
    user.accountState = accountState
  }
  if (typeof passwordHash === 'string' && passwordHash) {
    await query('UPDATE v1_users SET password_hash = $2 WHERE id = $1', [id, passwordHash])
    user.passwordHash = passwordHash
  }
  if (bumpTokenVersion) {
    const r = await query(
      'UPDATE v1_users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
      [id],
    )
    user.tokenVersion = Number(r?.rows?.[0]?.token_version ?? (user.tokenVersion || 0) + 1)
  }
  return user
}
