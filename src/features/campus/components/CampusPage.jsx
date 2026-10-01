// Shared building blocks for campus administration pages: a page frame that
// always renders the h1 + workspace context and the standard loading /
// unauthorized / offline / error states, plus a small confirm dialog.
import { useEffect, useRef } from 'react'
import { PageHeader } from '../../../components/ui/PageHeader.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { queryStateView } from '../../student/QueryState.jsx'
import { ASSESSMENT_STATUS_LABELS, ASSESSMENT_STATUS_TONES } from '../../../lib/copy/campus.js'
import { useCampusOrg } from '../hooks.js'

export function CampusPage({ title, description, breadcrumbs, actions, query, loadingLabel, children }) {
  const { workspace, orgId } = useCampusOrg()
  const state = query ? queryStateView(query, { label: loadingLabel || `Loading ${String(title).toLowerCase()}`, homeTo: `/campus/${orgId}/overview` }) : null
  return (
    <div>
      <PageHeader title={title} description={description} context={workspace} breadcrumbs={breadcrumbs} actions={state ? null : actions} />
      {state || children}
    </div>
  )
}

export function AssessmentStatus({ status }) {
  return <StatusChip tone={ASSESSMENT_STATUS_TONES[status] || 'neutral'} label={ASSESSMENT_STATUS_LABELS[status] || status} />
}

// Announced (role=alert) and scrolled into view, so an error from a footer
// button inside a scrolling dialog is also seen.
export function MutationError({ error }) {
  const ref = useRef(null)
  useEffect(() => { if (error) ref.current?.scrollIntoView?.({ block: 'nearest' }) }, [error])
  if (!error) return null
  return <div ref={ref} role="alert"><InlineNotice tone="blocked">{error.message}{error.requestId ? ` (Reference: ${error.requestId})` : ''}</InlineNotice></div>
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'primary', onConfirm, onClose, pending, error, children }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={tone} onClick={onConfirm} loading={pending}>{confirmLabel}</Button>
        </>
      )}
    >
      {children}
      <MutationError error={error} />
    </Modal>
  )
}

// Saves text the server produced as a file (no third-party code, no eval).
export function downloadText(fileName, text, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const crumbs = (orgId, ...items) => [{ label: 'Overview', to: `/campus/${orgId}/overview` }, ...items]

// After a failed submit, move focus to the first field marked invalid (WCAG 3.3.1).
export function focusFirstInvalid(root) {
  requestAnimationFrame(() => {
    const scope = root || document
    const el = scope.querySelector('[aria-invalid="true"]')
    const target = el && (el.matches('input,select,textarea,button') ? el : el.querySelector('input,select,textarea,button'))
    target?.focus()
  })
}

// Focus the page heading after an action that replaces the content under the pointer.
export function focusPageTitle() {
  requestAnimationFrame(() => document.getElementById('page-title')?.focus())
}
