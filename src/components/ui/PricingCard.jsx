import { Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { fadeUp } from '../../hooks/motionVariants.js'

export default function PricingCard({ plan, price, period, subtitle, badge, features, ctaLabel, ctaAction, featured = false }) {
  return (
    <motion.article
      variants={fadeUp}
      className={`relative flex flex-col gap-6 p-8 rounded-2xl border transition-all duration-300 ${
        featured
          ? 'bg-[#111520] border-[#C9A84C]/50 shadow-[0_0_40px_rgba(201,168,76,0.08)]'
          : 'bg-[#111520] border-[#252A3A]'
      }`}
      whileHover={{ y: -4 }}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold tracking-wider bg-[#C9A84C] text-[#0A0D14] rounded-full uppercase">
          {badge}
        </span>
      )}

      <div>
        <p className="font-sans text-xs font-semibold tracking-[0.15em] text-[#C9A84C] uppercase mb-3">{plan}</p>
        <div className="flex items-end gap-2">
          <span className="font-sans text-4xl font-bold text-white tabular-nums">{price}</span>
          <span className="font-sans text-sm text-[#64687A] mb-1.5">{period}</span>
        </div>
        <p className="font-sans text-sm text-[#64687A] mt-1">{subtitle}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            <Check size={16} className="text-[#C9A84C] mt-0.5 shrink-0" />
              <span className="font-sans text-sm text-[#C8C8D8]">{f}</span>
          </li>
        ))}
      </ul>

      <motion.button
        onClick={ctaAction}
        className={`w-full py-3 rounded-lg font-sans font-semibold text-sm transition-all duration-200 ${
          featured
            ? 'border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10'
            : 'shimmer-btn text-[#0A0D14] glow-pulse'
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {ctaLabel}
      </motion.button>
    </motion.article>
  )
}
