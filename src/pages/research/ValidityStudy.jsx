import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

const methodology = [
  {
    dimension: 'Critical Thinking',
    signal: 'Asks clarifying questions, identifies root cause, takes a clear position',
    weight: '20%',
  },
  {
    dimension: 'Communication',
    signal: 'Clear structure, appropriate tone, confident delivery',
    weight: '20%',
  },
  {
    dimension: 'Collaboration',
    signal: 'Acknowledges pushback, adapts position, finds common ground',
    weight: '20%',
  },
  {
    dimension: 'Problem Solving',
    signal: 'Breaks down constraints, generates options, commits to a decision',
    weight: '20%',
  },
  {
    dimension: 'AI Readiness',
    signal: 'Uses AI tool effectively, verifies output, decides what to do manually',
    weight: '20%',
  },
]

const bands = [
  {
    range: '0–40',
    name: 'Developing',
    desc: 'Early stage. Core skills need structured development.',
    color: '#E05252',
  },
  {
    range: '41–65',
    name: 'Emerging',
    desc: 'Shows potential. Some dimensions strong, others need work.',
    color: '#E0A028',
  },
  {
    range: '66–85',
    name: 'Proficient',
    desc: 'Ready for most roles. Strong across multiple dimensions.',
    color: '#3CB97A',
  },
  {
    range: '86–100',
    name: 'Advanced',
    desc: 'Exceptional. Stands out in competitive hiring.',
    color: '#C9A84C',
  },
]

export default function ValidityStudy() {
  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="Validity Study"
          subtitle="Assessment accuracy and scoring methodology"
        />
      </section>

      {/* Section 1 — What validity means */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#0A0D14] mb-4">
            What validity means
          </h2>
          <p className="text-[#5A5F6E] leading-relaxed text-lg">
            A valid assessment measures what it claims to measure. Prism is
            designed so that each of the 5 dimensions has clearly defined
            observable behaviours that the AI evaluator is trained to detect —
            not guess at.
          </p>
        </div>
      </section>

      {/* Section 2 — Scoring methodology */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[#0A0D14] text-center mb-12">
          Scoring methodology
        </h2>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F6EFE2]">
                <th className="py-4 px-6 text-sm font-bold text-[#0A0D14] uppercase tracking-wide">
                  Dimension
                </th>
                <th className="py-4 px-6 text-sm font-bold text-[#0A0D14] uppercase tracking-wide">
                  Signal the AI looks for
                </th>
                <th className="py-4 px-6 text-sm font-bold text-[#0A0D14] uppercase tracking-wide text-right">
                  Weight
                </th>
              </tr>
            </thead>
            <tbody>
              {methodology.map((row) => (
                <tr key={row.dimension} className="border-t border-[#E8E0D0]">
                  <td className="py-4 px-6 font-semibold text-[#0A0D14] align-top">
                    {row.dimension}
                  </td>
                  <td className="py-4 px-6 text-[#5A5F6E] align-top">
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

      {/* Section 3 — Score bands */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[#0A0D14] text-center mb-12">
          Score bands
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {bands.map((b) => (
            <div
              key={b.name}
              className="bg-white rounded-2xl shadow-sm p-6 border-l-4"
              style={{ borderLeftColor: b.color }}
            >
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-bold text-[#0A0D14]">
                  {b.range}
                </span>
                <span className="text-lg font-semibold" style={{ color: b.color }}>
                  {b.name}
                </span>
              </div>
              <p className="text-[#5A5F6E] leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4 — Retake policy */}
      <section className="py-12 pb-20 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#0A0D14] mb-4">
            Retake policy
          </h2>
          <p className="text-[#5A5F6E] leading-relaxed text-lg">
            Each assessment uses a different scenario. Candidates can retake
            after 30 days. Scores from multiple attempts are not averaged — the
            most recent score is used.
          </p>
        </div>
      </section>
    </PageLayout>
  )
}
