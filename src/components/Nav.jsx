import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import PrismLogo from './ui/PrismLogo.jsx'
import { isAuthenticated } from '../lib/session.js'

const navLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Dimensions',   href: '#dimensions' },
  { label: "Who it's for", href: '#who-its-for' },
  { label: 'Pricing',      href: '#pricing' },
]

const researchLinks = [
  { icon: '📄', label: 'The Science Behind Prism', desc: 'How we measure 5 skill dimensions', to: '/research/science' },
  { icon: '📊', label: 'Scoring Methodology',      desc: 'How scores are produced — validation in progress', to: '/research/validity' },
  { icon: '🧠', label: 'AI Evaluation',            desc: 'How our AI evaluation panel scores your responses', to: '/research/ai-evaluation' },
  { icon: '📰', label: 'Blog',                     desc: 'Insights on skills, hiring and AI', to: '/research/blog' },
]

const aboutLinks = [
  { icon: '🏢', label: 'About StudAI One', desc: 'Who we are and why we built Prism', to: '/about' },
  { icon: '👥', label: 'Our Team',         desc: 'The people behind the product', href: '#team' },
  { icon: '🌏', label: 'Our Mission',      desc: "Building the skills layer for India's workforce", to: '/about/mission' },
  { icon: '💼', label: 'Careers',          desc: 'Join the StudAI One team', to: '/about/careers' },
  { icon: '📢', label: 'Press',            desc: 'News and media coverage', href: '#press' },
]

const dropdowns = {
  research: researchLinks,
  about: aboutLinks,
}

