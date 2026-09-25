// resolveWorkspace — X-Prism-Workspace header → a workspace the caller can use.
// Missing header = PERSONAL. A workspace the caller does not hold → 403.
import { ApiError } from '../http/errors.js'

const HEADER_ID = /^(personal|[0-9a-f-]{36})$/i

export function createResolveWorkspace({ workspaceService }) {
  return async function resolveWorkspace(req, _res, next) {
    try {
      const header = req.get('x-prism-workspace')
      if (header && !HEADER_ID.test(header)) return next(new ApiError('VALIDATION_FAILED', 'Unknown workspace.'))
      const workspace = await workspaceService.getWorkspace(req.user, header || 'personal')
      if (!workspace) return next(new ApiError('FORBIDDEN', 'You do not have access to this workspace.'))
      req.workspace = workspace
      return next()
    } catch (err) {
      return next(err)
    }
  }
}
