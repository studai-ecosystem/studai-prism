import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import Assessment from './pages/Assessment.jsx'
import ScoreReport from './pages/ScoreReport.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/assessment" element={<Assessment />} />
      <Route path="/score" element={<ScoreReport />} />
    </Routes>
  )
}
