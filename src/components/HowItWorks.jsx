import { motion } from 'framer-motion'
import { PlayCircle, Users, Cpu, Award } from 'lucide-react'
import SectionLabel from './ui/SectionLabel.jsx'
import StepCard from './ui/StepCard.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

const steps = [
  {
    number: '01',
    title: 'Enter the Scenario',
    icon: PlayCircle,
    description:
      "You're placed in a live AI-driven business scenario — a challenge, a debate, a real decision that requires genuine thinking.",
  },
  {
    number: '02',
    title: 'Engage with AI Avatars',
    icon: Users,
    description:
      'Multiple AI participants push back, ask follow-up questions, and create the conditions where your real capabilities surface.',
  },
  {
    number: '03',
    title: 'AI Evaluation',
    icon: Cpu,
    description:
      'An AI evaluator analyses your reasoning, communication, collaboration, and problem-solving across a structured rubric — in real time.',
  },
  {
    number: '04',
    title: 'Receive Your Prism Score',
    icon: Award,
    description:
      'Your certified Prism Score and detailed skill map are ready within minutes. Share instantly on LinkedIn, résumé, or your college profile.',
    isLast: true,
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="mb-14 max-w-2xl"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={fadeUp}>
            <SectionLabel text="The Process" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-serif text-4xl md:text-5xl text-[#1A1A2E] leading-tight mt-1"
          >
            Four steps from conversation to certification
          </motion.h2>
        </motion.div>

        {/* Steps */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {steps.map((step) => (
            <StepCard key={step.number} {...step} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
