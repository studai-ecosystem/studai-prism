// Shared character avatars — hand-built parametric SVG faces (no images, no
// external libs). Used by Briefing (picker), Assessment (chat bubbles) and
// ScoreReport. A single data-driven face renderer (110×110 viewBox) draws all
// twelve characters from the CHARACTERS config below.

import { useId, useState } from 'react'

// 8 characters — 4 male, 4 female. Each entry carries its display copy, card
// gradient, a portrait `image` (served from /public/avatars) and a facial
// config used by <PrismFace /> as a graceful fallback if the image is missing.
// Portrait mapping: images 1–4 are female, images 5–8 are male.
export const CHARACTERS = [
  { id: 'priya', name: 'Priya', gender: 'female', personality: 'The Creator',      description: 'Always finds another way',       image: '/avatars/avatar-1.png', gradient: ['#065F46', '#34D399'], skin: '#C8845A', hair: 'longStraight', hairColor: '#10100E', earrings: true },
  { id: 'meera', name: 'Meera', gender: 'female', personality: 'The Communicator', description: 'Clear and composed always',       image: '/avatars/avatar-2.png', gradient: ['#5B21B6', '#A78BFA'], skin: '#E8B898', hair: 'curlyAfro',    hairColor: '#10100E', glasses: true },
  { id: 'sara',  name: 'Sara',  gender: 'female', personality: 'The Leader',       description: 'Owns every room she enters',      image: '/avatars/avatar-3.png', gradient: ['#881337', '#FB7185'], skin: '#C89060', hair: 'longStraight', hairColor: '#10100E', smile: 'big' },
  { id: 'nisha', name: 'Nisha', gender: 'female', personality: 'The Empath',       description: 'Reads the room instantly',        image: '/avatars/avatar-4.png', gradient: ['#4C1D95', '#EC4899'], skin: '#B87040', hair: 'longStraight', hairColor: '#10100E', raisedBrow: true, iris: '#8A2B2B' },
  { id: 'arjun', name: 'Arjun', gender: 'male',   personality: 'The Analyst',      description: 'Thinks before he speaks',        image: '/avatars/avatar-5.png', gradient: ['#1E3A8A', '#3B82F6'], skin: '#E8B898', hair: 'short',       hairColor: '#10100E', iris: '#3A5A80' },
  { id: 'ravi',  name: 'Ravi',  gender: 'male',   personality: 'The Bold One',     description: 'Never backs down',               image: '/avatars/avatar-6.png', gradient: ['#92400E', '#F59E0B'], skin: '#D4956A', hair: 'short',       hairColor: '#0A0A08', iris: '#4A5A2A' },
  { id: 'dev',   name: 'Dev',   gender: 'male',   personality: 'The Strategist',   description: 'Always three steps ahead',        image: '/avatars/avatar-7.png', gradient: ['#134E4A', '#2DD4BF'], skin: '#D4956A', hair: 'longStraight', hairColor: '#10100E', iris: '#4A5A2A' },
  { id: 'aadi',  name: 'Aadi',  gender: 'male',   personality: 'The Innovator',    description: 'Breaks rules to make new ones',   image: '/avatars/avatar-8.png', gradient: ['#1E1B4B', '#6366F1'], skin: '#D4956A', hair: 'wavyMedium',  hairColor: '#10100E', glasses: true },
]

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null
}

// ---- colour helpers ---------------------------------------------------------
function hx(c) {
  const h = c.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}
function mix(a, b, t) {
  const A = hx(a), B = hx(b)
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t])
}
const lighten = (c, t) => mix(c, '#FFFFFF', t)
const darken = (c, t) => mix(c, '#000000', t)

// ---- hair ------------------------------------------------------------------
const TOP_CAP = 'M27 55 Q27 20 55 18 Q83 20 83 55 Q83 35 55 30 Q27 35 27 55Z'

