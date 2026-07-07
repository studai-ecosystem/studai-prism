import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'

// ── Act III — The Room ───────────────────────────────────────────────────────
// The product moment: a miniature of the real conversation room (room-dark
// scope), pinned while a scripted exchange plays line by line under scroll.
// The script is FICTIONAL and labeled — never a scenario from the live bank.

const SCRIPT = [
  { speaker: 'Meera', role: 'Community Librarian', text: 'Our reading festival is in five days. The main hall just became unavailable, and two hundred families have registered. What do we do first?' },
  { speaker: 'YOU', you: true, text: 'First I would split the problem: the venue and the families. Can the courtyard hold the headline sessions if we stagger them — and what is the earliest honest update we can send to parents?' },
  { speaker: 'Arun', role: 'Volunteer Lead', interrupt: true, text: 'Just in — the storyteller says she can only come in the morning now.' },
  { speaker: 'YOU', you: true, text: 'Then the morning becomes the anchor. Move her session to the courtyard at ten, shift crafts to the reading rooms, and the update to parents goes out today with the new map — better one clear change than three small corrections.' },
]

function RoomLine({ line, progress, index, total, reduced }) {
  const start = 0.15 + (index / total) * 0.6
  const opacity = useTransform(progress, [start, start + 0.08], [0, 1])
  const y = useTransform(progress, [start, start + 0.08], [14, 0])
  return (
    <motion.div
      style={reduced ? undefined : { opacity, y }}
      className={`pl-4 border-l-2 ${line.you ? 'border-[var(--color-accent-bright)]' : 'border-[var(--color-room-line)]'} ${line.interrupt ? 'bg-[var(--color-accent-bright)]/5 rounded-r-[var(--radius-sm)] py-2 pr-3' : ''}`}
    >
      <p className={`font-mono text-[10px] tracking-[0.08em] uppercase mb-1 ${line.you ? 'text-[var(--color-accent-bright)]' : 'text-[var(--color-ink-muted)]'}`}>
        {line.speaker}
        {line.role && <span className="ml-2 normal-case">{line.role}</span>}
        {line.interrupt && <span className="ml-2 text-[var(--color-accent-bright)]">· mid-turn development</span>}
      </p>
      <p className="font-sans text-[15px] leading-[1.65] text-[var(--color-ink)]">{line.text}</p>
    </motion.div>
  )
}

export default function StoryRoom() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 0.25], [0.94, 1])
  const lift = useTransform(scrollYProgress, [0, 0.25], [40, 0])

  return (
    <section ref={ref} className="relative bg-[var(--color-paper)] py-24 sm:py-32" aria-label="The conversation room">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-3">The room</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--color-ink)] leading-tight mb-4">
            Thirty minutes with three colleagues who push back.
          </h2>
          <p className="font-sans text-base text-[var(--color-ink-muted)] leading-relaxed">
            Not a quiz. A working conversation — the situation shifts mid-turn, exactly
            like real work does, and how you respond is what gets measured.
          </p>
        </div>

        {/* The miniature room — room-dark scope on a paper canvas */}
        <motion.div
          style={reduced ? undefined : { scale, y: lift }}
          className="room-dark bg-[var(--color-room)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] shadow-2xl overflow-hidden max-w-3xl mx-auto"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-room-line)]">
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
              Sample scenario · not from the live bank
            </span>
            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">about 30 min</span>
          </div>

          {/* Persona rail */}
          <div className="flex gap-2 px-5 py-3 border-b border-[var(--color-room-line)] overflow-x-auto">
            {[{ n: 'Meera', r: 'Community Librarian' }, { n: 'Arun', r: 'Volunteer Lead' }, { n: 'Sara', r: 'Parent Representative' }].map((p) => (
              <div key={p.n} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-room-line)] bg-[var(--color-room-surface)] px-3 py-1.5 shrink-0">
                <span className="w-6 h-6 rounded-full bg-[var(--color-room)] border border-[var(--color-room-line)] flex items-center justify-center font-mono text-[10px] text-[var(--color-ink-muted)]" aria-hidden="true">{p.n[0]}</span>
                <div>
                  <p className="font-sans text-[11px] font-semibold text-[var(--color-ink)] leading-tight">{p.n}</p>
                  <p className="font-mono text-[9px] text-[var(--color-ink-muted)]">{p.r}</p>
                </div>
              </div>
            ))}
          </div>

          {/* The script plays on scroll */}
          <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 min-h-[320px]">
            {SCRIPT.map((line, i) => (
              <RoomLine key={i} line={line} progress={scrollYProgress} index={i} total={SCRIPT.length} reduced={reduced} />
            ))}
          </div>

          <div className="px-5 py-3 border-t border-[var(--color-room-line)]">
            <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">
              Speak or type — both count the same · every turn is kept as evidence
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
