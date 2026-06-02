import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import SectionLabel from './ui/SectionLabel.jsx'
import ScoreMockup from './ui/ScoreMockup.jsx'
import { stagger, fadeUp } from '../hooks/motionVariants.js'

const bullets = [
  'Shareable link — one click to LinkedIn or résumé',
  'Employer-verified — trusted by hiring teams on the Hire marketplace',
  'Valid for 12 months from assessment date',
]

export default function ScoreSection() {
  return (
    <section id="score" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left — Score card mockup */}
          <div className="flex justify-center lg:justify-end order-2 lg:order-1">
            <ScoreMockup />
          </div>

          {/* Right — Text */}
          <motion.div
            className="order-1 lg:order-2"
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            <motion.div variants={fadeUp}>
              <SectionLabel text="Your Score" />
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="font-serif text-4xl md:text-5xl text-[#1A1A2E] leading-tight mt-1 mb-4"
            >
              A score that shows what you can actually do.
            </motion.h2>

            <motion.h3
              variants={fadeUp}
              className="font-sans font-semibold text-[#1A1A2E] text-xl mb-3"
            >
              Not a pass/fail. A detailed map.
            </motion.h3>

            <motion.p
              variants={fadeUp}
              className="font-sans text-[#64687A] leading-relaxed mb-8"
            >
              Your Prism Score is a certified, verifiable number between 0–100. It comes
              with a detailed breakdown across all five dimensions — so employers and
              colleges see exactly where you excel, not just whether you cleared a cutoff.
            </motion.p>

            <motion.ul variants={stagger} className="flex flex-col gap-4">
              {bullets.map((b) => (
                <motion.li
                  key={b}
                  variants={fadeUp}
                  className="flex items-start gap-3"
                >
                  <div className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-[#C9A84C]/15 shrink-0">
                    <Check size={12} className="text-[#C9A84C]" />
                  </div>
                  <span className="font-sans text-sm text-[#1A1A2E]/80 leading-relaxed">{b}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
