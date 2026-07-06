import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

const pillars = [
  {
    name: 'Accessible',
    desc: '$10 puts skill verification within reach of every student.',
  },
  {
    name: 'Trustworthy',
    desc: 'AI evaluation with no human bias, no favouritism, no guesswork.',
  },
  {
    name: 'Actionable',
    desc: 'A score that employers actually use to make hiring decisions faster.',
  },
]

export default function Mission() {
  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="Our Mission"
          subtitle="Building the skills layer for India's workforce"
        />
      </section>

      {/* Body */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            Every year millions of students graduate across India. Most of them
            are capable. Very few of them have a way to prove it. Degrees tell
            you where someone studied. Grades tell you how they performed in
            exams. Nothing tells you how they think, communicate, or solve
            problems under real pressure. That is the gap Prism fills.
          </p>
        </div>
      </section>

      {/* Vision statement */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-[var(--color-paper)] rounded-2xl shadow-sm p-10 md:p-14 max-w-3xl mx-auto border-l-4 border-gold">
          <p className="text-2xl md:text-3xl font-serif text-[var(--color-ink)] leading-snug">
            “A world where every capable person has a verified, verifiable
            proof of what they can do — regardless of where they studied or who
            they know.”
          </p>
        </div>
      </section>

      {/* Three pillars */}
      <section className="py-12 pb-20 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-12">
          What we stand for
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((p, i) => (
            <div
              key={p.name}
              className="bg-white rounded-2xl shadow-sm p-8 border-t-2 border-transparent hover:border-gold transition-colors"
            >
              <span className="text-3xl font-bold text-gold">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-xl font-bold text-[var(--color-ink)] mt-3 mb-3">
                {p.name}
              </h3>
              <p className="text-[var(--color-ink-muted)] leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </PageLayout>
  )
}
