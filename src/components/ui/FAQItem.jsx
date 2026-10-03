import { useId, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

export default function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const reduced = useReducedMotion()

  return (
    <div
      className={`bg-prism-surface rounded-2xl border px-6 shadow-sm transition-colors ${
        open ? 'border-[var(--prism-signal)]' : 'border-[var(--prism-border)]'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-prism-accent"
      >
        <span className="font-sans font-medium text-[var(--prism-ink)] text-base group-hover:underline group-hover:underline-offset-4">
          {question}
        </span>
        <span className="shrink-0 flex items-center justify-center w-6 h-6 text-[var(--prism-signal)]">
          {open ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            id={panelId}
            role="region"
            aria-label={question}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="font-sans text-sm text-[var(--prism-ink-muted)] leading-relaxed pb-5 pr-10">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
