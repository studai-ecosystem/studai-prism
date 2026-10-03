// Title bar for one preparation: rename and delete (P7.3). Deletion asks
// for confirmation in a dialog and takes the rehearsal, card and linked
// notes with it; the server cancels anything still in flight.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button.jsx'
import { Input } from '../../../components/ui/FormControls.jsx'
import { Modal } from '../../../components/ui/Modal.jsx'
import { InlineNotice } from '../../../components/ui/Notice.jsx'
import { PREPARATION_COPY } from '../../../lib/copy/student.js'

export function PreparationTitleBar({ attempt, actions }) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(attempt.title || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const name = attempt.title || attempt.situationLabel || 'Preparation'
  const save = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    const ok = await actions.rename.mutateAsync({ id: attempt.id, title: title.trim() }).catch(() => null)
    if (ok) setRenaming(false)
  }
  const remove = async () => {
    const ok = await actions.remove.mutateAsync(attempt.id).catch(() => null)
    if (ok) navigate('/app/prepare', { replace: true })
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-3" data-testid="preparation-title-bar">
      {renaming ? (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <Input id="prep-title" label="Name this preparation" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" size="sm" loading={actions.rename.isPending} loadingLabel="Saving…">Save name</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setRenaming(false); setTitle(attempt.title || '') }}>Cancel</Button>
        </form>
      ) : (
        <h2 className="text-lg font-semibold text-prism-ink" data-testid="preparation-name">{name}</h2>
      )}
      <div className="flex flex-wrap gap-2">
        {!renaming && <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>Rename</Button>}
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </div>
      {actions.rename.error && <InlineNotice tone="blocked" className="w-full">{actions.rename.error.message}</InlineNotice>}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this preparation?"
        description={PREPARATION_COPY.deleteConfirm}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button variant="danger" onClick={remove} loading={actions.remove.isPending} loadingLabel="Deleting…">Delete</Button>
          </>
        )}
      >
        {actions.remove.error && <InlineNotice tone="blocked">{actions.remove.error.message}</InlineNotice>}
      </Modal>
    </div>
  )
}

export default PreparationTitleBar
