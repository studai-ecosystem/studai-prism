import { motion } from 'framer-motion'
import SectionLabel from './ui/SectionLabel.jsx'
import FAQItem from './ui/FAQItem.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'
import { SCORE_VALIDITY_MONTHS, REASSESSMENT_DAYS } from '../../server/lib/sharedConstants.js'

const faqs = [
  {
    question: 'Is Prism a multiple-choice test?',
    answer:
      'No. Prism puts you in realistic workplace situations and looks at what you actually do and write. There are no predetermined answer choices. You can try a short practice situation for free before anything else.',
  },
  {
    question: 'What does a Prism report show?',
    answer:
      'Observations about your work, each tied to the moment that earned it: what you did, the behaviour it shows and the capability it belongs to. Where there is not enough evidence the report says so instead of guessing, and it points to one useful next behaviour you can practise.',
  },
  {
    question: 'Is the free situation a real assessment?',
    answer:
      'No. It is one short practice scene with one observation about your own words and one retry. It does not produce a capability map, a report or any kind of credential, and it is kept for one hour unless you choose to save it to an account.',
  },
  {
    question: 'How long is my report valid?',
    answer: `Your formal assessment report stays readable under the published retention policy; its findings are dated and considered current for ${SCORE_VALIDITY_MONTHS} months from the date of assessment.`,
  },
  {
    question: 'Can I take the assessment again?',
    answer:
      `A new assessment is possible ${REASSESSMENT_DAYS} days after your last attempt. Growth is shown only after a comparable reassessment; a formal reassessment is not included in the personal development sprint until comparable forms are approved.`,
  },
  {
    question: 'What do I pay, and when?',
    answer:
      'Nothing to try a short situation. The personal development sprint is one package with one payment and nothing recurring; its price, tax treatment and recovery policy are shown at checkout from the server configuration and are marked proposed until they are approved. The package cannot be bought while any of its included content is still under review.',
  },
  {
    question: 'How does someone else see my report?',
    answer:
      'Only through a link you create, with the scope you choose, and you can revoke it at any time. Prism does not publish reports or scores anywhere on its own.',
  },
  {
    question: 'What does my university see?',
    answer:
      'Only what your institution sponsors, and what you choose to share. Your personal practice, preparation and anything you have not shared stay private to you, and you can change what you share at any time.',
  },
  {
    question: 'Is my conversation data private?',
    answer:
      'Yes. What you write is processed to produce your own observations and report and is not shared with employers or third parties without your consent. Research use is a separate choice you can make or decline on its own.',
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="py-24 bg-prism-canvas">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="mb-12"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={fadeUp}>
            <SectionLabel text="FAQ" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="text-3xl font-bold tracking-tight text-prism-ink leading-tight mt-1 md:text-4xl"
          >
            Common questions.
          </motion.h2>
        </motion.div>

        {/* Accordion */}
        <motion.div
          className="space-y-3"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {faqs.map((faq) => (
            <motion.div key={faq.question} variants={fadeUp}>
              <FAQItem question={faq.question} answer={faq.answer} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
