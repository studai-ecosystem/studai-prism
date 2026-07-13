// Bootstrap the first super administrator (and optionally the break-glass
// account) for the Admin Control Centre. One-shot, idempotent, CLI-only:
//
//   node db/seedAdmin.js --email ops@studai.one            # super admin
//   node db/seedAdmin.js --email sos@studai.one --break-glass
//
// The initial password is read from PRISM_ADMIN_BOOTSTRAP_PASSWORD (never a
// CLI arg — args leak into shell history and process lists). The account is
// created in state 'invited' with must_change_password=TRUE; the operator
// signs in, changes the password, and enrols MFA on first login. Refuses to
// run if an account with the email already exists.

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const { query, isDbConfigured, closePool } = await import('./pool.js')
const { seedRbac } = await import('../lib/adminRbac.js')
const { hashPassword, validatePasswordPolicy } = await import('../lib/adminAuth.js')

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  return next && !next.startsWith('--') ? next : true
}

const email = String(arg('email') || '').toLowerCase().trim()
const isBreakGlass = arg('break-glass') === true
const password = process.env.PRISM_ADMIN_BOOTSTRAP_PASSWORD

if (!isDbConfigured()) {
  console.error('DATABASE_URL is not configured — the admin console is database-backed.')
  process.exit(1)
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node db/seedAdmin.js --email you@example.com [--break-glass]')
  process.exit(1)
}
if (!password) {
  console.error('Set PRISM_ADMIN_BOOTSTRAP_PASSWORD in the environment (not as a CLI argument).')
  process.exit(1)
}
const policyError = validatePasswordPolicy(password, email)
if (policyError) {
  console.error(policyError)
  process.exit(1)
}

try {
  await seedRbac()

  const existing = await query('SELECT admin_id FROM admin_users WHERE email = $1', [email])
  if (existing?.rows?.length) {
    console.error(`An administrator with email ${email} already exists — refusing to overwrite.`)
    process.exit(1)
  }

  const adminId = randomUUID()
  await query(
    `INSERT INTO admin_users (admin_id, email, name, password_hash, state, must_change_password, is_break_glass)
     VALUES ($1,$2,$3,$4,'invited',TRUE,$5)`,
    [adminId, email, isBreakGlass ? 'Break glass' : 'Bootstrap admin', await hashPassword(password), isBreakGlass],
  )
  const roleKey = isBreakGlass ? 'break_glass' : 'super_admin'
  await query(
    `INSERT INTO admin_user_roles (admin_id, role_id)
     SELECT $1, role_id FROM admin_roles WHERE role_key = $2`,
    [adminId, roleKey],
  )
  await query(
    `INSERT INTO admin_audit_events (admin_id, admin_email, roles, action, entity_type, entity_id, reason)
     VALUES ($1,$2,$3,'admin_bootstrapped','admin_user',$4,'seedAdmin CLI')`,
    [adminId, email, JSON.stringify([roleKey]), String(adminId)],
  )
  console.log(`✓ ${roleKey} ${email} created (state: invited).`)
  console.log('  Next: set PRISM_ADMIN_CONSOLE=true, sign in at /admin/login, and enrol MFA.')
  console.log('  The bootstrap password must be changed at first login.')
} finally {
  await closePool()
}
