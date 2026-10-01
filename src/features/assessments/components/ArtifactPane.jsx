import { useMemo } from 'react'
import ArtifactRenderer from '../../../components/artifacts/ArtifactRenderer.jsx'
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

// Work materials (spec §12.1): every tab, its content and its save state come
// from the server contract and the versioned artifact store.
export function ArtifactPane({ items, activeId, onSelect, store }) {
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
      <div role="tablist" aria-label="Work materials" onKeyDown={onKeyDown} className="flex gap-2 overflow-x-auto border-b border-prism-border p-2 lg:flex-wrap lg:overflow-visible">
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
      <div role="tabpanel" id="artifact-panel" aria-labelledby={active ? `tab-${active.artifactId}` : undefined} className="min-w-0 flex-1 space-y-4 overflow-y-auto p-6">
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
        {active && (
          <ArtifactRenderer
            key={`${active.artifactId}:${active.status === 'CONFLICT' ? 'conflict' : 'live'}`}
            artifact={{ artifactId: active.artifactId, type: active.type, title: active.title, data: active.local }}
            controller={controller}
          />
        )}
      </div>
    </>
  )
}

export default ArtifactPane
