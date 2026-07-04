import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

const dimensions = [
  {
    num: '01',
    name: 'Critical Thinking',
    measures:
      'How you frame a problem, identify gaps, and take a position under pressure.',
    inConversation:
      'Avatar asks a vague question. Do you ask for clarity or guess?',
  },
  {
    num: '02',
    name: 'Communication',
    measures:
      'How clearly and confidently you express your thinking — spoken and written.',
    inConversation:
      'Can you explain your decision in simple terms when Avatar 3 is confused?',
  },
  {
    num: '03',
    name: 'Collaboration',
    measures:
      'How you handle disagreement, listen, adapt, and find common ground.',
    inConversation: 'Avatar 2 pushes back hard. Do you shut down or engage?',
  },
  {
    num: '04',
    name: 'Problem Solving',
    measures:
      'How you break down constraints, generate options, and move to resolution.',
    inConversation:
      'Avatar adds a budget cut mid-scenario. How do you adapt?',
  },
  {
    num: '05',
    name: 'AI & Digital Fluency',
    measures:
      'How fluently you work alongside AI — prompting, verifying, deciding.',
    inConversation:
      'Avatar mentions an AI tool is available. Do you use it well?',
  },
]

const steps = [
  {
    num: '1',
    text: 'Every response is captured in real time',
  },
  {
    num: '2',
    text: 'A panel of AI evaluators (Azure OpenAI) analyses reasoning, tone, structure, and adaptability',
  },
  {
    num: '3',
    text: 'A score is generated per dimension and combined into the Prism Score',
  },
]

export default function ScienceBehindPrism() {
  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="The Science Behind Prism"
          subtitle="How we measure 5 skill dimensions in a 30-minute AI conversation"
        />
      </section>

      {/* Section 1 — Why conversation not a test */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#0A0D14] mb-4">
            Why a conversation, not a test
          </h2>
          <p className="text-[#5A5F6E] leading-relaxed text-lg">
            Traditional assessments measure memory. Prism measures thinking. A
            live AI conversation surfaces how a person actually reasons,
            communicates, and collaborates — under real pressure, in real time.
            No memorisation. No tricks. Just real capability.
          </p>
        </div>
      </section>

      {/* Section 2 — The 5 dimensions */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[#0A0D14] text-center mb-12">
          The 5 dimensions explained
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dimensions.map((d) => (
            <div
              key={d.num}
              className="bg-white rounded-2xl shadow-sm p-6 flex flex-col border-t-2 border-transparent hover:border-gold transition-colors"
            >
              <span className="text-3xl font-bold text-gold mb-3">{d.num}</span>
              <h3 className="text-xl font-bold text-[#0A0D14] mb-3">{d.name}</h3>
              <p className="text-[#5A5F6E] leading-relaxed mb-4">{d.measures}</p>
              <p className="text-[#8A8FA0] italic leading-relaxed mt-auto">
                {d.inConversation}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — How scoring works */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[#0A0D14] text-center mb-12">
          How scoring works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div
              key={s.num}
              className="bg-white rounded-2xl shadow-sm p-8 flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-gold text-[#0A0D14] font-bold text-xl flex items-center justify-center mb-5">
                {s.num}
              </div>
              <p className="text-[#5A5F6E] leading-relaxed text-lg">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4 — Quote block */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <blockquote className="bg-white rounded-2xl shadow-sm p-10 md:p-14 max-w-3xl mx-auto border-l-4 border-gold">
          <p className="text-2xl md:text-3xl font-serif text-[#0A0D14] leading-snug">
            “The best predictor of job performance is not where you studied. It
            is how you think. Prism measures that.”
          </p>
          <footer className="mt-6 text-[#8A8FA0] font-semibold">
            — StudAI One Research Team
          </footer>
        </blockquote>
      </section>
    </PageLayout>
  )
}
