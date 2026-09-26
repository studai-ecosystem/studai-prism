import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../../../components/ui/Modal.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { RadioGroup, Select } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { useCreateShare } from '../hooks.js'
import { REPORT_COPY, SHARE_EXPIRY_OPTIONS } from '../../../lib/copy/report.js'
import { formatDate } from '../../student/QueryState.jsx'

const ShareForm = z.object({
  recipient: z.string().regex(/^(LINK|ORG:[0-9a-f-]{36})$/i),
  disclosureLevel: z.enum(['SUMMARY', 'FULL']),
  expiresInDays: z.coerce.number().int().min(1).max(180),
})

// Share dialog (spec §14.5, §36.3): the student picks who, what and for how
// long. A link's token is shown exactly once; only its hash is stored.
// `organizations` are the institutions the student belongs to that do not
// already see this report (a personal report can be shared with them).
export function ShareReportDialog({ open, onClose, sessionId, organizations = [] }) {
  const create = useCreateShare(sessionId)
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)
  const linkRef = useRef(null)
  const doneRef = useRef(null)
  // The form (and the button that had focus) is replaced by the result:
  // move focus to the link, or to Done for an institution share.
  useEffect(() => {
    if (created) (linkRef.current || doneRef.current)?.focus()
  }, [created])
  const { control, handleSubmit, setError, formState: { errors }, reset } = useForm({
    defaultValues: { recipient: 'LINK', disclosureLevel: 'SUMMARY', expiresInDays: '30' },
  })
  const S = REPORT_COPY.share

  const close = () => {
    setCreated(null)
    setCopied(false)
    create.reset()
    reset()
    onClose()
  }

  const onSubmit = handleSubmit(async (values) => {
    const parsed = ShareForm.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0], { message: 'Choose one of the options.' })
      return
    }
    const { recipient, disclosureLevel, expiresInDays } = parsed.data
    const orgId = recipient.startsWith('ORG:') ? recipient.slice(4) : null
    const body = orgId
      ? { recipientType: 'ORGANIZATION', recipientOrganizationId: orgId, disclosureLevel, expiresInDays }
      : { recipientType: 'LINK', disclosureLevel, expiresInDays }
    try {
      const out = await create.mutateAsync(body)
      setCreated({ ...out, organizationName: organizations.find((o) => o.id === orgId)?.name || null })
    } catch {
      // The error is shown from the mutation state below.
    }
  })

  const link = created?.token ? `${window.location.origin}/shared/${created.token}` : null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const recipientOptions = [
    { value: 'LINK', label: S.link },
    ...organizations.map((o) => ({ value: `ORG:${o.id}`, label: `${S.organization}: ${o.name}` })),
  ]

  return (
    <Modal
      open={open}
      onClose={close}
      title={S.title}
      footer={created
        ? <Button ref={doneRef} onClick={close}>Done</Button>
        : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={onSubmit} loading={create.isPending} loadingLabel="Creating…">{S.create}</Button>
          </>
        )}
    >
      {created ? (
        <div className="space-y-3 text-sm">
          <Callout tone="positive" title={S.created} role="status">
            {link ? S.linkOnce : `Shared with ${created.organizationName || 'your institution'} until ${formatDate(created.expiresAt)}.`}
          </Callout>
          {link && (
            <div className="space-y-2">
              <label htmlFor="share-link" className="text-sm font-medium text-prism-ink">Private link</label>
              <input ref={linkRef} id="share-link" readOnly value={link} className="w-full rounded-[var(--prism-radius-md)] border border-prism-border-strong bg-prism-subtle px-3 py-2 text-sm text-prism-ink" onFocus={(e) => e.target.select()} />
              <Button size="sm" variant="secondary" onClick={copy}>{copied ? S.copied : S.copy}</Button>
              <p role="status" className="sr-only">{copied ? 'Link copied to the clipboard.' : ''}</p>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Controller name="recipient" control={control} render={({ field }) => (
            <RadioGroup label={S.recipient} options={recipientOptions} value={field.value} onChange={field.onChange} error={errors.recipient?.message} />
          )} />
          <Controller name="disclosureLevel" control={control} render={({ field }) => (
            <RadioGroup label={S.disclosure} options={[{ value: 'SUMMARY', label: S.summary }, { value: 'FULL', label: S.full }]} value={field.value} onChange={field.onChange} error={errors.disclosureLevel?.message} />
          )} />
          <Controller name="expiresInDays" control={control} render={({ field }) => (
            <Select label={S.expiry} options={SHARE_EXPIRY_OPTIONS} value={field.value} onChange={(e) => field.onChange(e.target.value)} error={errors.expiresInDays?.message} />
          )} />
          {create.error && <Callout tone="blocked" role="alert" title="The share was not created">{create.error.message}</Callout>}
        </form>
      )}
    </Modal>
  )
}

export default ShareReportDialog
