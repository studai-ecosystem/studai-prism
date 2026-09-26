// /rater/evidence — blinded double-rating of V3 evidence units (spec §45;
// C12.01). One item at a time: the capability and the candidate's own words,
// with the candidate's identity replaced by a token. Raters never see the
// AI's level, other ratings, or who the candidate is.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Panel } from '../../components/ui/Card.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { InlineNotice } from '../../components/ui/Notice.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { validationApi, RATER_TOKEN_KEY } from '../../api/validation.js'

const SOURCE = { DIALOGUE_TURN: 'Conversation turn', WORK_ARTIFACT: 'Work artifact', ANCHOR_PROBE: 'Structured probe' }

function Frame({ children }) {
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-prism-ink">Rate evidence</h1>
        <p className="text-sm text-prism-ink-muted">Judge only what the candidate wrote, against the rubric from your training. You will not see the AI&apos;s judgement or other raters&apos; ratings.</p>
      </header>
      {children}
    </main>
  )
}

function Rating({ token, item }) {
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState('')
  const [error, setError] = useState(null)
  const headingRef = useRef(null)
  useEffect(() => { setChoice(''); setError(null); headingRef.current?.focus() }, [item.itemId])
  const save = useMutation({
    mutationFn: () => validationApi.rate(token, item.itemId, choice === 'cannot' ? { cannotRate: true } : { level: Number(choice) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rater-evidence-next'] }),
  })
  const submit = (e) => {
    e.preventDefault()
    if (!choice) { setError('Choose a level, or "cannot rate".'); return }
    setError(null)
    save.mutate()
  }
  return (
    <Panel title={<span ref={headingRef} tabIndex={-1}>{item.capabilityName || item.capabilityId}</span>} description={`${SOURCE[item.sourceType] || 'Evidence'} · rubric ${item.rubricVersion}`}>
      <blockquote className="whitespace-pre-wrap rounded-[var(--prism-radius-md)] border-l-4 border-prism-border-strong bg-prism-subtle p-4 text-sm text-prism-ink" data-testid="evidence-excerpt">{item.excerpt}</blockquote>
      <p className="mt-2 text-xs text-prism-ink-subtle">{item.candidateToken} stands for the candidate.</p>
      <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
        <fieldset aria-describedby={error ? 'rating-error' : undefined}>
          <legend className="mb-2 text-sm font-medium text-prism-ink">Rubric level</legend>
          <div className="flex flex-wrap gap-3">
            {item.scale.map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm text-prism-ink">
                <input type="radio" name="level" value={String(n)} checked={choice === String(n)} onChange={() => setChoice(String(n))} />
                Level {n}{n === 1 ? ' (lowest)' : n === item.scale.length ? ' (highest)' : ''}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-prism-ink">
              <input type="radio" name="level" value="cannot" checked={choice === 'cannot'} onChange={() => setChoice('cannot')} />
              Cannot rate from this excerpt
            </label>
          </div>
          {error && <p id="rating-error" role="alert" className="mt-2 text-sm text-prism-blocked">{error}</p>}
        </fieldset>
        <Button type="submit" loading={save.isPending}>Save and continue</Button>
        {save.error && <div role="alert"><InlineNotice tone="blocked">{save.error.message}</InlineNotice></div>}
      </form>
    </Panel>
  )
}

export default function EvidenceRatingPage() {
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RATER_TOKEN_KEY) || '' : ''
  const query = useQuery({ queryKey: ['rater-evidence-next'], queryFn: () => validationApi.next(token), enabled: Boolean(token), retry: false })
  if (!token) {
    return <Frame><InlineNotice tone="partial">Sign in with your rater token on the <Link className="underline" to="/rater">rater workbench</Link> first.</InlineNotice></Frame>
  }
  if (query.isPending) return <Frame><Skeleton variant="card" label="Loading the next item" /></Frame>
  if (query.isError) {
    const e = query.error
    const text = e.status === 404 ? 'The evidence rating queue is not available.'
      : e.code === 'RATER_NOT_QUALIFIED' ? 'Finish rater training on the workbench before rating evidence.'
        : e.status === 401 ? 'Your rater token was not recognised. Sign in again on the rater workbench.'
          : e.message
    return <Frame><div role="alert"><InlineNotice tone="blocked">{text}</InlineNotice></div><Button variant="secondary" onClick={() => query.refetch()}>Try again</Button></Frame>
  }
  if (!query.data) return <Frame><InlineNotice tone="positive">There is nothing to rate right now. Thank you.</InlineNotice></Frame>
  return <Frame><Rating token={token} item={query.data} /></Frame>
}
