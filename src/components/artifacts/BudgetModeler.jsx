// src/components/artifacts/BudgetModeler.jsx — budget allocation worksheet
// driven only by the artifact's data (total, allocations, constraints). No
// client-side projections are invented; "Saved" appears only after the server
// confirms, otherwise "Not saved — retry" and the candidate's input stays.
import { useState } from 'react'
import { useArtifactStore, artifactStore } from '../../lib/artifactStore.js'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'

const LABELS = {
  metaSpend: 'Meta ads',
  searchSpend: 'Search ads',
  retentionSpend: 'Retention and win-back',
  experimentationSpend: 'Creative testing',
}
const labelFor = (key) => LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
const fmt = (n) => Number(n || 0).toLocaleString('en-IN')

export default function BudgetModeler({ artifactId, title, data, sessionId }) {
  const { isSaving } = useArtifactStore()
  const total = Number(data?.totalBudget ?? data?.constraints?.maxTotal)
  const initial = data?.allocations && typeof data.allocations === 'object' ? data.allocations : null
  const [allocations, setAllocations] = useState(initial || {})
  const [notes, setNotes] = useState('')
  const [save, setSave] = useState({ state: 'idle', error: null })
  if (!initial || !Number.isFinite(total) || total <= 0) return <ArtifactUnavailable title={title} />

  const keys = Object.keys(initial)
  const used = keys.reduce((sum, k) => sum + Number(allocations[k] || 0), 0)
  const over = used > total
  const minRetention = Number(data.constraints?.minRetention)
  const retentionLow = Number.isFinite(minRetention) && 'retentionSpend' in allocations && Number(allocations.retentionSpend) < minRetention
  const step = Math.max(1, Math.round(total / 100))

  const change = (key, value) => {
    const next = { ...allocations, [key]: Number(value) }
    setAllocations(next)
    setSave({ state: 'idle', error: null })
    artifactStore.updateLocalArtifact(artifactId, { allocations: next })
  }

  const onSave = async () => {
    if (over) return
    setSave({ state: 'saving', error: null })
    try {
      await artifactStore.persistArtifact(sessionId, artifactId, notes)
      setSave({ state: 'saved', error: null })
    } catch (error) {
      setSave({ state: 'idle', error })
    }
  }

  return (
    <div className="space-y-4 text-prism-ink">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm">Allocated {fmt(used)} of {fmt(total)}</p>
      </div>
      {over && <p role="alert" className="text-sm font-medium text-prism-blocked">Over the total by {fmt(used - total)}. Reduce an allocation to save.</p>}
      {!over && <p className="text-sm text-prism-ink-muted">Remaining: {fmt(total - used)}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {keys.map((key) => (
          <div key={key} className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
            <label htmlFor={`alloc-${key}`} className="flex justify-between text-sm font-medium">
              <span>{labelFor(key)}</span>
              <span className="font-mono">{fmt(allocations[key])}</span>
            </label>
            <input
              id={`alloc-${key}`}
              type="range"
              min="0"
              max={total}
              step={step}
              value={Number(allocations[key] || 0)}
              onChange={(e) => change(key, e.target.value)}
              className="mt-2 w-full accent-[var(--prism-accent)]"
            />
            {key === 'retentionSpend' && Number.isFinite(minRetention) && (
              <p className={retentionLow ? 'mt-1 text-xs font-medium text-prism-partial' : 'mt-1 text-xs text-prism-ink-muted'}>
                Minimum set in the brief: {fmt(minRetention)}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <label htmlFor={`notes-${artifactId}`} className="text-sm font-medium">Your reasoning</label>
        <textarea
          id={`notes-${artifactId}`}
          rows={3}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSave({ state: 'idle', error: null }) }}
          className="w-full rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-surface px-3 py-2 text-sm text-prism-ink"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={over || isSaving || save.state === 'saving'}
          className="rounded-[var(--prism-radius-md)] bg-prism-accent px-4 py-2 text-sm font-semibold text-prism-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.state === 'saving' ? 'Saving…' : save.error ? 'Retry save' : 'Save plan'}
        </button>
        <span aria-live="polite" className="text-sm">
          {save.state === 'saved' && <span className="text-prism-positive">Saved</span>}
          {save.error && <span className="text-prism-blocked">Not saved — retry. Your plan is still here.</span>}
        </span>
      </div>
    </div>
  )
}
