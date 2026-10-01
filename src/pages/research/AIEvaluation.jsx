import DocumentLayout, { DocH, DocP, MethodCard } from '../../components/DocumentLayout.jsx'

const analyses = [
  { title: 'Reasoning quality', desc: 'Does the candidate identify the right problem? Do they make logical connections?' },
  { title: 'Communication clarity', desc: 'Is the response structured? Is the tone appropriate? Is it concise?' },
  { title: 'Adaptability', desc: 'Does the candidate change their approach when new information arrives?' },
  { title: 'Collaboration signals', desc: 'Do they acknowledge other viewpoints? Do they build on them or dismiss them?' },
]

const doesNot = [
  'Does not score based on accent or speaking style',
  'Does not analyse facial expressions, voice tone or emotion \u2014 the webcam is used for proctoring only, and voice is converted to text before scoring',
  'Does not penalise for typing speed',
  'Does not compare against a single correct answer',
  'Does not factor in gender, name, or college name',
]

export default function AIEvaluation() {
  return (
    <DocumentLayout title="AI Evaluation" subtitle="How our AI evaluation panel scores your responses">
      <DocH id="evaluator">The evaluator</DocH>
      <DocP>
        Prism scores are produced by a panel of large-language-model evaluators accessed through Amazon
        Bedrock. Your full conversation is scored several times by independent judge passes with different
        judging personas and rubric orderings; your score on each dimension is the median of the panel, and
        the level of agreement between judges is measured and shown on your report as an AI panel
        consistency label. The model deployment used is configured per environment and recorded with your
        report &mdash; every result can be traced to the models that produced it.
      </DocP>

      <DocH id="analyses">What the AI panel analyses</DocH>
      <div className="grid gap-4 sm:grid-cols-2">
        {analyses.map((a) => <MethodCard key={a.title} title={a.title}>{a.desc}</MethodCard>)}
      </div>

      <DocH id="does-not">What the AI panel does not do</DocH>
      <ul className="space-y-3">
        {doesNot.map((item) => (
          <li key={item} className="flex items-start gap-3 text-base leading-relaxed text-prism-ink-muted">
            <span aria-hidden="true" className="mt-0.5 font-bold text-brand-green-ink">{'\u2713'}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <DocH id="privacy">Privacy</DocH>
      <DocP>
        Your assessment conversation is processed to generate your score and stored so your result can be
        verified and, if you ask, reviewed by a human. With your explicit consent, your responses and scores
        may also be used in pseudonymised form for research and to calibrate and improve the scoring system.
        Your audio is transcribed and never stored, your report is never shared with employers without your
        action, and you can request deletion of your assessment data at any time.
      </DocP>
    </DocumentLayout>
  )
}