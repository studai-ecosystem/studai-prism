import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from '../components/Nav.jsx'
import Hero from '../components/Hero.jsx'
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
  const [loading, setLoading] = useState(false)

  const handleGetAssessed = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/payment/dev-session', { method: 'POST' })
      if (!res.ok) throw new Error('Could not start session. Please try again.')
      const { sessionId } = await res.json()
      navigate(`/assessment?session=${sessionId}`)
    } catch (err) {
      alert(err.message)
      setLoading(false)
    }
  }, [navigate, loading])

  const handleContactSales = () => {
    window.location.href = 'mailto:institutions@studaione.com?subject=Prism Institutional Licence'
  }

  return (
    <main className="bg-white min-h-screen overflow-x-hidden">
      <Nav onGetAssessed={handleGetAssessed} />
      <Hero onGetAssessed={handleGetAssessed} />
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
