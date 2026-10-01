// Data-access audit (contract §4, §10): every campus read of student-level
// data writes an append-only data_access_audit_events row. The write happens
// BEFORE the data is returned; if it fails, the read fails (fail closed).
export function createDataAccessAudit({ repos }) {
  return {
    async record({ req, organizationId, subjectUserId, resourceType, resourceId, action = 'READ', purpose = null }) {
      return repos.audit.recordDataAccess({
        actorUserId: req.user.id,
        organizationId,
        subjectUserId,
        resourceType,
        resourceId: resourceId == null ? null : String(resourceId),
        action,
        purpose,
        requestId: req.requestId || null,
      })
    },
  }
}
