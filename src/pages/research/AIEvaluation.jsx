import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

const analyses = [
  {
    title: 'Reasoning quality',
    desc: 'Does the candidate identify the right problem? Do they make logical connections?',
  },
  {
    title: 'Communication clarity',
    desc: 'Is the response structured? Is the tone appropriate? Is it concise?',
  },
  {
    title: 'Adaptability',
    desc: 'Does the candidate change their approach when new information arrives?',
  },
  {
    title: 'Collaboration signals',
    desc: 'Do they acknowledge other viewpoints? Do they build on them or dismiss them?',
  },
]

const doesNot = [
  'Does not score based on accent or speaking style',
  'Does not analyse facial expressions, voice tone or emotion — the webcam is used for proctoring only, and voice is converted to text before scoring',
  'Does not penalise for typing speed',
  'Does not compare against a single correct answer',
  'Does not factor in gender, name, or college name',
]

export default function AIEvaluation() {
  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="AI Evaluation"
          subtitle="How our AI evaluation panel scores your responses"
        />
      </section>

      {/* Section 1 — The evaluator */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[var(--color-ink)] mb-4">
            The evaluator
          </h2>
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            Prism scores are produced by a panel of large-language-model
            evaluators running on Microsoft Azure OpenAI Service. Your full
            conversation is scored several times by independent judge passes
            with different judging personas and rubric orderings; your score on
            each dimension is the median of the panel, and the level of
            agreement between judges is measured and shown on your report as a
            reliability label. The model deployment used is configured per
            environment and recorded with your report — every result can be
            traced to the models that produced it.
          </p>
        </div>
      </section>

      {/* Section 2 — What the AI panel analyses */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-12">
          What the AI panel analyses
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {analyses.map((a) => (
            <div
              key={a.title}
              className="bg-white rounded-2xl shadow-sm p-6 border-t-2 border-transparent hover:border-gold transition-colors"
            >
              <h3 className="text-xl font-bold text-[var(--color-ink)] mb-3">
                {a.title}
              </h3>
              <p className="text-[var(--color-ink-muted)] leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — What the AI panel does NOT do */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-12">
          What the AI panel does not do
        </h2>
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-10 max-w-3xl mx-auto">
          <ul className="flex flex-col gap-4">
            {doesNot.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="text-gold font-bold text-xl leading-6 flex-shrink-0">
                  ✓
                </span>
                <span className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Section 4 — Privacy */}
      <section className="py-12 pb-20 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto border-l-4 border-gold">
          <h2 className="text-2xl font-bold text-[var(--color-ink)] mb-4">Privacy</h2>
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            Your assessment conversation is processed to generate your score
            and stored so your result can be verified and, if you ask, reviewed
            by a human. With your explicit consent, your responses and scores
            may also be used in pseudonymised form for research and to
            calibrate and improve the scoring system. Your audio is transcribed
            and never stored, your report is never shared with employers
            without your action, and you can request deletion of your
            assessment data at any time.
          </p>
        </div>
      </section>
    </PageLayout>
  )
}
