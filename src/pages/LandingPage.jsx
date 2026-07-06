import { useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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

  const handleGetAssessed = useCallback(() => {
    // Enter the funnel: account → payment → briefing → assessment.
    navigate('/register')
  }, [navigate])

  const handleContactSales = () => {
    window.location.href = 'mailto:institutions@studaione.com?subject=Prism Institutional Licence'
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
    </main>
  )
}
