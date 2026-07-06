import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'
import {
  DIMENSION_KEYS,
  DIMENSION_WEIGHTS,
  DIMENSION_LABELS,
  REASSESSMENT_DAYS,
} from '../../../server/lib/sharedConstants.js'

// Behavioural signals the judging panel is instructed to look for, keyed by
// the same dimension keys the server scores. The WEIGHTS are imported from the
// shared constants module the scoring route itself uses, so the numbers on
// this page cannot drift from the arithmetic that produces scores (audit C2).
const DIMENSION_SIGNALS = {
  criticalThinking: 'Asks clarifying questions, identifies root cause, takes a clear position',
  communication: 'Clear structure, appropriate tone, confident delivery',
  collaboration: 'Acknowledges pushback, adapts position, finds common ground',
  problemSolving: 'Breaks down constraints, generates options, commits to a decision',
  aiDigitalFluency: 'Uses AI tools effectively, verifies output, decides what to do manually',
}

const methodology = [...DIMENSION_KEYS]
  .sort((a, b) => DIMENSION_WEIGHTS[b] - DIMENSION_WEIGHTS[a])
  .map((key) => ({
    dimension: DIMENSION_LABELS[key],
    signal: DIMENSION_SIGNALS[key],
    weight: `${Math.round(DIMENSION_WEIGHTS[key] * 100)}%`,
  }))

// How each score is actually produced — mirrors server/routes/assessment.js
// (panel of judges) + server/lib/scoreAggregator.js (median vote, position-swap
// consistency, reliability label). Describe only what the code does.
const scoringSteps = [
  {
    title: 'A panel of independent AI judges',
    desc: 'Your full conversation transcript is scored by a panel of independent AI evaluator passes (five by default), each with a different judging persona and with the rubric presented in different orders to counter position bias.',
  },
  {
    title: 'Median vote per dimension',
    desc: 'Your score on each dimension is the median across the panel — robust to any single outlier judge. The overall score is a weighted average using the exact weights below, recomputed and range-checked on the server.',
  },
  {
    title: 'Agreement is measured, not assumed',
    desc: 'We measure how much the judges disagreed. Low agreement produces a lower reliability label on your report and can flag the result for human review — you can also request human review of any result.',
  },
]

export default function ValidityStudy() {
  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="Scoring Methodology"
          subtitle="How Prism scores are produced — formal validation study in progress"
        />
      </section>

      {/* Section 1 — Validation status (honest) */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto border-l-4 border-gold">
          <h2 className="text-2xl font-bold text-[var(--color-ink)] mb-4">
            Where validation stands today
          </h2>
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            A valid assessment measures what it claims to measure. Prism is
            built for that from day one: each of the 5 dimensions is defined by
            observable behaviours, every score is produced by a multi-judge
            panel with measured agreement, and every scoring decision is
            logged. A formal validation study — human co-rated sessions, item
            calibration and published reliability statistics — is in progress
            and has not yet been completed. Until it is published, Prism
            reports carry an explicit reliability label instead of statistical
            claims we cannot yet back.
          </p>
        </div>
      </section>

      {/* Section 2 — How a score is produced */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-12">
          How a score is produced
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {scoringSteps.map((s) => (
            <div key={s.title} className="bg-white rounded-2xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-[var(--color-ink)] mb-3">{s.title}</h3>
              <p className="text-[var(--color-ink-muted)] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — Scoring weights */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-4">
          Scoring weights
        </h2>
        <p className="text-[var(--color-ink-muted)] text-center max-w-2xl mx-auto mb-12">
          Your overall Prism Score is a weighted average of the five dimension
          scores. These are the exact weights used by the scoring engine.
        </p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--color-paper)]">
                <th className="py-4 px-6 text-sm font-bold text-[var(--color-ink)] uppercase tracking-wide">
                  Dimension
                </th>
                <th className="py-4 px-6 text-sm font-bold text-[var(--color-ink)] uppercase tracking-wide">
                  Signal the AI looks for
                </th>
                <th className="py-4 px-6 text-sm font-bold text-[var(--color-ink)] uppercase tracking-wide text-right">
                  Weight
                </th>
              </tr>
            </thead>
            <tbody>
              {methodology.map((row) => (
                <tr key={row.dimension} className="border-t border-[var(--color-line)]">
                  <td className="py-4 px-6 font-semibold text-[var(--color-ink)] align-top">
                    {row.dimension}
                  </td>
                  <td className="py-4 px-6 text-[var(--color-ink-muted)] align-top">
                    {row.signal}
                  </td>
                  <td className="py-4 px-6 font-bold text-gold text-right align-top">
                    {row.weight}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4 — Score bands (mirrors the bands shown on the score report) */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-12">
          Score bands
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {[
            { range: '0–49', name: 'Developing', desc: 'Early stage. Core skills need structured development.', color: 'var(--color-danger)' },
            { range: '50–69', name: 'Growing', desc: 'Shows potential. Some dimensions strong, others need work.', color: 'var(--color-reliability-moderate)' },
            { range: '70–84', name: 'Strong', desc: 'Ready for most roles. Strong across multiple dimensions.', color: 'var(--color-success)' },
            { range: '85–100', name: 'Exceptional', desc: 'Exceptional. Stands out in competitive hiring.', color: 'var(--color-accent)' },
          ].map((b) => (
            <div
              key={b.name}
              className="bg-white rounded-2xl shadow-sm p-6 border-l-4"
              style={{ borderLeftColor: b.color }}
            >
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-bold text-[var(--color-ink)]">
                  {b.range}
                </span>
                <span className="text-lg font-semibold" style={{ color: b.color }}>
                  {b.name}
                </span>
              </div>
              <p className="text-[var(--color-ink-muted)] leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 5 — Retake policy */}
      <section className="py-12 pb-20 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[var(--color-ink)] mb-4">
            Retake policy
          </h2>
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            Each assessment uses a different scenario. Candidates can retake
            after {REASSESSMENT_DAYS} days. Scores from multiple attempts are
            not averaged — the most recent score is used.
          </p>
        </div>
      </section>
    </PageLayout>
  )
}
