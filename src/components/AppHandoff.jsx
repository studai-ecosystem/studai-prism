import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonitorDown, ExternalLink, Globe, X } from 'lucide-react'

// ── Website → app hand-off ───────────────────────────────────────────────────
// The website sells the licence; the desktop app runs the exam. When a
// Windows candidate clicks "Take the assessment" in a normal browser tab we
// offer — never force — the app: open it if installed (prism:// deep link),
// download it, or continue right here. "Continue in browser" is remembered
// for the session so the nudge never becomes a nag.

const DISMISS_KEY = 'prismAppNudgeDismissed'

export function shouldOfferApp() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  if (/PrismShell/.test(ua)) return false // already in the app
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return false // installed PWA
  if (!/Windows NT/.test(ua)) return false // the shell is Windows-only today
  if (sessionStorage.getItem(DISMISS_KEY) === '1') return false
  return true
}

export function useAppHandoff(onContinueInBrowser) {
  const [open, setOpen] = useState(false)

  const offer = useCallback(() => {
    if (shouldOfferApp()) setOpen(true)
    else onContinueInBrowser()
  }, [onContinueInBrowser])

  const close = useCallback(() => setOpen(false), [])

  return { open, offer, close }
}

export default function AppHandoffModal({ open, onClose, onContinueInBrowser }) {
  const navigate = useNavigate()
  if (!open) return null

  const openApp = () => {
    // If the shell is installed this focuses/starts it; if not, nothing
    // happens and the download + browser paths remain one click away.
    window.location.href = 'prism://open'
  }

  const continueBrowser = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    onClose()
    onContinueInBrowser()
  }

  return (
    <div
      className="fixed inset-0 z-[130] bg-[var(--color-ink)]/60 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose where to take the assessment"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-lg)] p-6 shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
        >
          <X size={16} />
        </button>

        <h2 className="font-serif text-xl text-[var(--color-ink)] mb-1.5">Where would you like to take it?</h2>
        <p className="font-sans text-sm text-[var(--color-ink-muted)] mb-5">
          The Prism app is a dedicated exam window — no tabs, no distractions.
          Your account and licence work in both.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={openApp}
            className="w-full flex items-center gap-3 p-3.5 rounded-[var(--radius-md)] bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer text-left"
          >
            <ExternalLink size={16} className="shrink-0" aria-hidden="true" />
            <span className="font-sans text-sm font-semibold">Open the Prism app</span>
            <span className="ml-auto font-mono text-[10px] opacity-70">if installed</span>
          </button>

          <a
            href="/download/Prism-Assessment-Setup.exe"
            className="w-full flex items-center gap-3 p-3.5 rounded-[var(--radius-md)] border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-colors cursor-pointer text-left"
          >
            <MonitorDown size={16} className="shrink-0" aria-hidden="true" />
            <span className="font-sans text-sm font-semibold">Download for Windows</span>
            <span className="ml-auto font-mono text-[10px] text-[var(--color-ink-muted)]">1.4 MB</span>
          </a>

          <button
            onClick={continueBrowser}
            className="w-full flex items-center gap-3 p-3.5 rounded-[var(--radius-md)] border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-colors cursor-pointer text-left"
          >
            <Globe size={16} className="shrink-0" aria-hidden="true" />
            <span className="font-sans text-sm font-semibold">Continue in the browser</span>
            <span className="ml-auto font-mono text-[10px] text-[var(--color-ink-muted)]">works fully</span>
          </button>
        </div>

        <p className="mt-4 font-mono text-[10px] text-[var(--color-ink-muted)] leading-relaxed">
          New installer, building its reputation: Windows may show a publisher
          notice on first run — choose "More info → Run anyway". Publisher
          verification (code signing) is in progress; the download always comes
          only from prism.studai.one.
        </p>
      </div>
    </div>
  )
}
