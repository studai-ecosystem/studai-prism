import { motion } from 'framer-motion'
import { Briefcase, Users, X, Timer } from 'lucide-react'

// Scenario briefing — the opening beat of the room. The candidate absorbs the
// situation and cast before the clock starts; dismissing it begins the
// assessment. Design-system room-dark surfaces; the accent marks the moment
// measurement begins.
export default function ScenarioCard({ scenario, onDismiss }) {
  if (!scenario) return null
  const { title, domain, context, participants = [] } = scenario

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="room-dark fixed inset-0 z-[110] bg-[var(--color-room)]/92 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--color-room-surface)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] shadow-2xl"
      >
        {/* The accent rule: measurement begins here */}
        <div className="h-[3px] bg-[var(--color-accent-bright)]" aria-hidden="true" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[var(--color-room-line)]">
          <div className="flex items-center gap-2 mb-2.5">
            <Briefcase size={13} className="text-[var(--color-accent-bright)]" aria-hidden="true" />
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-accent-bright)]">
              {domain || 'Scenario briefing'}
            </span>
          </div>
          <h2 className="font-serif text-2xl text-[var(--color-ink)] leading-snug">{title}</h2>
        </div>

        {/* Context */}
        <div className="px-6 py-5">
          <p className="font-sans text-sm text-[var(--color-ink)] leading-[1.7]">{context}</p>

          <p className="mt-4 p-3.5 rounded-[var(--radius-md)] bg-[var(--color-room)] border border-[var(--color-room-line)] font-sans text-xs text-[var(--color-ink-muted)] leading-relaxed">
            There is no right or wrong answer, and you don't need to know this field.
            Just talk through how you'd handle it — we're listening to how you think.
          </p>

          {participants.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={13} className="text-[var(--color-ink-muted)]" aria-hidden="true" />
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
                  In the room
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {participants.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] bg-[var(--color-room)] border border-[var(--color-room-line)]">
                    <span className="w-8 h-8 rounded-full bg-[var(--color-room-surface)] border border-[var(--color-room-line)] text-[var(--color-ink)] flex items-center justify-center font-mono text-xs shrink-0" aria-hidden="true">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-sans text-sm font-semibold text-[var(--color-ink)] leading-tight">{p.name}</p>
                      <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">{p.role}</p>
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
            className="w-full py-3.5 rounded-[var(--radius-md)] bg-[var(--color-room-ink)] font-sans font-semibold text-sm text-[var(--color-room)] tracking-wide hover:opacity-90 transition-opacity cursor-pointer"
          >
            Got it — continue
          </button>
          <p className="mt-2.5 flex items-center justify-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
            <Timer size={11} aria-hidden="true" />
            Your 30 minutes begin when you continue.
          </p>
        </div>

        <button
          onClick={onDismiss}
          aria-label="Dismiss scenario briefing"
          className="absolute top-4 right-4 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </motion.div>
    </motion.div>
  )
}
