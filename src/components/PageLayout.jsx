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
      className="bg-[#FAF7F2] min-h-screen overflow-x-hidden"
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
      <h1 className="text-4xl md:text-5xl font-bold text-[#0A0D14] tracking-tight">
        {title}
      </h1>
      <div className="w-16 h-1 bg-gold mx-auto mt-4" />
      {subtitle && (
        <p className="mt-6 text-lg text-[#5A5F6E] leading-relaxed">{subtitle}</p>
      )}
    </header>
  )
}
