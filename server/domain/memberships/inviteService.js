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
    async createInvites({ actor, orgId, role, emails, cohortId = null, departmentId = null }) {
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
      // Consent first: an ACTIVE sponsor membership never exists without the
      // disclosure the student acknowledged (recorded once per copy version).
      // Membership/workspace/cohort writes are upserts and the invite is
      // marked ACCEPTED last, so a retry completes a partial acceptance.
      const prior = (await repos.sharing.listConsents(user.id)).some((c) =>
        c.organizationId === invite.organizationId && c.consentType === 'CAMPUS_SPONSORSHIP_DISCLOSURE'
        && c.copyVersion === CAMPUS_DISCLOSURE_COPY_VERSION && !c.withdrawnAt)
      if (!prior) {
        await repos.sharing.recordConsent({
          userId: user.id, organizationId: invite.organizationId, consentType: 'CAMPUS_SPONSORSHIP_DISCLOSURE',
          copyVersion: CAMPUS_DISCLOSURE_COPY_VERSION, grantedAt: clock().toISOString(),
        })
      }
      // A staff invite adds its cohort to any cohorts already assigned.
      const priorCohorts = Array.isArray(existing?.scope?.cohortIds) ? existing.scope.cohortIds : []
      const scope = invite.role !== 'STUDENT' && invite.cohortId
        ? { ...(existing?.scope || {}), cohortIds: [...new Set([...priorCohorts, invite.cohortId])] }
        : {}
      await repos.memberships.upsertMembership({
        organizationId: invite.organizationId, userId: user.id, role: invite.role, status: 'ACTIVE',
        departmentId: invite.departmentId, scope, invitedBy: invite.invitedBy,
      })
      const workspace = await repos.workspaces.upsertWorkspace({ type, ownerUserId: user.id, organizationId: invite.organizationId, name: invite.organizationName })
      if (invite.role === 'STUDENT' && invite.cohortId) {
        await repos.organizations.addCohortMember({ cohortId: invite.cohortId, userId: user.id, addedBy: invite.invitedBy })
        await onCohortJoined({ organizationId: invite.organizationId, cohortId: invite.cohortId, userId: user.id })
      }
      await repos.memberships.updateInvite(invite.id, { status: 'ACCEPTED', acceptedBy: user.id, acceptedAt: clock().toISOString() })
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
