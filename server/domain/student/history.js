// Authorized history projection (P1.2). One list over the caller's owned
// records in the active workspace: formal sessions, legacy reports and
// practice attempts, each with its source id and type kept apart. Nothing is
// stored here — the projection is rebuilt from the session directory (owner
// + workspace scoped) and the development ledger. Dates are stored facts
// only; an unknown date stays null (never the clock). Practice is a separate
// mode and never changes a formal record. P7 adds the learner's private
// PREPARATION attempts and SELF_REPORT check-ins (PERSONAL workspace only),
// each its own sourceType and mode, never grouped with formal items.
import { z } from 'zod'
import { ApiError } from '../http/errors.js'
import { isEnabled } from '../flags/index.js'
import { CORE_DEFINITION_ID, definitionForScenario } from '../assessments/catalog.js'
import { playerPath, reportPath, reportV3 } from '../assessments/assignmentService.js'

export const HISTORY_PAGE_DEFAULT = 20
export const HISTORY_PAGE_MAX = 50
// A finished session whose report has not appeared after this long is a
// technical failure to recover from, not a result still being processed.
export const PROCESSING_GRACE_MS = 24 * 60 * 60 * 1000

const workspaceV3 = () => isEnabled('PRISM_ASSESSMENT_WORKSPACE_V3')
const iso = z.string().datetime({ offset: true }).nullable()

export const HistoryItemSchema = z.object({
  id: z.string().min(1),
  sourceType: z.enum(['FORMAL_SESSION', 'LEGACY_REPORT', 'PRACTICE_ATTEMPT', 'PREPARATION_ATTEMPT', 'SELF_REPORT']),
  sourceId: z.string().min(1),
  mode: z.enum(['FORMAL', 'PRACTICE', 'PREPARATION', 'SELF_REPORT']),
  title: z.string().nullable(),
  startedAt: iso,
  completedAt: iso,
  issuedAt: iso,
  scope: z.enum(['PERSONAL', 'SPONSORED']),
  sponsorOrganizationId: z.string().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'PROCESSING', 'TECHNICAL_FAILED', 'UNDER_REVIEW', 'LEGACY', 'ABANDONED']),
  reportFormat: z.enum(['V3', 'LEGACY_V2']).nullable(),
  permittedAction: z.object({ kind: z.enum(['VIEW_REPORT', 'RESUME', 'RECOVER', 'VIEW', 'NONE']), to: z.string().nullable() }),
  recoveryState: z.enum(['NONE', 'RESUMABLE', 'AWAITING_REPORT', 'RECOVERABLE', 'SUPPORT_REQUIRED', 'HELD']),
  // Practice only (P2.8): the formal session this practice was started from,
  // by id. The two records stay separately typed; this is the link between them.
  linkedSessionId: z.string().nullable().optional(),
  // Practice only (P6.7): enough to offer a fresh challenge for the same
  // capability from history, and to say whether this attempt was uncoached.
  practice: z.object({
    capabilityId: z.string().nullable(),
    assistanceMode: z.enum(['GUIDED', 'UNCOACHED']),
    variant: z.enum(['BASE', 'TRANSFER']),
  }).strict().optional(),
}).strict()

export const HistoryPageSchema = z.object({ items: z.array(HistoryItemSchema), nextCursor: z.string().nullable() }).strict()

const encodeCursor = (offset) => Buffer.from(String(offset), 'utf8').toString('base64url')
function decodeCursor(cursor) {
  if (cursor == null || cursor === '') return 0
  const n = Number(Buffer.from(String(cursor), 'base64url').toString('utf8'))
  if (!Number.isInteger(n) || n < 0) throw new ApiError('VALIDATION_FAILED', 'That page reference is not valid.')
  return n
}

const sortKey = (i) => i.completedAt || i.issuedAt || i.startedAt || ''

const EMPTY_PREPARATION = { listAttemptHistory: async () => [], listCheckinHistory: async () => [] }

