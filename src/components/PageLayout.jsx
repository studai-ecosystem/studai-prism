import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from './Nav.jsx'
import Footer from './Footer.jsx'

// Shared shell for the marketing / research / about pages.
// Renders the fixed Nav, the page content, and the Footer.
export default function PageLayout({ children }) {
  const navigate = useNavigate()

  const handleGetAssessed = useCallback(() => {
    navigate('/register')
  }, [navigate])

  return (
    <main
      className="bg-[var(--color-paper)] min-h-screen overflow-x-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <Nav onGetAssessed={handleGetAssessed} />
      {/* Offset for the fixed 4rem-tall header */}
      <div className="pt-16">{children}</div>
      <Footer />
    </main>
  )
}

// Reusable page heading with the gold divider used across all pages.
export function PageHeading({ title, subtitle }) {
  return (
    <header className="text-center max-w-3xl mx-auto">
      <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-ink)] tracking-tight">
        {title}
      </h1>
      <div className="w-16 h-1 bg-gold mx-auto mt-4" />
      {subtitle && (
        <p className="mt-6 text-lg text-[var(--color-ink-muted)] leading-relaxed">{subtitle}</p>
      )}
    </header>
  )
}
