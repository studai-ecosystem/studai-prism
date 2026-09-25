import { cx } from '../../lib/cx.js'
import { Button } from './Button.jsx'

function ariaSort(column, sort) {
  if (!column.sortable) return undefined
  if (!sort || sort.key !== column.key) return 'none'
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}

// Accessible data table. Sorting and pagination are server-driven: the table
// only reports intent through onSortChange; it never re-orders rows itself.
export function DataTable({
  caption,
  columns,
  rows,
  rowKey = (r) => r.id,
  sort,
  onSortChange,
  loading = false,
  emptyMessage = 'No rows to show.',
  selectable = false,
  selected = [],
  onSelectedChange,
  className,
}) {
  const allIds = rows.map(rowKey)
  const allSelected = selectable && rows.length > 0 && allIds.every((id) => selected.includes(id))
  const toggle = (id) => onSelectedChange?.(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className={cx('overflow-x-auto rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface', className)}>
      <table className="min-w-full border-collapse text-left text-sm" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-prism-subtle text-prism-ink-muted">
          <tr>
            {selectable && (
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={() => onSelectedChange?.(allSelected ? [] : allIds)}
                  className="h-4 w-4 accent-[var(--prism-accent)]"
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} scope="col" aria-sort={ariaSort(c, sort)} className={cx('px-3 py-2 font-semibold', c.align === 'right' && 'text-right')}>
                {c.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSortChange?.({ key: c.key, direction: sort?.key === c.key && sort.direction === 'asc' ? 'desc' : 'asc' })}
                    className="inline-flex items-center gap-1 hover:text-prism-ink"
                  >
                    {c.header}
                    <span aria-hidden="true">{sort?.key === c.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-6 text-center text-prism-ink-muted" role="status">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-6 text-center text-prism-ink-muted">{emptyMessage}</td></tr>
          ) : rows.map((r) => {
            const id = rowKey(r)
            return (
              <tr key={id} className="border-t border-prism-border">
                {selectable && (
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Select row ${id}`} checked={selected.includes(id)} onChange={() => toggle(id)} className="h-4 w-4 accent-[var(--prism-accent)]" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-3 py-2 text-prism-ink', c.align === 'right' && 'text-right')}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Cursor pagination controls (server-driven).
export function Pagination({ hasPrevious, hasNext, onPrevious, onNext, summary }) {
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between gap-3 text-sm">
      <span className="text-prism-ink-muted" aria-live="polite">{summary}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onPrevious} disabled={!hasPrevious}>Previous</Button>
        <Button variant="secondary" size="sm" onClick={onNext} disabled={!hasNext}>Next</Button>
      </div>
    </nav>
  )
}

export default DataTable
