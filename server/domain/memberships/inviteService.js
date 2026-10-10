// Organization invites + student activation (spec §37.2; contract §4).
// One identity: accepting never creates a user — it links the signed-in
// account whose email matches the invite, activates the membership, opens the
// campus workspace and records the disclosure the student acknowledged.
import { createHash, randomBytes } from 'node:crypto'
import { ApiError } from '../http/errors.js'
import { can } from '../permissions/can.js'
import { INVITABLE_ROLES, workspaceTypeForRole } from '../permissions/roles.js'
import { CAMPUS_DISCLOSURE_COPY_VERSION } from '../sharing/copyVersions.js'
import { auditLog } from '../../lib/telemetry.js'

export const INVITE_TTL_DAYS = 14
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
const defaultToken = () => randomBytes(32).toString('base64url')

function maskEmail(email) {
  const [name, domain] = String(email).split('@')
  if (!domain) return null
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(6, name.length - 1)))}@${domain}`
}

export function createInviteService({
  repos,
  sendInviteEmail = async () => false,
  inviteUrlFor = (token) => `/app/campus-invite/${token}`,
  clock = () => new Date(),
  tokenFactory = defaultToken,
  audit = auditLog,
  // Called after a student joins a cohort (roster sync for live assignments).
  onCohortJoined = async () => {},
}) {
  async function assertMayInvite({ actor, orgId, role, cohort, departmentId }) {
    if (!INVITABLE_ROLES.includes(role)) throw new ApiError('VALIDATION_FAILED', 'This role cannot be invited.')
    if (role === 'STUDENT') {
      const decision = can(actor, 'students.manage', {
        organizationId: orgId,
        cohortId: cohort ? cohort.id : null,
        departmentId: cohort?.departmentId ?? departmentId ?? null,
      })
      if (!decision.allowed) throw new ApiError('NOT_FOUND', 'Not found')
      return
    }
    const decision = can(actor, 'team.manage', { organizationId: orgId })
    if (!decision.allowed) throw new ApiError('NOT_FOUND', 'Not found')
    const isOwner = actor.memberships.some((m) => m.organizationId === orgId && m.status === 'ACTIVE' && ['ORG_OWNER', 'STUDAI_ADMIN'].includes(m.role))
    if (role === 'ORG_OWNER' && !isOwner) throw new ApiError('FORBIDDEN', 'Only an organization owner can invite another owner.')
    if (decision.scope === 'LIMITED' && role !== 'FACULTY_MENTOR') throw new ApiError('FORBIDDEN', 'Your role can invite faculty mentors only.')
    // Nobody can hand out access they do not hold: a cohort or department on
    // a staff invite must already be within the inviter's own reach.
    if (decision.scope !== 'ALL' && (cohort || departmentId)) {
      const reach = can(actor, 'cohorts.read', {
        organizationId: orgId,
        cohortId: cohort ? cohort.id : null,
        departmentId: cohort?.departmentId ?? departmentId ?? null,
      })
      if (!reach.allowed) throw new ApiError('NOT_FOUND', 'Not found')
    }
  }

  // Multi-write unit: the store's transaction when it has one (both campus
  // stores do), otherwise the plain repositories (test doubles).
  const inTransaction = (fn) => (typeof repos.transaction === 'function' ? repos.transaction(fn) : fn(repos))

  async function loadInvite(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null
    return repos.memberships.findInviteByTokenHash(hashToken(token))
  }

  function assertUsable(invite, user) {
    if (!invite || invite.status === 'REVOKED' || invite.organizationStatus !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'This invitation is not valid.')
    if (invite.status === 'ACCEPTED') {
      if (invite.acceptedBy === user.id) return 'ALREADY_ACCEPTED'
      throw new ApiError('CONFLICT', 'This invitation has already been used.')
    }
    if (invite.status === 'DECLINED') throw new ApiError('CONFLICT', 'This invitation was declined.')
    if (new Date(invite.expiresAt) <= clock()) throw new ApiError('INVITE_EXPIRED', 'This invitation has expired. Ask your institution for a new one.')
    if (String(user.email).trim().toLowerCase() !== invite.email) {
      throw new ApiError('INVITE_EMAIL_MISMATCH', 'This invitation was sent to a different email address. Sign in with that account to accept it.')
    }
    return 'PENDING'
  }

  return {
    // delivery 'SEND' (default): each email is sent inside the request, as
    // before. 'QUEUE' (CSV import while PRISM_JOB_WORKER is on, PROD-READY
    // Phase 5): every invite and its email job are written in one
    // transaction; the invite holds an unusable placeholder token until the
    // job issues the real link (deliverQueuedInvite) — the job payload is the
    // invite id only, never the address or the token.
    async createInvites({ actor, orgId, role, emails, cohortId = null, departmentId = null, delivery = 'SEND' }) {
      const org = await repos.organizations.getOrganization(orgId)
      if (!org || org.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'Not found')
      const cohort = cohortId ? await repos.organizations.getCohort(cohortId) : null
      if (cohortId && (!cohort || cohort.organizationId !== orgId)) throw new ApiError('VALIDATION_FAILED', 'Unknown cohort.')
      if (departmentId) {
        const dept = await repos.organizations.getDepartment(departmentId)
        if (!dept || dept.organizationId !== orgId) throw new ApiError('VALIDATION_FAILED', 'Unknown department.')
      }
      await assertMayInvite({ actor, orgId, role, cohort, departmentId })
      const unique = [...new Set(emails.map((e) => String(e).trim().toLowerCase()))]
      const expiresAt = new Date(clock().getTime() + INVITE_TTL_DAYS * 86400000).toISOString()
      const results = []
      if (delivery === 'QUEUE') {
        await inTransaction(async (tx) => {
          for (const email of unique) {
            const invite = await tx.memberships.createInvite({
              organizationId: orgId, email, role, cohortId, departmentId: cohort?.departmentId ?? departmentId, tokenHash: hashToken(randomBytes(32).toString('base64url')), invitedBy: actor.userId, expiresAt,
            })
            await tx.jobs.enqueue({ kind: 'campus.invite_email', payload: { inviteId: invite.id }, dedupeKey: invite.id })
            results.push({ id: invite.id, email, role, expiresAt, delivery: 'QUEUED' })
          }
        })
        audit('campus.membership.changed', null, { action: 'INVITED', organizationId: orgId, role, count: results.length, actorUserId: actor.userId, delivery: 'QUEUED' })
        return results
      }
      for (const email of unique) {
        const token = tokenFactory()
        const invite = await repos.memberships.createInvite({
          organizationId: orgId, email, role, cohortId, departmentId: cohort?.departmentId ?? departmentId, tokenHash: hashToken(token), invitedBy: actor.userId, expiresAt,
        })
        let delivery = 'NOT_SENT'
        try {
          delivery = (await sendInviteEmail({ to: email, organizationName: org.name, inviteUrl: inviteUrlFor(token) })) ? 'SENT' : 'NOT_SENT'
        } catch {
          delivery = 'NOT_SENT'
        }
        results.push({ id: invite.id, email, role, expiresAt, delivery })
      }
      audit('campus.membership.changed', null, { action: 'INVITED', organizationId: orgId, role, count: results.length, actorUserId: actor.userId })
      return results
    },

    // Job handler for 'campus.invite_email' (idempotent): an invite that is
    // no longer PENDING, has expired or whose organization is not active is
    // skipped; otherwise a fresh link token replaces the stored hash and the
    // email is sent. A transport failure throws (the job retries with
    // backoff); a retry issues a new token, so only the latest email's link
    // works. Mail not configured → NOT_SENT, like the synchronous path.
    async deliverQueuedInvite(inviteId) {
      const invite = await repos.memberships.getInviteById(inviteId)
      if (!invite) return { outcome: 'GONE' }
      if (invite.status !== 'PENDING') return { outcome: 'NOT_PENDING' }
      if (invite.organizationStatus !== 'ACTIVE') return { outcome: 'ORGANIZATION_INACTIVE' }
      if (new Date(invite.expiresAt) <= clock()) return { outcome: 'EXPIRED' }
      const token = tokenFactory()
      if (!(await repos.memberships.setPendingInviteTokenHash(invite.id, hashToken(token)))) return { outcome: 'NOT_PENDING' }
      const sent = await sendInviteEmail({ to: invite.email, organizationName: invite.organizationName, inviteUrl: inviteUrlFor(token) })
      return { outcome: sent ? 'SENT' : 'NOT_SENT' }
    },

    async getInvite(token) {
      const invite = await loadInvite(token)
      if (!invite || invite.status === 'REVOKED' || invite.organizationStatus !== 'ACTIVE') return null
      return {
        organizationId: invite.organizationId,
        organizationName: invite.organizationName,
        role: invite.role,
        status: invite.status,
        expired: new Date(invite.expiresAt) <= clock(),
        expiresAt: invite.expiresAt,
        emailHint: maskEmail(invite.email),
        disclosureVersion: CAMPUS_DISCLOSURE_COPY_VERSION,
      }
    },

    async acceptInvite({ token, user, acknowledged }) {
      const invite = await loadInvite(token)
      const state = assertUsable(invite, user)
      const type = workspaceTypeForRole(invite.role)
      if (state === 'ALREADY_ACCEPTED') {
        const workspace = await repos.workspaces.upsertWorkspace({ type, ownerUserId: user.id, organizationId: invite.organizationId, name: invite.organizationName })
        return { workspaceId: workspace.id, workspaceType: type, organizationId: invite.organizationId, role: invite.role, alreadyAccepted: true }
      }
      if (acknowledged !== true) throw new ApiError('VALIDATION_FAILED', 'Please confirm you have read what your institution can and cannot see.')
      const existing = (await repos.memberships.listMembershipsForUser(user.id))
        .find((m) => m.organizationId === invite.organizationId && m.role === invite.role)
      if (existing && ['SUSPENDED', 'REMOVED'].includes(existing.status)) {
        throw new ApiError('FORBIDDEN', 'Your membership with this institution is not active. Contact your institution.')
      }
      // PROD-READY Phase 3 (S6 family): consent, membership, workspace,
      // cohort membership (and the roster sync it triggers) and the invite
      // status are written in ONE repository transaction, so a failure leaves
      // no partial acceptance. The invite row is re-read under the
      // transaction and must still be PENDING, so two concurrent acceptances
      // cannot both run the writes.
      const workspace = await inTransaction(async (tx) => {
        const current = typeof tx.memberships.lockInvite === 'function' ? await tx.memberships.lockInvite(invite.id) : invite
        if (!current) throw new ApiError('NOT_FOUND', 'This invitation is not valid.')
        if (current.status !== 'PENDING') {
          if (current.status === 'ACCEPTED' && current.acceptedBy === user.id) return null
          throw new ApiError('CONFLICT', 'This invitation has already been used.')
        }
        // Consent first: an ACTIVE sponsor membership never exists without
        // the disclosure the student acknowledged (once per copy version).
        const prior = (await tx.sharing.listConsents(user.id)).some((c) =>
          c.organizationId === invite.organizationId && c.consentType === 'CAMPUS_SPONSORSHIP_DISCLOSURE'
          && c.copyVersion === CAMPUS_DISCLOSURE_COPY_VERSION && !c.withdrawnAt)
        if (!prior) {
          await tx.sharing.recordConsent({
            userId: user.id, organizationId: invite.organizationId, consentType: 'CAMPUS_SPONSORSHIP_DISCLOSURE',
            copyVersion: CAMPUS_DISCLOSURE_COPY_VERSION, grantedAt: clock().toISOString(),
          })
        }
        // A staff invite adds its cohort to any cohorts already assigned.
        const priorCohorts = Array.isArray(existing?.scope?.cohortIds) ? existing.scope.cohortIds : []
        const scope = invite.role !== 'STUDENT' && invite.cohortId
          ? { ...(existing?.scope || {}), cohortIds: [...new Set([...priorCohorts, invite.cohortId])] }
          : {}
        await tx.memberships.upsertMembership({
          organizationId: invite.organizationId, userId: user.id, role: invite.role, status: 'ACTIVE',
          departmentId: invite.departmentId, scope, invitedBy: invite.invitedBy,
        })
        const ws = await tx.workspaces.upsertWorkspace({ type, ownerUserId: user.id, organizationId: invite.organizationId, name: invite.organizationName })
        if (invite.role === 'STUDENT' && invite.cohortId) {
          await tx.organizations.addCohortMember({ cohortId: invite.cohortId, userId: user.id, addedBy: invite.invitedBy })
          await onCohortJoined({ organizationId: invite.organizationId, cohortId: invite.cohortId, userId: user.id, repos: tx })
        }
        await tx.memberships.updateInvite(invite.id, { status: 'ACCEPTED', acceptedBy: user.id, acceptedAt: clock().toISOString() })
        return ws
      })
      if (!workspace) {
        const ws = await repos.workspaces.upsertWorkspace({ type, ownerUserId: user.id, organizationId: invite.organizationId, name: invite.organizationName })
        return { workspaceId: ws.id, workspaceType: type, organizationId: invite.organizationId, role: invite.role, alreadyAccepted: true }
      }
      audit('campus.membership.changed', null, { action: 'ACCEPTED', organizationId: invite.organizationId, role: invite.role, userId: user.id })
      return { workspaceId: workspace.id, workspaceType: type, organizationId: invite.organizationId, role: invite.role, alreadyAccepted: false }
    },

    async declineInvite({ token, user }) {
      const invite = await loadInvite(token)
      const state = assertUsable(invite, user)
      if (state === 'ALREADY_ACCEPTED') throw new ApiError('CONFLICT', 'This invitation has already been accepted.')
      await repos.memberships.updateInvite(invite.id, { status: 'DECLINED' })
      audit('campus.membership.changed', null, { action: 'DECLINED', organizationId: invite.organizationId, role: invite.role, userId: user.id })
      return { declined: true }
    },
  }
}
