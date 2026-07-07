import { useCallback, useEffect } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import Nav from '../components/Nav.jsx'
import HeroThesis from '../components/HeroThesis.jsx'
import { ClaimsProvider } from '../components/ui/measurement.jsx'
import HowItWorks from '../components/HowItWorks.jsx'
import Dimensions from '../components/Dimensions.jsx'
import ScoreSection from '../components/ScoreSection.jsx'
import WhoItsFor from '../components/WhoItsFor.jsx'
import Pricing from '../components/Pricing.jsx'
import FAQ from '../components/FAQ.jsx'
import CTABanner from '../components/CTABanner.jsx'
import Footer from '../components/Footer.jsx'
import AppHandoffModal, { useAppHandoff } from '../components/AppHandoff.jsx'
import { isAuthenticated } from '../lib/session.js'

export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // When we arrive with a hash (e.g. /#pricing from another page), scroll to
  // that section. The delay lets sections mount and beats ScrollToTop's reset.
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.replace(/^#/, '')
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timer)
  }, [location.hash])

  const enterFunnel = useCallback(() => {
    // Enter the funnel: account → payment → briefing → assessment.
    // Already signed in? Skip straight to checkout — never back to login.
    navigate(isAuthenticated() ? '/payment' : '/register')
  }, [navigate])

  // On Windows browsers, taking the test first offers the dedicated exam app
  // (open if installed / download / continue here) — never a dead end, and
  // "continue in browser" is remembered for the session.
  const { open: handoffOpen, offer: handleGetAssessed, close: closeHandoff } = useAppHandoff(enterFunnel)

  const handleContactSales = () => {
    window.location.href = 'mailto:institutions@studaione.com?subject=Prism Institutional Licence'
  }

  // The desktop shell opens into the launcher, not the marketing site.
  if (/PrismShell/.test(window.navigator.userAgent || '')) {
    return <Navigate to="/app" replace />
  }

  return (
    <main className="bg-white min-h-screen overflow-x-hidden">
      <Nav onGetAssessed={handleGetAssessed} />
      <ClaimsProvider>
        <HeroThesis onGetAssessed={handleGetAssessed} onSeeHow={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} />
      </ClaimsProvider>
      <HowItWorks />
      <Dimensions />
      <ScoreSection />
      <WhoItsFor />
      <Pricing onGetAssessed={handleGetAssessed} onContactSales={handleContactSales} />
      <FAQ />
      <CTABanner onGetAssessed={handleGetAssessed} />
      <Footer />
      <AppHandoffModal open={handoffOpen} onClose={closeHandoff} onContinueInBrowser={enterFunnel} />
    </main>
  )
}
