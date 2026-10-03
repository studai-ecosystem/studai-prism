// Editable work areas for a practice mission (spec §16.4 artifact workspace).
// Data-driven: labels, fields and columns come from the mission itself.
import { Input, Textarea } from '../../../components/ui/FormControls.jsx'

export function MissionArtifactEditor({ artifact, value, onChange, disabled }) {
  if (artifact.type === 'TEXT_RESPONSE') {
    const text = value?.text ?? ''
    return (
      <Textarea
        label={artifact.title}
        hint={`${artifact.prompt}${artifact.maxLength ? ` (${text.length} of ${artifact.maxLength} characters)` : ''}`}
        value={text}
        maxLength={artifact.maxLength || undefined}
        rows={5}
        disabled={disabled}
        onChange={(e) => onChange({ text: e.target.value })}
      />
    )
  }
  if (artifact.type === 'FIELD_SHEET') {
    const fields = value?.fields || {}
    return (
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold text-prism-ink">{artifact.title}</legend>
        <p className="text-sm text-prism-ink-muted">{artifact.prompt}</p>
        {(artifact.fields || []).map((f) => (
          f.kind === 'number'
            ? <Input key={f.key} type="number" inputMode="decimal" label={f.label} value={fields[f.key] ?? ''} disabled={disabled} onChange={(e) => onChange({ fields: { ...fields, [f.key]: e.target.value === '' ? null : Number(e.target.value) } })} />
            : <Textarea key={f.key} label={f.label} rows={2} maxLength={f.max_length || undefined} value={fields[f.key] ?? ''} disabled={disabled} onChange={(e) => onChange({ fields: { ...fields, [f.key]: e.target.value } })} />
        ))}
      </fieldset>
    )
  }
  const rows = value?.rows || []
  const columns = artifact.columns || []
  return (
    <fieldset className="min-w-0 max-w-full space-y-2">
      <legend className="text-sm font-semibold text-prism-ink">{artifact.title}</legend>
      <p className="text-sm text-prism-ink-muted">{artifact.prompt}</p>
      <div className="max-w-full overflow-x-auto rounded-[var(--prism-radius-md)] border border-prism-border" role="region" aria-label={artifact.title} tabIndex={0}>
        <table className="w-max min-w-full text-left text-sm">
          <caption className="sr-only">{artifact.title}</caption>
          <thead className="bg-prism-subtle text-prism-ink-muted">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className="px-3 py-2 font-semibold">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-prism-border">
                {columns.map((c) => {
                  const label = `${c.label} for ${rows[i][columns.find((x) => !x.editable)?.key] || `row ${i + 1}`}`
                  if (!c.editable) return <th key={c.key} scope="row" className="min-w-[9rem] max-w-[16rem] px-3 py-2 align-top font-medium text-prism-ink">{r[c.key]}</th>
                  return (
                    <td key={c.key} className="px-3 py-2">
                      <input
                        type={c.kind === 'number' ? 'number' : 'text'}
                        inputMode={c.kind === 'number' ? 'decimal' : undefined}
                        aria-label={label}
                        value={r[c.key] ?? ''}
                        disabled={disabled}
                        onChange={(e) => {
                          const v = c.kind === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value
                          onChange({ rows: rows.map((x, j) => (j === i ? { ...x, [c.key]: v } : x)) })
                        }}
                        className="h-9 w-36 rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-surface px-2 text-sm text-prism-ink"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  )
}

export default MissionArtifactEditor
