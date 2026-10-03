// src/components/artifacts/PlanBoard.jsx — the shared plan board (P3.6),
// driven only by the artifact's data and the server-supplied schema (the
// exact choices the server validates). Every edit uses labelled native form
// controls, so the keyboard does the same work as any pointer. Values the
// form supplied are marked "Provided"; values the learner changed are marked
// "Your edit" (stored as `<rowId>.<field>` keys), so seeded content is never
// presented as the learner's work. Saving goes through `controller`.
import { ArtifactShell } from './ArtifactShell.jsx'
import { ArtifactUnavailable } from './ArtifactUnavailable.jsx'
import { humanizeKey } from './format.js'

const FIELD_LABELS = { owner: 'Owner', due: 'Due', status: 'Status', dependency: 'Depends on', rationale: 'Why' }
const SAVE_TEXT = { SAVING: 'Saving…', SAVED: 'All changes saved', DIRTY: 'Not saved yet', ERROR: 'Not saved — retrying. Your changes are still here.', CONFLICT: 'Changed elsewhere — choose what to keep above.' }

const rowIdOf = (row, i) => (typeof row?.rowId === 'string' && row.rowId ? row.rowId : `R${i + 1}`)
const taskOf = (row, i) => (row?.task ? row.task : `Task ${i + 1}`)
const own = (data, key) => Object.prototype.hasOwnProperty.call(data, key)
const statusLabel = (s) => { const t = String(s).replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1) }

function Origin({ id, edited, empty }) {
  if (edited) return <span id={id} className="ml-2 rounded-[var(--prism-radius-sm)] border border-prism-accent px-1.5 py-0.5 text-[11px] font-semibold text-prism-ink">Your edit</span>
  if (empty) return null
  return <span id={id} className="ml-2 rounded-[var(--prism-radius-sm)] border border-dashed border-prism-border-strong px-1.5 py-0.5 text-[11px] font-medium text-prism-ink-muted">Provided</span>
}

export default function PlanBoard({ artifactId, title, data, schema, controller }) {
  const rows = Array.isArray(data?.rows) ? data.rows : null
  if (!rows || rows.length === 0) return <ArtifactUnavailable title={title} />
  const editable = new Set(Array.isArray(schema?.editable) ? schema.editable : [])
  const owners = Array.isArray(schema?.owners) ? schema.owners : []
  const statuses = Array.isArray(schema?.statuses) ? schema.statuses : []
  const ids = rows.map(rowIdOf)
  const valueOf = (row, i, field) => {
    const key = `${ids[i]}.${field}`
    return own(data, key) ? data[key] : (row[field] ?? null)
  }
  const set = (i, field, value) => controller.onChange({ [`${ids[i]}.${field}`]: value === '' ? null : value })
  const saveState = controller.autosave ? controller.saveState : null
  const fieldId = (i, field) => `board-${artifactId}-${ids[i]}-${field}`
  const control = 'mt-1 w-full min-w-0 rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-surface px-2 py-1.5 text-sm text-prism-ink'

  const fields = ['owner', 'due', 'status', 'dependency', 'rationale'].filter((f) => editable.has(f) || rows.some((r) => r[f] != null))
  return (
    <ArtifactShell
      title={title}
      kind="Plan board"
      status={saveState && <span aria-live="polite" data-testid="board-save-state">{SAVE_TEXT[saveState] || ''}</span>}
    >
      <p className="text-sm text-prism-ink-muted">
        {editable.size > 0
          ? '“Provided” marks what the board already said; “Your edit” marks what you changed. Changes save automatically.'
          : 'This board is shown for reference; it cannot be edited here.'}
      </p>
      <ol className="space-y-3" aria-label={`${title} tasks`}>
        {rows.map((row, i) => (
          <li key={ids[i]}>
            <fieldset className="rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface p-3" data-row={ids[i]}>
              <legend className="px-1 text-sm font-semibold text-prism-ink">{taskOf(row, i)}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => {
                  const value = valueOf(row, i, field)
                  const edited = own(data, `${ids[i]}.${field}`)
                  const empty = value == null || value === ''
                  const canEdit = editable.has(field) && !(field === 'owner' && owners.length === 0) && !(field === 'status' && statuses.length === 0)
                  const label = (
                    <div className="flex flex-wrap items-center">
                      <label htmlFor={fieldId(i, field)} className="text-xs font-medium text-prism-ink-muted">
                        {FIELD_LABELS[field] || humanizeKey(field)}<span className="sr-only"> for {taskOf(row, i)}</span>
                      </label>
                      <Origin id={`${fieldId(i, field)}-origin`} edited={edited} empty={empty} />
                    </div>
                  )
                  const described = edited || !empty ? `${fieldId(i, field)}-origin` : undefined
                  if (!canEdit) {
                    return (
                      <div key={field} className="min-w-0">
                        <p className="text-xs font-medium text-prism-ink-muted">{FIELD_LABELS[field] || humanizeKey(field)}<Origin edited={edited} empty={empty} /></p>
                        <p className="mt-1 text-sm text-prism-ink">{empty ? 'Not set' : field === 'status' ? statusLabel(value) : field === 'dependency' ? (ids.includes(value) ? taskOf(rows[ids.indexOf(value)], ids.indexOf(value)) : value) : String(value)}</p>
                      </div>
                    )
                  }
                  return (
                    <div key={field} className={field === 'rationale' ? 'min-w-0 sm:col-span-2' : 'min-w-0'} data-field={field} data-origin={edited ? 'LEARNER' : empty ? 'EMPTY' : 'PROVIDED'}>
                      {label}
                      {field === 'owner' && (
                        <select id={fieldId(i, field)} aria-describedby={described} className={control} value={value ?? ''} onChange={(e) => set(i, field, e.target.value)}>
                          <option value="">Not set</option>
                          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                      {field === 'status' && (
                        <select id={fieldId(i, field)} aria-describedby={described} className={control} value={value ?? ''} onChange={(e) => set(i, field, e.target.value)}>
                          <option value="">Not set</option>
                          {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                        </select>
                      )}
                      {field === 'dependency' && (
                        <select id={fieldId(i, field)} aria-describedby={described} className={control} value={value ?? ''} onChange={(e) => set(i, field, e.target.value)}>
                          <option value="">None</option>
                          {rows.map((r, j) => (j === i ? null : <option key={ids[j]} value={ids[j]}>{taskOf(r, j)}</option>))}
                        </select>
                      )}
                      {field === 'due' && (
                        <input id={fieldId(i, field)} aria-describedby={described} type="text" maxLength={80} className={control} value={value ?? ''} onChange={(e) => set(i, field, e.target.value)} />
                      )}
                      {field === 'rationale' && (
                        <textarea id={fieldId(i, field)} aria-describedby={described} rows={2} maxLength={600} className={control} value={value ?? ''} onChange={(e) => set(i, field, e.target.value)} />
                      )}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
    </ArtifactShell>
  )
}
