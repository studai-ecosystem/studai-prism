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
          subtitle="How Claude API scores your responses"
        />
      </section>

      {/* Section 1 — The evaluator */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#0A0D14] mb-4">
            The evaluator
          </h2>
          <p className="text-[#5A5F6E] leading-relaxed text-lg">
            Prism uses Anthropic's Claude API as its evaluation engine. Claude
            analyses every response in the conversation — not just what was said
            but how it was said, in what order, and how it responded to pressure
            from the other avatars.
          </p>
        </div>
      </section>

      {/* Section 2 — What Claude analyses */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[#0A0D14] text-center mb-12">
          What Claude analyses
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {analyses.map((a) => (
            <div
              key={a.title}
              className="bg-white rounded-2xl shadow-sm p-6 border-t-2 border-transparent hover:border-gold transition-colors"
            >
              <h3 className="text-xl font-bold text-[#0A0D14] mb-3">
                {a.title}
              </h3>
              <p className="text-[#5A5F6E] leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — What Claude does NOT do */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[#0A0D14] text-center mb-12">
          What Claude does not do
        </h2>
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-10 max-w-3xl mx-auto">
          <ul className="flex flex-col gap-4">
            {doesNot.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="text-gold font-bold text-xl leading-6 flex-shrink-0">
                  ✓
                </span>
                <span className="text-[#5A5F6E] leading-relaxed text-lg">
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
          <h2 className="text-2xl font-bold text-[#0A0D14] mb-4">Privacy</h2>
          <p className="text-[#5A5F6E] leading-relaxed text-lg">
            Your assessment conversation is processed for scoring only. It is
            not stored permanently, not shared with employers, and not used to
            train AI models. You own your data.
          </p>
        </div>
      </section>
    </PageLayout>
  )
}
