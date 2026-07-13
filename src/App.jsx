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
import Admin from './pages/Admin.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminShell from './pages/admin/AdminShell.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminAdmins from './pages/admin/AdminAdmins.jsx'
import AdminCandidates from './pages/admin/AdminCandidates.jsx'
import AdminCandidateDetail from './pages/admin/AdminCandidateDetail.jsx'
import AdminSessions from './pages/admin/AdminSessions.jsx'
import AdminSessionDetail from './pages/admin/AdminSessionDetail.jsx'
import AdminReports, { AdminReportDetail } from './pages/admin/AdminReports.jsx'
import AdminDisputes, { AdminDisputeDetail } from './pages/admin/AdminDisputes.jsx'
import AdminPayments from './pages/admin/AdminPayments.jsx'
import AdminRecords from './pages/admin/AdminRecords.jsx'
import AdminBank from './pages/admin/AdminBank.jsx'
import AdminCalibrations from './pages/admin/AdminCalibrations.jsx'
import AdminRaters from './pages/admin/AdminRaters.jsx'
import AdminStudies from './pages/admin/AdminStudies.jsx'
import AdminPrompts from './pages/admin/AdminPrompts.jsx'
import AdminPsychometrics from './pages/admin/AdminPsychometrics.jsx'
import AdminCredentials from './pages/admin/AdminCredentials.jsx'
import AdminReplays from './pages/admin/AdminReplays.jsx'
import AdminTeamfit from './pages/admin/AdminTeamfit.jsx'
import AdminExports from './pages/admin/AdminExports.jsx'
import AdminContent from './pages/admin/AdminContent.jsx'
import AdminFlags from './pages/admin/AdminFlags.jsx'
import AdminSystem from './pages/admin/AdminSystem.jsx'
import AdminPrivacy from './pages/admin/AdminPrivacy.jsx'
import AdminAudit from './pages/admin/AdminAudit.jsx'
import ShellHome from './pages/ShellHome.jsx'
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
      {/* Control Centre — database-backed admin identities + MFA + RBAC.
          Dark server-side unless PRISM_ADMIN_CONSOLE=true. */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminShell />}>
        <Route index element={<AdminDashboard />} />
        <Route path="admins" element={<AdminAdmins />} />
        <Route path="candidates" element={<AdminCandidates />} />
        <Route path="candidates/:id" element={<AdminCandidateDetail />} />
        <Route path="sessions" element={<AdminSessions />} />
        <Route path="sessions/:id" element={<AdminSessionDetail />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="reports/:sessionId" element={<AdminReportDetail />} />
        <Route path="disputes" element={<AdminDisputes />} />
        <Route path="disputes/:sessionId" element={<AdminDisputeDetail />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="consents" element={<AdminRecords mode="consents" />} />
        <Route path="verifications" element={<AdminRecords mode="verifications" />} />
        <Route path="integrity" element={<AdminRecords mode="integrity" />} />
        <Route path="bank" element={<AdminBank />} />
        <Route path="calibrations" element={<AdminCalibrations />} />
        <Route path="raters" element={<AdminRaters />} />
        <Route path="studies" element={<AdminStudies />} />
        <Route path="prompts" element={<AdminPrompts />} />
        <Route path="psychometrics" element={<AdminPsychometrics />} />
        <Route path="credentials" element={<AdminCredentials />} />
        <Route path="replays" element={<AdminReplays />} />
        <Route path="teamfit" element={<AdminTeamfit />} />
        <Route path="exports" element={<AdminExports />} />
        <Route path="content" element={<AdminContent />} />
        <Route path="flags" element={<AdminFlags />} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="privacy" element={<AdminPrivacy />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
      {/* Legacy pilot cockpit (read-only, x-admin-token) — retires in Phase 6. */}
      <Route path="/admin/legacy-ops" element={<Admin />} />
      {/* The app launcher — what the desktop shell / installed PWA opens into. */}
      <Route path="/app" element={<ShellHome />} />
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
