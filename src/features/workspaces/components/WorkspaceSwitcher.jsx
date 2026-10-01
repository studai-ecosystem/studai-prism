import { useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx'
import { useToast } from '../../../components/ui/Toast.jsx'
import { useDismiss } from '../../../hooks/useFocusTrap.js'
import { cx } from '../../../lib/cx.js'
import { homePathFor, scopeText, workspaceLabel } from '../workspacePaths.js'

// Workspace selector (spec §7.2). Listbox pattern: arrow keys move, Enter
// selects, Esc closes. Switching drops the previous workspace's cached data
// (WorkspaceProvider), moves to the new context's home and confirms it.
export function WorkspaceSwitcher() {
  const { workspaces, active, switchTo } = useWorkspace()
  const toast = useToast()
  const navigate = useNavigate()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const refs = useMemo(() => [btnRef, listRef], [])
  useDismiss(open, refs, () => { setOpen(false); btnRef.current?.focus() })

  const choose = (w) => {
    setOpen(false)
    btnRef.current?.focus()
    if (w.id === active.id) return
    const next = switchTo(w.id)
    if (next) {
      navigate(homePathFor(next))
      toast.show(`Now viewing: ${workspaceLabel(next)}`)
    }
  }

  const openList = () => {
    setCursor(Math.max(0, workspaces.findIndex((w) => w.id === active.id)))
    setOpen(true)
    requestAnimationFrame(() => listRef.current?.focus())
  }

  function onListKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % workspaces.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + workspaces.length) % workspaces.length) }
    else if (e.key === 'Home') { e.preventDefault(); setCursor(0) }
    else if (e.key === 'End') { e.preventDefault(); setCursor(workspaces.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(workspaces[cursor]) }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="relative min-w-0">
      <span id={`${listId}-label`} className="sr-only">Workspace</span>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listId}-label ${listId}-value ${listId}-scope`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openList() } }}
        className="inline-flex max-w-[9rem] items-center gap-2 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface px-3 py-1 text-left text-sm font-medium text-prism-ink hover:bg-prism-subtle sm:max-w-[18rem]"
      >
        <span className="min-w-0 leading-tight">
          <span id={`${listId}-value`} className="block truncate">{workspaceLabel(active)}</span>
          <span id={`${listId}-scope`} className="hidden truncate text-[11px] font-normal text-prism-ink-subtle sm:block">{scopeText(active)}</span>
        </span>
        <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-prism-ink-subtle" />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${listId}-label`}
          aria-activedescendant={`${listId}-opt-${cursor}`}
          onKeyDown={onListKey}
          className="absolute left-0 z-40 mt-2 min-w-[16rem] rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-surface py-1 shadow-lg focus:outline-none"
        >
          {workspaces.map((w, i) => {
            const selected = w.id === active.id
            return (
              <li
                key={w.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={selected}
                onClick={() => choose(w)}
                onMouseEnter={() => setCursor(i)}
                className={cx('flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm', i === cursor ? 'bg-prism-subtle' : '', 'text-prism-ink')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{workspaceLabel(w)}</span>
                  <span className="block text-xs text-prism-ink-subtle">{w.type === 'PERSONAL' ? 'Private to you. Your institution never sees it.' : w.type === 'CAMPUS_ADMIN' ? 'Institution administration' : `Sponsored by ${w.organizationName || w.name}. Your own results stay private.`}</span>
                </span>
                {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-prism-accent" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default WorkspaceSwitcher
