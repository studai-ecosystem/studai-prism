import { motion } from 'framer-motion'
import { fadeUp } from '../../hooks/motionVariants.js'

export default function PersonaCard({ title, description, icon: Icon }) {
  return (
    <motion.article
      variants={fadeUp}
      className="flex flex-col gap-4 p-6 rounded-xl bg-white border border-[var(--color-line)] hover:border-[var(--color-accent)]/40 transition-all duration-300 group shadow-sm hover:shadow-md"
      whileHover={{ y: -3 }}
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--color-paper)] text-[var(--color-accent)] group-hover:bg-[var(--color-accent)]/10 transition-colors"
      >
        {Icon && <Icon size={22} strokeWidth={1.5} />}
      </div>
      <div>
        <h3 className="font-sans font-semibold text-[var(--color-ink)] text-base mb-2">{title}</h3>
        <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed">{description}</p>
      </div>
    </motion.article>
  )
}