// Hair drawn BEHIND the face (side falls / volume).
function HairBack({ style, color }) {
  switch (style) {
    case 'longStraight':
      return (
        <>
          <rect x="18" y="38" width="14" height="55" rx="7" fill={color} />
          <rect x="78" y="38" width="14" height="55" rx="7" fill={color} />
        </>
      )
    case 'curlyAfro':
      return (
        <>
          <circle cx="55" cy="30" r="32" fill={color} />
          <circle cx="30" cy="45" r="18" fill={color} />
          <circle cx="80" cy="45" r="18" fill={color} />
        </>
      )
    case 'locs':
      return (
        <>
          <rect x="19" y="45" width="7" height="45" rx="3.5" fill={color} />
          <rect x="28" y="42" width="7" height="50" rx="3.5" fill={color} />
          <rect x="75" y="42" width="7" height="50" rx="3.5" fill={color} />
          <rect x="84" y="45" width="7" height="45" rx="3.5" fill={color} />
        </>
      )
    default:
      return null
  }
}

// Hair drawn IN FRONT of the face (caps / fringe / bun).
function HairFront({ style, color }) {
  switch (style) {
    case 'short':
    case 'slickedBack':
    case 'fade':
      return (
        <>
          <path d={TOP_CAP} fill={color} />
          <rect x="27" y="28" width="56" height="12" rx="4" fill={color} />
        </>
      )
    case 'shortCurly':
      return (
        <>
          <path d={TOP_CAP} fill={color} />
          <circle cx="34" cy="26" r="7" fill={color} />
          <circle cx="46" cy="22" r="7.5" fill={color} />
          <circle cx="58" cy="22" r="7.5" fill={color} />
          <circle cx="70" cy="26" r="7" fill={color} />
        </>
      )
    case 'wavyMedium':
      return (
        <>
          <path d={TOP_CAP} fill={color} />
          <path d="M27 40 Q22 50 25 60 Q20 50 18 62" stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
          <path d="M83 40 Q88 50 85 60 Q90 50 92 62" stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
        </>
      )
    case 'bunTop':
      return (
        <>
          <path d={TOP_CAP} fill={color} />
          <circle cx="55" cy="16" r="14" fill={color} />
        </>
      )
    case 'longStraight':
    case 'locs':
    default:
      return <path d={TOP_CAP} fill={color} />
  }
}

// ---- mouth / brows / extras -------------------------------------------------
function Mouth({ char, lip }) {
  if (char.smile === 'big') {
    return (
      <>
        <path d="M40 72 Q55 92 70 72 Z" fill="#6B2B2B" />
        <path d="M44 74 Q55 79 66 74 Q55 76 44 74 Z" fill="white" />
        <path d="M40 72 Q55 73 70 72" stroke={lip} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    )
  }
  if (char.smirk) {
    return (
      <>
        <path d="M42 74 Q48 71 55 73 Q62 71 68 73" stroke={lip} strokeWidth="1.5" fill={lip} opacity="0.7" />
        <path d="M44 75 Q54 80 67 72" stroke={lip} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    )
  }
  if (char.smile === 'warm') {
    return (
      <>
        <path d="M42 73 Q48 70 55 72 Q62 70 68 73" stroke={lip} strokeWidth="1.5" fill={lip} opacity="0.7" />
        <path d="M43 74 Q55 84 67 74" stroke={lip} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </>
    )
  }
  return (
    <>
      <path d="M42 74 Q48 70 55 72 Q62 70 68 74" stroke={lip} strokeWidth="1.5" fill={lip} opacity="0.7" />
      <path d="M42 74 Q55 82 68 74" stroke={lip} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  )
}

