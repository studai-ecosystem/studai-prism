import { motion } from 'framer-motion'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

export default function CTABanner({ onGetAssessed }) {
  return (
    <section className="py-28 bg-[var(--color-paper)] relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full bg-[var(--color-accent)] opacity-[0.04] blur-[120px]" />
      </div>

      <motion.div
        className="relative z-10 max-w-4xl mx-auto px-6 text-center flex flex-col items-center gap-6"
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
      >
        <motion.h2
          variants={fadeUp}
          className="font-serif italic text-5xl md:text-6xl text-[var(--color-ink)] leading-tight"
        >
          Your score is 30 minutes away.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="font-sans text-lg text-[var(--color-ink-muted)] max-w-xl"
        >
          One conversation. A verified map of your capability.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          <motion.button
            onClick={onGetAssessed}
            className="shimmer-btn glow-pulse px-8 py-4 rounded-lg font-sans font-semibold text-[var(--color-ink)] cursor-pointer"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Get Assessed — $10
          </motion.button>

          <motion.a
            href="mailto:institutions@studaione.com"
            className="px-8 py-4 rounded-lg font-sans font-semibold text-sm text-[var(--color-accent)] border border-[var(--color-accent)]/40 hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-all duration-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Book for your institution →
          </motion.a>
        </motion.div>
      </motion.div>
    </section>
  )
}
