// src/components/artifacts/BudgetModeler.jsx — allocation worksheet driven
// only by the artifact's data (total, allocations, constraints); labels come
// from the data's own keys, so no scenario vocabulary lives here (C5.09). No
// client-side projections are invented. "Saved" appears only after the
// server confirms; otherwise "Not saved — retry" and the candidate's input stays.
// Saving goes through `controller` (V3 versioned store, or the legacy store).
import { useState } from 'react'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'
import { humanizeKey, formatValue } from './format.js'

export default function BudgetModeler({ artifactId, title, data, controller }) {
  const total = Number(data?.totalBudget ?? data?.constraints?.maxTotal)
  const initial = data?.allocations && typeof data.allocations === 'object' ? data.allocations : null
  const [allocations, setAllocations] = useState(initial || {})
  const [notes, setNotes] = useState(controller.notes || '')
  const [save, setSave] = useState({ state: 'idle', error: null })
  if (!initial || !Number.isFinite(total) || total <= 0) return <ArtifactUnavailable title={title} />

  const keys = Object.keys(initial)
  const used = keys.reduce((sum, k) => sum + Number(allocations[k] || 0), 0)
  const over = used > total
  const constraints = data.constraints && typeof data.constraints === 'object'
    ? Object.entries(data.constraints).filter(([, v]) => typeof v === 'number')
    : []
  const step = Math.max(1, Math.round(total / 100))
  const autosaving = Boolean(controller.autosave)
  const status = autosaving ? controller.saveState : null

  const change = (key, value) => {
    const next = { ...allocations, [key]: Number(value) }
    setAllocations(next)
    setSave({ state: 'idle', error: null })
    controller.onChange({ allocations: next })
  }

  const onSave = async () => {
    if (over) return
    setSave({ state: 'saving', error: null })
    try {
      await controller.save(notes)
      setSave({ state: 'saved', error: null })
    } catch (error) {
      setSave({ state: 'idle', error })
    }
  }

  const saving = save.state === 'saving' || status === 'SAVING'
  const failed = Boolean(save.error) || status === 'ERROR'
  const saved = !failed && (save.state === 'saved' || status === 'SAVED')

  return (
    <div className="space-y-4 text-prism-ink">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm">Allocated {formatValue(used)} of {formatValue(total)}</p>
      </div>
      {over && <p role="alert" className="text-sm font-medium text-prism-blocked">Over the total by {formatValue(used - total)}. Reduce an allocation to save.</p>}
      {!over && <p className="text-sm text-prism-ink-muted">Remaining: {formatValue(total - used)}</p>}
      {constraints.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Constraints in the brief</p>
          <ul className="mt-1 list-disc pl-5 text-prism-ink-muted">
            {constraints.map(([k, v]) => <li key={k}>{humanizeKey(k)}: {formatValue(v)}</li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {keys.map((key) => (
          <div key={key} className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3">
            <label htmlFor={`alloc-${artifactId}-${key}`} className="flex justify-between text-sm font-medium">
              <span>{humanizeKey(key)}</span>
              <span className="font-mono">{formatValue(allocations[key])}</span>
            </label>
            <input
              id={`alloc-${artifactId}-${key}`}
              type="range"
              min="0"
              max={total}
              step={step}
              value={Number(allocations[key] || 0)}
              onChange={(e) => change(key, e.target.value)}
              className="mt-2 w-full accent-[var(--prism-accent)]"
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <label htmlFor={`notes-${artifactId}`} className="text-sm font-medium">Your reasoning</label>
        <textarea
          id={`notes-${artifactId}`}
          rows={3}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSave({ state: 'idle', error: null }); controller.onNotes?.(e.target.value) }}
          className="w-full rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-surface px-3 py-2 text-sm text-prism-ink"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={over || saving}
          className="rounded-[var(--prism-radius-md)] bg-prism-accent px-4 py-2 text-sm font-semibold text-prism-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : failed ? 'Retry save' : 'Save plan'}
        </button>
        <span aria-live="polite" className="text-sm">
          {saved && <span className="text-prism-positive">Saved</span>}
          {failed && <span className="text-prism-blocked">Not saved — retry. Your plan is still here.</span>}
        </span>
      </div>
    </div>
  )
}
