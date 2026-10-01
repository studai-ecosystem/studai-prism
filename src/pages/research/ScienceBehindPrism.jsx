import { Link } from 'react-router-dom'
import DocumentLayout, { DocH, DocP, MethodCard, StudyStatus } from '../../components/DocumentLayout.jsx'

const dimensions = [
  { num: '01', name: 'Critical Thinking', measures: 'How you frame a problem, identify gaps, and take a position under pressure.', inConversation: 'Avatar asks a vague question. Do you ask for clarity or guess?' },
  { num: '02', name: 'Communication', measures: 'How clearly and confidently you express your thinking \u2014 spoken and written.', inConversation: 'Can you explain your decision in simple terms when Avatar 3 is confused?' },
  { num: '03', name: 'Collaborative Behaviour', measures: 'Behaviour demonstrated while responding to other participants in a simulated workplace interaction \u2014 handling disagreement, listening, adapting.', inConversation: 'Avatar 2 pushes back hard. Do you shut down or engage?' },
  { num: '04', name: 'Problem Solving', measures: 'How you break down constraints, generate options, and move to resolution.', inConversation: 'Avatar adds a budget cut mid-scenario. How do you adapt?' },
  { num: '05', name: 'AI & Digital Fluency', measures: 'How fluently you work alongside AI \u2014 prompting, verifying, deciding.', inConversation: 'Avatar mentions an AI tool is available. Do you use it well?' },
]

const steps = [
  'Every response is captured in real time.',
  'A panel of AI evaluators (Amazon Bedrock) analyses reasoning, structure, evidence, and adaptability.',
  'A score is generated for each dimension, tied to the evidence behind it.',
]

export default function ScienceBehindPrism() {
  return (
    <DocumentLayout
      title="The Science Behind Prism"
      subtitle="How we measure 5 skill dimensions in a 30-minute AI conversation"
      status={<StudyStatus status="progress">Formal validation study in progress</StudyStatus>}
    >
      <DocH>Why a conversation, not a test</DocH>
      <DocP>
        Traditional assessments measure memory. Prism measures thinking. A live AI conversation surfaces
        how a person actually reasons, communicates, and collaborates &mdash; under real pressure, in real
        time. No memorisation. No tricks. Just real capability.
      </DocP>

      <DocH id="dimensions">The 5 dimensions explained</DocH>
      <div className="grid gap-4 sm:grid-cols-2">
        {dimensions.map((d) => (
          <MethodCard key={d.num} label={d.num} title={d.name}>
            <p>{d.measures}</p>
            <p className="mt-3 italic">{d.inConversation}</p>
          </MethodCard>
        ))}
      </div>

      <DocH id="scoring">How scoring works</DocH>
      <ol className="space-y-3">
        {steps.map((text, i) => (
          <li key={text} className="flex gap-3 rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-4">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-brand-navy">{i + 1}</span>
            <p className="text-base leading-relaxed text-prism-ink-muted">{text}</p>
          </li>
        ))}
      </ol>

      <DocH id="pending">What is still pending</DocH>
      <MethodCard label="Study status" title="Formal validation">
        <p className="mb-3"><StudyStatus status="progress">In progress, not yet complete</StudyStatus></p>
        <p>
          Human co-rated sessions, item calibration and published agreement statistics are planned and have
          not been completed. Until they are published, Prism reports carry an explicit AI panel consistency
          label instead of statistical claims we cannot yet back. Details and the current status of each study are on the{' '}
          <Link to="/research/validity" className="text-brand-green-ink underline underline-offset-4">scoring methodology page</Link>.
        </p>
      </MethodCard>
    </DocumentLayout>
  )
}