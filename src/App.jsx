import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import Auth from './pages/Auth.jsx'
import Payment from './pages/Payment.jsx'
import Briefing from './pages/Briefing.jsx'
import Assessment from './pages/Assessment.jsx'
import ScoreReport from './pages/ScoreReport.jsx'
import { isAuthenticated } from './lib/session.js'

// Gate funnel pages behind a (mock) authenticated session.
function RequireAuth({ children }) {
  return isAuthenticated() ? children : <Navigate to="/register" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/register" element={<Auth />} />
      <Route path="/payment" element={<RequireAuth><Payment /></RequireAuth>} />
      <Route path="/briefing" element={<RequireAuth><Briefing /></RequireAuth>} />
      <Route path="/assessment" element={<Assessment />} />
      <Route path="/score" element={<ScoreReport />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