export default function Nav({ onGetAssessed, activeHref }) {
  const [openDropdown, setOpenDropdown] = useState(null) // null, 'research', or 'about'
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileAccordion, setMobileAccordion] = useState(null)
  const navRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Section links (#how-it-works, #pricing …) only exist on the landing page.
  // From any other route we navigate home first, then scroll to the section,
  // so the top bar works everywhere — not just on "/".
  const handleSectionNav = (e, href) => {
    e.preventDefault()
    const id = href.replace(/^#/, '')
    if (location.pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate(`/#${id}`)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close mobile menu / dropdown on resize to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) {
        setMobileOpen(false)
        setMobileAccordion(null)
      }
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Lock body scroll while mobile overlay is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const closeMobile = () => {
    setMobileOpen(false)
    setMobileAccordion(null)
  }

  return (
    <>
      <style>{`
        @keyframes prismDropdownIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .prism-dropdown-anim { animation: prismDropdownIn 200ms ease forwards; }
        .prism-navlink::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -4px;
          height: 1px;
          width: 0;
          background: var(--color-accent);
          transition: width 200ms ease;
        }
        .prism-navlink:hover::after { width: 100%; }
        .prism-navlink.is-active::after { width: 100%; }
        .prism-overlay {
          transform: translateX(100%);
          transition: transform 300ms ease;
        }
        .prism-overlay.is-open { transform: translateX(0); }
        .prism-drop-item:hover { box-shadow: inset 3px 0 0 var(--color-accent); background: var(--color-paper); }
      `}</style>

      <header
        ref={navRef}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[var(--color-paper)]/90 border-b border-[var(--color-line)]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" aria-label="Prism home">
            <PrismLogo size={34} wordmarkColor="var(--color-ink)" subtitleColor="var(--color-ink-muted)" />
          </Link>

          {/* Desktop links */}
          <ul className="hidden md:flex items-center gap-8" role="list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={(e) => handleSectionNav(e, link.href)}
                  className={`prism-navlink relative text-[14px] text-[var(--color-ink)] no-underline ${activeHref === link.href ? 'is-active' : ''}`}
                >
                  {link.label}
                </a>
              </li>
            ))}

            {/* Dropdown triggers */}
            {Object.keys(dropdowns).map((key) => {
              const label = key.charAt(0).toUpperCase() + key.slice(1)
              const isOpen = openDropdown === key
              return (
                <li
                  key={key}
                  className="relative"
                  onMouseEnter={() => setOpenDropdown(key)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(isOpen ? null : key)}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    className={`prism-navlink relative text-[14px] text-[var(--color-ink)] bg-transparent cursor-pointer ${isOpen ? 'is-active' : ''}`}
                  >
                    {label}
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 top-full pt-3 w-[220px]">
                    <div
                      className="prism-dropdown-anim w-full bg-white rounded-lg overflow-hidden border-l-[3px] border-[var(--color-accent)]"
                      style={{ boxShadow: '0 12px 32px rgba(10,13,20,0.12)' }}
                    >
                      {dropdowns[key].map((item) => {
                        const inner = (
                          <>
                            <span className="text-base leading-5">{item.icon}</span>
                            <span className="flex flex-col">
                              <span className="text-[13px] font-semibold text-[var(--color-ink)] leading-tight">{item.label}</span>
                              <span className="text-[11px] text-[var(--color-ink-muted)] leading-snug mt-0.5">{item.desc}</span>
                            </span>
                          </>
                        )
                        const cls = 'prism-drop-item flex gap-2.5 px-4 py-2.5 no-underline transition-colors'
                        return item.to ? (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setOpenDropdown(null)}
                            className={cls}
                          >
                            {inner}
                          </Link>
                        ) : (
                          <a
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpenDropdown(null)}
                            className={cls}
                          >
                            {inner}
                          </a>
                        )
                      })}
                    </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated() && (
              <Link
                to="/profile"
                className="text-[14px] font-medium text-[var(--color-ink)] no-underline hover:text-[var(--color-accent)] transition"
              >
                My Profile
              </Link>
            )}
            <button
              onClick={onGetAssessed}
              className="px-5 py-2 rounded-lg font-bold text-sm text-[var(--color-ink)] bg-[var(--color-accent)] cursor-pointer hover:brightness-105 transition"
            >
              Get Assessed
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="md:hidden flex flex-col justify-center gap-[5px] w-10 h-10 items-center"
          >
            <span className="block w-6 h-[2px] bg-[var(--color-ink)]" />
            <span className="block w-6 h-[2px] bg-[var(--color-ink)]" />
            <span className="block w-6 h-[2px] bg-[var(--color-ink)]" />
          </button>
        </nav>
      </header>

      {/* Mobile full-screen overlay */}
      <div
        className={`prism-overlay md:hidden fixed inset-0 z-[60] bg-[var(--color-paper)] ${mobileOpen ? 'is-open' : ''}`}
        style={{ fontFamily: "'DM Sans', sans-serif" }}
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between px-6 h-16 border-b border-[var(--color-line)]">
          <PrismLogo size={34} wordmarkColor="var(--color-ink)" subtitleColor="var(--color-ink-muted)" />
          <button
            onClick={closeMobile}
            aria-label="Close menu"
            className="w-10 h-10 flex items-center justify-center text-[var(--color-ink)] text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col px-6 py-6 gap-1 overflow-y-auto h-[calc(100%-4rem)]">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => { handleSectionNav(e, link.href); closeMobile() }}
              className={`py-3 text-[20px] text-[var(--color-ink)] no-underline border-b border-[var(--color-line)] ${activeHref === link.href ? 'border-b-2 border-[var(--color-accent)]' : ''}`}
            >
              {link.label}
            </a>
          ))}

          {/* Accordion dropdowns */}
          {Object.keys(dropdowns).map((key) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1)
            const isOpen = mobileAccordion === key
            return (
              <div key={key} className="border-b border-[var(--color-line)]">
                <button
                  type="button"
                  onClick={() => setMobileAccordion(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between py-3 text-[20px] text-[var(--color-ink)] bg-transparent"
                >
                  {label}
                  <span
                    className="text-base transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col pb-2 pl-2">
                    {dropdowns[key].map((item) => {
                      const inner = (
                        <>
                          <span className="text-base leading-6">{item.icon}</span>
                          <span className="flex flex-col">
                            <span className="text-[15px] font-semibold text-[var(--color-ink)] leading-tight">{item.label}</span>
                            <span className="text-[12px] text-[var(--color-ink-muted)] leading-snug mt-0.5">{item.desc}</span>
                          </span>
                        </>
                      )
                      const cls = 'flex gap-2.5 py-2.5 no-underline'
                      return item.to ? (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={closeMobile}
                          className={cls}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={closeMobile}
                          className={cls}
                        >
                          {inner}
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          <button
            onClick={() => { closeMobile(); onGetAssessed && onGetAssessed() }}
            className="mt-6 w-full py-3 rounded-lg font-bold text-base text-[var(--color-ink)] bg-[var(--color-accent)]"
          >
            Get Assessed
          </button>
        </div>
      </div>
    </>
  )
}
