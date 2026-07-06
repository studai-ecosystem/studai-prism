import { motion } from 'framer-motion'
import { GraduationCap, Building2, Briefcase, BarChart2 } from 'lucide-react'
import SectionLabel from './ui/SectionLabel.jsx'
import PersonaCard from './ui/PersonaCard.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

const personas = [
  {
    title: 'Students',
    icon: GraduationCap,
    description:
      "Verify your ability before placement season. Add a verified Prism Score to your profile that hiring managers can trust — before you've had a single job.",
  },
  {
    title: 'Colleges & Universities',
    icon: Building2,
    description:
      'Run Prism for your entire final-year cohort. Share skill maps with recruiting employers for faster, better-matched placements. Institutional dashboard included.',
  },
  {
    title: 'Employers',
    icon: Briefcase,
    description:
      'Set a minimum Prism Score as a first filter on the Hire marketplace. Cut time interviewing candidates who don\'t have the core capability the role requires.',
  },
  {
    title: 'MBA & Management Institutes',
    icon: BarChart2,
    description:
      'Give every student a verified score before placement season. Build employer confidence in your cohort with data-backed skill maps.',
  },
]

export default function WhoItsFor() {
  return (
    <section id="who-its-for" className="py-24 bg-[var(--color-paper)]">
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
            <SectionLabel text="Who Uses Prism" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-serif text-4xl md:text-5xl text-[var(--color-ink)] leading-tight mt-1"
          >
            Built for every stage of the journey.
          </motion.h2>
        </motion.div>

        {/* 2x2 grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {personas.map((p) => (
            <PersonaCard key={p.title} {...p} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
