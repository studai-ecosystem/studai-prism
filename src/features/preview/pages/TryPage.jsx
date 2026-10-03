// /try — P8.3 free first experience (public). One short PRACTICE scene, one
// answer, one source-backed observation computed from the learner's own words,
// one retry, then an honest explanation of the broader package and an EXPLICIT
// "save to account" step. The preview token is a scoped capability held in
// sessionStorage for the sign-in round trip; it never enters a URL or event.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RotateCcw, Quote, Save } from 'lucide-react'
import { fetchPreviewScene, startPreview, retryPreview, claimPreview } from '../../../api/preview.js'
import { fetchOffers } from '../../../api/offers.js'
import { Button, LinkButton } from '../../../components/ui/Button.jsx'
import { Card } from '../../../components/ui/Card.jsx'
import { StatusChip } from '../../../components/ui/Badge.jsx'
import { Textarea } from '../../../components/ui/FormControls.jsx'
import { Callout } from '../../../components/ui/Notice.jsx'
import { Skeleton } from '../../../components/ui/Skeleton.jsx'
import { ErrorState } from '../../../components/states/ErrorState.jsx'
import { DocumentTitle } from '../../../components/ui/DocumentTitle.jsx'
import PrismLogo from '../../../components/ui/PrismLogo.jsx'
import { useAuth } from '../../../app/providers/AuthProvider.jsx'
import { track } from '../../../lib/telemetry.js'

const TOKEN_KEY = 'prism_preview_token'
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } }
const writeToken = (t) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable: the preview still works in memory */ } }

function Observation({ observation }) {
  const observed = observation.kind === 'OBSERVED'
  return (
    <Card as="article" aria-labelledby="observation-title" className="space-y-4 p-5" data-testid="preview-observation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="observation-title" className="text-lg font-semibold text-prism-ink">{observation.label}</h2>
        <StatusChip tone={observed ? 'positive' : 'insufficient'} label={observed ? 'Observed · practice' : 'Not found yet'} />
      </div>
      {observed ? (
        <blockquote className="flex gap-3 rounded-[var(--prism-radius-md)] border border-prism-border bg-prism-subtle p-4 text-sm text-prism-ink">
          <Quote size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-green-ink" />
          <span><span className="sr-only">Your words: </span>&ldquo;{observation.quote}&rdquo;</span>
        </blockquote>
      ) : (
        <p className="text-sm text-prism-ink" data-testid="preview-not-found">{observation.message}</p>
      )}
      <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">Why it matters:</span> {observation.why}</p>
      <p className="text-sm text-prism-ink-muted"><span className="font-medium text-prism-ink">One next behaviour:</span> {observation.nextBehaviour}</p>
      <p className="text-xs text-prism-ink-subtle">{observation.disclaimer}</p>
    </Card>
  )
}

