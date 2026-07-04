import { useState, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------ */
/* Robot definitions — colors + expression per avatar                  */
/* ------------------------------------------------------------------ */
const ROBOTS = [
  {
    id: 'blue',
    label: 'Asks & Listens',
    headColor: '#1E3A8A',
    bodyColor: '#1E3A8A',
    eyeColor: '#60A5FA',
    glowColor: '#60A5FA',
    // friendly smile
    mouth: <path d="M45 65 Q60 75 75 65" stroke="white" strokeWidth="2" fill="none" />,
    float: 'rbtFloat1',
    floatDur: '3s',
    entranceDelay: '0.2s',
    cardAlign: 'left',
    card: {
      icon: '💬',
      title: 'The Questioner',
      subtitle: 'Starts the conversation',
      description:
        'I open the scenario, ask you clear questions, and follow up when your answers are vague. I am listening to how you think, not just what you say.',
      badge: 'Tests → Critical Thinking · Communication',
    },
  },
  {
    id: 'gold',
    label: 'Challenges You',
    headColor: '#92600A',
    bodyColor: '#92600A',
    eyeColor: '#FBBF24',
    glowColor: '#FBBF24',
    // serious straight mouth
    mouth: <line x1="45" y1="68" x2="75" y2="68" stroke="white" strokeWidth="2" />,
    float: 'rbtFloat2',
    floatDur: '3.8s',
    entranceDelay: '0.5s',
    cardAlign: 'center',
    card: {
      icon: '⚡',
      title: 'The Challenger',
      subtitle: 'Pushes you to your limit',
      description:
        'I disagree with your answers. I question your decisions. I create pressure. How you handle me shows if you can hold your ground or think on your feet.',
      badge: 'Tests → Collaboration · Problem Solving',
    },
  },
  {
    id: 'teal',
    label: 'Needs Guidance',
    headColor: '#0D6E6E',
    bodyColor: '#0D6E6E',
    eyeColor: '#34D399',
    glowColor: '#34D399',
    // confused slightly open mouth
    mouth: <ellipse cx="60" cy="68" rx="7" ry="5" stroke="white" strokeWidth="2" fill="none" />,
    float: 'rbtFloat3',
    floatDur: '4.5s',
    entranceDelay: '0.8s',
    cardAlign: 'right',
    card: {
      icon: '🌀',
      title: 'The Confused One',
      subtitle: 'Needs you to lead',
      description:
        'I do not understand things easily. You have to guide me, explain clearly, and show patience. How you handle confusion shows your real communication skill.',
      badge: 'Tests → Communication · AI & Digital Fluency',
    },
  },
]

/* ------------------------------------------------------------------ */
/* Mini robots — decorative, float in the background behind the main 3 */
/* ------------------------------------------------------------------ */
const MINI_ROBOTS = [
  // Left side — 3 robots stacked vertically
  { size: 50, color: '#1E3A8A', opacity: 0.35, eyeColor: '#60A5FA', anim: 'floatL1', dur: '6s', delay: '0s',   pos: { top: '15%', left: '3%' } },
  { size: 40, color: '#0D6E6E', opacity: 0.35, eyeColor: '#34D399', anim: 'floatL2', dur: '8s', delay: '0.5s', pos: { top: '42%', left: '5%' } },
  { size: 45, color: '#C9A84C', opacity: 0.30, eyeColor: '#FDE68A', anim: 'floatL3', dur: '7s', delay: '1s',   pos: { top: '68%', left: '2%' } },
  // Right side — 3 robots stacked vertically
  { size: 45, color: '#C9A84C', opacity: 0.30, eyeColor: '#FDE68A', anim: 'floatR1', dur: '7s', delay: '0.3s', pos: { top: '12%', right: '3%' } },
  { size: 55, color: '#1E3A8A', opacity: 0.35, eyeColor: '#93C5FD', anim: 'floatR2', dur: '9s', delay: '0.8s', pos: { top: '40%', right: '4%' } },
  { size: 40, color: '#0D6E6E', opacity: 0.30, eyeColor: '#34D399', anim: 'floatR3', dur: '6s', delay: '1.2s', pos: { top: '65%', right: '2%' } },
]

/* ------------------------------------------------------------------ */
/* Floating gradient blobs — soft moving colour behind everything      */
/* ------------------------------------------------------------------ */
const BLOBS = [
  {
    pos: { top: '8%', left: '6%' },
    size: '380px',
    background: 'radial-gradient(circle, rgba(30,58,138,0.18) 0%, rgba(30,58,138,0) 70%)',
    blur: 60,
    opacity: 0.9,
    anim: 'floatL1', dur: '14s', delay: '0s',
  },
  {
    pos: { bottom: '10%', left: '12%' },
    size: '300px',
    background: 'radial-gradient(circle, rgba(13,110,110,0.16) 0%, rgba(13,110,110,0) 70%)',
    blur: 70,
    opacity: 0.8,
    anim: 'floatL2', dur: '18s', delay: '1s',
  },
  {
    pos: { top: '14%', right: '8%' },
    size: '340px',
    background: 'radial-gradient(circle, rgba(201,168,76,0.20) 0%, rgba(201,168,76,0) 70%)',
    blur: 60,
    opacity: 0.9,
    anim: 'floatR1', dur: '16s', delay: '0.5s',
  },
  {
    pos: { bottom: '6%', right: '14%' },
    size: '300px',
    background: 'radial-gradient(circle, rgba(30,58,138,0.14) 0%, rgba(30,58,138,0) 70%)',
    blur: 70,
    opacity: 0.8,
    anim: 'floatR2', dur: '20s', delay: '1.5s',
  },
]

function MiniRobot({ size, color, opacity, eyeColor, anim, dur, delay, pos }) {
  return (
    <div
      className="mini-robot"
      style={{
        position: 'absolute',
        ...pos,
        // entrance: fade 0 -> target opacity, then stay (handled by keyframe var)
        ['--mini-op']: opacity,
        opacity,
        animation: `miniFadeIn 1s ease-out 0.5s both`,
      }}
    >
      <div style={{ animation: `${anim} ${dur} ease-in-out ${delay} infinite` }}>
        <svg width={size} height={size * 1.25} viewBox="0 0 40 50">
          {/* Antenna */}
          <line x1="20" y1="2" x2="20" y2="10" stroke={color} strokeWidth="2" />
          <circle cx="20" cy="2" r="3" fill={color} />

          {/* Head */}
          <rect x="5" y="10" width="30" height="22" rx="6" fill={color} />

          {/* Eyes */}
          <circle cx="13" cy="21" r="4" fill={eyeColor} />
          <circle cx="27" cy="21" r="4" fill={eyeColor} />

          {/* Body */}
          <rect x="8" y="34" width="24" height="14" rx="5" fill={color} />

          {/* Feet */}
          <rect x="9" y="49" width="8" height="5" rx="3" fill={color} />
          <rect x="23" y="49" width="8" height="5" rx="3" fill={color} />
        </svg>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Popover card shown above a robot when clicked                       */
/* ------------------------------------------------------------------ */
function RobotCard({ robot, closing, onClose }) {
  const { card, cardAlign = 'center' } = robot
  const cardRef = useRef(null)

  // When the card opens, make sure it's fully visible — scroll it into view
  // smoothly so the user doesn't have to manually scroll down to read it.
  useEffect(() => {
    if (closing) return
    const id = setTimeout(() => {
      cardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 60)
    return () => clearTimeout(id)
  }, [closing])

  // Horizontal placement of the card relative to the robot, plus where the
  // pointer triangle sits so it always points back at the robot.
  const CARD_WIDTH = 260
  const alignStyles = {
    left: { left: '50%', marginLeft: -(CARD_WIDTH - 40) }, // card to the left
    center: { left: '50%', marginLeft: -(CARD_WIDTH / 2) }, // centered
    right: { left: '50%', marginLeft: -40 }, // card to the right
  }
  const pointerStyles = {
    left: { left: 'auto', right: 30, marginLeft: 0 },
    center: { left: '50%', marginLeft: -10 },
    right: { left: 30, marginLeft: 0 },
  }
  const place = alignStyles[cardAlign] || alignStyles.center

  return (
    <div
      className="rbt-card"
      onClick={(e) => e.stopPropagation()}
      ref={cardRef}
      style={{
        ...place,
        transformOrigin:
          cardAlign === 'left'
            ? 'top right'
            : cardAlign === 'right'
            ? 'top left'
            : 'top center',
        animation: closing
          ? 'cardClose 0.2s ease-in forwards'
          : 'cardPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }}
    >
      {/* Close X */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-2 right-3 text-lg leading-none text-black/40 hover:text-black/70"
        aria-label="Close"
      >
        ×
      </button>

      <div style={{ fontSize: 32, lineHeight: 1 }}>{card.icon}</div>
      <h3 className="mt-2 text-lg font-bold text-[#1E3A8A]">{card.title}</h3>
      <p className="text-xs font-semibold text-[#92600A] mb-2">{card.subtitle}</p>
      <p className="text-sm text-[#1E3A8A]/75 leading-relaxed">{card.description}</p>

      <span className="inline-block mt-3 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#C9A84C] text-[#1E3A8A]">
        {card.badge}
      </span>

      {/* Pointer triangle pointing down to the robot */}
      <div className="rbt-card-pointer" style={pointerStyles[cardAlign] || pointerStyles.center} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Single robot rendered purely in SVG                                 */
/* ------------------------------------------------------------------ */
function Robot({ robot, isOpen, closing, onSelect, onClose }) {
  const { headColor, bodyColor, eyeColor, glowColor, mouth, float, floatDur, entranceDelay } = robot

  return (
    <div
      className="rbt-outer"
      style={{
        ['--glow']: glowColor,
        zIndex: isOpen ? 50 : 'auto',
      }}
    >
      {isOpen && <RobotCard robot={robot} closing={closing} onClose={onClose} />}

      <div
        className="rbt-wrap"
        style={{
          // entrance (slide up + fade) then continuous float
          animation: `rbtEntrance 0.7s ease-out ${entranceDelay} both, ${float} ${floatDur} ease-in-out infinite`,
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <svg
          width="120"
          height="160"
          viewBox="0 0 120 160"
          className={`rbt-svg ${isOpen ? 'rbt-active' : ''}`}
        >
          {/* Antenna */}
          <line x1="60" y1="10" x2="60" y2="25" stroke={headColor} strokeWidth="3" />
          <circle cx="60" cy="8" r="5" fill={glowColor} className="rbt-blink" />

          {/* Head */}
          <rect x="25" y="25" width="70" height="55" rx="12" fill={headColor} />

          {/* Eyes — two glowing circles (pulse) */}
          <circle cx="43" cy="48" r="8" fill={eyeColor} className="rbt-eye" />
          <circle cx="77" cy="48" r="8" fill={eyeColor} className="rbt-eye" />
          {/* Eye shine */}
          <circle cx="46" cy="45" r="3" fill="white" opacity="0.6" />
          <circle cx="80" cy="45" r="3" fill="white" opacity="0.6" />

          {/* Mouth — per avatar expression */}
          {mouth}

          {/* Body */}
          <rect x="30" y="85" width="60" height="45" rx="10" fill={bodyColor} />

          {/* Chest light (blinks) */}
          <rect x="50" y="95" width="20" height="12" rx="4" fill={glowColor} className="rbt-chest" />

          {/* Arms */}
          <rect x="12" y="88" width="15" height="30" rx="7" fill={headColor} />
          <rect x="93" y="88" width="15" height="30" rx="7" fill={headColor} />

          {/* Feet */}
          <rect x="35" y="132" width="20" height="14" rx="6" fill={headColor} />
          <rect x="65" y="132" width="20" height="14" rx="6" fill={headColor} />
        </svg>
        <p className="mt-2 text-sm font-semibold text-[#1E3A8A]">{robot.label}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mini chat preview — typewriter, auto-loops every 8s                 */
/* ------------------------------------------------------------------ */
const CHAT = [
  { from: 'Avatar 1', text: "Tell me how you'd handle a 30% budget cut.", me: false },
  { from: 'You', text: "I'd prioritise core features and cut the rest.", me: true },
  { from: 'Avatar 2', text: 'Too vague. Which features exactly?', me: false },
  { from: 'You', text: 'Payment flow and onboarding. Everything else waits.', me: true },
]

function ChatPreview() {
  // how many full messages are currently visible
  const [visible, setVisible] = useState(0)
  // typed text for the message currently being typed
  const [typed, setTyped] = useState('')

  useEffect(() => {
    let timers = []
    let cancelled = false

    const runCycle = () => {
      setVisible(0)
      setTyped('')

      let totalDelay = 0

      CHAT.forEach((msg, i) => {
        // gap before this message appears (1.5s between messages)
        const startAt = totalDelay
        timers.push(
          setTimeout(() => {
            if (cancelled) return
            setVisible(i + 1)
            // typewriter for this message
            let charIdx = 0
            const typeInterval = setInterval(() => {
              if (cancelled) {
                clearInterval(typeInterval)
                return
              }
              charIdx += 1
              setTyped(msg.text.slice(0, charIdx))
              if (charIdx >= msg.text.length) clearInterval(typeInterval)
            }, 28)
            timers.push(typeInterval)
          }, startAt)
        )
        totalDelay += 1500
      })

      // after all 4 messages, pause 2s then restart
      timers.push(setTimeout(runCycle, totalDelay + 2000))
    }

    runCycle()

    return () => {
      cancelled = true
      timers.forEach((t) => {
        clearTimeout(t)
        clearInterval(t)
      })
    }
  }, [])

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl bg-white shadow-[0_10px_40px_rgba(30,58,138,0.12)] p-5 border border-black/5">
      <div className="flex flex-col gap-3 min-h-[180px]">
        {CHAT.slice(0, visible).map((msg, i) => {
          const isLast = i === visible - 1
          const display = isLast ? typed : msg.text
          return (
            <div
              key={i}
              className={`flex flex-col ${msg.me ? 'items-end' : 'items-start'} chat-msg`}
            >
              <span className="text-[11px] font-semibold mb-1 text-[#92600A]">{msg.from}</span>
              <span
                className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${
                  msg.me
                    ? 'bg-[#1E3A8A] text-white rounded-br-sm'
                    : 'bg-[#FDF8F0] text-[#1E3A8A] rounded-bl-sm border border-black/5'
                }`}
              >
                {display}
                {isLast && display.length < msg.text.length && (
                  <span className="chat-caret">|</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Landing hero                                                        */
/* ------------------------------------------------------------------ */
export default function Landing({ onGetAssessed, onSeeHow }) {
  // which robot card is open: null | 'blue' | 'gold' | 'teal'
  const [openCard, setOpenCard] = useState(null)
  // id of a card currently playing its exit animation
  const [closing, setClosing] = useState(null)

  const closeCard = (then) => {
    if (openCard == null) {
      then && then()
      return
    }
    setClosing(openCard)
    setTimeout(() => {
      setClosing(null)
      setOpenCard(null)
      then && then()
    }, 200)
  }

  const handleSelect = (id) => {
    if (openCard === id) {
      closeCard()
    } else if (openCard != null) {
      // close current first, then open the new one
      closeCard(() => setOpenCard(id))
    } else {
      setOpenCard(id)
    }
  }

  return (
    <section
      className="relative min-h-screen w-full flex flex-col items-center justify-start overflow-hidden px-6 pt-28 pb-20"
      style={{ backgroundColor: '#FBFAF7' }}
    >
      {/* Inline animation styles */}
      <style>{styles}</style>

      {/* Soft radial glow behind robots */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0) 70%)',
        }}
      />

      {/* Floating gradient blobs — soft moving colour behind everything */}
      <div className="absolute inset-0 -z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {BLOBS.map((blob, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              ...blob.pos,
              width: blob.size,
              height: blob.size,
              background: blob.background,
              filter: `blur(${blob.blur}px)`,
              opacity: blob.opacity,
              animation: `${blob.anim} ${blob.dur} ease-in-out ${blob.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* Mini robots — float in a background layer behind the main 3 robots */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden="true"
      >
        {MINI_ROBOTS.map((mini, i) => (
          <MiniRobot key={i} {...mini} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center gap-6">
        {/* Overlay — blurs the page behind but keeps the open card sharp.
            Rendered inside the z-10 context so the open robot (z-50) paints
            above it while everything else is blurred. */}
        {openCard != null && (
          <div
            className="fixed inset-0 z-40"
            style={{ backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
            onClick={() => closeCard()}
          />
        )}

        {/* 1. Eyebrow */}
        <span className="text-xs font-bold tracking-[0.25em] uppercase text-[#92600A]">
          AI Skills Certification
        </span>

        {/* 2. H1 */}
        <h1 className="font-serif italic text-4xl md:text-6xl text-[#1A1A2E] leading-tight max-w-3xl">
          One conversation. A certified map of what you can do.
        </h1>

        {/* 3. Subtext */}
        <p className="text-lg md:text-xl text-[#1E3A8A]/70 max-w-xl">
          30 minutes. 3 AI avatars. 5 skills certified.
        </p>

        {/* 4 + 5. Robots side by side with labels */}
        <div className="flex flex-wrap items-end justify-center gap-8 md:gap-14 mt-6 mb-2">
          {ROBOTS.map((robot) => (
            <Robot
              key={robot.id}
              robot={robot}
              isOpen={openCard === robot.id}
              closing={closing === robot.id}
              onSelect={() => handleSelect(robot.id)}
              onClose={() => closeCard()}
            />
          ))}
        </div>

        {/* 6. Mini chat preview */}
        <ChatPreview />

        {/* 7. CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
          <button
            onClick={onGetAssessed}
            className="shimmer-btn glow-pulse px-7 py-3 rounded-xl font-semibold text-[#0A0D14] transition-all hover:-translate-y-0.5"
          >
            Get Assessed $10
          </button>
          <button
            onClick={onSeeHow}
            className="px-7 py-3 rounded-xl font-semibold text-[#1E3A8A] border-2 border-[#1E3A8A]/30 hover:border-[#1E3A8A] hover:bg-[#1E3A8A]/5 transition-all"
          >
            See how it works
          </button>
        </div>

        {/* 8. Stats */}
        <div className="flex items-center justify-center gap-8 md:gap-12 mt-8">
          {[
            { value: '30 min', label: 'One conversation' },
            { value: '5 dimensions', label: 'Certified' },
            { value: 'Verified', label: 'Shareable score' },
          ].map((stat) => (
            <div key={stat.value} className="flex flex-col items-center">
              <span className="text-2xl font-bold text-[#1E3A8A]">{stat.value}</span>
              <span className="text-xs text-[#1E3A8A]/60 mt-1">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Keyframe + helper styles (inline, no external libraries)            */
/* ------------------------------------------------------------------ */
const styles = `
  @keyframes rbtFloat1 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
  @keyframes rbtFloat2 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
  @keyframes rbtFloat3 { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }

  @keyframes rbtEntrance {
    0%   { opacity: 0; transform: translateY(40px) }
    100% { opacity: 1; transform: translateY(0) }
  }

  @keyframes rbtEyePulse { 0%,100% { opacity: 0.7 } 50% { opacity: 1 } }
  @keyframes rbtBlink { 0%,90%,100% { opacity: 1 } 95% { opacity: 0.1 } }
  @keyframes rbtChest { 0%,100% { opacity: 0.7 } 50% { opacity: 0.15 } }

  .rbt-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
  }
  .rbt-svg {
    transition: transform 0.3s ease, filter 0.3s ease;
  }
  .rbt-wrap:hover .rbt-svg {
    transform: scale(1.1);
    filter: drop-shadow(0 0 12px var(--glow));
  }

  .rbt-eye   { animation: rbtEyePulse 2s ease-in-out infinite; }
  .rbt-blink { animation: rbtBlink 2s linear infinite; }
  .rbt-chest { animation: rbtChest 1.5s ease-in-out infinite; }

  /* ---- Click-to-open card ---- */
  .rbt-outer {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* clicked robot bounces up + eyes glow brighter */
  @keyframes rbtBounce {
    0%   { transform: scale(1); }
    60%  { transform: scale(1.2); }
    100% { transform: scale(1.15); }
  }
  .rbt-svg.rbt-active {
    animation: rbtBounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    filter: drop-shadow(0 0 16px var(--glow));
  }
  .rbt-svg.rbt-active .rbt-eye {
    animation: none;
    opacity: 1;
  }

  @keyframes cardPop {
    0%   { transform: scale(0.8) translateY(10px); opacity: 0; }
    70%  { transform: scale(1.05) translateY(-2px); opacity: 1; }
    100% { transform: scale(1.0) translateY(0); opacity: 1; }
  }
  @keyframes cardClose {
    0%   { transform: scale(1.0); opacity: 1; }
    100% { transform: scale(0.8) translateY(10px); opacity: 0; }
  }

  .rbt-card {
    position: absolute;
    top: calc(100% + 16px);
    width: 260px;
    padding: 24px;
    background: #FFFFFF;
    border-top: 3px solid #C9A84C;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    text-align: left;
    z-index: 50;
  }
  .rbt-card-pointer {
    position: absolute;
    bottom: 100%;
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-bottom: 12px solid #C9A84C;
    filter: drop-shadow(0 -4px 4px rgba(0, 0, 0, 0.06));
  }

  @keyframes chatFadeIn {
    from { opacity: 0; transform: translateY(6px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  .chat-msg { animation: chatFadeIn 0.4s ease-out both; }

  .chat-caret { animation: caretBlink 0.8s step-end infinite; margin-left: 1px; }
  @keyframes caretBlink { 50% { opacity: 0 } }

  /* ---- Mini robots (background decorative layer) ---- */
  @keyframes miniFadeIn { from { opacity: 0 } to { opacity: var(--mini-op, 0.35) } }

  @keyframes floatL1 {
    0%,100% { transform: translateY(0px) rotate(-3deg) }
    50%     { transform: translateY(-20px) rotate(3deg) }
  }
  @keyframes floatL2 {
    0%,100% { transform: translateY(0px) rotate(4deg) }
    50%     { transform: translateY(-25px) rotate(-4deg) }
  }
  @keyframes floatL3 {
    0%,100% { transform: translateY(0px) rotate(-5deg) }
    50%     { transform: translateY(-18px) rotate(5deg) }
  }
  @keyframes floatR1 {
    0%,100% { transform: translateY(0px) rotate(4deg) }
    50%     { transform: translateY(-22px) rotate(-4deg) }
  }
  @keyframes floatR2 {
    0%,100% { transform: translateY(0px) rotate(-3deg) }
    50%     { transform: translateY(-16px) rotate(3deg) }
  }
  @keyframes floatR3 {
    0%,100% { transform: translateY(0px) rotate(6deg) }
    50%     { transform: translateY(-20px) rotate(-6deg) }
  }
`
