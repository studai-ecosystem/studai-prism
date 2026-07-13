// Admin RBAC catalogue — the SINGLE source of truth for roles, permissions and
// role→permission grants (Control Centre plan §5). The database tables
// (migration 0011) are seeded FROM this file, idempotently, so code and data
// cannot drift. Tests assert the structural invariants here (e.g. the auditor
// role holds no write permission, ever).
//
// Permission keys are `resource:action`. `*` (super_admin / break_glass only)
// matches everything. Enforcement happens server-side in requirePermission()
// (lib/adminAuth.js) — hiding a frontend button is never the security boundary.

import { randomUUID } from 'crypto'
import { query } from '../db/pool.js'

// ── Permission catalogue ─────────────────────────────────────────────────────
export const PERMISSIONS = {
  // Administration of administrators (super admin only)
  'admins:read': 'View administrator accounts, roles and sessions',
  'admins:manage': 'Create/suspend administrators, grant/revoke roles (elevation is dual-approved)',
  'approvals:decide': 'Approve or reject dual-control requests raised by another admin',

  // Candidates
  'users:read': 'View candidate accounts (email masked)',
  'users:read_pii': 'View unmasked candidate PII (email, verification identity fields)',
  'users:write': 'Edit candidate profile fields (name, college, year)',
  'users:suspend': 'Suspend / reactivate candidate accounts',

  // Assessment sessions
  'sessions:read': 'View assessment sessions, transcripts, evidence, timeline',
  'sessions:review': 'Place sessions in / release from human review',
  'sessions:invalidate': 'Mark a session invalid with reason; exclude from calibration',

  // Reports
  'reports:read': 'View score reports and their version history',
  'reports:resend': 'Resend report delivery to the candidate',
  'reports:hold': 'Place or release a delivery hold on a report',
  'reports:supersede': 'Supersede a report after an approved review (never silent edit)',

  // Disputes
  'disputes:read': 'View disputes',
  'disputes:manage': 'Assign, transition, and resolve disputes',

  // Consent / verification / integrity
  'consents:read': 'View consent records',
  'verifications:read': 'View verification status (PII masked)',
  'verifications:read_pii': 'View verification identity fields (each access audited)',
  'integrity:read': 'View proctoring/integrity events',
  'integrity:review': 'Record reviewer decisions on integrity events',

  // Commerce
  'payments:read': 'View payments and entitlements',
  'payments:grant': 'Grant a controlled entitlement with reason',
  'payments:revoke': 'Revoke an unused entitlement with reason',
  'payments:refund': 'Operate the refund workflow',

  // Assessment content
  'scenarios:read': 'View the scenario bank and lifecycle state',
  'scenarios:manage': 'Scenario lifecycle actions (freeze-aware; never hard delete)',
  'items:read': 'View item/probe bank with calibration status',
  'items:retire': 'Retire or supersede items (never delete)',
  'prompts:read': 'View prompt registry and versions',
  'prompts:manage': 'Create/edit draft prompt versions',
  'prompts:publish': 'Approve/publish/rollback prompt versions',

  // Psychometrics
  'psychometrics:read': 'View reliability, IRT, DIF, drift, conformal dashboards',
  'calibrations:read': 'View calibration runs',
  'calibrations:freeze': 'Freeze a reviewed calibration run (dual-approved)',
  'calibrations:apply': 'Apply a frozen calibration run (dual-approved)',

  // Human rating
  'raters:read': 'View rater roster, IRR, training progress',
  'raters:manage': 'Create/suspend raters, rotate tokens, reset training, manage references',
  'ratings:supersede': 'Record a versioned correction to a human rating',

  // Research
  'studies:read': 'View study registry, sessions, results',
  'studies:manage': 'Preregister studies, edit before activation, transition status, external ratings',
  'studies:compute': 'Trigger study metric computation (results are append-only)',

  // Credentials
  'credentials:read': 'View credentials, chains, signing-key status (public parts only)',
  'credentials:issue': 'Issue credentials',
  'credentials:revoke': 'Revoke / reissue credentials with reason (bulk is dual-approved)',

  // Team simulation & replay
  'replays:read': 'View practice replays',
  'teamfit:read': 'View teams and team-fit sessions',
  'teamfit:manage': 'Create/archive teams, manage consented members',

  // Content CMS
  'content:read': 'View CMS content',
  'content:write': 'Create/edit content drafts',
  'content:publish': 'Publish/unpublish/schedule content',
  'content:applications': 'View and process job applications',

  // Feature flags (registry + change REQUESTS only — flips stay human ops)
  'flags:read': 'View flag registry, env state, flip-check verdicts',
  'flags:request': 'Request a flag change (recorded, needs approval)',
  'flags:approve': 'Approve a flag change request (dual control)',

  // System
  'system:read': 'View integration/system health (booleans only, never secrets)',
  'jobs:manage': 'Retry/cancel background jobs (idempotent operations only)',

  // Privacy & governance
  'privacy:read': 'View privacy requests and retention rules',
  'privacy:manage': 'Operate privacy request workflow (dry-runs, corrections)',
  'privacy:execute': 'Execute approved erasures (dual-approved)',
  'audit:read': 'Search and export the admin audit trail',
  'exports:create': 'Create data exports (every export is ledgered)',
  'notes:write': 'Add internal notes to operational entities',
  'dashboard:read': 'View the command centre',
}