function Brows({ char, color }) {
  if (char.raisedBrow) {
    return (
      <>
        <path d="M38 42 Q44 36 50 42" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M60 45 Q66 41 72 45" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </>
    )
  }
  return (
    <>
      <path d="M38 45 Q44 41 50 45" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M60 45 Q66 41 72 45" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  )
}

function Extras({ char }) {
  const nodes = []
  if (char.earrings) {
    nodes.push(<circle key="el" cx="25" cy="70" r="2.6" fill="#E8C96A" />)
    nodes.push(<circle key="er" cx="85" cy="70" r="2.6" fill="#E8C96A" />)
  }
  if (char.bindi) {
    nodes.push(<circle key="bindi" cx="55" cy="40" r="2.6" fill="#C0392B" />)
  }
  if (char.stubble) {
    const dots = [[40, 80], [46, 83], [55, 84], [64, 83], [70, 80], [36, 74], [74, 74]]
    dots.forEach((d, i) => nodes.push(
      <circle key={`stub-${i}`} cx={d[0]} cy={d[1]} r="0.9" fill={darken(char.skin, 0.3)} opacity="0.7" />,
    ))
  }
  if (char.glasses) {
    nodes.push(
      <g key="glasses" stroke="#2A2A2A" strokeWidth="2" fill="none">
        <rect x="35" y="46" width="17" height="12" rx="4" />
        <rect x="58" y="46" width="17" height="12" rx="4" />
        <path d="M52 52 L58 52" />
      </g>,
    )
  }
  return nodes
}

// ---- the parametric face ----------------------------------------------------
function PrismFace({ char, uid }) {
  const skin = char.skin
  const skinLight = lighten(skin, 0.3)
  const noseColor = darken(skin, 0.2)
  const lip = mix(skin, '#B0485A', 0.55)
  const hair = char.hairColor || '#10100E'
  const iris = char.iris || '#3A2516'
  const bgLight = lighten(char.gradient[1], 0.8)
  const outfit = char.gradient[0]
  const clip = `faceClip-${uid}`
  const grad = `skinGrad-${uid}`

  return (
    <>
      <defs>
        <clipPath id={clip}>
          <circle cx="55" cy="55" r="52" />
        </clipPath>
        <radialGradient id={grad} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={skinLight} />
          <stop offset="100%" stopColor={skin} />
        </radialGradient>
      </defs>

      {/* Light backdrop circle (card-gradient tint) */}
      <circle cx="55" cy="55" r="52" fill={bgLight} />

      <g clipPath={`url(#${clip})`}>
        {/* Hair behind the face */}
        <HairBack style={char.hair} color={hair} />

        {/* Neck + outfit/collar */}
        <rect x="42" y="88" width="26" height="22" rx="8" fill={skin} />
        <rect x="20" y="100" width="70" height="20" rx="6" fill={outfit} />

        {/* Face */}
        <ellipse cx="55" cy="60" rx="28" ry="32" fill={`url(#${grad})`} />

        {/* Ears */}
        <ellipse cx="27" cy="60" rx="5" ry="7" fill={skin} />
        <ellipse cx="83" cy="60" rx="5" ry="7" fill={skin} />

        {/* Hair in front */}
        <HairFront style={char.hair} color={hair} />

        {/* Eyebrows */}
        <Brows char={char} color={hair} />

        {/* Eyes */}
        <ellipse cx="44" cy="52" rx="6" ry="5" fill="white" />
        <ellipse cx="66" cy="52" rx="6" ry="5" fill="white" />
        <circle cx="44" cy="52" r="3.5" fill={iris} />
        <circle cx="66" cy="52" r="3.5" fill={iris} />
        <circle cx="44" cy="52" r="1.8" fill="#0A0A0A" />
        <circle cx="66" cy="52" r="1.8" fill="#0A0A0A" />
        <circle cx="46" cy="50" r="1.2" fill="white" opacity="0.9" />
        <circle cx="68" cy="50" r="1.2" fill="white" opacity="0.9" />

        {/* Nose */}
        <path d="M52 62 Q55 68 58 62" stroke={noseColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="51" cy="65" r="2" fill={noseColor} opacity="0.4" />
        <circle cx="59" cy="65" r="2" fill={noseColor} opacity="0.4" />

        {/* Mouth */}
        <Mouth char={char} lip={lip} />

        {/* Cheek blush */}
        <circle cx="34" cy="66" r="8" fill="#FF9999" opacity="0.15" />
        <circle cx="76" cy="66" r="8" fill="#FF9999" opacity="0.15" />

        {/* Per-character extras */}
        <Extras char={char} />
      </g>
    </>
  )
}

export function CharacterAvatar({ id, size = 80, className = '' }) {
  const rawUid = useId()
  const [imgError, setImgError] = useState(false)
  const char = getCharacter(id)
  if (!char) return null

  // Prefer the painted portrait (served from /public/avatars). If the file is
  // missing or fails to load, fall back to the hand-built SVG face so an avatar
  // is always shown.
  if (char.image && !imgError) {
    return (
      <img
        src={char.image}
        width={size}
        height={size}
        alt={char.name}
        onError={() => setImgError(true)}
        className={className}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%', display: 'block' }}
      />
    )
  }

  const uid = `${id}-${rawUid.replace(/[:]/g, '')}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      className={className}
      role="img"
      aria-label={char.name}
    >
      <PrismFace char={char} uid={uid} />
    </svg>
  )
}
