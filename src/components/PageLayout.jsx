import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from './Nav.jsx'
import Footer from './Footer.jsx'
import { isAuthenticated } from '../lib/session.js'

// Shared shell for the marketing / research / about pages.
// Renders the fixed Nav, the page content, and the Footer.
export default function PageLayout({ children }) {
  const navigate = useNavigate()

  const handleGetAssessed = useCallback(() => {
    // Signed-in users go straight to checkout; new visitors register first.
    navigate(isAuthenticated() ? '/payment' : '/register')
  }, [navigate])

  return (
    <main
      className="bg-prism-canvas min-h-screen overflow-x-hidden"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <Nav onGetAssessed={handleGetAssessed} />
      {/* Offset for the fixed 4rem-tall header */}
      <div className="pt-16">{children}</div>
      <Footer />
    </main>
  )
}

// Reusable page heading with the green divider used across all pages.
export function PageHeading({ title, subtitle }) {
  return (
    <header className="text-center max-w-3xl mx-auto">
      <h1 className="text-4xl md:text-5xl font-bold text-prism-ink tracking-tight">
        {title}
      </h1>
      <div className="w-16 h-1 bg-brand-green mx-auto mt-4" />
      {subtitle && (
        <p className="mt-6 text-lg text-prism-ink-muted leading-relaxed">{subtitle}</p>
      )}
    </header>
  )
}
