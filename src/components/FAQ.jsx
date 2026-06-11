import { motion } from 'framer-motion'
import SectionLabel from './ui/SectionLabel.jsx'
import FAQItem from './ui/FAQItem.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

const faqs = [
  {
    question: 'Is Prism a multiple-choice test?',
    answer:
      'No. Prism is a live 30-minute AI conversation — a scenario where multiple AI participants engage with you in real time. There are no predetermined answer choices.',
  },
  {
    question: 'What does a Prism Score look like?',
    answer:
      'You receive a score between 0–100 with a breakdown across five dimensions: Critical Thinking, Collaboration, Communication, Problem Solving, and AI Readiness. You also get a detailed skill map report.',
  },
  {
    question: 'How long is my score valid?',
    answer: 'Your Prism Score is valid for 12 months from the date of assessment.',
  },
  {
    question: 'Can I retake the assessment?',
    answer:
      'Yes. You can purchase a new assessment at any time. Each assessment uses a different scenario to ensure a fresh evaluation.',
  },
  {
    question: 'How does an employer verify my score?',
    answer:
      'Every Prism Score comes with a unique shareable verification link. Employers can verify your score directly without needing to contact you.',
  },
  {
    question: 'What is the Hire Marketplace?',
    answer:
      "Hire is StudAI One's job marketplace where employers can filter candidates by Prism Score. A strong Prism Score gives you visibility with companies that have set score-based filters.",
  },
  {
    question: 'Is my conversation data private?',
    answer:
      'Yes. Your assessment conversation is processed for scoring only and is not shared with employers or third parties without your consent.',
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="py-24 bg-[#F5F5FA]">
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
            className="font-serif text-4xl md:text-5xl text-[#1A1A2E] leading-tight mt-1"
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
