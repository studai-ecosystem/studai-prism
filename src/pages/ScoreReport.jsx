import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Award, MapPin, Building2, Clock, Star, CheckCircle2,
  ExternalLink, Lightbulb, MessageSquare, Brain, Puzzle, Users, Bot,
  Sparkles, ArrowUpRight, ArrowRight, Linkedin, Download, Mail, Link as LinkIcon,
  ShieldCheck, Briefcase, Share2, Scale, Trash2,
} from 'lucide-react'
import { getUser, getToken } from '../lib/session.js'
import { DIMENSION_WEIGHTS, SCORE_VALIDITY_MONTHS, REASSESSMENT_DAYS } from '../../server/lib/sharedConstants.js'

// ── Dimension config (order + colours mirror the reference report) ────────────
const DIMENSIONS = [
  {
    key: 'communication',
    label: 'Communication',
    color: '#B8902F',
    sub: 'Structural clarity · Precision · Audience adaptation',
    Icon: MessageSquare,
    ringBg: 'rgba(184,144,47,0.10)',
    iconBg: 'rgba(184,144,47,0.12)',
    evidence: '"When Avatar 3 said it didn\'t follow your reasoning, you didn\'t repeat yourself — you restructured entirely. Your second explanation used an analogy, a data point, and a direct consequence. That\'s adaptive communication under pressure. Rare."',
  },
  {
    key: 'criticalThinking',
    label: 'Critical Thinking',
    color: '#9A7724',
    sub: 'Gap identification · Reasoning quality · Position calibration',
    Icon: Brain,
    ringBg: 'rgba(154,119,36,0.10)',
    iconBg: 'rgba(154,119,36,0.12)',
    evidence: '"Before choosing the dashboard, you asked what the teacher adoption rate was for the previous version — information the scenario hadn\'t provided. Identifying the missing variable before acting is the defining behavior of structured critical thinking."',
  },
  {
    key: 'problemSolving',
    label: 'Problem Solving',
    color: '#C9A84C',
    sub: 'Constraint recognition · Trade-off articulation · Iteration quality',
    Icon: Puzzle,
    ringBg: 'rgba(201,168,76,0.12)',
    iconBg: 'rgba(201,168,76,0.14)',
    evidence: '"When Avatar 1 added the constraint — only 3 engineers available — you immediately dropped your original plan and proposed the FAQ bot middle ground. You named what you were giving up and what you were preserving. That\'s trade-off articulation, not just compromise."',
  },
  {
    key: 'collaboration',
    label: 'Collaboration',
    color: '#8A6A1A',
    sub: 'Perspective acknowledgment · Position updating · Conflict navigation',
    Icon: Users,
    ringBg: 'rgba(138,106,26,0.10)',
    iconBg: 'rgba(138,106,26,0.12)',
    evidence: '"You acknowledged the opposing concern before countering. You held your position but demonstrated genuine engagement with the opposing view. One missed moment: you didn\'t credit Avatar 1\'s suggestion before adopting it."',
  },
  {
    key: 'aiDigitalFluency',
    label: 'AI & Digital Fluency',
    color: '#B8902F',
    sub: 'Prompt quality · Verification behaviour · Appropriate delegation',
    Icon: Bot,
    ringBg: 'rgba(184,144,47,0.10)',
    iconBg: 'rgba(184,144,47,0.12)',
    evidence: '"When offered an AI content tool, you specified what to prompt and what to verify manually — showing you understand AI as a tool, not an answer machine. Improvement area: raising whether AI-generated output should be reviewed by an expert before publishing."',
  },
]

// Weight of each dimension in the overall Prism Score — imported from the SAME
// shared module the server's scoring route uses (audit C2), so the breakdown
// shown to candidates can never drift from the arithmetic that produced the
// score.

// ── Performance bands ─────────────────────────────────────────────────────────
const BANDS = [
  { min: 90, label: 'Exceptional Performer', tag: 'Band I' },
  { min: 75, label: 'Strong Performer', tag: 'Band II' },
  { min: 60, label: 'Competent Performer', tag: 'Band III' },
  { min: 40, label: 'Developing Performer', tag: 'Band IV' },
  { min: 0, label: 'Early Stage', tag: 'Band V' },
]
function getBand(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1]
}

// English ordinal suffix: 1 → "st", 2 → "nd", 3 → "rd", 61 → "st", 11 → "th".
function ordinalSuffix(n) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

