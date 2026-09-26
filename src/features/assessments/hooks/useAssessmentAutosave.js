// Autosave for work materials (spec §12.2; C5.10): debounced flush after an
// edit, immediate flush when the tab is hidden or the connection returns, and
// a leave-page warning while anything is unsaved. Every write is idempotent
// (client event id) and versioned (If-Match) by the artifact store.
import { useEffect, useSyncExternalStore } from 'react'

export function useArtifactStoreState(store) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useAssessmentAutosave(store, { delayMs = 1200, retryMs = 4000 } = {}) {
  const state = useArtifactStoreState(store)

  useEffect(() => {
    const dirty = state.items.filter((i) => i.status === 'DIRTY')
    const failed = state.items.filter((i) => i.status === 'ERROR')
    if (dirty.length === 0 && failed.length === 0) return undefined
    const t = setTimeout(() => {
      for (const i of [...dirty, ...failed]) store.flush(i.artifactId)
    }, dirty.length ? delayMs : retryMs)
    return () => clearTimeout(t)
  }, [state, store, delayMs, retryMs])

  useEffect(() => {
    const flush = () => { store.flushAll() }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    const onBeforeUnload = (e) => {
      if (!store.hasUnsaved()) return undefined
      flush()
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('online', flush)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('online', flush)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [store])

  return state
}

export default useAssessmentAutosave
