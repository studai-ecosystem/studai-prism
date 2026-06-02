import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, MonitorX, Clock, Copy, Eye, Camera, Briefcase } from 'lucide-react'

const RULES = [
  { icon: MonitorX, text: 'Do not switch tabs or close this window' },
  { icon: Clock, text: 'You have 30 minutes — the timer cannot be paused' },
  { icon: Camera, text: 'Keep your camera on if prompted' },
  { icon: Copy, text: 'No right-click, copy, or paste' },
  { icon: Eye, text: 'This is your performance — not a research exercise' },
]

export default function Briefing() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session')

  const handleEnter = () => {
    if (!sessionId) {
      navigate('/payment')
      return
    }
    // Trigger fullscreen lock before entering the closed assessment surface.
    document.documentElement.requestFullscreen?.().catch(() => {})
    navigate(`/assessment?session=${sessionId}`)
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-[#F0EDE6] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[#252A3A]">
        <span className="font-serif text-xl text-[#F0EDE6] tracking-tight">Prism</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-xl flex flex-col gap-8"
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#C9A84C]/15 mb-4">
              <ShieldCheck size={22} className="text-[#C9A84C]" />
            </div>
            <h1 className="font-serif text-4xl text-[#F0EDE6] mb-2">Your assessment is about to begin</h1>
            <p className="font-sans text-sm text-[#8A8FA0]">30-minute assessment · 5 skill dimensions · Certified result</p>
          </div>

          {/* Rules */}
          <ul className="flex flex-col gap-3">
            {RULES.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex gap-3 items-center p-4 rounded-xl bg-[#111520] border border-[#252A3A]"
              >
                <Icon size={18} className="text-[#C9A84C] shrink-0" />
                <span className="font-sans text-sm text-[#C9CDD8]">{text}</span>
              </motion.li>
            ))}
          </ul>

          {/* Scenario */}
          <div className="rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/[0.06] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase size={16} className="text-[#C9A84C]" />
              <span className="font-sans text-xs font-semibold tracking-[0.18em] text-[#C9A84C] uppercase">Your scenario</span>
            </div>
            <p className="font-sans text-sm text-[#C9CDD8] leading-relaxed">
              You are a product manager at a growing startup. The engineering team can only ship
              <span className="text-[#F0EDE6] font-semibold"> ONE feature</span> before launch. You have to make the call. The meeting starts now.
            </p>
          </div>

          <motion.button
            onClick={handleEnter}
            className="w-full py-4 rounded-xl bg-[#C9A84C] font-sans font-semibold text-sm text-[#0A0D14] tracking-wide hover:bg-[#E8C96A] transition-colors cursor-pointer"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            Enter Assessment →
          </motion.button>

          <p className="text-center font-sans text-xs text-[#5A5F70]">
            By entering you confirm this is your own unaided work.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
