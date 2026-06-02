import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useScrollDirection } from '../hooks/useScrollDirection.js'

const navLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Dimensions',   href: '#dimensions' },
  { label: "Who it's for", href: '#who-its-for' },
  { label: 'Pricing',      href: '#pricing' },
]

export default function Nav({ onGetAssessed }) {
  const { scrollDir, scrollY } = useScrollDirection()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  // Close menu on resize
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMenuOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const visible = scrollDir === 'up' || scrollY < 80

  return (
    <motion.header
      animate={{ y: visible ? 0 : -100, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 nav-blur bg-white/95 border-b border-[#E0E0E8]"
    >
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex flex-col leading-none" aria-label="Prism home">
          <span className="font-serif text-xl text-[#1A1A2E] tracking-tight">Prism</span>
          <span className="font-sans text-[10px] text-[#64687A] tracking-wider mt-0.5">by StudAI One</span>
        </a>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-8" role="list">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="relative font-sans text-sm text-[#64687A] hover:text-[#1A1A2E] transition-colors group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#C9A84C] transition-all duration-300 group-hover:w-full" />
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center">
          <motion.button
            onClick={onGetAssessed}
            className="shimmer-btn px-5 py-2.5 rounded-md font-sans font-semibold text-sm text-[#0A0D14] cursor-pointer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Get Assessed
          </motion.button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="md:hidden flex items-center justify-center w-10 h-10 text-[#1A1A2E]"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden overflow-hidden bg-white border-t border-[#E0E0E8]"
          >
            <div className="flex flex-col items-center gap-5 py-6 px-6">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="font-sans text-sm text-[#64687A] hover:text-[#1A1A2E] transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <motion.button
                onClick={() => { setMenuOpen(false); onGetAssessed && onGetAssessed() }}
                className="shimmer-btn w-full py-3 rounded-md font-sans font-semibold text-sm text-[#0A0D14]"
                whileTap={{ scale: 0.97 }}
              >
                Get Assessed — ₹499
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
