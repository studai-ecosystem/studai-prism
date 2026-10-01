// Artifact state for the V3 player (spec §39.3; C5.08). Per work material it
// tracks the server snapshot (data + notes + version), the optimistic local
// copy, the unsaved change queue, and a conflict state. Writes carry If-Match;
// on a 409 the server wins by default and the candidate's draft (data AND
// reasoning) is kept in a recoverable panel — never silently dropped, never
// silently overwritten.
import { newIdempotencyKey } from '../../../api/client.js'

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)))
const UNSAVED = new Set(['DIRTY', 'ERROR', 'SAVING', 'CONFLICT'])

export function createArtifactStore({ save }) {
  let items = new Map()
  const listeners = new Set()
  let snapshot = { items: [] }

  function emit() {
    snapshot = { items: [...items.values()].map((i) => ({ ...i })) }
    for (const l of listeners) l()
  }
  const patch = (id, next) => {
    items.set(id, { ...items.get(id), ...next })
    emit()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,

    // Load (or refresh after resume) from the session contract. Unsaved local
    // work is kept; clean items take the server's state.
    load(artifacts = []) {
      const next = new Map()
      for (const a of artifacts) {
        const prev = items.get(a.artifactId)
        const serverNotes = typeof a.notes === 'string' ? a.notes : ''
        if (prev && UNSAVED.has(prev.status)) {
          next.set(a.artifactId, { ...prev, server: { data: clone(a.data), version: a.version, notes: serverNotes } })
        } else {
          next.set(a.artifactId, {
            artifactId: a.artifactId, type: a.type, title: a.title,
            server: { data: clone(a.data), version: a.version, notes: serverNotes },
            local: clone(a.data), pending: null, notes: serverNotes, notesDirty: false,
            status: 'SAVED', error: null, conflict: null, recovered: null, clientEventId: null,
          })
        }
      }
      items = next
      emit()
    },

    edit(artifactId, updates) {
      const it = items.get(artifactId)
      if (!it) return
      // During a conflict, new edits join the recoverable draft; the conflict
      // stays visible until the candidate chooses what to keep.
      if (it.status === 'CONFLICT') {
        patch(artifactId, { recovered: { ...(it.recovered || {}), pending: { ...(it.recovered?.pending || {}), ...updates } } })
        return
      }
      patch(artifactId, {
        local: { ...(it.local || {}), ...updates },
        pending: { ...(it.pending || {}), ...updates },
        status: it.status === 'SAVING' ? 'SAVING' : 'DIRTY',
        error: null,
      })
    },

    setNotes(artifactId, notes) {
      const it = items.get(artifactId)
      if (!it) return
      if (it.status === 'CONFLICT') {
        patch(artifactId, { recovered: { ...(it.recovered || {}), notes } })
        return
      }
      patch(artifactId, { notes, notesDirty: true, status: it.status === 'SAVING' ? 'SAVING' : 'DIRTY', pending: it.pending || {}, error: null })
    },

    hasUnsaved() {
      return [...items.values()].some((i) => UNSAVED.has(i.status))
    },

    // Send the queued changes for one material. Safe to call repeatedly.
    async flush(artifactId) {
      const it = items.get(artifactId)
      if (!it || it.status === 'SAVING' || it.status === 'CONFLICT' || !it.pending) return it?.status || null
      const updates = it.pending
      const notes = it.notesDirty ? it.notes : undefined
      const payloadKey = JSON.stringify({ updates, notes })
      // One client event id per attempt payload: a retry of the SAME change is
      // recognised by the server; a new change gets a new id.
      const clientEventId = it.clientEventId && it.lastSent === payloadKey ? it.clientEventId : newIdempotencyKey('art')
      patch(artifactId, { status: 'SAVING', pending: null, notesDirty: false, clientEventId, lastSent: payloadKey })
      try {
        const out = await save(artifactId, { updates, notes, ifMatch: it.server.version, clientEventId })
        const now = items.get(artifactId)
        const stillDirty = Boolean(now.pending) || now.notesDirty
        const savedNotes = typeof out.notes === 'string' ? out.notes : (notes ?? it.server.notes)
        patch(artifactId, {
          server: { data: clone(out.data), version: out.version, notes: savedNotes },
          status: stillDirty ? 'DIRTY' : 'SAVED',
          local: stillDirty ? now.local : clone(out.data),
          notes: now.notesDirty ? now.notes : savedNotes,
          error: null,
          clientEventId: null,
          lastSent: null,
        })
        return stillDirty ? 'DIRTY' : 'SAVED'
      } catch (error) {
        const now = items.get(artifactId)
        const merged = { ...updates, ...(now.pending || {}) }
        const draftNotes = notes !== undefined || now.notesDirty ? now.notes : null
        if (error?.status === 409 && error.details) {
          const server = error.details.artifact
          const serverNotes = typeof server?.notes === 'string' ? server.notes : it.server.notes
          patch(artifactId, {
            status: 'CONFLICT',
            conflict: { version: error.details.version, data: clone(server?.data ?? null) },
            // Server wins on screen; the candidate's draft stays recoverable.
            recovered: { local: clone(now.local), pending: merged, notes: draftNotes },
            server: { data: clone(server?.data ?? now.server.data), version: error.details.version, notes: serverNotes },
            local: clone(server?.data ?? now.server.data),
            notes: serverNotes,
            notesDirty: false,
            pending: null,
            error: null,
          })
          return 'CONFLICT'
        }
        patch(artifactId, { status: 'ERROR', pending: merged, notesDirty: draftNotes !== null, error })
        return 'ERROR'
      }
    },

    async flushAll() {
      const ids = [...items.keys()]
      const results = await Promise.all(ids.map((id) => this.flush(id)))
      return results
    },

    // Resolve a conflict: keep the server's version (discard the draft), or
    // re-apply the draft on top of the server's latest version.
    resolveConflict(artifactId, choice) {
      const it = items.get(artifactId)
      if (!it || it.status !== 'CONFLICT') return
      if (choice === 'KEEP_SERVER') {
        patch(artifactId, { status: 'SAVED', conflict: null, recovered: null, pending: null, local: clone(it.server.data), notes: it.server.notes, notesDirty: false })
        return
      }
      const draft = it.recovered
      const reapplyNotes = typeof draft?.notes === 'string'
      patch(artifactId, {
        status: 'DIRTY',
        conflict: null,
        local: { ...(it.server.data || {}), ...(draft?.pending || {}) },
        pending: draft?.pending || {},
        notes: reapplyNotes ? draft.notes : it.server.notes,
        notesDirty: reapplyNotes,
        recovered: null,
      })
    },
  }
}