// ── Radar chart ───────────────────────────────────────────────────────────────
function Radar({ dims }) {
  const cx = 180, cy = 160, R = 130, N = dims.length
  const pt = (r, i) => {
    const a = (Math.PI * 2 * i / N) - Math.PI / 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const rings = [20, 40, 60, 80, 100]
  const scorePts = dims.map((d, i) => pt(R * d.score / 100, i))
  const polyStr = (pts) => pts.map((p) => p.join(',')).join(' ')

  return (
    <svg viewBox="0 0 360 320" width="300" height="266" style={{ overflow: 'visible' }}>
      {rings.map((v) => (
        <polygon
          key={v}
          points={polyStr(Array.from({ length: N }, (_, i) => pt(R * v / 100, i)))}
          fill="none" stroke="#EFE6CF" strokeWidth="1"
        />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(R, i)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E6D9B8" strokeWidth="1" />
      })}
      <polygon points={polyStr(scorePts)} fill="rgba(184,144,47,0.16)" stroke="#B8902F" strokeWidth="2" />
      {dims.map((d, i) => {
        const [x, y] = pt(R * d.score / 100, i)
        return <circle key={i} cx={x} cy={y} r="5" fill={d.color} stroke="white" strokeWidth="2" />
      })}
      {dims.map((d, i) => {
        const [lx, ly] = pt(R + 22, i)
        const split = d.label === 'Critical Thinking' || d.label === 'Problem Solving' || d.label === 'AI & Digital Fluency'
        const parts = d.label.split(' ')
        const [sx, sy] = pt(R * d.score / 100, i)
        const offX = i === 0 ? 14 : (i === 1 || i === 2) ? 12 : -14
        const offY = i === 3 || i === 4 ? -10 : i === 0 ? -12 : 0
        return (
          <g key={i}>
            <text
              x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="600" fill="#4A3C1E"
              fontFamily="'Bricolage Grotesque',sans-serif"
            >
              {split ? (
                <>
                  <tspan x={lx} dy="-7">{parts.slice(0, -1).join(' ')}</tspan>
                  <tspan x={lx} dy="14">{parts[parts.length - 1]}</tspan>
                </>
              ) : d.label}
            </text>
            <text
              x={sx + offX} y={sy + offY} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight="700" fill={d.color}
              fontFamily="'JetBrains Mono',monospace"
            >
              {d.score}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PercentileRow({ label, value }) {
  // Honest cold-start (audit C19): no cohort history → no invented rank.
  if (typeof value !== 'number') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t3)' }}>Pending cohort data</span>
        </div>
        <div className="pct-bar-track" />
        <div className="pct-labels"><span>0</span><span>25th</span><span>50th</span><span>75th</span><span>100th</span></div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--fm)', fontSize: 20, fontWeight: 500, color: 'var(--pr)' }}>{value}th</span>
      </div>
      <div className="pct-bar-track">
        <div className="pct-bar-fill" style={{ width: `${value}%` }}><div className="pct-bar-thumb" /></div>
      </div>
      <div className="pct-labels"><span>0</span><span>25th</span><span>50th</span><span>75th</span><span>100th</span></div>
    </div>
  )
}

export default function ScoreReport() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sessionId = params.get('session')

  const demoReport = params.get('demo') === '1' ? {
    scores: { criticalThinking: 88, collaboration: 79, communication: 91, problemSolving: 85, aiDigitalFluency: 77, overall: 84 },
    feedback: { summary: 'Riya demonstrates the profile of a candidate ready for cross-functional roles that require both clear communication and structured decision-making under pressure. The standout characteristic was the consistent gap-identification behaviour before acting — asking for missing information rather than assuming.' },
    highlights: ['Framed the core trade-off early', 'Kept stakeholders aligned', 'Clear, structured communication'],
    growthAreas: ['Quantify risks more explicitly', 'Invite dissenting views sooner'],
  } : null

  const [report, setReport] = useState(location.state?.report || demoReport)
  const [loadingReport, setLoadingReport] = useState(false)

  // Refresh-safe: if the page is reloaded or opened directly with a session id,
  // fetch the durable report from the server.
  useEffect(() => {
    if (report || !sessionId) return
    let cancelled = false
    setLoadingReport(true)
    fetch(`/api/assessment/report/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setReport(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingReport(false) })
    return () => { cancelled = true }
  }, [report, sessionId])

  const certRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  // Email-report modal state.
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailState, setEmailState] = useState('idle') // idle | sending | done | error
  const [emailMsg, setEmailMsg] = useState('')

  // Score dispute (human review) + right-to-erasure state.
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeState, setDisputeState] = useState('idle') // idle | submitting | done | error
  const [disputeMsg, setDisputeMsg] = useState('')
  const [erasing, setErasing] = useState(false)

  const [userName, setUserName] = useState('')
  const [college, setCollege] = useState('')
  useEffect(() => {
    setUserName(localStorage.getItem('prismUserName') || '')
    setCollege(getUser()?.college || '')
    setEmailInput(getUser()?.email || '')
  }, [])

  if (!report) {
    if (loadingReport) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-[#B8902F] border-t-transparent animate-spin" />
          <p className="font-sans text-[#64687A]">Loading your report…</p>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6 text-center">
        <AlertTriangle size={40} className="text-[#E05252]" />
        <h1 className="font-serif text-3xl text-[#1A1A2E]">Score not found</h1>
        <p className="font-sans text-[#64687A] max-w-sm">
          This report link has expired or was accessed directly. Please complete an assessment first.
        </p>
        <button onClick={() => navigate('/')} className="font-sans text-sm text-[#B8902F] underline">
          Back to home
        </button>
      </div>
    )
  }

  const { scores, feedback, highlights, growthAreas } = report
  const band = getBand(scores.overall)

  // Honest reliability display (audit C4): the server measures judge-panel
  // agreement and returns a reliability label — show THAT. Never render a
  // numeric confidence interval until a calibrated one exists in the report.
  const reliabilityText = {
    high: 'High reliability',
    moderate: 'Moderate reliability',
    low: 'Low judge agreement — eligible for human review',
  }[report.reliability?.label] || 'Provisional score'

  // Track 4.1: non-English sessions are provisional until the multilingual
  // DIF study calibrates them — the report must say so, always.
  const provisionalLanguage = report.scoring && report.scoring.status === 'provisional_uncalibrated'
    ? report.scoring.language
    : null

  const validityMonths = report.validityMonths || SCORE_VALIDITY_MONTHS
  const now = new Date()
  const issuedDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const validUntilDate = new Date(now)
  validUntilDate.setMonth(validUntilDate.getMonth() + validityMonths)
  const validUntil = validUntilDate
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const testDateTime = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
    ' · ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const verifyId = sessionId || 'PSRM-DEMO'
  const displayName = userName || getUser()?.name || 'Prism Candidate'

  const dims = DIMENSIONS.map((d) => ({ ...d, score: scores[d.key] ?? 0 }))
  const radarDims = dims.map((d) => ({ label: d.label, score: d.score, color: d.color }))

  // Honest percentiles (audit C19): show ONLY server-computed values. Until a
  // real comparison pool exists the server returns null/0 — render an explicit
  // "pending cohort data" state, never an approximation of a rank.
  const pctAll = (() => {
    const stored = report.percentile ?? report.percentiles?.all
    return typeof stored === 'number' && stored > 0 ? stored : null
  })()
  const pctTrack = typeof report.percentiles?.track === 'number' ? report.percentiles.track : null
  const pctCohort = typeof report.percentiles?.cohort === 'number' ? report.percentiles.cohort : null

  // Real conformal CI (Phase 2 scorer) when the report carries one — otherwise
  // the agreement-based reliability label. Never a fabricated interval (C4).
  const ci = report.confidenceInterval && Number.isFinite(report.confidenceInterval.low) && Number.isFinite(report.confidenceInterval.high)
    ? report.confidenceInterval
    : null
  // `report.scenario` may be a plain string (legacy/mock) or an object
  // ({ title, domain }) returned by the scoring endpoint. Normalise to text.
  const scenarioText =
    (report.scenario && typeof report.scenario === 'object'
      ? [report.scenario.title, report.scenario.domain].filter(Boolean).join(' · ')
      : report.scenario) ||
    '"You are a Product Manager at a growing EdTech startup. Two weeks before launch, engineering says they can ship only one of two features. You have to make the call — and defend it."'

  const strengths = (highlights && highlights.length)
    ? highlights
    : [
        'Asks for missing information before deciding — signature critical thinking behaviour',
        'Adapts communication style when not understood — did not repeat, restructured',
        'Articulates trade-offs explicitly, not just makes choices',
        'Holds positions under weak pushback, updates under strong evidence',
      ]
  const growth = (growthAreas && growthAreas.length)
    ? growthAreas
    : [
        "Credit others' ideas before building on them — acknowledge before adopt",
        'Raise ethical/quality flags on AI outputs proactively, not reactively',
        'Quantify your own reasoning more explicitly',
      ]

  const interviewQs = report.interviewQuestions || [
    'Tell me about a time you had to make a decision with incomplete information. What did you specifically look for before deciding?',
    'Walk me through a situation where someone disagreed with your recommendation. How did you handle the conversation?',
    'Describe a decision where you had to explicitly trade something off. How did you communicate what you were giving up?',
    'When have you used an AI tool in your work? What did you give it, what did you verify yourself, and why?',
  ]

  const shareUrl = `${window.location.origin}/verify/${verifyId}`
  const shareText = `I just got my Prism Score: ${scores.overall}/100 on the AI Skills Assessment by StudAI One.`

  const handleLinkedInShare = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSubmitDispute = async () => {
    if (!sessionId) {
      setDisputeState('error')
      setDisputeMsg('Human review is only available for completed assessments.')
      return
    }
    if (disputeReason.trim().length < 10) {
      setDisputeState('error')
      setDisputeMsg('Please describe your concern (at least 10 characters).')
      return
    }
    setDisputeState('submitting')
    setDisputeMsg('')
    try {
      const res = await fetch('/api/assessment/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, reason: disputeReason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not submit your request.')
      setDisputeState('done')
      setDisputeMsg(data.message || 'Your request has been submitted for human review.')
    } catch (err) {
      setDisputeState('error')
      setDisputeMsg(err.message || 'Something went wrong. Please try again.')
    }
  }

  const handleEraseData = async () => {
    if (!sessionId) {
      navigate('/')
      return
    }
    const confirmed = window.confirm(
      'This will permanently delete your assessment, score and all related data. This cannot be undone. Continue?',
    )
    if (!confirmed) return
    setErasing(true)
    try {
      await fetch(`/api/assessment/data/${sessionId}`, { method: 'DELETE' })
      localStorage.removeItem('prismUserName')
      localStorage.removeItem('prismCharacter')
      alert('Your data has been permanently deleted.')
      navigate('/')
    } catch {
      setErasing(false)
      alert('Sorry, we could not delete your data right now. Please try again.')
    }
  }

  const handleDownloadPdf = async () => {
    if (!certRef.current || downloading) return
    setDownloading(true)
    try {
      const { pdf, filename } = await buildReportPdf()
      pdf.save(filename)
    } catch (err) {
      console.error('PDF download failed', err)
      alert('Sorry, the PDF could not be generated. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  // Shared PDF builder used by both "Download PDF" and "Email report" so the two
  // produce an identical certificate. Returns the jsPDF instance + a safe
  // filename; callers decide whether to .save() or extract base64 for upload.
  async function buildReportPdf() {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const canvas = await html2canvas(certRef.current, {
      scale: 2,
      backgroundColor: '#FBF7EC',
      useCORS: true,
      // html2canvas renders text higher within its line-box than the browser
      // does, so very tight line-heights cause the name to overlap the meta
      // row beneath it. Relax those line-heights on the *cloned* node only so
      // the on-screen certificate is untouched but the PDF is properly spaced.
      onclone: (doc) => {
        const setLH = (selector, lh, extra = {}) => {
          doc.querySelectorAll(selector).forEach((el) => {
            el.style.lineHeight = lh
            Object.assign(el.style, extra)
          })
        }
        setLH('.cert-name', '1.2', { paddingBottom: '4px' })
        setLH('.cert-meta', 'normal', { marginTop: '4px' })
        setLH('.cert-score-num', '1.1')
        setLH('.cert-pct-num', '1.2')
        setLH('.cert-score-tier', 'normal')
        setLH('.cert-overline-txt', 'normal')
      },
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgWidth = pageWidth - 48
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 24, 24, imgWidth, imgHeight)
    const safeName = displayName.replace(/[^a-z0-9]+/gi, '-')
    return { pdf, filename: `Prism-Score-${safeName}.pdf` }
  }

  const handleEmailReport = async () => {
    if (emailSending) return
    const target = (emailInput || getUser()?.email || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setEmailState('error')
      setEmailMsg('Please enter a valid email address.')
      return
    }
    setEmailSending(true)
    setEmailState('sending')
    setEmailMsg('')
    try {
      const { pdf, filename } = await buildReportPdf()
      const pdfBase64 = pdf.output('datauristring') // data:application/pdf;base64,...
      const res = await fetch('/api/assessment/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({ sessionId, email: target, pdfBase64, filename }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        // Email not configured — fall back to a direct download.
        pdf.save(filename)
        setEmailState('done')
        setEmailMsg('Email isn’t set up yet, so we downloaded the PDF for you instead.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Could not send the email.')
      setEmailState('done')
      setEmailMsg(`Report sent to ${target}. Check your inbox (and spam).`)
    } catch (err) {
      setEmailState('error')
      setEmailMsg(err.message || 'Could not send the email. Please try again.')
    } finally {
      setEmailSending(false)
    }
  }

  return (
    <div className="prism-report">
      <style>{`
.prism-report{
  --pr:#B8902F;--prh:#9A7724;--prs:rgba(184,144,47,0.10);--prm:rgba(184,144,47,0.20);--prt:#7A5E16;
  --bg:#FBF7EC;--s0:#FFFFFF;--s1:#F7F1E1;--s2:#EFE6CF;
  --bd:rgba(184,144,47,0.14);--bd2:rgba(184,144,47,0.24);--bd3:rgba(184,144,47,0.36);
  --t1:#1A1407;--t2:#4A3C1E;--t3:#7A6B45;--t4:#C5B488;
  --ok:#047857;--oks:rgba(4,120,87,0.09);--okb:rgba(4,120,87,0.22);
  --am:#C27803;--ams:rgba(194,120,3,0.09);--amb:rgba(194,120,3,0.22);
  --sc1:#B8902F;--sc2:#9A7724;--sc3:#C9A84C;--sc4:#8A6A1A;--sc5:#B8902F;
  --f:"Bricolage Grotesque",system-ui,sans-serif;
  --fm:"JetBrains Mono",monospace;
  font-family:var(--f);background:var(--bg);color:var(--t1);min-height:100vh;
  -webkit-font-smoothing:antialiased;
}
.prism-report *{box-sizing:border-box}
@media print{.prism-report .no-print{display:none!important}.prism-report{background:#fff}}
.pr-top-strip{background:var(--pr);height:5px;width:100%}
.pr-header{background:var(--s0);border-bottom:1px solid var(--bd);padding:16px 40px;display:flex;align-items:center;justify-content:space-between}
.pr-header-logo{display:flex;align-items:center;gap:10px}
.pr-logo-mark{width:36px;height:36px;background:var(--pr);border-radius:8px;display:flex;align-items:center;justify-content:center}
.pr-logo-mark svg{width:20px;height:20px;fill:white}
.pr-logo-name{font-size:18px;font-weight:800;color:var(--t1);letter-spacing:-0.03em}
.pr-logo-sub{font-size:11px;font-weight:600;color:var(--t3);letter-spacing:0.05em;text-transform:uppercase;margin-top:1px}
.pr-header-right{display:flex;align-items:center;gap:10px}
.hbtn{font-family:var(--f);font-weight:600;font-size:13px;border-radius:8px;cursor:pointer;transition:all 140ms ease;display:inline-flex;align-items:center;gap:6px;padding:8px 16px;letter-spacing:-0.01em;border:none}
.hbtn:disabled{opacity:0.6;cursor:not-allowed}
.hbtn-outline{background:transparent;color:var(--pr);border:1px solid var(--bd2)}
.hbtn-outline:hover{background:var(--prs);border-color:var(--pr)}
.hbtn-fill{background:var(--pr);color:#fff}
.hbtn-fill:hover{background:var(--prh);transform:translateY(-1px)}
.hbtn-g{background:var(--s1);color:var(--t2);border:1px solid var(--bd)}
.hbtn-g:hover{background:var(--s2)}
.pr-main{max-width:900px;margin:0 auto;padding:40px 24px 80px}
.cert-card{background:var(--s0);border:1px solid var(--bd);border-radius:20px;overflow:hidden;margin-bottom:20px;position:relative}
.cert-top{background:linear-gradient(135deg,#6B4E12 0%,#B8902F 50%,#D8B65A 100%);padding:40px 44px;position:relative;overflow:hidden}
.cert-pattern{position:absolute;inset:0;opacity:0.06}
.cert-overline{display:flex;align-items:center;gap:8px;margin-bottom:20px}
.cert-overline-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:100px;padding:5px 14px 5px 8px}
.cert-overline-dot{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;color:#fff}
.cert-overline-txt{font-size:12px;font-weight:600;color:rgba(255,255,255,0.9);letter-spacing:0.02em}
.cert-name{font-size:42px;font-weight:800;color:#fff;letter-spacing:-0.04em;line-height:1.05;margin-bottom:6px}
.cert-meta{display:flex;align-items:center;gap:20px;margin-bottom:28px;flex-wrap:wrap}
.cert-meta-item{font-size:13px;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:5px}
.cert-scores-row{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:20px}
.cert-score-hero{display:flex;flex-direction:column}
.cert-score-num{font-family:var(--fm);font-size:88px;font-weight:500;color:#fff;letter-spacing:-0.06em;line-height:1}
.cert-score-denom{font-family:var(--fm);font-size:32px;color:rgba(255,255,255,0.4);letter-spacing:-0.03em;margin-left:4px}
.cert-score-lbl{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:6px}
.cert-score-tier{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:100px;padding:5px 14px;font-size:13px;font-weight:700;color:#fff;margin-top:10px}
.cert-pct-num{font-family:var(--fm);font-size:32px;font-weight:500;color:rgba(255,255,255,0.9);letter-spacing:-0.03em}
.cert-validity{font-size:11px;color:rgba(255,255,255,0.45);margin-top:6px}
.cert-bottom{padding:18px 44px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--bd);flex-wrap:wrap;gap:16px}
.cert-id-block{display:flex;flex-direction:column;gap:2px}
.cert-id-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--t4)}
.cert-id-val{font-family:var(--fm);font-size:13px;font-weight:500;color:var(--t2)}
.cert-verify{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--pr);font-weight:600;cursor:pointer;text-decoration:none}
.cert-verify:hover{text-decoration:underline}
.cert-scenario{background:var(--prs);border:1px solid var(--bd);border-radius:0 0 12px 12px;padding:14px 44px;display:flex;align-items:center;gap:12px}
.cert-scenario-icon{width:32px;height:32px;border-radius:8px;background:var(--prm);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--pr)}
.cert-scenario-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--t3)}
.cert-scenario-text{font-size:14px;font-weight:500;color:var(--t1);margin-top:1px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.radar-card{background:var(--s0);border:1px solid var(--bd);border-radius:16px;padding:24px;display:flex;flex-direction:column;align-items:center}
.section-title{font-size:14px;font-weight:700;color:var(--t1);letter-spacing:-0.02em;margin-bottom:4px}
.section-sub{font-size:12px;color:var(--t3);margin-bottom:20px}
.pct-card{background:var(--s0);border:1px solid var(--bd);border-radius:16px;padding:24px;display:flex;flex-direction:column}
.pct-bar-track{height:8px;background:var(--s2);border-radius:100px;margin:10px 0 6px;position:relative;overflow:visible}
.pct-bar-fill{height:100%;background:var(--pr);border-radius:100px;position:relative;transition:width 1s ease}
.pct-bar-thumb{width:16px;height:16px;border-radius:50%;background:var(--pr);border:3px solid #fff;box-shadow:0 0 0 2px var(--pr);position:absolute;right:-8px;top:50%;transform:translateY(-50%)}
.pct-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--t4);font-family:var(--fm)}
.pct-bands{display:flex;gap:0;margin-top:20px;border:1px solid var(--bd);border-radius:10px;overflow:hidden}
.pct-band{flex:1;padding:10px 8px;text-align:center;border-right:1px solid var(--bd);position:relative}
.pct-band:last-child{border-right:none}
.pct-band.active{background:var(--prs)}
.pct-band-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--t4)}
.pct-band.active .pct-band-lbl{color:var(--prt)}
.pct-band-range{font-family:var(--fm);font-size:12px;font-weight:500;color:var(--t3);margin-top:2px}
.pct-band.active .pct-band-range{color:var(--pr);font-weight:700}
.pct-band-arrow{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:5px solid var(--pr);position:absolute;top:-6px;left:50%;transform:translateX(-50%);display:none}
.pct-band.active .pct-band-arrow{display:block}
.dims-section{margin-bottom:16px}
.dims-grid{display:grid;grid-template-columns:1fr;gap:10px}
.dim-card{background:var(--s0);border:1px solid var(--bd);border-radius:14px;padding:20px;display:flex;gap:16px;align-items:flex-start;transition:border-color 160ms ease}
.dim-card:hover{border-color:var(--bd2)}
.dim-ring{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;flex-shrink:0;border:2px solid;font-family:var(--fm)}
.dim-ring-num{font-size:18px;font-weight:500;line-height:1;letter-spacing:-0.03em}
.dim-ring-max{font-size:10px;opacity:0.6;letter-spacing:-0.01em}
.dim-body{flex:1;min-width:0}
.dim-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.dim-name{font-size:15px;font-weight:700;color:var(--t1);letter-spacing:-0.02em}
.dim-icon{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.dim-bar-track{height:5px;background:var(--s2);border-radius:100px;margin-bottom:10px;position:relative}
.dim-bar-fill{height:100%;border-radius:100px}
.dim-evidence{background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:10px 12px}
.dim-evidence-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--t4);margin-bottom:4px}
.dim-evidence-text{font-size:13px;color:var(--t2);line-height:1.55;font-style:italic}
.ai-summary{background:var(--s0);border:1px solid var(--bd);border-radius:16px;padding:24px;margin-bottom:16px}
.ai-summary-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.ai-summary-icon{width:36px;height:36px;background:var(--prs);border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--pr)}
.ai-summary-title{font-size:15px;font-weight:700;color:var(--t1);letter-spacing:-0.02em}
.ai-summary-sub{font-size:12px;color:var(--t3);margin-top:1px}
.ai-summary-text{font-size:15px;color:var(--t2);line-height:1.75;font-weight:400;border-left:3px solid var(--pr);padding-left:16px;margin-bottom:20px}
.ai-summary-text strong{color:var(--t1);font-weight:700}
.sw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sw-col-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px}
.sw-list{list-style:none;display:flex;flex-direction:column;gap:7px;padding:0;margin:0}
.sw-list li{font-size:13px;color:var(--t2);display:flex;align-items:flex-start;gap:8px;line-height:1.5}
.sw-icon{flex-shrink:0;margin-top:1px}
.employer-card{background:var(--prs);border:1px solid var(--bd2);border-radius:16px;padding:24px;margin-bottom:16px}
.employer-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.employer-icon{width:36px;height:36px;background:var(--pr);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff}
.employer-title{font-size:15px;font-weight:700;color:var(--prt)}
.employer-sub{font-size:12px;color:var(--t3);margin-top:1px}
.interview-qs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.iq{background:var(--s0);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font-size:13px;color:var(--t2);line-height:1.5;display:flex;gap:8px;align-items:flex-start}
.iq-num{font-family:var(--fm);font-size:11px;font-weight:500;color:var(--t4);flex-shrink:0;margin-top:2px}
.share-card{background:var(--s0);border:1px solid var(--bd);border-radius:16px;padding:24px;margin-bottom:16px}
.share-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;gap:12px}
.share-title{font-size:15px;font-weight:700;color:var(--t1)}
.share-sub{font-size:12px;color:var(--t3);margin-top:2px}
.share-buttons{display:flex;gap:10px;flex-wrap:wrap}
.share-btn{font-family:var(--f);font-weight:600;font-size:13px;border-radius:9px;cursor:pointer;transition:all 140ms ease;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border:1px solid var(--bd2);background:var(--s0);color:var(--t2);letter-spacing:-0.01em}
.share-btn:hover{border-color:var(--pr);color:var(--pr);background:var(--prs)}
.share-btn:disabled{opacity:0.6;cursor:not-allowed}
.share-btn-linkedin{background:#0A66C2;color:#fff;border-color:#0A66C2}
.share-btn-linkedin:hover{background:#0958A8;border-color:#0958A8;color:#fff}
.link-box{background:var(--s1);border:1px solid var(--bd);border-radius:9px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-top:14px}
.link-url{font-family:var(--fm);font-size:12px;color:var(--t3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copy-btn{font-family:var(--f);font-size:12px;font-weight:600;color:var(--pr);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background 140ms ease;white-space:nowrap}
.copy-btn:hover{background:var(--prs)}
.rpt-footer{background:var(--s0);border:1px solid var(--bd);border-radius:16px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.footer-left{font-size:12px;color:var(--t4)}
.footer-right{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.footer-right a{font-size:12px;color:var(--t3);text-decoration:none;cursor:pointer}
.footer-right a:hover{color:var(--pr)}
.verified-badge{display:inline-flex;align-items:center;gap:5px;background:var(--oks);border:1px solid var(--okb);border-radius:100px;padding:3px 10px;font-size:11px;font-weight:700;color:var(--ok)}
@media(max-width:760px){
  .prism-report .pr-header{padding:14px 18px;flex-wrap:wrap;gap:10px}
  .prism-report .cert-top{padding:28px 24px}
  .prism-report .cert-name{font-size:32px}
  .prism-report .cert-bottom,.prism-report .cert-scenario{padding-left:24px;padding-right:24px}
  .prism-report .two-col,.prism-report .sw-grid,.prism-report .interview-qs{grid-template-columns:1fr}
}
      `}</style>

      <div className="pr-top-strip" />

      <header className="pr-header no-print">
        <div className="pr-header-logo">
          <div className="pr-logo-mark">
            <svg viewBox="0 0 24 24">
              <rect x="9" y="2.5" width="11" height="15" rx="2" fill="#fff" opacity="0.55" />
              <rect x="4" y="5" width="11" height="15" rx="2" fill="#fff" />
              <g stroke="#B8902F" strokeWidth="1" strokeLinecap="round">
                <line x1="6.5" y1="9" x2="12.5" y2="9" />
                <line x1="6.5" y1="11.5" x2="12.5" y2="11.5" />
                <line x1="6.5" y1="14" x2="10.5" y2="14" />
              </g>
              <circle cx="9" cy="18" r="3.2" fill="#fff" stroke="#B8902F" strokeWidth="0.9" />
            </svg>
          </div>
          <div>
            <div className="pr-logo-name">StudAI Prism</div>
            <div className="pr-logo-sub">Certified Assessment</div>
          </div>
        </div>
        <div className="pr-header-right">
          <button className="hbtn hbtn-g" onClick={handleDownloadPdf} disabled={downloading}>
            <Download size={15} />{downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          <button className="hbtn hbtn-outline" onClick={handleLinkedInShare}><Share2 size={15} />Share</button>
          <button className="hbtn hbtn-fill" onClick={() => navigate('/')}><Briefcase size={15} />Find jobs with this score</button>
        </div>
      </header>

      <main className="pr-main">
        {/* CERTIFICATE CARD */}
        <div className="cert-card" ref={certRef}>
          <div className="cert-top">
            <svg className="cert-pattern" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="hex" width="30" height="26" patternUnits="userSpaceOnUse">
                  <polygon points="15,1 29,8 29,22 15,29 1,22 1,8" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="400" height="200" fill="url(#hex)" />
            </svg>
            <div className="cert-overline">
              <div className="cert-overline-badge">
                <div className="cert-overline-dot"><Award size={12} /></div>
                <span className="cert-overline-txt">Prism Certified · Issued {issuedDate}</span>
              </div>
            </div>
            <div className="cert-name">{displayName}</div>
            <div className="cert-meta">
              <div className="cert-meta-item"><MapPin size={14} />India</div>
              {college && <div className="cert-meta-item"><Building2 size={14} />{college}</div>}
              <div className="cert-meta-item"><Clock size={14} />30 min · Assessment Session</div>
            </div>
            <div className="cert-scores-row">
              <div className="cert-score-hero">
                <div className="cert-score-lbl">Overall Prism Score</div>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <div className="cert-score-num">{scores.overall}</div>
                  <div className="cert-score-denom">%</div>
                </div>
                <div className="cert-score-tier"><Star size={14} fill="#FCD34D" color="#FCD34D" />{band.label} · {reliabilityText}</div>
                {provisionalLanguage && (
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#FCD34D', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Provisional — {provisionalLanguage} scoring not yet calibrated
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: '14px 20px', flexDirection: 'column' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>National Percentile</div>
                  {pctAll != null ? (
                    <>
                      <div className="cert-pct-num">{pctAll}<span style={{ fontSize: 18, opacity: 0.6 }}>{ordinalSuffix(pctAll)}</span></div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Top {Math.max(1, 100 - pctAll)}% nationally</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', maxWidth: 140, lineHeight: 1.5 }}>Available once enough candidates have tested</div>
                  )}
                </div>
                <div className="cert-validity" style={{ textAlign: 'right' }}>Valid until {validUntil} · {verifyId}</div>
              </div>
            </div>
          </div>

          <div className="cert-bottom">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div className="cert-id-block">
                <div className="cert-id-lbl">Verification ID</div>
                <div className="cert-id-val">{verifyId}</div>
              </div>
              <div className="cert-id-block">
                <div className="cert-id-lbl">Test Date</div>
                <div className="cert-id-val">{testDateTime}</div>
              </div>
              <div className="cert-id-block">
                <div className="cert-id-lbl">Status</div>
                <div style={{ marginTop: 3 }}><span className="verified-badge"><CheckCircle2 size={13} />Verified</span></div>
              </div>
            </div>
            <a className="cert-verify" href={`/verify/${verifyId}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Verify this credential</a>
          </div>

          <div className="cert-scenario">
            <div className="cert-scenario-icon"><Lightbulb size={16} /></div>
            <div>
              <div className="cert-scenario-label">Scenario presented</div>
              <div className="cert-scenario-text">{scenarioText}</div>
            </div>
          </div>
        </div>

        {/* RADAR + PERCENTILE */}
        <div className="two-col">
          <div className="radar-card">
            <div className="section-title">Skill Map</div>
            <div className="section-sub">Shape of ability across 5 dimensions</div>
            <Radar dims={radarDims} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, justifyContent: 'center' }}>
              {dims.slice(0, 3).map((d) => (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--t3)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />{d.label}
                </div>
              ))}
            </div>
          </div>

          <div className="pct-card">
            <div className="section-title">Percentile Ranking</div>
            <div className="section-sub" style={{ marginBottom: 0 }}>Where you stand nationally</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, marginTop: 16 }}>
              <PercentileRow label="All candidates tested" value={pctAll} />
              <PercentileRow label="Same track" value={pctTrack} />
              <PercentileRow label="Recent graduates" value={pctCohort} />
              <div className="pct-bands">
                {[
                  { lbl: 'Developing', range: '0–49', active: scores.overall < 50 },
                  { lbl: 'Growing', range: '50–69', active: scores.overall >= 50 && scores.overall < 70 },
                  { lbl: 'Strong', range: '70–84', active: scores.overall >= 70 && scores.overall < 85 },
                  { lbl: 'Exceptional', range: '85–100', active: scores.overall >= 85 },
                ].map((b) => (
                  <div key={b.lbl} className={`pct-band${b.active ? ' active' : ''}`}>
                    <div className="pct-band-arrow" />
                    <div className="pct-band-lbl">{b.lbl}</div>
                    <div className="pct-band-range">{b.range}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
                {ci ? (
                  <>
                    <span style={{ fontWeight: 600, color: 'var(--t2)' }}>Score confidence interval:</span> {ci.low}–{ci.high} points (90% coverage target{ci.provisional ? ', provisional until first calibration study' : ''}).
                    {' '}Score is valid for {validityMonths} months from the date of assessment.
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 600, color: 'var(--t2)' }}>Score reliability:</span> {reliabilityText}
                    {typeof report.reliability?.agreement === 'number' && <> · judge-panel agreement {Math.round(report.reliability.agreement * 100)}%</>}
                    . Provisional — calibrated confidence intervals will be published after our first calibration study. Score is valid for {validityMonths} months from the date of assessment.
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* HOW THE OVERALL SCORE IS CALCULATED */}
        <div className="dims-section" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <div className="section-title" style={{ fontSize: 16 }}>How your overall score is calculated</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>
              Your overall Prism Score is a weighted average of the five dimensions
            </div>
          </div>
          <div style={{ background: 'var(--s0)', border: '1px solid var(--bd)', borderRadius: 16, padding: '20px 24px' }}>
            {dims.map((d) => {
              const weight = DIMENSION_WEIGHTS[d.key] ?? 0
              const contribution = d.score * weight
              return (
                <div
                  key={d.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--bd)' }}
                >
                  <div style={{ flex: '0 0 168px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 60 }}>
                    <div className="dim-bar-track" style={{ margin: 0 }}>
                      <div className="dim-bar-fill" style={{ width: `${d.score}%`, background: d.color }} />
                    </div>
                  </div>
                  <div style={{ flex: '0 0 44px', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>{d.score}</div>
                  <div style={{ flex: '0 0 48px', textAlign: 'right', fontSize: 12, color: 'var(--t3)' }}>× {Math.round(weight * 100)}%</div>
                  <div style={{ flex: '0 0 56px', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 14, fontWeight: 600, color: d.color }}>{contribution.toFixed(1)}</div>
                </div>
              )
            })}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Overall Prism Score</span>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 22, fontWeight: 600, color: 'var(--pr)' }}>{scores.overall}%</span>
            </div>
          </div>
        </div>

        {/* DIMENSION BREAKDOWN */}
        <div className="dims-section">
          <div style={{ marginBottom: 12 }}>
            <div className="section-title" style={{ fontSize: 16 }}>Dimension Breakdown</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>What each score is based on — specific moments from your conversation</div>
          </div>
          <div className="dims-grid">
            {dims.map((d) => {
              const evidence = report.evidence?.[d.key] || feedback?.[d.key] || d.evidence
              return (
                <div className="dim-card" key={d.key}>
                  <div className="dim-ring" style={{ background: d.ringBg, borderColor: d.color, color: d.color }}>
                    <div className="dim-ring-num">{d.score}</div>
                    <div className="dim-ring-max">/100</div>
                  </div>
                  <div className="dim-body">
                    <div className="dim-header">
                      <div>
                        <div className="dim-name">{d.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{d.sub}</div>
                      </div>
                      <div className="dim-icon" style={{ background: d.iconBg }}><d.Icon size={14} color={d.color} /></div>
                    </div>
                    <div className="dim-bar-track"><div className="dim-bar-fill" style={{ width: `${d.score}%`, background: d.color }} /></div>
                    <div className="dim-evidence">
                      <div className="dim-evidence-label">Behavioral evidence from your session</div>
                      <div className="dim-evidence-text">{evidence}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* AI SUMMARY */}
        <div className="ai-summary">
          <div className="ai-summary-hdr">
            <div className="ai-summary-icon"><Sparkles size={18} /></div>
            <div>
              <div className="ai-summary-title">Orin™ Performance Summary</div>
              <div className="ai-summary-sub">AI-generated · Based on scored exchanges in your 30-minute session</div>
            </div>
          </div>
          {feedback?.summary && <div className="ai-summary-text">{feedback.summary}</div>}
          <div className="sw-grid">
            <div>
              <div className="sw-col-lbl" style={{ color: 'var(--ok)' }}>✓ Strengths identified</div>
              <ul className="sw-list">
                {strengths.map((s, i) => (
                  <li key={i}><ArrowUpRight className="sw-icon" size={14} color="#047857" />{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="sw-col-lbl" style={{ color: 'var(--am)' }}>↑ Growth areas</div>
              <ul className="sw-list">
                {growth.map((g, i) => (
                  <li key={i}><ArrowRight className="sw-icon" size={14} color="#C27803" />{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* EMPLOYER VIEW */}
        <div className="employer-card">
          <div className="employer-hdr">
            <div className="employer-icon"><Building2 size={18} /></div>
            <div>
              <div className="employer-title">For the Employer — What to Probe in the Interview</div>
              <div className="employer-sub">Suggested interview questions based on this Prism profile · Generated by Orin™</div>
            </div>
          </div>
          <div className="interview-qs">
            {interviewQs.map((q, i) => (
              <div className="iq" key={i}><span className="iq-num">Q{i + 1}</span>{q}</div>
            ))}
          </div>
        </div>

        {/* SHARE SECTION */}
        <div className="share-card no-print">
          <div className="share-hdr">
            <div>
              <div className="share-title">Share your Prism Score</div>
              <div className="share-sub">Your score is verified and shareable. Employers can check authenticity at the verification link.</div>
            </div>
            <span className="verified-badge"><CheckCircle2 size={13} />Verified</span>
          </div>
          <div className="share-buttons">
            <button className="share-btn share-btn-linkedin" onClick={handleLinkedInShare}><Linkedin size={15} />Add to LinkedIn Profile</button>
            <button className="share-btn" onClick={handleDownloadPdf} disabled={downloading}><Download size={15} />{downloading ? 'Preparing…' : 'Download PDF'}</button>
            <button className="share-btn" onClick={() => { setEmailState('idle'); setEmailMsg(''); setEmailOpen(true) }}><Mail size={15} />Email report</button>
            <button className="share-btn" onClick={handleDownloadPdf}><Award size={15} />Download certificate</button>
          </div>
          <div className="link-box">
            <LinkIcon size={15} color="var(--t3)" style={{ flexShrink: 0 }} />
            <span className="link-url">{shareUrl}</span>
            <button
              className="copy-btn"
              onClick={(e) => {
                navigator.clipboard.writeText(shareUrl)
                const el = e.currentTarget
                el.textContent = 'Copied!'
                setTimeout(() => { el.textContent = 'Copy link' }, 2000)
              }}
            >Copy link</button>
          </div>
        </div>

        {/* DATA RIGHTS — human review + erasure */}
        <div className="share-card no-print" style={{ borderColor: '#E8E0D0' }}>
          <div className="share-hdr">
            <div>
              <div className="share-title">Your rights</div>
              <div className="share-sub">This score was generated with AI assistance. You can request a human review or have your data permanently deleted.</div>
            </div>
            <span className="verified-badge"><ShieldCheck size={13} />DPDP</span>
          </div>

          {!disputeOpen && disputeState !== 'done' && (
            <div className="share-buttons">
              <button className="share-btn" onClick={() => setDisputeOpen(true)}>
                <Scale size={15} />Request human review
              </button>
              <button
                className="share-btn"
                onClick={handleEraseData}
                disabled={erasing}
                style={{ color: '#C0392B', borderColor: '#E8C3BC' }}
              >
                <Trash2 size={15} />{erasing ? 'Deleting…' : 'Delete my data'}
              </button>
            </div>
          )}

          {disputeOpen && disputeState !== 'done' && (
            <div style={{ marginTop: 14 }}>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={4}
                placeholder="Tell us why you believe this score should be reviewed by a person…"
                style={{
                  width: '100%', borderRadius: 10, padding: '12px 14px', fontSize: 14,
                  border: '1px solid #E8E0D0', color: '#1A1A2E', outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              {disputeState === 'error' && (
                <p style={{ color: '#C0392B', fontSize: 13, marginTop: 6 }}>{disputeMsg}</p>
              )}
              <div className="share-buttons" style={{ marginTop: 10 }}>
                <button
                  className="share-btn share-btn-linkedin"
                  onClick={handleSubmitDispute}
                  disabled={disputeState === 'submitting'}
                >
                  <Scale size={15} />{disputeState === 'submitting' ? 'Submitting…' : 'Submit for review'}
                </button>
                <button className="share-btn" onClick={() => { setDisputeOpen(false); setDisputeState('idle'); setDisputeMsg('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {disputeState === 'done' && (
            <div
              style={{
                marginTop: 14, padding: '12px 14px', borderRadius: 10,
                background: '#EAF7EE', border: '1px solid #BFE6CC', color: '#1E7A45',
                fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <CheckCircle2 size={16} />{disputeMsg}
            </div>
          )}
        </div>

        {/* EMAIL REPORT MODAL */}
        {emailOpen && (
          <div
            className="no-print"
            onClick={() => !emailSending && setEmailOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(10,13,20,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16,
                padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 10, background: 'rgba(184,144,47,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A7724',
                }}>
                  <Mail size={20} />
                </span>
                <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1A1A2E', margin: 0 }}>
                  Email your report
                </h3>
              </div>
              <p style={{ fontSize: 14, color: '#64687A', margin: '0 0 14px' }}>
                We’ll send the certified PDF to your inbox.
              </p>

              {emailState === 'done' ? (
                <div
                  style={{
                    padding: '12px 14px', borderRadius: 10, background: '#EAF7EE',
                    border: '1px solid #BFE6CC', color: '#1E7A45', fontSize: 14,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <CheckCircle2 size={16} />{emailMsg}
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    disabled={emailSending}
                    style={{
                      width: '100%', borderRadius: 10, padding: '12px 14px', fontSize: 14,
                      border: '1px solid #E8E0D0', color: '#1A1A2E', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  {emailState === 'error' && (
                    <p style={{ color: '#C0392B', fontSize: 13, marginTop: 6 }}>{emailMsg}</p>
                  )}
                </>
              )}

              <div className="share-buttons" style={{ marginTop: 14 }}>
                {emailState === 'done' ? (
                  <button className="share-btn" onClick={() => setEmailOpen(false)}>Close</button>
                ) : (
                  <>
                    <button
                      className="share-btn share-btn-linkedin"
                      onClick={handleEmailReport}
                      disabled={emailSending}
                    >
                      <Mail size={15} />{emailSending ? 'Sending…' : 'Send report'}
                    </button>
                    <button
                      className="share-btn"
                      onClick={() => setEmailOpen(false)}
                      disabled={emailSending}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="rpt-footer">
          <div className="footer-left">
            © 2026 StudAI One · Studai Edutech Pvt. Ltd. · CIN U85500TN2024PTC168744<br />
            Score valid for {SCORE_VALIDITY_MONTHS} months · Reassessment available after {REASSESSMENT_DAYS} days
          </div>
          <div className="footer-right">
            <a>Privacy policy</a>
            <a>Assessment methodology</a>
            <a href={`/verify/${verifyId}`} target="_blank" rel="noopener noreferrer">Verify this score</a>
            <span className="verified-badge"><ShieldCheck size={13} />DPDP Compliant</span>
          </div>
        </div>
      </main>
    </div>
  )
}
