import { motion } from 'framer-motion'
import { fadeUp } from '../../hooks/motionVariants.js'

export default function StepCard({ number, title, description, icon: Icon, isLast }) {
  return (
    <motion.div variants={fadeUp} className="relative flex-1 min-w-0">
      {/* Connector line */}
      {!isLast && (
        <div className="hidden md:block absolute top-8 left-[calc(50%+2.5rem)] right-0 h-px bg-gradient-to-r from-[var(--color-line)] to-transparent" />
      )}

      <article
        className="flex flex-col items-start md:items-start gap-4 p-6 rounded-xl bg-white border border-[var(--color-line)] hover:border-[var(--color-accent)]/40 transition-colors duration-300 h-full shadow-sm hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <span className="font-sans text-xs font-semibold tracking-[0.15em] text-[var(--color-accent)] tabular-nums">
            {number}
          </span>
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-paper)] text-[var(--color-accent)]">
            {Icon && <Icon size={18} strokeWidth={1.5} />}
          </div>
        </div>
        <div>
          <h3 className="font-sans font-semibold text-[var(--color-ink)] text-base mb-2">{title}</h3>
          <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed">{description}</p>
        </div>
      </article>
    </motion.div>
  )
}
