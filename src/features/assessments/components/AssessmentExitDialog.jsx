import { Modal } from '../../../components/ui/Modal.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'

// Finishing (spec §12.3): pending saves are flushed first; unsaved work
// blocks with a clear message; ending before every part was reached is
// allowed, with an honest warning — the report then says where there was not
// enough evidence instead of inventing any.
export function AssessmentExitDialog({ open, onClose, onConfirm, exchanges, requiredExchanges, unsaved, submitting, error }) {
  const early = exchanges < requiredExchanges
  return (
    <Modal
      open={open}
      onClose={onClose}
      themeClass="theme-assessment"
      title={early ? 'Finish before the end?' : 'Finish the assessment?'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Keep going</Button>
          <Button onClick={() => onConfirm({ early })} disabled={unsaved || submitting} loading={submitting} loadingLabel="Submitting…">
            {early ? 'Finish anyway' : 'Finish'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        {unsaved && (
          <Callout tone="blocked" title="Some work is not saved yet">Wait for “All work saved”, or retry the save, before you finish.</Callout>
        )}
        {early && (
          <p>
            You have answered {exchanges} of the {requiredExchanges} parts of this assessment. You can finish now, but the
            remaining parts will not add evidence, so your report may show less about some capabilities.
          </p>
        )}
        <p>You cannot change your answers after you finish.</p>
        {error && <Callout tone="blocked" role="alert" title="Your assessment was not submitted">{error.message} Your answers are saved; nothing has been scored yet.</Callout>}
      </div>
    </Modal>
  )
}

export default AssessmentExitDialog
