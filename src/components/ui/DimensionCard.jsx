import { motion } from 'framer-motion'
import { fadeUp } from '../../hooks/motionVariants.js'

export default function DimensionCard({ title, description, icon: Icon, badge }) {
  return (
    <motion.article
      variants={fadeUp}
      className="relative flex flex-col gap-4 p-6 rounded-xl bg-white border border-[var(--color-line)] hover:border-[var(--color-accent)]/50 transition-all duration-300 group cursor-default shadow-sm hover:shadow-md"
      whileHover={{ scale: 1.02, y: -2 }}
    >
      {/* Gold left-border accent on hover */}
      <div className="absolute left-0 top-6 bottom-6 w-0.5 rounded-full bg-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--color-paper)] text-[var(--color-accent)]">
          {Icon && <Icon size={20} strokeWidth={1.5} />}
        </div>
        {badge && (
          <span className="px-2 py-0.5 text-[10px] font-semibold tracking-widest text-[var(--color-accent)] border border-[var(--color-accent)]/40 rounded-full uppercase">
            {badge}
          </span>
        )}
      </div>

      <div>
        <h3 className="font-sans font-semibold text-[var(--color-ink)] text-base mb-1">{title}</h3>
        <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed">{description}</p>
      </div>
    </motion.article>
  )
}
