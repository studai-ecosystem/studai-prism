import { motion } from 'framer-motion'
import { Target, Users, MessageSquare, Zap, Bot } from 'lucide-react'
import SectionLabel from './ui/SectionLabel.jsx'
import DimensionCard from './ui/DimensionCard.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

const dimensions = [
  {
    title: 'Critical Thinking',
    icon: Target,
    description:
      'How you frame a problem, evaluate information, and arrive at a position under pressure.',
  },
  {
    title: 'Collaboration',
    icon: Users,
    description:
      'How you work with others, navigate disagreement, and build toward a shared outcome.',
  },
  {
    title: 'Communication',
    icon: MessageSquare,
    description:
      'How clearly and confidently you express your thinking — in writing, speech, and argument.',
  },
  {
    title: 'Problem Solving',
    icon: Zap,
    description:
      'How you break down complexity, generate options, and move through a challenge to resolution.',
  },
  {
    title: 'AI & Digital Fluency',
    icon: Bot,
    description:
      'How fluently you work alongside AI — prompting effectively, verifying outputs, knowing what to delegate and what to own.',
    badge: 'NEW',
  },
]

export default function Dimensions() {
  return (
    <section id="dimensions" className="py-24 bg-[var(--color-paper)]">
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
            <SectionLabel text="What Gets Assessed" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-serif text-4xl md:text-5xl text-[var(--color-ink)] leading-tight mt-1"
          >
            Five dimensions. Every role. Every industry.
          </motion.h2>
        </motion.div>

        {/* Cards — 3-col on lg, 2-col on md, 1-col mobile */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {dimensions.map((d) => (
            <DimensionCard key={d.title} {...d} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