// Every read-only permission (used to build the auditor grant and asserted in
// tests: the auditor must never gain a write capability by drift).
export const READ_ONLY_PERMISSIONS = Object.keys(PERMISSIONS).filter(
  (k) => k.endsWith(':read') || k.endsWith(':read_pii'),
)

// ── Roles ────────────────────────────────────────────────────────────────────
export const ROLES = {
  super_admin: {
    title: 'Super Administrator',
    description: 'Administrators, roles, security, product configuration, retention.',
    permissions: ['*'],
  },
  product_admin: {
    title: 'Product Administrator',
    description: 'Users, assessments, reports, content, support, routine configuration. No calibration or signing.',
    permissions: [
      'dashboard:read', 'users:read', 'users:read_pii', 'users:write', 'users:suspend',
      'sessions:read', 'sessions:review', 'reports:read', 'reports:resend', 'reports:hold', 'reports:supersede',
      'disputes:read', 'disputes:manage', 'consents:read', 'verifications:read',
      'integrity:read', 'payments:read', 'content:read', 'flags:read', 'system:read',
      'exports:create', 'notes:write',
    ],
  },
  assessment_ops: {
    title: 'Assessment Operations Administrator',
    description: 'Sessions, review queues, disputes, proctoring, report delivery, candidate support.',
    permissions: [
      'dashboard:read', 'users:read', 'sessions:read', 'sessions:review', 'sessions:invalidate',
      'reports:read', 'reports:resend', 'reports:hold', 'disputes:read', 'disputes:manage',
      'consents:read', 'verifications:read', 'integrity:read', 'integrity:review', 'notes:write',
    ],
  },
  psychometric_admin: {
    title: 'Psychometric Administrator',
    description: 'Item bank, scenario lifecycle, calibration, DIF, reliability, rating science.',
    permissions: [
      'dashboard:read', 'scenarios:read', 'scenarios:manage', 'items:read', 'items:retire',
      'prompts:read', 'prompts:manage', 'prompts:publish',
      'psychometrics:read', 'calibrations:read', 'calibrations:freeze', 'calibrations:apply',
      'raters:read', 'ratings:supersede', 'sessions:read', 'notes:write',
    ],
  },
  research_admin: {
    title: 'Research Administrator',
    description: 'Studies, cohorts, computation, research exports. Assignments and history immutable.',
    permissions: [
      'dashboard:read', 'studies:read', 'studies:manage', 'studies:compute',
      'sessions:read', 'replays:read', 'exports:create', 'notes:write',
    ],
  },
  rater_manager: {
    title: 'Rater Manager',
    description: 'Rater lifecycle, training references, IRR, work assignment.',
    permissions: ['dashboard:read', 'raters:read', 'raters:manage', 'notes:write'],
  },
  credential_admin: {
    title: 'Credential Administrator',
    description: 'Issue/revoke/reissue credentials, inspect chains, export audits. Signed contents immutable.',
    permissions: [
      'dashboard:read', 'credentials:read', 'credentials:issue', 'credentials:revoke',
      'exports:create', 'notes:write',
    ],
  },
  finance_admin: {
    title: 'Finance Administrator',
    description: 'Payments, entitlements, refunds, reconciliation, revenue reports.',
    permissions: [
      'dashboard:read', 'payments:read', 'payments:grant', 'payments:revoke', 'payments:refund',
      'users:read', 'exports:create', 'notes:write',
    ],
  },
  content_admin: {
    title: 'Content Administrator',
    description: 'Blog, careers, public content, publication workflow.',
    permissions: [
      'dashboard:read', 'content:read', 'content:write', 'content:publish',
      'content:applications', 'notes:write',
    ],
  },
  privacy_admin: {
    title: 'Privacy Administrator',
    description: 'Data-subject requests, consent, retention, privacy incidents.',
    permissions: [
      'dashboard:read', 'privacy:read', 'privacy:manage', 'privacy:execute',
      'consents:read', 'users:read', 'users:read_pii', 'verifications:read', 'verifications:read_pii',
      'replays:read', 'audit:read', 'notes:write',
    ],
  },
  support_admin: {
    title: 'Support Administrator',
    description: 'Candidate search, limited account details, routine issues. No evidence or research data.',
    permissions: ['dashboard:read', 'users:read', 'reports:resend', 'disputes:read', 'notes:write'],
  },
  auditor: {
    title: 'Auditor',
    description: 'Read-only: audit logs, calibration records, credential chains, decision trails.',
    permissions: ['audit:read', 'dashboard:read', ...READ_ONLY_PERMISSIONS],
  },
  break_glass: {
    title: 'Break-Glass (emergency)',
    description: 'Emergency full access. Explicit activation, reason, time-limited, alerting, fully audited.',
    permissions: ['*'],
  },
}

