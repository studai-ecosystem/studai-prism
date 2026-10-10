import { cx } from '../../lib/cx.js'
import { Button } from './Button.jsx'
import './DataTable.css'

// The column header as plain text, for the stacked (small screen) label.
const labelOf = (c) => (typeof c.header === 'string' ? c.header : (c.stackLabel || undefined))

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
  isRowSelectable = () => true,
  rowLabel = (r) => String(rowKey(r)),
  // Below the md breakpoint rows stack as label/value cards instead of
  // scrolling sideways (each cell labelled with its column header).
  stack = true,
  className,
}) {
  const allIds = rows.filter(isRowSelectable).map(rowKey)
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selected.includes(id))
  const toggle = (id) => onSelectedChange?.(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    // Below md the rows stack (DataTable.css); from md up a wide table scrolls
    // sideways inside this region, which is focusable so keyboard users can
    // scroll it too (WCAG 2.1.1, axe scrollable-region-focusable). Explicit
    // roles keep the table semantics when the stacked layout changes display.
    <div
      role="region"
      aria-label={typeof caption === 'string' ? caption : 'Table'}
      tabIndex={0}
      className={cx('relative overflow-x-auto rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--prism-accent)]', className)}
    >
      <table role={stack ? 'table' : undefined} className={cx('min-w-full border-collapse text-left text-sm', stack && 'prism-table-stack')} aria-busy={loading || undefined} data-stack={stack ? 'md' : undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead role={stack ? 'rowgroup' : undefined} className="bg-prism-subtle text-prism-ink-muted">
          <tr role={stack ? 'row' : undefined}>
            {selectable && (
              <th scope="col" role={stack ? 'columnheader' : undefined} className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  disabled={allIds.length === 0}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && allIds.some((id) => selected.includes(id)) }}
                  onChange={() => onSelectedChange?.(allSelected ? [] : allIds)}
                  className="h-4 w-4 accent-[var(--prism-accent)]"
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} scope="col" role={stack ? 'columnheader' : undefined} aria-sort={ariaSort(c, sort)} className={cx('px-3 py-2 font-semibold', c.align === 'right' && 'text-right')}>
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
        <tbody role={stack ? 'rowgroup' : undefined}>
          {loading ? (
            <tr role={stack ? 'row' : undefined}><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-6 text-center text-prism-ink-muted" role="status">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr role={stack ? 'row' : undefined}><td role={stack ? 'cell' : undefined} colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-6 text-center text-prism-ink-muted">{emptyMessage}</td></tr>
          ) : rows.map((r) => {
            const id = rowKey(r)
            return (
              <tr key={id} role={stack ? 'row' : undefined} className="border-t border-prism-border">
                {selectable && (
                  <td role={stack ? 'cell' : undefined} className="px-3 py-2">
                    {isRowSelectable(r) && (
                      <input type="checkbox" aria-label={`Select ${rowLabel(r)}`} checked={selected.includes(id)} onChange={() => toggle(id)} className="h-4 w-4 accent-[var(--prism-accent)]" />
                    )}
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} role={stack ? 'cell' : undefined} data-label={stack ? labelOf(c) : undefined} className={cx('px-3 py-2 text-prism-ink', c.align === 'right' && 'text-right')}>
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