export function createStudentHistory({ directory, catalog, legacy, practice = { listAttemptHistory: async () => [] }, preparation = EMPTY_PREPARATION, clock = () => new Date() }) {
  const paths = legacy.paths

  function formalItem(s, workspace, cat, at) {
    const sponsored = s.scope === 'SPONSORED'
    const definitionId = definitionForScenario(cat, s.scenarioId)
    const definition = cat.definitions.find((d) => d.id === definitionId) || null
    const bank = Boolean(definitionId) && definitionId !== CORE_DEFINITION_ID
    const sourceType = s.hasSession ? 'FORMAL_SESSION' : 'LEGACY_REPORT'
    const reportFormat = s.hasReport ? (s.hasPublishedReport && reportV3() ? 'V3' : 'LEGACY_V2') : null
    const resumeTo = workspaceV3()
      ? playerPath(s.sessionId, sponsored ? workspace.id : null)
      : (sponsored ? null : paths.resume(s.sessionId, bank))
    let status
    let action = { kind: 'NONE', to: null }
    let recoveryState = 'NONE'
    if (s.integrity !== 'OK') {
      status = 'UNDER_REVIEW'
      recoveryState = 'HELD'
    } else if (s.hasReport) {
      status = sourceType === 'LEGACY_REPORT' ? 'LEGACY' : 'COMPLETED'
      action = { kind: 'VIEW_REPORT', to: reportPath(paths, s.sessionId, bank, sponsored ? workspace.organizationId : null, s.hasPublishedReport) }
    } else if (s.sessionCompletedAt) {
      const age = at.getTime() - new Date(s.sessionCompletedAt).getTime()
      if (age > PROCESSING_GRACE_MS) {
        status = 'TECHNICAL_FAILED'
        action = resumeTo ? { kind: 'RECOVER', to: resumeTo } : { kind: 'NONE', to: null }
        recoveryState = resumeTo ? 'RECOVERABLE' : 'SUPPORT_REQUIRED'
      } else {
        status = 'PROCESSING'
        recoveryState = 'AWAITING_REPORT'
      }
    } else if (s.hasSession) {
      status = 'ACTIVE'
      action = resumeTo ? { kind: 'RESUME', to: resumeTo } : { kind: 'NONE', to: null }
      recoveryState = 'RESUMABLE'
    } else {
      status = 'LEGACY'
      recoveryState = 'SUPPORT_REQUIRED'
    }
    return {
      id: `${sourceType}:${s.sessionId}`,
      sourceType,
      sourceId: s.sessionId,
      mode: 'FORMAL',
      title: definition?.title || null,
      startedAt: s.startedAt || null,
      completedAt: s.reportIssuedAt || s.sessionCompletedAt || null,
      issuedAt: s.reportIssuedAt || null,
      scope: s.scope,
      sponsorOrganizationId: s.sponsorOrganizationId || null,
      status,
      reportFormat,
      permittedAction: action,
      recoveryState,
    }
  }

  function practiceItem(a, workspace) {
    const sponsored = workspace.type === 'CAMPUS_STUDENT'
    const open = a.status === 'IN_PROGRESS'
    const missionTo = sponsored
      ? `/app/campus/${encodeURIComponent(workspace.organizationId)}/development/missions/${encodeURIComponent(a.missionId)}`
      : `/app/development/missions/${encodeURIComponent(a.missionId)}`
    return {
      id: `PRACTICE_ATTEMPT:${a.id}`,
      sourceType: 'PRACTICE_ATTEMPT',
      sourceId: a.id,
      mode: 'PRACTICE',
      title: a.title || null,
      startedAt: a.startedAt || null,
      completedAt: a.submittedAt || null,
      issuedAt: null,
      scope: sponsored ? 'SPONSORED' : 'PERSONAL',
      sponsorOrganizationId: sponsored ? workspace.organizationId : null,
      status: open ? 'ACTIVE' : 'COMPLETED',
      reportFormat: null,
      // A finished practice attempt stays readable (P6.5): VIEW opens the
      // player on that attempt's feedback.
      permittedAction: open ? { kind: 'RESUME', to: missionTo } : { kind: 'VIEW', to: `${missionTo}?attempt=${encodeURIComponent(a.id)}` },
      recoveryState: open ? 'RESUMABLE' : 'NONE',
      linkedSessionId: a.origin?.kind === 'ASSESSMENT_MOMENT' ? a.origin.sessionId : null,
      practice: { capabilityId: a.capabilityId || null, assistanceMode: a.assistance?.mode === 'UNCOACHED' ? 'UNCOACHED' : 'GUIDED', variant: a.variant === 'TRANSFER' ? 'TRANSFER' : 'BASE' },
    }
  }

  // P7: private preparation and the learner's own SELF_REPORT check-ins.
  // Both are PERSONAL-only, separately typed and never part of a formal group.
  function preparationItem(a) {
    const open = a.state === 'DRAFT' || a.state === 'REHEARSING'
    const to = `/app/prepare/${encodeURIComponent(a.id)}`
    return {
      id: `PREPARATION_ATTEMPT:${a.id}`,
      sourceType: 'PREPARATION_ATTEMPT',
      sourceId: a.id,
      mode: 'PREPARATION',
      title: a.title || null,
      startedAt: a.createdAt || null,
      completedAt: a.completedAt || null,
      issuedAt: null,
      scope: 'PERSONAL',
      sponsorOrganizationId: null,
      status: open ? 'ACTIVE' : a.state === 'ABANDONED' ? 'ABANDONED' : 'COMPLETED',
      reportFormat: null,
      permittedAction: { kind: open ? 'RESUME' : 'VIEW', to },
      recoveryState: open ? 'RESUMABLE' : 'NONE',
    }
  }

  function checkinItem(c) {
    return {
      id: `SELF_REPORT:${c.id}`,
      sourceType: 'SELF_REPORT',
      sourceId: c.id,
      mode: 'SELF_REPORT',
      title: 'Your own note',
      startedAt: null,
      completedAt: c.createdAt || null,
      issuedAt: null,
      scope: 'PERSONAL',
      sponsorOrganizationId: null,
      status: 'COMPLETED',
      reportFormat: null,
      permittedAction: c.sourceType === 'PREPARATION' && c.sourceId
        ? { kind: 'VIEW', to: `/app/prepare/${encodeURIComponent(c.sourceId)}` }
        : { kind: 'NONE', to: null },
      recoveryState: 'NONE',
    }
  }

  return {
    async list(user, workspace, { cursor = null, limit = HISTORY_PAGE_DEFAULT } = {}) {
      const offset = decodeCursor(cursor)
      const size = Math.min(Math.max(1, Number(limit) || HISTORY_PAGE_DEFAULT), HISTORY_PAGE_MAX)
      const at = clock()
      const personal = workspace.type === 'PERSONAL'
      const [cat, sessions, attempts, preparations, checkins] = await Promise.all([
        catalog.getCatalog(),
        directory.listSessions(user, workspace),
        practice.listAttemptHistory(user, workspace),
        personal ? preparation.listAttemptHistory(user, workspace) : [],
        personal ? preparation.listCheckinHistory(user, workspace) : [],
      ])
      const all = [
        ...sessions.map((s) => formalItem(s, workspace, cat, at)),
        ...attempts.map((a) => practiceItem(a, workspace)),
        ...preparations.map(preparationItem),
        ...checkins.map(checkinItem),
      ].sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || a.id.localeCompare(b.id))
      const page = all.slice(offset, offset + size)
      const nextCursor = offset + size < all.length ? encodeCursor(offset + size) : null
      // Fail closed: a malformed projection is an internal error, never a
      // partially shaped record on screen.
      return HistoryPageSchema.parse({ items: page, nextCursor })
    },
  }
}