// ── Idempotent seed (boot + seedAdmin CLI) ──────────────────────────────────
// Upserts the catalogue; revokes grants that were removed from this file so
// the DB always mirrors the catalogue exactly. Never touches admin_user_roles.
export async function seedRbac() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await query(
      `INSERT INTO admin_permissions (permission_key, description) VALUES ($1,$2)
       ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description`,
      [key, description],
    )
  }
  // '*' is a real row so role_permissions FKs stay satisfied.
  await query(
    `INSERT INTO admin_permissions (permission_key, description) VALUES ('*','All permissions')
     ON CONFLICT (permission_key) DO NOTHING`,
  )

  for (const [roleKey, def] of Object.entries(ROLES)) {
    await query(
      `INSERT INTO admin_roles (role_id, role_key, title, description, is_system)
       VALUES ($1,$2,$3,$4,TRUE)
       ON CONFLICT (role_key) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description`,
      [randomUUID(), roleKey, def.title, def.description],
    )
    const r = await query('SELECT role_id FROM admin_roles WHERE role_key = $1', [roleKey])
    const roleId = r.rows[0].role_id
    const perms = [...new Set(def.permissions)]
    await query(
      `DELETE FROM admin_role_permissions WHERE role_id = $1 AND permission_key <> ALL($2::text[])`,
      [roleId, perms],
    )
    for (const p of perms) {
      await query(
        `INSERT INTO admin_role_permissions (role_id, permission_key) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [roleId, p],
      )
    }
  }
}

// Resolve the flat permission set for an admin (union across roles).
export async function permissionsForAdmin(adminId) {
  const r = await query(
    `SELECT DISTINCT rp.permission_key
       FROM admin_user_roles ur
       JOIN admin_role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.admin_id = $1`,
    [adminId],
  )
  return new Set((r?.rows || []).map((row) => row.permission_key))
}

export async function rolesForAdmin(adminId) {
  const r = await query(
    `SELECT ro.role_key FROM admin_user_roles ur JOIN admin_roles ro ON ro.role_id = ur.role_id
      WHERE ur.admin_id = $1 ORDER BY ro.role_key`,
    [adminId],
  )
  return (r?.rows || []).map((row) => row.role_key)
}
