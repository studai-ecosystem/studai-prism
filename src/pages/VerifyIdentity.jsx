import { useState, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2, Upload, Check, X, Lock } from 'lucide-react'
import Tesseract from 'tesseract.js'
import { getUser, getToken } from '../lib/session.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'

// Pre-test identity verification (Phase 2).
// OCR runs entirely in the browser via tesseract.js — the document images are
// never uploaded. We compare the name read from each document against the
// candidate's registered name and only send the MATCH RESULT (plus the last 4
// Aadhaar digits, typed manually) to the server.
//
// The OCR engine is SELF-HOSTED under /public/ocr (worker, wasm cores and the
// English traineddata). tesseract.js's default CDN paths (jsDelivr +
// tessdata.projectnaptha.com) are blocked by our CSP — and vendoring them is
// what makes the "nothing leaves the browser" claim true for the engine too.
const OCR_OPTIONS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr',
  langPath: '/ocr/tessdata',
}

const MATCH_THRESHOLD = 0.6

// Normalise a name to a set of alphabetic tokens for fuzzy comparison.
function nameTokens(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

// Fraction of the declared name's tokens that appear in the OCR text.
function matchScore(declaredName, ocrText) {
  const declared = nameTokens(declaredName)
  if (!declared.length) return 0
  const found = new Set(nameTokens(ocrText))
  const hits = declared.filter((t) => found.has(t)).length
  return hits / declared.length
}

function Field({ label, type = 'text', value, onChange, placeholder, maxLength, inputMode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-sans text-xs font-semibold text-[var(--prism-ink)] tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        className="w-full px-4 py-3 rounded-xl bg-[var(--prism-canvas)] border border-[var(--prism-border)] font-sans text-sm text-[var(--prism-ink)] placeholder:text-[var(--prism-ink-muted)] focus:outline-none focus:border-[var(--prism-signal)] focus:ring-2 focus:ring-[var(--prism-signal)]/20 transition-all"
      />
    </label>
  )
}

// A single document drop-zone that OCRs the chosen image and reports a match.
function DocUpload({ title, hint, declaredName, onResult }) {
  const inputRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | scanning | matched | mismatch | error
  const [score, setScore] = useState(null)
  const [fileName, setFileName] = useState('')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStatus('scanning')
    setScore(null)
    onResult({ matched: false, score: null, scanning: true })
    try {
      const { data } = await Tesseract.recognize(file, 'eng', OCR_OPTIONS)
      const text = data?.text || ''
      const s = matchScore(declaredName, text)
      const matched = s >= MATCH_THRESHOLD
      setScore(s)
      setStatus(matched ? 'matched' : 'mismatch')
      onResult({ matched, score: s, scanning: false })
    } catch {
      setStatus('error')
      onResult({ matched: false, score: null, scanning: false, error: true })
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--prism-border)] bg-prism-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-sm font-semibold text-[var(--prism-ink)]">{title}</h3>
          <p className="mt-0.5 font-sans text-xs text-[var(--prism-ink-muted)]">{hint}</p>
        </div>
        {status === 'matched' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-prism-positive-soft px-2.5 py-1 text-xs font-semibold text-prism-positive">
            <Check size={13} /> Match
          </span>
        )}
        {status === 'mismatch' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-prism-blocked-soft px-2.5 py-1 text-xs font-semibold text-prism-blocked">
            <X size={13} /> No match
          </span>
        )}
        {status === 'scanning' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--prism-signal)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--prism-signal)]">
            <Loader2 size={13} className="animate-spin" /> Reading
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'scanning'}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--prism-signal)]/50 bg-[var(--prism-canvas)] px-4 py-3 font-sans text-sm font-semibold text-[var(--prism-signal)] transition-colors hover:bg-[var(--status-partial-soft)] disabled:opacity-60"
      >
        <Upload size={16} />
        {fileName ? 'Choose a different image' : 'Upload photo of document'}
      </button>
      {fileName && (
        <p className="mt-2 truncate font-sans text-xs text-[var(--prism-ink-muted)]">{fileName}</p>
      )}
      {status === 'mismatch' && score !== null && (
        <p className="mt-2 font-sans text-xs text-prism-blocked">
          The name on this document doesn’t match your registered name.
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 font-sans text-xs text-prism-blocked">
          Couldn’t read this image. Try a clearer, well-lit photo.
        </p>
      )}
    </div>
  )
}

