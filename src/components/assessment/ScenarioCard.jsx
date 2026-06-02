import { motion } from 'framer-motion'
import { Briefcase, Users, X } from 'lucide-react'

// Scenario Card — a visual situation briefing that slides in mid-assessment.
// Tests Critical Thinking: the candidate must absorb the full context quickly.
export default function ScenarioCard({ scenario, onDismiss }) {
  if (!scenario) return null
  const { title, domain, context, participants = [] } = scenario

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-[#0A0D14]/80 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[#1A1A2E] px-6 py-5">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase size={15} className="text-[#C9A84C]" />
            <span className="font-sans text-[11px] font-semibold tracking-[0.2em] text-[#C9A84C] uppercase">
              {domain || 'Scenario Briefing'}
            </span>
          </div>
          <h2 className="font-serif text-2xl text-[#F0EDE6] leading-snug">{title}</h2>
        </div>

        {/* Context */}
        <div className="px-6 py-5">
          <p className="font-sans text-sm text-[#3A3A4A] leading-relaxed">{context}</p>

          {participants.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-[#64687A]" />
                <span className="font-sans text-[11px] font-semibold tracking-wide text-[#64687A] uppercase">
                  In the room
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {participants.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#F5F5FA] border border-[#E8E8F0]">
                    <span className="w-8 h-8 rounded-full bg-[#C9A84C]/15 text-[#C9A84C] flex items-center justify-center font-sans text-xs font-semibold shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-sans text-sm font-semibold text-[#1A1A2E] leading-tight">{p.name}</p>
                      <p className="font-sans text-xs text-[#64687A]">{p.role}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onDismiss}
            className="w-full py-3.5 rounded-xl bg-[#1A1A2E] font-sans font-semibold text-sm text-[#C9A84C] tracking-wide hover:bg-[#252A3A] transition-colors cursor-pointer"
          >
            Got it — continue
          </button>
        </div>

        <button
          onClick={onDismiss}
          aria-label="Dismiss scenario briefing"
          className="absolute top-4 right-4 text-[#F0EDE6]/60 hover:text-[#F0EDE6] transition-colors"
        >
          <X size={18} />
        </button>
      </motion.div>
    </motion.div>
  )
}
