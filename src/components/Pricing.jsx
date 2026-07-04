import { motion } from 'framer-motion'
import SectionLabel from './ui/SectionLabel.jsx'
import PricingCard from './ui/PricingCard.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'
import { SCORE_VALIDITY_MONTHS } from '../../server/lib/sharedConstants.js'

const individualFeatures = [
  'One 30-minute AI assessment',
  'Certified Prism Score',
  'Full 5-dimension skill map report',
  'Shareable score link',
  `Valid for ${SCORE_VALIDITY_MONTHS} months`,
]

const institutionalFeatures = [
  'Entire cohort access (up to 500 students)',
  'Placement team dashboard',
  'Cohort-level skill analytics',
  'Employer-facing cohort reports',
  'Priority support',
]

export default function Pricing({ onGetAssessed, onContactSales }) {
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="mb-14 text-center"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={fadeUp}>
            <SectionLabel text="Pricing" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-serif text-4xl md:text-5xl text-[#1A1A2E] leading-tight mt-1"
          >
            Simple, transparent pricing.
          </motion.h2>
        </motion.div>

        {/* Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <PricingCard
            plan="Individual"
            price="$10"
            period="per assessment"
            subtitle="For students booking directly"
            features={individualFeatures}
            ctaLabel="Get Assessed"
            ctaAction={onGetAssessed}
            featured={false}
          />
          <PricingCard
            plan="Institutional"
            price="Custom"
            period="per year"
            subtitle="For colleges and universities"
            badge="Most popular"
            features={institutionalFeatures}
            ctaLabel="Talk to us"
            ctaAction={onContactSales}
            featured={true}
          />
        </motion.div>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center font-sans text-xs text-[#8A8FA0] mt-6"
        >
          For larger cohorts, custom pricing available.
        </motion.p>
      </div>
    </section>
  )
}
