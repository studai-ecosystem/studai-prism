import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import Auth from './pages/Auth.jsx'
import Payment from './pages/Payment.jsx'
import Briefing from './pages/Briefing.jsx'
import VerifyIdentity from './pages/VerifyIdentity.jsx'
import LinkPhone from './pages/LinkPhone.jsx'
import PhoneProctor from './pages/PhoneProctor.jsx'
import RoomScan from './pages/RoomScan.jsx'
import Assessment from './pages/Assessment.jsx'
import ScoreReport from './pages/ScoreReport.jsx'
import Verify from './pages/Verify.jsx'
import Profile from './pages/Profile.jsx'
import RaterWorkbench from './pages/RaterWorkbench.jsx'
import ScienceBehindPrism from './pages/research/ScienceBehindPrism.jsx'
import ValidityStudy from './pages/research/ValidityStudy.jsx'
import AIEvaluation from './pages/research/AIEvaluation.jsx'
import Blog from './pages/research/Blog.jsx'
import BlogPost from './pages/research/BlogPost.jsx'
import AboutStudAI from './pages/about/AboutStudAI.jsx'
import Mission from './pages/about/Mission.jsx'
import Careers from './pages/about/Careers.jsx'
import DesignSystem from './pages/DesignSystem.jsx'
import { isAuthenticated } from './lib/session.js'

// Gate funnel pages behind a (mock) authenticated session.
function RequireAuth({ children }) {
  return isAuthenticated() ? children : <Navigate to="/register" replace />
}

// Reset scroll to the top whenever the route changes so new pages
// don't inherit the previous page's scroll position.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/research/science" element={<ScienceBehindPrism />} />
      <Route path="/research/validity" element={<ValidityStudy />} />
      <Route path="/research/ai-evaluation" element={<AIEvaluation />} />
      <Route path="/research/blog" element={<Blog />} />
      <Route path="/research/blog/:slug" element={<BlogPost />} />
      <Route path="/about" element={<AboutStudAI />} />
      <Route path="/about/mission" element={<Mission />} />
      <Route path="/about/careers" element={<Careers />} />
      {/* Internal living style guide (Part A) — admin-token gated in-page. */}
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/register" element={<Auth />} />
      <Route path="/payment" element={<RequireAuth><Payment /></RequireAuth>} />
      <Route path="/verify-identity" element={<RequireAuth><VerifyIdentity /></RequireAuth>} />
      <Route path="/link-phone" element={<RequireAuth><LinkPhone /></RequireAuth>} />
      <Route path="/m/:pairCode" element={<PhoneProctor />} />
      <Route path="/room-scan" element={<RequireAuth><RoomScan /></RequireAuth>} />
      <Route path="/briefing" element={<RequireAuth><Briefing /></RequireAuth>} />
      <Route path="/assessment" element={<Assessment />} />
      <Route path="/score" element={<ScoreReport />} />
      <Route path="/verify/:id" element={<Verify />} />
      <Route path="/rater" element={<RaterWorkbench />} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
