// P8.2 minimal intent onboarding. Shown once on first visit to /app/home when
// the workspace owns no history and no intent preference is saved. Asks only
// what changes the experience (who you are, what you want to do, how you want
// to respond). Display-only: the answer routes to a relevant action and is
// NEVER a scoring input. Skippable; speech is honestly "not yet available".
import { useState } from 'react'
import { Card } from '../../../components/ui/Card.jsx'
import { Button } from '../../../components/ui/Button.jsx'
import { RadioGroup } from '../../../components/ui/FormControls.jsx'
import { usePreferences, useSavePreferences } from '../../student/hooks.js'
import { IntentChooser } from './IntentChooser.jsx'

export const SEGMENT_OPTIONS = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'EARLY_CAREER', label: 'Early career' },
  { value: 'OTHER', label: 'Other' },
]
export const INTENTION_OPTIONS = [
  { value: 'UNDERSTAND', label: 'Understand how I work', description: 'A formal assessment with the evidence behind every conclusion.' },
  { value: 'PRACTISE', label: 'Practise what matters next', description: 'Short development missions, labelled as practice.' },
  { value: 'PREPARE', label: 'Prepare for a specific situation', description: 'Private preparation; opens when it is ready.' },
]
export const RESPONSE_MODE_OPTIONS = [
  { value: 'TEXT', label: 'Typing (text)' },
  { value: 'SPEECH', label: 'Speaking (speech) — not yet available', disabled: true, description: 'Speech responses are not supported yet; text is the supported mode.' },
]

const SKIP_KEY = 'prism_intent_skipped'
const skipped = () => { try { return sessionStorage.getItem(SKIP_KEY) === '1' } catch { return false } }
const markSkipped = () => { try { sessionStorage.setItem(SKIP_KEY, '1') } catch { /* fine */ } }

export function IntentStep({ onDone }) {
  const [segment, setSegment] = useState('')
  const [intention, setIntention] = useState('')
  const [responseMode, setResponseMode] = useState('TEXT')
  const prefs = usePreferences()
  const save = useSavePreferences()
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!segment || !intention) { setError('Choose one option in each group, or skip for now.'); return }
    setError(null)
    try {
      const current = prefs.data || { reducedMotion: false, largerText: false }
      await save.mutateAsync({ reducedMotion: current.reducedMotion, largerText: current.largerText, segment, intention, responseMode })
      onDone?.({ segment, intention, responseMode })
    } catch (err) {
      setError(err?.message || 'Your choices could not be saved. You can continue without them.')
    }
  }
  const skip = () => { markSkipped(); onDone?.(null) }

  return (
    <Card as="section" aria-labelledby="intent-step-title" className="space-y-5 p-5" data-testid="intent-step">
      <div className="space-y-1">
        <h2 id="intent-step-title" className="text-lg font-semibold text-prism-ink">Three quick choices</h2>
        <p className="text-sm text-prism-ink-muted">They only shape what we show first. They are never used to measure you, and you can change or skip them.</p>
      </div>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <RadioGroup label="I am a…" name="segment" options={SEGMENT_OPTIONS} value={segment} onChange={setSegment} />
        <RadioGroup label="Right now I want to…" name="intention" options={INTENTION_OPTIONS} value={intention} onChange={setIntention} />
        <RadioGroup label="I prefer to respond by…" name="responseMode" options={RESPONSE_MODE_OPTIONS} value={responseMode} onChange={setResponseMode} />
        {error && <p role="alert" className="text-sm text-prism-blocked">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={save.isPending} loadingLabel="Saving…">Continue</Button>
          <Button type="button" variant="ghost" onClick={skip}>Skip for now</Button>
        </div>
      </form>
    </Card>
  )
}

// Decides between the intent step and the intention chooser for a new learner.
export function NewLearnerStart({ assessmentTo, practiceTo }) {
  const prefs = usePreferences()
  const [done, setDone] = useState(skipped())
  const hasIntent = Boolean(prefs.data && (prefs.data.segment || prefs.data.intention))
  if (!done && !hasIntent && !prefs.isPending && !prefs.isError) {
    return <IntentStep onDone={() => setDone(true)} />
  }
  return <IntentChooser assessmentTo={assessmentTo} practiceTo={practiceTo} />
}

export default IntentStep
