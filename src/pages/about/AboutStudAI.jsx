import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

const stats = [
  { value: '1,200+', label: 'Students assessed' },
  { value: '14', label: 'Colleges on platform' },
  { value: '8', label: 'Cities across India' },
]

const details = [
  { label: 'Founded', value: '2024' },
  { label: 'Headquarters', value: 'Chennai, India' },
  { label: 'CIN', value: 'U85500TN2024PTC168744' },
  {
    label: 'Status',
    value: 'Private — In production across India and APAC',
  },
]

export default function AboutStudAI() {
  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="About StudAI One"
          subtitle="Building the skills layer for India's workforce"
        />
      </section>

      {/* Section 1 — Who we are */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[var(--color-ink)] mb-4">Who we are</h2>
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            StudAI One is a privately held intelligence company built in
            Chennai, India. We build AI-powered products for students, colleges,
            and employers across India and APAC. Prism is our skills
            verification product — the foundation on which we believe serious
            hiring should be built.
          </p>
        </div>
      </section>

      {/* Section 2 — Why we built Prism */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto border-l-4 border-gold">
          <h2 className="text-2xl font-bold text-[var(--color-ink)] mb-4">
            Why we built Prism
          </h2>
          <p className="text-[var(--color-ink-muted)] leading-relaxed text-lg">
            We kept hearing the same thing from placement officers and hiring
            managers — resumes tell us where someone studied, not what they can
            do. We built Prism to fix that. One conversation. A verified score.
            Proof that works.
          </p>
        </div>
      </section>

      {/* Section 3 — Stat boxes */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl shadow-sm p-8 text-center"
            >
              <p className="text-4xl font-bold text-gold mb-2">{s.value}</p>
              <p className="text-[var(--color-ink-muted)]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4 — Company details */}
      <section className="py-12 pb-20 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--color-ink)] text-center mb-12">
          Company details
        </h2>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
          <table className="w-full text-left border-collapse">
            <tbody>
              {details.map((row, i) => (
                <tr
                  key={row.label}
                  className={i === 0 ? '' : 'border-t border-[var(--color-line)]'}
                >
                  <td className="py-4 px-6 font-semibold text-[var(--color-ink)] w-1/3 align-top">
                    {row.label}
                  </td>
                  <td className="py-4 px-6 text-[var(--color-ink-muted)] align-top">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageLayout>
  )
}
