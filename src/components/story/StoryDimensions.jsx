import { useState } from 'react'
import { DIMENSION_KEYS, DIMENSION_WEIGHTS, DIMENSION_LABELS } from '../../../server/lib/sharedConstants.js'

// ── Act VI — The Dimensions ──────────────────────────────────────────────────
// Five dimensions, weights PUBLISHED — imported from the same shared module
// the scoring route uses, so this section cannot drift from the arithmetic.
// Interactive: selecting a dimension foregrounds its vertex and definition.

const DEFINITIONS = {
  criticalThinking: 'Spots the missing variable before acting. Asks for the number instead of assuming it.',
  communication: 'Restructures when not understood — never just repeats louder.',
  collaboration: 'Credits the idea before building on it. Holds a position without holding a grudge.',
  problemSolving: 'Names the trade-off out loud: what is given up, what is protected.',
  aiDigitalFluency: 'Treats AI as a tool with a verification step — not an answer machine.',
}

function vertexPoint(i, n, r, cx, cy) {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

export default function StoryDimensions() {
  const [active, setActive] = useState('criticalThinking')
  const keys = DIMENSION_KEYS
  const cx = 150
  const cy = 140
  const R = 105

  return (
    <section className="relative bg-[var(--prism-surface)] border-y border-[var(--prism-border)] py-24 sm:py-32" aria-label="The five dimensions">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--prism-ink-muted)] mb-3">The dimensions</p>
          <h2 className="font-serif text-3xl sm:text-5xl text-[var(--prism-ink)] leading-tight mb-4">
            Five dimensions. Weights published, not implied.
          </h2>
          <p className="font-sans text-base text-[var(--prism-ink-muted)] leading-relaxed">
            The exact weights below are imported from the same code that computes your
            score — the page cannot say one thing while the arithmetic does another.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Interactive pentagon */}
          <svg viewBox="0 0 300 280" className="w-full max-w-md mx-auto" role="img" aria-label="Pentagon of the five dimensions">
            {[0.4, 0.7, 1].map((f) => (
              <polygon
                key={f}
                points={keys.map((_, i) => vertexPoint(i, keys.length, R * f, cx, cy).join(',')).join(' ')}
                fill="none"
                stroke="var(--prism-border)"
                strokeWidth="1"
              />
            ))}
            {keys.map((k, i) => {
              const [x, y] = vertexPoint(i, keys.length, R, cx, cy)
              const [lx, ly] = vertexPoint(i, keys.length, R + 26, cx, cy)
              const isActive = active === k
              return (
                <g key={k} onClick={() => setActive(k)} style={{ cursor: 'pointer' }}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke={isActive ? 'var(--prism-signal)' : 'var(--prism-border)'} strokeWidth={isActive ? 1.6 : 1} />
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 7 : 4.5}
                    fill={isActive ? 'var(--prism-signal)' : 'var(--prism-surface)'}
                    stroke="var(--prism-signal)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                    fill={isActive ? 'var(--prism-ink)' : 'var(--prism-ink-muted)'}
                  >
                    {Math.round(DIMENSION_WEIGHTS[k] * 100)}%
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Selector + definition */}
          <div>
            <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Choose a dimension">
              {keys.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={active === k}
                  onClick={() => setActive(k)}
                  className={`px-3.5 py-2 rounded-[var(--radius-full)] border font-sans text-xs font-semibold transition-colors cursor-pointer ${
                    active === k
                      ? 'border-[var(--prism-signal)] bg-[var(--prism-canvas)] text-[var(--prism-ink)]'
                      : 'border-[var(--prism-border)] text-[var(--prism-ink-muted)] hover:text-[var(--prism-ink)]'
                  }`}
                >
                  {DIMENSION_LABELS[k]}
                </button>
              ))}
            </div>
            <div className="bg-[var(--prism-canvas)] border border-[var(--prism-border)] rounded-[var(--radius-md)] p-6">
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <h3 className="font-serif text-2xl text-[var(--prism-ink)]">{DIMENSION_LABELS[active]}</h3>
                <span className="font-mono text-sm tabular-nums text-[var(--prism-signal)]">
                  × {Math.round(DIMENSION_WEIGHTS[active] * 100)}% of overall
                </span>
              </div>
              <p className="font-sans text-base text-[var(--prism-ink)] leading-relaxed">{DEFINITIONS[active]}</p>
              <p className="mt-4 font-mono text-[11px] text-[var(--prism-ink-muted)]">
                behaviour observed in conversation — not facts memorised
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
