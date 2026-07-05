import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { stagger, fadeUp } from '../hooks/motionVariants.js'
import HeroAvatars from './HeroAvatars.jsx'

const trustStats = [
  { value: '30 min', label: 'One conversation' },
  { value: '5 dimensions', label: 'Verified assessment' },
  { value: 'Verified', label: 'Shareable score' },
]

export default function Hero({ onGetAssessed }) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-white noise-bg pt-28 pb-16">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 right-1/4 w-[700px] h-[700px] rounded-full bg-[#C9A84C] opacity-[0.07] blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[400px] rounded-full bg-[#C9A84C] opacity-[0.04] blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full bg-[#C9A84C] opacity-[0.04] blur-[150px]" />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 hero-grid pointer-events-none opacity-60" />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center max-w-5xl mx-auto px-6 flex flex-col items-center gap-6"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Eyebrow */}
        <motion.span
          variants={fadeUp}
          className="inline-block font-sans text-xs font-semibold tracking-[0.22em] text-[#C9A84C] uppercase"
        >
          AI Skills Assessment
        </motion.span>

        {/* H1 */}
        <motion.h1
          variants={fadeUp}
          className="font-serif italic text-5xl sm:text-6xl md:text-7xl text-[#1A1A2E] leading-[1.08] tracking-tight max-w-4xl"
        >
          One conversation.{' '}
          <span className="not-italic">A verified map</span>{' '}
          of what you can do.
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={fadeUp}
          className="font-sans text-lg md:text-xl text-[#64687A] max-w-2xl leading-relaxed"
        >
          Not a multiple-choice test. A live 30-minute AI scenario that surfaces
          how you actually think — then verifies it with a score employers can check.
        </motion.p>

        {/* Animated avatar characters + chat preview */}
        <motion.div variants={fadeUp} className="w-full mt-4 mb-2">
          <HeroAvatars />
        </motion.div>

        {/* CTAs */}
        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          <motion.button
            onClick={onGetAssessed}
            className="shimmer-btn glow-pulse px-7 py-3.5 rounded-lg font-sans font-semibold text-sm text-[#0A0D14] cursor-pointer"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Get Assessed — $10
          </motion.button>

          <motion.a
            href="#how-it-works"
            className="flex items-center gap-2 px-7 py-3.5 rounded-lg font-sans font-semibold text-sm text-[#C9A84C] border border-[#C9A84C]/40 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 transition-all duration-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            See how it works <ArrowRight size={15} />
          </motion.a>
        </motion.div>

        {/* Trust stats */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col sm:flex-row items-center gap-0 mt-4"
        >
          {trustStats.map((stat, i) => (
            <div key={stat.value} className="flex items-center">
              {i > 0 && (
                <div className="hidden sm:block w-px h-8 bg-[#E0E0E8] mx-8" aria-hidden="true" />
              )}
              {i > 0 && (
                <div className="sm:hidden w-8 h-px bg-[#E0E0E8] my-4" aria-hidden="true" />
              )}
              <div className="text-center">
                <p className="font-sans font-semibold text-[#1A1A2E] text-base tabular-nums">{stat.value}</p>
                <p className="font-sans text-xs text-[#64687A] mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <span className="font-sans text-xs text-[#64687A] tracking-widest uppercase">Scroll</span>
        <motion.div
          className="w-px h-8 bg-gradient-to-b from-[#C9A84C] to-transparent"
          animate={{ scaleY: [1, 0.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </motion.div>
    </section>
  )
}
