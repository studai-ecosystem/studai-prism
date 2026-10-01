import { useEffect, useState } from 'react'
import DocumentLayout, { DocH, DocP, MethodCard, StudyStatus } from '../../components/DocumentLayout.jsx'
import { DIMENSION_KEYS, DIMENSION_WEIGHTS, DIMENSION_LABELS, REASSESSMENT_DAYS, NOT_SOLE_BASIS_POLICY } from '../../../server/lib/sharedConstants.js'

// Behavioural signals the judging panel is instructed to look for, keyed by the
// same dimension keys the server scores. The WEIGHTS come from the shared
// constants module the scoring route uses, so this page cannot drift from the
// arithmetic that produces scores.
const DIMENSION_SIGNALS = {
  criticalThinking: 'Asks clarifying questions, identifies root cause, takes a clear position',
  communication: 'Clear structure, appropriate tone, confident delivery',
  collaboration: 'Acknowledges pushback, adapts position, finds common ground',
  problemSolving: 'Breaks down constraints, generates options, commits to a decision',
  aiDigitalFluency: 'Uses AI tools effectively, verifies output, decides what to do manually',
}

const methodology = [...DIMENSION_KEYS]
  .sort((a, b) => DIMENSION_WEIGHTS[b] - DIMENSION_WEIGHTS[a])
  .map((key) => ({ dimension: DIMENSION_LABELS[key], signal: DIMENSION_SIGNALS[key], weight: `${Math.round(DIMENSION_WEIGHTS[key] * 100)}%` }))

// Mirrors server/routes/assessment.js and server/lib/scoreAggregator.js.
// Describes only what the code does.
const scoringSteps = [
  { title: 'A panel of independent AI judges', desc: 'Your full conversation transcript is scored by a panel of independent AI evaluator passes (five by default), each with a different judging persona and with the rubric presented in different orders to counter position bias.' },
  { title: 'Median vote per dimension', desc: 'Your score on each dimension is the median across the panel \u2014 robust to any single outlier judge. Reports are profile-first: each dimension is reported separately, recomputed and range-checked on the server; no overall composite is issued during the pilot.' },
  { title: 'Agreement is measured, not assumed', desc: 'We measure how much the judges disagreed. Low agreement produces a lower AI panel consistency label on your report and can flag the result for human review \u2014 you can also request human review of any result.' },
]

// Preregistered studies. Nothing here states a result the registry does not hold.
const STUDIES = [
  { key: 'steering_ab', title: 'Does adaptive steering raise the quality of evidence per conversation?' },
  { key: 'human_llm_agreement', title: 'Do the AI panels agree with trained human raters, dimension by dimension?' },
  { key: 'test_retest', title: 'Is the score stable when the same person takes it twice?' },
]

const BANDS = [
  { range: '0\u201349', name: 'Developing', desc: 'Evidence of the behaviour was limited in this conversation.' },
  { range: '50\u201369', name: 'Growing', desc: 'Evidence was present for some behaviours and thin for others.' },
  { range: '70\u201384', name: 'Strong', desc: 'Evidence was consistent across most of the behaviours observed.' },
  { range: '85\u2013100', name: 'Exceptional', desc: 'Evidence was consistent and well developed across the behaviours observed.' },
]

export default function ValidityStudy() {
  const [bench, setBench] = useState(null)
  useEffect(() => {
    let live = true
    fetch('/api/evidence/adversarial').then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setBench(d) }).catch(() => {})
    return () => { live = false }
  }, [])

  return (
    <DocumentLayout
      title="Scoring Methodology"
      subtitle="How Prism scores are produced"
      status={<StudyStatus status="progress">Formal validation study in progress</StudyStatus>}
    >
      <DocH id="status">Where validation stands today</DocH>
      <DocP>
        A valid assessment measures what it claims to measure. Prism is built for that from day one: each of
        the 5 dimensions is defined by observable behaviours, every score is produced by a multi-judge panel
        with measured agreement, and every scoring decision is logged. A formal validation study &mdash; human
        co-rated sessions, item calibration and published agreement statistics &mdash; is in progress and has
        not yet been completed. Until it is published, Prism reports carry an explicit AI panel consistency
        label instead of statistical claims we cannot yet back. Critical Thinking and Problem Solving are
        reported as separate dimensions; that distinction is provisional pending factor evidence from the
        validation programme.
      </DocP>

      <DocH id="studies">Study status</DocH>
      <DocP>Every study below was written down before any data existed. Results are published here either way they come out.</DocP>
      <div className="grid gap-3 sm:grid-cols-2">
        {[...STUDIES.map((s) => ({ ...s, status: 'pending', label: 'Preregistered, not yet run' })),
          { key: 'adversarial_benchmark', title: bench?.protocol?.hypothesis || 'Can coached, LLM-assisted candidates be told apart from honest ones?', status: bench ? 'progress' : 'pending', label: bench?.status || 'Preregistered, not yet run' }].map((s) => (
          <MethodCard key={s.key} label={s.key} title={s.title}>
            <StudyStatus status={s.status}>{s.label}</StudyStatus>
          </MethodCard>
        ))}
      </div>

      <DocH id="how">How a score is produced</DocH>
      <div className="grid gap-4">
        {scoringSteps.map((s) => (
          <MethodCard key={s.title} title={s.title}>{s.desc}</MethodCard>
        ))}
      </div>

      <DocH id="weights">Scoring weights</DocH>
      <DocP>
        Each dimension is scored 0&ndash;100 and weighted for internal research and calibration exactly as
        below. During the pilot, reports are profile-first &mdash; the weighted composite is not shown on new reports.
      </DocP>
      <div className="overflow-x-auto rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Dimensions, the signal the AI panel looks for and each weight</caption>
          <thead>
            <tr className="bg-prism-subtle text-xs uppercase tracking-wide text-prism-ink-muted">
              <th scope="col" className="px-4 py-3 font-semibold">Dimension</th>
              <th scope="col" className="px-4 py-3 font-semibold">Signal the AI looks for</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody>
            {methodology.map((row) => (
              <tr key={row.dimension} className="border-t border-prism-border align-top">
                <th scope="row" className="px-4 py-3 font-semibold text-prism-ink">{row.dimension}</th>
                <td className="px-4 py-3 text-prism-ink-muted">{row.signal}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-prism-ink">{row.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH id="bands">Reading a dimension score</DocH>
      <DocP>The bands below describe a score on this scale. They are a reading guide, not a prediction. {NOT_SOLE_BASIS_POLICY}</DocP>
      <dl className="grid gap-3 sm:grid-cols-2">
        {BANDS.map((b) => (
          <div key={b.name} className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
            <dt className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tabular-nums text-prism-ink">{b.range}</span>
              <span className="text-sm font-semibold text-prism-ink-muted">{b.name}</span>
            </dt>
            <dd className="mt-1 text-sm text-prism-ink-muted">{b.desc}</dd>
          </div>
        ))}
      </dl>

      <DocH id="retake">Retake policy</DocH>
      <DocP>
        Each assessment uses a different scenario. Candidates can retake after {REASSESSMENT_DAYS} days.
        Scores from multiple attempts are not averaged &mdash; the most recent score is used.
      </DocP>
    </DocumentLayout>
  )
}