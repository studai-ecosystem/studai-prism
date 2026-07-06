import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

export default function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={`bg-white rounded-2xl border px-6 shadow-sm transition-colors ${
        open ? 'border-[var(--color-accent)]' : 'border-[var(--color-line)]'
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="font-sans font-medium text-[var(--color-ink)] text-base group-hover:text-[var(--color-accent)] transition-colors">
          {question}
        </span>
        <span className="shrink-0 flex items-center justify-center w-6 h-6 text-[var(--color-accent)]">
          {open ? <Minus size={16} /> : <Plus size={16} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed pb-5 pr-10">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