export default function VerifyIdentity() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session')
  const user = getUser()

  const [form, setForm] = useState({
    fullName: user?.name || '',
    fathersName: '',
    dob: '',
    aadhaarLast4: '',
    college: user?.college || '',
    rollNumber: '',
  })
  const [aadhaarDoc, setAadhaarDoc] = useState({ matched: false, score: null, scanning: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) => {
    const value = key === 'aadhaarLast4' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  const scanning = aadhaarDoc.scanning
  const nameMatch = aadhaarDoc.matched
  const bestScore = aadhaarDoc.score ?? 0

  // College / roll number are OPTIONAL — working professionals take Prism too
  // (the college ID document requirement was removed for the same reason).
  const requiredFilled = form.fullName.trim() && form.aadhaarLast4.length === 4

  const canContinue = requiredFilled && nameMatch && !scanning && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!sessionId) {
      setError('Missing session. Please sign in again.')
      return
    }
    if (!nameMatch) {
      setError('The name on your document does not match your registered name. You cannot proceed.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/assessment/verify-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          sessionId,
          fullName: form.fullName.trim(),
          fathersName: form.fathersName.trim(),
          dob: form.dob,
          aadhaarLast4: form.aadhaarLast4,
          college: form.college.trim(),
          rollNumber: form.rollNumber.trim(),
          nameMatch,
          matchScore: bestScore,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not record verification.')
      }
      // Charter §14: the phone second camera is OFF by default — the link-phone
      // step exists only when the governance-gated flag enables it. Charter
      // §13: an approved no-camera accommodation also skips the room scan.
      const cfg = await fetch('/api/payment/config').then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const accommodation = await fetch(`/api/assessment/accommodation/${sessionId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const noCamera = accommodation?.status === 'approved' && accommodation?.modes?.noCamera
      const nextStep = noCamera ? 'briefing' : cfg?.proctoring?.phoneCam ? 'link-phone' : 'room-scan'
      navigate(`/${nextStep}?session=${sessionId}`)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-prism-surface text-[var(--prism-ink)] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[var(--prism-border)]">
        <Link to="/" aria-label="Prism home">
          <PrismLogo size={32} />
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--prism-signal)]/12 text-[var(--prism-signal)]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-[var(--prism-ink)]">Verify your identity</h1>
              <p className="font-sans text-sm text-[var(--prism-ink-muted)]">
                A quick check before your proctored test begins.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name (as on Aadhaar)" value={form.fullName} onChange={update('fullName')} placeholder="Your full name" />
              <Field label="Father's name" value={form.fathersName} onChange={update('fathersName')} placeholder="As on document" />
              <Field label="Date of birth" type="date" value={form.dob} onChange={update('dob')} />
              <Field label="Aadhaar — last 4 digits" value={form.aadhaarLast4} onChange={update('aadhaarLast4')} placeholder="••••" maxLength={4} inputMode="numeric" />
              <Field label="College / Organisation (optional)" value={form.college} onChange={update('college')} placeholder="Your institution or employer" />
              <Field label="Roll / Employee number (optional)" value={form.rollNumber} onChange={update('rollNumber')} placeholder="Roll or employee ID" />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <DocUpload
                title="Aadhaar card"
                hint="Front side, name clearly visible"
                declaredName={form.fullName}
                onResult={setAadhaarDoc}
              />
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-[var(--prism-canvas)] px-4 py-3">
              <Lock size={15} className="mt-0.5 shrink-0 text-[var(--prism-signal)]" />
              <p className="font-sans text-xs leading-relaxed text-[var(--prism-ink-muted)]">
                Your documents are processed in your browser and never uploaded. We store only the
                match result and the last 4 digits of your Aadhaar.
              </p>
            </div>

            {!nameMatch && aadhaarDoc.score !== null && !scanning && (
              <p className="font-sans text-sm font-medium text-prism-blocked">
                The name on your document does not match your registered name. You cannot proceed.
              </p>
            )}
            {error && <p className="font-sans text-sm font-medium text-prism-blocked">{error}</p>}

            <button
              type="submit"
              disabled={!canContinue}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--prism-signal)] px-6 py-3.5 font-sans text-sm font-bold text-[var(--prism-ink)] transition-all hover:bg-[var(--prism-signal)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {submitting ? 'Verifying…' : 'Continue'}
            </button>

            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => navigate(`/room-scan?session=${sessionId}`)}
                className="w-full text-center font-sans text-xs font-semibold text-[var(--prism-signal)] hover:underline"
              >
                Skip verification (dev only) →
              </button>
            )}
          </form>
        </motion.div>
      </div>
    </div>
  )
}
