import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

export default function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-[#E0E0E8] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="font-sans font-medium text-[#F0EDE6] text-base group-hover:text-[#C9A84C] transition-colors">
          {question}
        </span>
        <span className="shrink-0 flex items-center justify-center w-6 h-6 text-[#C9A84C]">
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
            <p className="font-sans text-sm text-[#64687A] leading-relaxed pb-5 pr-10">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
