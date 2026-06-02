import { motion } from 'framer-motion'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

export default function CTABanner({ onGetAssessed }) {
  return (
    <section className="py-28 bg-[#F5F5FA] relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full bg-[#C9A84C] opacity-[0.04] blur-[120px]" />
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
          className="font-serif italic text-5xl md:text-6xl text-[#1A1A2E] leading-tight"
        >
          Your score is 30 minutes away.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="font-sans text-lg text-[#64687A] max-w-xl"
        >
          One conversation. A certified map of your capability.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          <motion.button
            onClick={onGetAssessed}
            className="shimmer-btn glow-pulse px-8 py-4 rounded-lg font-sans font-semibold text-[#0A0D14] cursor-pointer"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Get Assessed — ₹499
          </motion.button>

          <motion.a
            href="mailto:institutions@studaione.com"
            className="px-8 py-4 rounded-lg font-sans font-semibold text-sm text-[#C9A84C] border border-[#C9A84C]/40 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 transition-all duration-200"
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
