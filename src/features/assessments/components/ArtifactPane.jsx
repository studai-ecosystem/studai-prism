import { useMemo } from 'react'
import ArtifactRenderer, { isSupportedArtifactType } from '../../../components/artifacts/ArtifactRenderer.jsx'
import { LinkButton } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { formatValue, humanizeKey } from '../../../components/artifacts/format.js'

function ConflictPanel({ item, onResolve }) {
  const draft = item.recovered?.pending || {}
  const draftNotes = typeof item.recovered?.notes === 'string' ? item.recovered.notes : null
  return (
    <Callout tone="partial" title="This work material changed elsewhere" role="alert">
      <p>The saved version is shown. Your unsaved changes are kept below so you can re-apply them.</p>
      <ul className="mt-2 list-disc pl-5 text-sm" data-testid="recovered-draft">
        {Object.entries(draft).map(([k, v]) => (
          <li key={k}>{humanizeKey(k)}: {typeof v === 'object' ? Object.entries(v || {}).map(([a, b]) => `${humanizeKey(a)} ${formatValue(b)}`).join(', ') : formatValue(v)}</li>
        ))}
        {draftNotes !== null && <li className="whitespace-pre-wrap">Your reasoning: {draftNotes || '(empty)'}</li>}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onResolve('KEEP_SERVER')}>Keep the saved version</Button>
        <Button size="sm" onClick={() => onResolve('REAPPLY')}>Re-apply my changes</Button>
      </div>
    </Callout>
  )
}

// P3.5/T11: a work material that is part of this assessment but did not load
// is a recovery state with retry, never a silent conversation-only layout.
export const materialMissing = (item) => Boolean(item) && (item.local == null || !isSupportedArtifactType(item.type))

function MaterialRecovery({ item, onRetry, retrying }) {
  const unsupported = !isSupportedArtifactType(item.type)
  return (
    <Callout tone="blocked" title={`${item.title || 'This work material'} did not load`} role="alert">
      <p data-testid="material-recovery">
        {unsupported
          ? 'This work material cannot be shown on this version of the assessment. Your saved work is kept. Contact support before you finish; the conversation alone is not the whole task.'
          : 'This assessment needs this work material, but it did not load. Your saved work is kept. Try loading it again; the clock keeps running.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!unsupported && onRetry && <Button size="sm" onClick={onRetry} loading={retrying} loadingLabel="Loading…">Load work material again</Button>}
        <LinkButton size="sm" variant="secondary" to="/contact">Contact support</LinkButton>
      </div>
    </Callout>
  )
}

// Work materials (spec §12.1): every tab, its content and its save state come
// from the server contract and the versioned artifact store.
export function ArtifactPane({ items, activeId, onSelect, store, onRetryLoad, retrying = false }) {
  const active = items.find((i) => i.artifactId === activeId) || items[0] || null
  const controller = useMemo(() => active && ({
    autosave: true,
    saveState: active.status,
    notes: active.notes,
    onChange: (updates) => store.edit(active.artifactId, updates),
    onNotes: (text) => store.setNotes(active.artifactId, text),
    save: async () => {
      const out = await store.flush(active.artifactId)
      if (out === 'ERROR' || out === 'CONFLICT') throw new Error('Not saved')
      return out
    },
  }), [active, store])

  if (items.length === 0) {
    return <p className="p-6 text-sm text-prism-ink-muted">This assessment has no work materials. Everything happens in the conversation.</p>
  }
  const label = (art, i) => art.title || `Work material ${i + 1}`
  // Tabs pattern: one Tab stop; arrow keys, Home and End move between tabs.
  const onKeyDown = (e) => {
    const idx = items.findIndex((i) => i.artifactId === active?.artifactId)
    const last = items.length - 1
    const next = e.key === 'ArrowRight' ? (idx >= last ? 0 : idx + 1)
      : e.key === 'ArrowLeft' ? (idx <= 0 ? last : idx - 1)
        : e.key === 'Home' ? 0
          : e.key === 'End' ? last
            : null
    if (next === null) return
    e.preventDefault()
    onSelect(items[next].artifactId)
    document.getElementById(`tab-${items[next].artifactId}`)?.focus()
  }
  return (
    <>
      <div role="tablist" aria-label="Work materials" onKeyDown={onKeyDown} className="flex shrink-0 gap-2 overflow-x-auto border-b border-prism-border p-2 lg:flex-wrap lg:overflow-visible">
        {items.map((art, i) => {
          const selected = active?.artifactId === art.artifactId
          return (
            <button
              key={art.artifactId}
              type="button"
              role="tab"
              id={`tab-${art.artifactId}`}
              aria-selected={selected}
              aria-controls="artifact-panel"
              tabIndex={selected ? 0 : -1}
              title={label(art, i)}
              onClick={() => onSelect(art.artifactId)}
              className={selected
                ? 'max-w-[16rem] shrink-0 truncate rounded-[var(--prism-radius-md)] bg-prism-accent px-3 py-1.5 text-sm font-medium text-prism-accent-ink'
                : 'max-w-[16rem] shrink-0 truncate rounded-[var(--prism-radius-md)] bg-prism-subtle px-3 py-1.5 text-sm font-medium text-prism-ink'}
            >
              {label(art, i)}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id="artifact-panel" aria-labelledby={active ? `tab-${active.artifactId}` : undefined} tabIndex={0} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-prism-accent">
        {active?.status === 'CONFLICT' && (
          <ConflictPanel
            item={active}
            onResolve={(choice) => {
              store.resolveConflict(active.artifactId, choice)
              // The panel unmounts: keep keyboard focus on this material's tab.
              requestAnimationFrame(() => document.getElementById(`tab-${active.artifactId}`)?.focus())
            }}
          />
        )}
        {active && materialMissing(active) && <MaterialRecovery item={active} onRetry={onRetryLoad} retrying={retrying} />}
        {active && !materialMissing(active) && (
          <ArtifactRenderer
            key={`${active.artifactId}:${active.status === 'CONFLICT' ? 'conflict' : 'live'}`}
            artifact={{ artifactId: active.artifactId, type: active.type, title: active.title, data: active.local, schema: active.schema }}
            controller={controller}
          />
        )}
      </div>
    </>
  )
}

export default ArtifactPane
