import { useState, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2, Upload, Check, X, Lock } from 'lucide-react'
import Tesseract from 'tesseract.js'
import { getUser } from '../lib/session.js'
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
      <span className="font-sans text-xs font-semibold text-[#3A3A4A] tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        className="w-full px-4 py-3 rounded-xl bg-[#F5F5FA] border border-[#E0E0E8] font-sans text-sm text-[#1A1A2E] placeholder:text-[#A0A4B0] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition-all"
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
    <div className="rounded-2xl border border-[#E0E0E8] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-sm font-semibold text-[#1A1A2E]">{title}</h3>
          <p className="mt-0.5 font-sans text-xs text-[#7A7F8C]">{hint}</p>
        </div>
        {status === 'matched' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
            <Check size={13} /> Match
          </span>
        )}
        {status === 'mismatch' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
            <X size={13} /> No match
          </span>
        )}
        {status === 'scanning' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A84C]/10 px-2.5 py-1 text-xs font-semibold text-[#9A7B23]">
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
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#C9A84C]/50 bg-[#FBF8F0] px-4 py-3 font-sans text-sm font-semibold text-[#9A7B23] transition-colors hover:bg-[#F5EFD9] disabled:opacity-60"
      >
        <Upload size={16} />
        {fileName ? 'Choose a different image' : 'Upload photo of document'}
      </button>
      {fileName && (
        <p className="mt-2 truncate font-sans text-xs text-[#A0A4B0]">{fileName}</p>
      )}
      {status === 'mismatch' && score !== null && (
        <p className="mt-2 font-sans text-xs text-red-600">
          The name on this document doesn’t match your registered name.
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 font-sans text-xs text-red-600">
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
  const [collegeDoc, setCollegeDoc] = useState({ matched: false, score: null, scanning: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) => {
    const value = key === 'aadhaarLast4' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
  }

  const scanning = aadhaarDoc.scanning || collegeDoc.scanning
  const nameMatch = aadhaarDoc.matched || collegeDoc.matched
  const bestScore = Math.max(aadhaarDoc.score ?? 0, collegeDoc.score ?? 0)

  const requiredFilled =
    form.fullName.trim() &&
    form.aadhaarLast4.length === 4 &&
    form.college.trim() &&
    form.rollNumber.trim()

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
        headers: { 'Content-Type': 'application/json' },
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
      navigate(`/link-phone?session=${sessionId}`)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#1A1A2E] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[#E0E0E8]">
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#C9A84C]/12 text-[#9A7B23]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-[#1A1A2E]">Verify your identity</h1>
              <p className="font-sans text-sm text-[#7A7F8C]">
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
              <Field label="College / University" value={form.college} onChange={update('college')} placeholder="Your institution" />
              <Field label="Roll / Enrollment number" value={form.rollNumber} onChange={update('rollNumber')} placeholder="Your roll number" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DocUpload
                title="Aadhaar card"
                hint="Front side, name clearly visible"
                declaredName={form.fullName}
                onResult={setAadhaarDoc}
              />
              <DocUpload
                title="College ID card"
                hint="Photo and name visible"
                declaredName={form.fullName}
                onResult={setCollegeDoc}
              />
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-[#F5F5FA] px-4 py-3">
              <Lock size={15} className="mt-0.5 shrink-0 text-[#9A7B23]" />
              <p className="font-sans text-xs leading-relaxed text-[#5A5F6E]">
                Your documents are processed in your browser and never uploaded. We store only the
                match result and the last 4 digits of your Aadhaar.
              </p>
            </div>

            {!nameMatch && (aadhaarDoc.score !== null || collegeDoc.score !== null) && !scanning && (
              <p className="font-sans text-sm font-medium text-red-600">
                The name on your document does not match your registered name. You cannot proceed.
              </p>
            )}
            {error && <p className="font-sans text-sm font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={!canContinue}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] px-6 py-3.5 font-sans text-sm font-bold text-[#1A1A2E] transition-all hover:bg-[#b89640] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {submitting ? 'Verifying…' : 'Continue'}
            </button>

            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={() => navigate(`/link-phone?session=${sessionId}`)}
                className="w-full text-center font-sans text-xs font-semibold text-[#9A7B23] hover:underline"
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