export default function TryPage() {
  const { status: authStatus } = useAuth()
  const scene = useQuery({ queryKey: ['public', 'preview', 'scene'], queryFn: fetchPreviewScene, staleTime: 5 * 60 * 1000 })
  // The package explanation at the end reads the server's offer so the
  // allowance and purchasability are exact, never a hard-coded promise.
  const offers = useQuery({ queryKey: ['public', 'offers'], queryFn: fetchOffers, retry: false, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false })
  const sprint = offers.data?.offers?.find((o) => o.code === 'PERSONAL_DEVELOPMENT_SPRINT') || offers.data?.offer || null
  const [answer, setAnswer] = useState('')
  const [attempt, setAttempt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [claim, setClaim] = useState(null) // { attemptId } after an explicit save
  const [pendingToken, setPendingToken] = useState(() => readToken())

  useEffect(() => { track('preview_started', { surface: 'TRY' }) }, [])

  const submit = async (event) => {
    event?.preventDefault?.()
    if (busy) return
    const text = answer.trim()
    if (!text) { setError('Write a few sentences first.'); return }
    setBusy(true)
    setError(null)
    try {
      const next = attempt ? await retryPreview(attempt.previewToken, text) : await startPreview(text)
      setAttempt(next)
      writeToken(next.previewToken)
      setPendingToken(next.previewToken)
      setAnswer('')
    } catch (err) {
      setError(err?.message || 'We could not read your answer. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const token = attempt?.previewToken || pendingToken
    if (!token || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await claimPreview(token)
      setClaim(result)
      writeToken(null)
      setPendingToken(null)
      track('preview_claimed', { outcome: result.alreadyClaimed ? 'ALREADY_LINKED' : 'LINKED' })
    } catch (err) {
      setError(err?.message || 'We could not save this preview to your account.')
    } finally {
      setBusy(false)
    }
  }

  const canRetry = attempt && attempt.attemptsRemaining > 0
  const exhausted = attempt && attempt.attemptsRemaining === 0
  const signedIn = authStatus === 'authenticated'

  return (
    <main id="main" className="prism-app min-h-screen bg-prism-canvas text-prism-ink">
      <DocumentTitle title="Try a short situation" />
      <header className="flex h-16 items-center justify-between border-b border-prism-border px-6">
        <Link to="/" aria-label="Prism home"><PrismLogo size={32} /></Link>
        <nav aria-label="Try page" className="flex items-center gap-4 text-sm">
          <Link to="/#pricing" className="underline underline-offset-4"><span className="sm:hidden">Full package</span><span className="hidden sm:inline">What the full package includes</span></Link>
          {!signedIn && <Link to="/login?next=%2Ftry" className="underline underline-offset-4">Sign in</Link>}
        </nav>
      </header>

      <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-green-ink">Practice scene · free</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">Try a short situation</h1>
          <p className="text-sm text-prism-ink-muted">
            A few minutes, one choice, one observation about your own words. This is practice, not a formal assessment: nothing here becomes a capability level or a report.
          </p>
        </div>

        {scene.isPending && <Skeleton variant="page" label="Loading the scene" />}
        {scene.isError && (
          <ErrorState title="The scene could not be loaded" description={scene.error?.message || 'Please try again.'} action={<Button onClick={() => scene.refetch()}>Try again</Button>} />
        )}

        {scene.data && (
          <>
            <Card as="section" aria-labelledby="scene-title" className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="scene-title" className="text-lg font-semibold">{scene.data.title}</h2>
                <StatusChip tone="neutral" label={`${scene.data.mode === 'PRACTICE' ? 'Practice' : scene.data.mode} · ${scene.data.contentStatus === 'DRAFT' ? 'draft content' : scene.data.contentStatus.toLowerCase()}`} />
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-prism-ink">
                {scene.data.briefing.facts.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Who is in the room</h3>
                  <ul className="mt-1 space-y-1 text-sm text-prism-ink-muted">
                    {scene.data.briefing.participants.map((p) => <li key={p.name}><span className="font-medium text-prism-ink">{p.name}</span> — {p.role}</li>)}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{scene.data.briefing.board.title}</h3>
                  <table className="mt-1 w-full text-sm">
                    <thead><tr className="text-left text-xs uppercase tracking-wide text-prism-ink-subtle"><th scope="col" className="pr-2 font-medium">Task</th><th scope="col" className="pr-2 font-medium">Owner</th><th scope="col" className="font-medium">Due</th></tr></thead>
                    <tbody>
                      {scene.data.briefing.board.rows.map((r) => (
                        <tr key={r.task} className="border-t border-prism-border">
                          <td className="py-1 pr-2">{r.task}</td>
                          <td className="py-1 pr-2">{r.owner || <span className="text-prism-ink-subtle">No owner</span>}</td>
                          <td className="whitespace-nowrap py-1">{r.due || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {attempt && <Observation observation={attempt.observation} />}

            {claim ? (
              <Callout tone="positive" title="Saved to your account" action={<LinkButton to="/app/home" variant="primary">Go to your home <ArrowRight size={16} aria-hidden="true" /></LinkButton>}>
                {claim.alreadyClaimed ? 'This preview was already linked to your account.' : 'Your practice observation is now part of your account history, labelled as practice.'}
              </Callout>
            ) : exhausted ? (
              <Card as="section" aria-labelledby="next-title" className="space-y-4 p-5" data-testid="preview-next">
                <h2 id="next-title" className="text-lg font-semibold">What comes next is up to you</h2>
                <p className="text-sm text-prism-ink-muted">
                  The preview includes one answer and one retry. The personal development sprint adds one formal assessment with its evidence-backed report, four development missions of your choice and one fresh practice challenge over 30 days. Pricing and limits are explained before any payment.
                </p>
                <dl className="grid gap-1 text-xs text-prism-ink-muted" data-testid="preview-package">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-prism-ink">Exact allowance</dt>
                    <dd>
                      {sprint?.included
                        ? `Formal assessment ×${sprint.included.formalAssessments} · missions ×${sprint.included.missionsSelectable} (${sprint.included.attemptsPerMission} attempts each) · fresh challenge ×${sprint.included.freshChallenges} · ${sprint.windowDays}-day activity window`
                        : offers.isPending ? 'Loading the package terms…' : 'Shown at checkout from the server configuration'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-prism-ink">Status</dt>
                    <dd data-testid="preview-package-status">
                      {!sprint ? (offers.isPending ? 'Loading…' : 'Explained at checkout')
                        : sprint.purchasable ? (sprint.priceStatus === 'APPROVED' ? 'Available' : 'Available at a proposed test price, pending finance approval')
                          : 'Not yet purchasable: the included content or price is still under review'}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3">
                  {signedIn ? (
                    <Button onClick={save} loading={busy} loadingLabel="Saving…"><Save size={16} aria-hidden="true" /> Save this to my account</Button>
                  ) : (
                    <LinkButton to="/register?next=%2Ftry" variant="primary">Create an account to keep this</LinkButton>
                  )}
                  <LinkButton to="/#pricing" variant="secondary">See the full package</LinkButton>
                </div>
                <p className="text-xs text-prism-ink-subtle">Your preview is kept for one hour. Saving is an explicit step; nothing is linked to an account until you choose it.</p>
              </Card>
            ) : (
              <form onSubmit={submit} className="space-y-3" aria-labelledby="answer-title">
                <h2 id="answer-title" className="text-lg font-semibold">{attempt ? 'Try once more' : 'Your turn'}</h2>
                <p className="text-sm text-prism-ink">{scene.data.prompt}</p>
                <Textarea
                  id="preview-answer"
                  label={attempt ? 'Your revised answer' : 'Your answer'}
                  hint={`Up to ${scene.data.limits.maxAnswerChars} characters. ${attempt ? 'This is your one retry.' : 'You get one retry.'}`}
                  value={answer}
                  maxLength={scene.data.limits.maxAnswerChars}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={6}
                  disabled={busy}
                  error={error}
                />
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" loading={busy} loadingLabel="Reading your answer…">
                    {attempt ? <><RotateCcw size={16} aria-hidden="true" /> Retry</> : <>Send my answer <ArrowRight size={16} aria-hidden="true" /></>}
                  </Button>
                  {canRetry && <span className="self-center text-xs text-prism-ink-subtle">{attempt.attemptsRemaining} retry left</span>}
                </div>
              </form>
            )}

            {!attempt && pendingToken && signedIn && !claim && (
              <Callout tone="info" title="You have an unsaved preview from earlier" action={<Button onClick={save} loading={busy} loadingLabel="Saving…">Save it to my account</Button>}>
                It stays available for one hour after you answered.
              </Callout>
            )}

            {error && exhausted && <p role="alert" className="text-sm text-prism-blocked">{error}</p>}
            <p className="text-xs text-prism-ink-subtle">{scene.data.notice}</p>
          </>
        )}
      </div>
    </main>
  )
}
