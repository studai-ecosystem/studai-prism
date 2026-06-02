import { useEffect, useState } from 'react'

// ── Hand-built SVG avatar face (no external libraries) ───────────────────────
function AvatarFace({ bg, talking = false }) {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" className="block" role="img" aria-hidden="true">
      {/* Background circle */}
      <circle cx="60" cy="60" r="58" fill={bg} />
      {/* Head */}
      <circle cx="60" cy="56" r="34" fill="#FDF8F0" />
      {/* Eyes */}
      <circle cx="49" cy="52" r="4.5" fill="#0A0D14" />
      <circle cx="71" cy="52" r="4.5" fill="#0A0D14" />
      {/* Eye highlights */}
      <circle cx="50.5" cy="50.5" r="1.4" fill="#FFFFFF" />
      <circle cx="72.5" cy="50.5" r="1.4" fill="#FFFFFF" />
      {/* Mouth — animates open/close when talking */}
      {talking ? (
        <rect
          x="50"
          y="68"
          width="20"
          rx="4"
          fill="#0A0D14"
          className="prism-talk-mouth"
        />
      ) : (
        <path
          d="M48 68 Q60 78 72 68"
          stroke="#0A0D14"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  )
}

const AVATARS = [
  { id: 1, bg: '#1E3A8A', glow: '#1E3A8A', label: 'Asks & Listens',  float: 'prism-float-1', delay: '0.2s', talking: true },
  { id: 2, bg: '#C9A84C', glow: '#C9A84C', label: 'Challenges You',  float: 'prism-float-2', delay: '0.4s', talking: false },
  { id: 3, bg: '#0D6E6E', glow: '#0D6E6E', label: 'Needs Guidance',  float: 'prism-float-3', delay: '0.6s', talking: false },
]

// ── Auto-playing typewriter chat preview ─────────────────────────────────────
const SCRIPT = [
  { side: 'left',  name: 'Avatar 1', color: '#1E3A8A', text: "Tell me how you'd handle a 30% budget cut." },
  { side: 'right', name: 'You',      color: '#C9A84C', text: "I'd prioritise core features and cut the rest." },
  { side: 'left',  name: 'Avatar 2', color: '#C9A84C', text: "That's too vague. Which features exactly?" },
  { side: 'right', name: 'You',      color: '#C9A84C', text: 'Payment flow and onboarding. Everything else waits.' },
]

function ChatPreview() {
  const [shown, setShown] = useState([])      // indices of fully-typed messages
  const [typing, setTyping] = useState(null)  // { idx, text }

  useEffect(() => {
    let cancelled = false
    const timers = []
    const wait = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)))

    async function run() {
      while (!cancelled) {
        setShown([])
        setTyping(null)
        await wait(500)
        for (let i = 0; i < SCRIPT.length; i++) {
          const { text } = SCRIPT[i]
          for (let c = 1; c <= text.length; c++) {
            if (cancelled) return
            setTyping({ idx: i, text: text.slice(0, c) })
            await wait(26)
          }
          if (cancelled) return
          setShown((prev) => [...prev, i])
          setTyping(null)
          await wait(650)
        }
        await wait(2000) // pause before restarting the loop
      }
    }
    run()
    return () => { cancelled = true; timers.forEach(clearTimeout) }
  }, [])

  const renderBubble = (msg, key, text, isTyping) => (
    <div key={key} className={`flex ${msg.side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] px-3.5 py-2 rounded-2xl ${
          msg.side === 'right'
            ? 'bg-[#C9A84C]/15 border border-[#C9A84C]/30 rounded-tr-sm'
            : 'bg-[#F6EFE2] border border-[#E8E0D0] rounded-tl-sm'
        }`}
      >
        <span className="block font-sans text-[10px] font-semibold mb-0.5" style={{ color: msg.color }}>
          {msg.name}
        </span>
        <span className="font-sans text-[13px] text-[#0A0D14] leading-snug">
          {text}
          {isTyping && <span className="prism-caret">▋</span>}
        </span>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl border border-[#E8E0D0] shadow-[0_10px_40px_-12px_rgba(10,13,20,0.18)] p-4 flex flex-col gap-2.5 min-h-[208px]">
      {shown.map((i) => renderBubble(SCRIPT[i], `s-${i}`, SCRIPT[i].text, false))}
      {typing && renderBubble(SCRIPT[typing.idx], `t-${typing.idx}`, typing.text, true)}
    </div>
  )
}

// ── Main showcase: three floating avatars + chat preview ─────────────────────
export default function HeroAvatars() {
  return (
    <div className="relative w-full flex flex-col items-center gap-8">
      {/* Spotlight radial gradient behind avatars */}
      <div
        className="absolute -top-8 left-1/2 -translate-x-1/2 w-[520px] h-[280px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, #FFFDF8 0%, rgba(253,248,240,0) 70%)' }}
        aria-hidden="true"
      />

      {/* Avatars row */}
      <div className="relative flex items-start justify-center gap-6 sm:gap-12">
        {AVATARS.map((a) => (
          <div
            key={a.id}
            className="prism-enter flex flex-col items-center gap-3"
            style={{ animationDelay: a.delay }}
          >
            <div className={`${a.float} group relative cursor-pointer`}>
              {/* Hover glow */}
              <div
                className="absolute inset-0 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-300"
                style={{ background: a.glow }}
                aria-hidden="true"
              />
              {/* Scaling wrapper (hover) */}
              <div className="relative transition-transform duration-300 group-hover:scale-[1.08]">
                <AvatarFace bg={a.bg} talking={a.talking} />
              </div>
            </div>
            {/* Name tag */}
            <span className="bg-white border border-[#E8E0D0] rounded-full px-3 py-1 font-sans text-xs font-semibold text-[#1A1A2E] shadow-sm whitespace-nowrap">
              {a.label}
            </span>
          </div>
        ))}
      </div>

      {/* Mini chat preview */}
      <ChatPreview />

      {/* Scoped animation keyframes — no external animation libraries */}
      <style>{`
        @keyframes prismFloat {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-12px); }
        }
        .prism-float-1 { animation: prismFloat 3s   ease-in-out infinite; }
        .prism-float-2 { animation: prismFloat 3.5s ease-in-out infinite; }
        .prism-float-3 { animation: prismFloat 4s   ease-in-out infinite; }

        @keyframes prismEnter {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .prism-enter { opacity: 0; animation: prismEnter 0.6s ease forwards; }

        @keyframes prismTalk {
          0%, 100% { height: 2px; y: 70px; }
          50%      { height: 6px; y: 68px; }
        }
        .prism-talk-mouth { animation: prismTalk 1.5s ease-in-out infinite; }

        @keyframes prismCaret {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        .prism-caret { animation: prismCaret 0.8s step-end infinite; margin-left: 1px; color: #C9A84C; }

        @media (prefers-reduced-motion: reduce) {
          .prism-float-1, .prism-float-2, .prism-float-3,
          .prism-enter, .prism-talk-mouth, .prism-caret { animation: none; }
          .prism-enter { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
