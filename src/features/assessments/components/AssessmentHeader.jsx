import { Button } from '../../../components/ui/Button.jsx'
import PrismLogo from '../../../components/ui/PrismLogo.jsx'
import { SessionSaveStatus } from './SessionSaveStatus.jsx'

function formatRemaining(ms) {
  if (ms == null) return null
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Player header (spec §12.1): scenario, time left (server clock), save state,
// briefing and finish. No scoring details while the assessment is active.
export function AssessmentHeader({ title, scopeLabel, contextLine, remainingMs, saveState, briefingOpen, onToggleBriefing, onFinish, finishing, canFinish = true }) {
  const remaining = formatRemaining(remainingMs)
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-prism-border bg-prism-surface px-4 py-3">
      <div className="flex min-w-0 max-w-full items-center gap-3">
        <PrismLogo variant="icon" tone="reverse" size={24} decorative className="shrink-0" />
        <div className="min-w-0">
          {scopeLabel && <p className="text-xs font-medium uppercase tracking-wide text-prism-ink-muted">{scopeLabel}</p>}
          <h1 id="page-title" tabIndex={-1} className="truncate text-base font-semibold text-prism-ink focus:outline-none">{title}</h1>
          {contextLine && <p className="truncate text-xs text-prism-ink-muted">{contextLine}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {remaining && (
          <p className="text-sm text-prism-ink" role="timer">
            <span className="sr-only">Time remaining: </span>{remaining} <span className="text-xs text-prism-ink-muted">left</span>
          </p>
        )}
        {saveState && <SessionSaveStatus state={saveState} />}
        {onToggleBriefing && (
          <Button variant="secondary" size="sm" aria-expanded={briefingOpen} aria-controls="player-briefing" onClick={onToggleBriefing}>
            {briefingOpen ? 'Hide briefing' : 'Briefing'}
          </Button>
        )}
        {onFinish && (
          <Button id="finish-assessment" size="sm" onClick={onFinish} loading={finishing} loadingLabel="Submitting…" disabled={!canFinish}>
            Finish assessment
          </Button>
        )}
      </div>
    </header>
  )
}

export default AssessmentHeader
