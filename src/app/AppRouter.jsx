// Every route of the app (spec §6). Legacy routes are preserved exactly (see
// docs/campus/BASELINE_INVENTORY.md §1); new /app/* and /campus/* routes are
// dark behind their flags. All pages are lazy-loaded per route.
import { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './providers/AuthProvider.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { AuthGuard } from './guards/AuthGuard.jsx'
import { WorkspaceGuard } from './guards/WorkspaceGuard.jsx'
import { FlagRoute, LegacyAlias, V3Route, ParamRedirect } from './routing.jsx'
import { RouteErrorBoundary, lazyWithRetry } from './RouteErrorBoundary.jsx'
import { StudentShell } from '../layouts/StudentShell.jsx'
import { CampusShell } from '../layouts/CampusShell.jsx'
import { LinkButton } from '../components/ui/Button.jsx'
import { DocumentTitle } from '../components/ui/DocumentTitle.jsx'
import { ErrorState } from '../components/states/ErrorState.jsx'
import { WorkspaceContent } from './providers/WorkspaceProvider.jsx'

const lazy = lazyWithRetry
const named = (loader, name) => lazyWithRetry(() => loader().then((m) => ({ default: m[name] })))

// ── Legacy pages ────────────────────────────────────────────────────────────
const LandingPage = lazy(() => import('../pages/LandingPage.jsx'))
const Auth = lazy(() => import('../pages/Auth.jsx'))
const Payment = lazy(() => import('../pages/Payment.jsx'))
const Briefing = lazy(() => import('../pages/Briefing.jsx'))
const VerifyIdentity = lazy(() => import('../pages/VerifyIdentity.jsx'))
const LinkPhone = lazy(() => import('../pages/LinkPhone.jsx'))
const PhoneProctor = lazy(() => import('../pages/PhoneProctor.jsx'))
const RoomScan = lazy(() => import('../pages/RoomScan.jsx'))
const Assessment = lazy(() => import('../pages/Assessment.jsx'))
const ScoreReport = lazy(() => import('../pages/ScoreReport.jsx'))
const Verify = lazy(() => import('../pages/Verify.jsx'))
const RaterWorkbench = lazy(() => import('../pages/RaterWorkbench.jsx'))
const AssessmentWorkspace = lazy(() => import('../pages/AssessmentWorkspace.jsx'))
const ExploreMode = lazy(() => import('../pages/ExploreMode.jsx'))
const StudentReportV2 = lazy(() => import('../pages/StudentReportV2.jsx'))
const EmployeeReportV2 = lazy(() => import('../pages/EmployeeReportV2.jsx'))
const DevelopmentMission = lazy(() => import('../pages/DevelopmentMission.jsx'))
const Admin = lazy(() => import('../pages/Admin.jsx'))
const AdminLogin = lazy(() => import('../pages/admin/AdminLogin.jsx'))
const AdminShell = lazy(() => import('../pages/admin/AdminShell.jsx'))
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard.jsx'))
const AdminAdmins = lazy(() => import('../pages/admin/AdminAdmins.jsx'))
const AdminCandidates = lazy(() => import('../pages/admin/AdminCandidates.jsx'))
const AdminCandidateDetail = lazy(() => import('../pages/admin/AdminCandidateDetail.jsx'))
const AdminSessions = lazy(() => import('../pages/admin/AdminSessions.jsx'))
const AdminSessionDetail = lazy(() => import('../pages/admin/AdminSessionDetail.jsx'))
const AdminReports = lazy(() => import('../pages/admin/AdminReports.jsx'))
const AdminReportDetail = named(() => import('../pages/admin/AdminReports.jsx'), 'AdminReportDetail')
const AdminDisputes = lazy(() => import('../pages/admin/AdminDisputes.jsx'))
const AdminDisputeDetail = named(() => import('../pages/admin/AdminDisputes.jsx'), 'AdminDisputeDetail')
const AdminPayments = lazy(() => import('../pages/admin/AdminPayments.jsx'))
const AdminRecords = lazy(() => import('../pages/admin/AdminRecords.jsx'))
const AdminBank = lazy(() => import('../pages/admin/AdminBank.jsx'))
const AdminCalibrations = lazy(() => import('../pages/admin/AdminCalibrations.jsx'))
const AdminRaters = lazy(() => import('../pages/admin/AdminRaters.jsx'))
const AdminStudies = lazy(() => import('../pages/admin/AdminStudies.jsx'))
const AdminPrompts = lazy(() => import('../pages/admin/AdminPrompts.jsx'))
const AdminPsychometrics = lazy(() => import('../pages/admin/AdminPsychometrics.jsx'))
const AdminCredentials = lazy(() => import('../pages/admin/AdminCredentials.jsx'))
const AdminReplays = lazy(() => import('../pages/admin/AdminReplays.jsx'))
const AdminTeamfit = lazy(() => import('../pages/admin/AdminTeamfit.jsx'))
const AdminExports = lazy(() => import('../pages/admin/AdminExports.jsx'))
const AdminContent = lazy(() => import('../pages/admin/AdminContent.jsx'))
const AdminFlags = lazy(() => import('../pages/admin/AdminFlags.jsx'))
const AdminSystem = lazy(() => import('../pages/admin/AdminSystem.jsx'))
const AdminPrivacy = lazy(() => import('../pages/admin/AdminPrivacy.jsx'))
const AdminAudit = lazy(() => import('../pages/admin/AdminAudit.jsx'))
const AdminInvites = lazy(() => import('../pages/admin/AdminInvites.jsx'))
const AdminMargin = lazy(() => import('../pages/admin/AdminMargin.jsx'))
const ShellHome = lazy(() => import('../pages/ShellHome.jsx'))
const InviteRedeem = lazy(() => import('../pages/InviteRedeem.jsx'))
const ScienceBehindPrism = lazy(() => import('../pages/research/ScienceBehindPrism.jsx'))
const ValidityStudy = lazy(() => import('../pages/research/ValidityStudy.jsx'))
const AIEvaluation = lazy(() => import('../pages/research/AIEvaluation.jsx'))
const Blog = lazy(() => import('../pages/research/Blog.jsx'))
const BlogPost = lazy(() => import('../pages/research/BlogPost.jsx'))
const AboutStudAI = lazy(() => import('../pages/about/AboutStudAI.jsx'))
const Mission = lazy(() => import('../pages/about/Mission.jsx'))
const Careers = lazy(() => import('../pages/about/Careers.jsx'))
const DesignSystem = lazy(() => import('../pages/DesignSystem.jsx'))
const PrivacyPolicy = named(() => import('../pages/legal/LegalPages.jsx'), 'PrivacyPolicy')
const TermsOfService = named(() => import('../pages/legal/LegalPages.jsx'), 'TermsOfService')
const RefundPolicy = named(() => import('../pages/legal/LegalPages.jsx'), 'RefundPolicy')
const SecurityPage = named(() => import('../pages/legal/LegalPages.jsx'), 'SecurityPage')
const ContactPage = named(() => import('../pages/legal/LegalPages.jsx'), 'ContactPage')

// ── New application pages (dark behind flags) ───────────────────────────────
const HomePage = lazy(() => import('../features/home/pages/HomePage.jsx'))
const AssessmentsPage = lazy(() => import('../features/assessments/pages/AssessmentsPage.jsx'))
const BriefingPage = lazy(() => import('../features/assessments/pages/BriefingPage.jsx'))
const SystemCheckPage = lazy(() => import('../features/assessments/pages/SystemCheckPage.jsx'))
const AssessmentPlayerPage = lazy(() => import('../features/assessments/pages/AssessmentPlayerPage.jsx'))
const ExplorePage = lazy(() => import('../features/exploration/pages/ExplorePage.jsx'))
const CapabilitiesPage = lazy(() => import('../features/capabilities/pages/CapabilitiesPage.jsx'))
const CapabilityDetailPage = lazy(() => import('../features/capabilities/pages/CapabilityDetailPage.jsx'))
const AssessmentDetailPage = lazy(() => import('../features/assessments/pages/AssessmentDetailPage.jsx'))
const EvidencePage = lazy(() => import('../features/evidence/pages/EvidencePage.jsx'))
const DevelopmentPage = lazy(() => import('../features/development/pages/DevelopmentPage.jsx'))
const GrowthPage = lazy(() => import('../features/growth/pages/GrowthPage.jsx'))
const SharingPage = lazy(() => import('../features/sharing/pages/SharingPage.jsx'))
const SettingsPage = lazy(() => import('../features/settings/pages/SettingsPage.jsx'))
const CampusOverviewPage = lazy(() => import('../features/campus/pages/CampusOverviewPage.jsx'))
const CampusStudentsPage = lazy(() => import('../features/campus/pages/CampusStudentsPage.jsx'))
const CampusStudentDetailPage = lazy(() => import('../features/campus/pages/CampusStudentDetailPage.jsx'))
const CampusCohortsPage = lazy(() => import('../features/campus/pages/CampusCohortsPage.jsx'))
const CampusCohortDetailPage = lazy(() => import('../features/campus/pages/CampusCohortDetailPage.jsx'))
const CampusImportPage = lazy(() => import('../features/campus/pages/CampusImportPage.jsx'))
const CampusProgramsPage = lazy(() => import('../features/campus/pages/CampusProgramsPage.jsx'))
const CampusProgramDetailPage = lazy(() => import('../features/campus/pages/CampusProgramDetailPage.jsx'))
const CampusAssessmentsPage = lazy(() => import('../features/campus/pages/CampusAssessmentsPage.jsx'))
const CampusAssignWizardPage = lazy(() => import('../features/campus/pages/CampusAssignWizardPage.jsx'))
const CampusAssignmentDetailPage = lazy(() => import('../features/campus/pages/CampusAssignmentDetailPage.jsx'))
const CampusMembersPage = lazy(() => import('../features/campus/pages/CampusMembersPage.jsx'))
const CampusSettingsPage = lazy(() => import('../features/campus/pages/CampusSettingsPage.jsx'))
const CampusOnboardingPage = lazy(() => import('../features/campus/pages/CampusOnboardingPage.jsx'))
const CampusReportPage = lazy(() => import('../features/campus/pages/CampusReportPage.jsx'))
const CampusNotYetAvailablePage = lazy(() => import('../features/campus/pages/CampusNotYetAvailablePage.jsx'))
const CampusDevelopmentPage = lazy(() => import('../features/campus/pages/CampusDevelopmentPage.jsx'))
const CampusReassessmentsPage = lazy(() => import('../features/campus/pages/CampusReassessmentsPage.jsx'))
const CampusAnalyticsPage = lazy(() => import('../features/campus/pages/CampusAnalyticsPage.jsx'))
const CampusReportsPage = lazy(() => import('../features/campus/pages/CampusReportsPage.jsx'))
const CampusBillingPage = lazy(() => import('../features/campus/pages/CampusBillingPage.jsx'))
const CampusIntegrationsPage = lazy(() => import('../features/campus/pages/CampusIntegrationsPage.jsx'))
const AdminOrganizationsPage = lazy(() => import('../features/admin/AdminOrganizationsPage.jsx'))
const EvidenceRatingPage = lazy(() => import('../features/validation/EvidenceRatingPage.jsx'))
const MissionPlayerPage = lazy(() => import('../features/development/pages/MissionPlayerPage.jsx'))
const CampusInvitePage = lazy(() => import('../features/workspaces/pages/CampusInvitePage.jsx'))
const StudentReportPage = lazy(() => import('../features/reports/pages/StudentReportPage.jsx'))
const SharedReportPage = lazy(() => import('../features/reports/pages/SharedReportPage.jsx'))

// Preserve the explicit legacy funnel destination through account creation.
function RequireAuth({ children }) {
  const { status } = useAuth()
  const { pathname, search, hash } = useLocation()
  return status === 'authenticated' ? children : <Navigate to={`/register?next=${encodeURIComponent(`${pathname}${search}${hash}`)}`} replace />
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Student entry routes explain a dark portal; Campus routes stay dark.
function ShellGate({ children, off = <Navigate to="/" replace /> }) {
  return <FlagRoute flag="PRISM_APP_SHELL_V3" onError="error" on={children} off={off} />
}

function StudentPortalUnavailable() {
  return (
    <main id="main" className="prism-app min-h-screen bg-prism-canvas px-4 py-10">
      <DocumentTitle title="Student portal unavailable" />
      <ErrorState
        headingLevel={1}
        title="The student portal is not available yet"
        description="Your account and assessment history have not been removed. You can use the assessment launcher while the portal is unavailable. Contact support if you need help finding an earlier report."
        action={<div className="flex flex-wrap gap-3"><LinkButton to="/app" variant="primary">Open assessment launcher</LinkButton><LinkButton to="/contact" variant="secondary">Contact support</LinkButton></div>}
      />
    </main>
  )
}

function CampusGate({ children }) {
  return <FlagRoute flag="PRISM_CAMPUS_ENABLED" onError="error" on={children} off={<Navigate to="/" replace />} />
}

const studentShell = (
  <AuthGuard><ShellGate off={<StudentPortalUnavailable />}><StudentShell /></ShellGate></AuthGuard>
)

// V3 shell pages: the shell flag is part of V3Route's predicate (requiresShell).
const inShell = (page) => (
  <AuthGuard><StudentShell>{page}</StudentShell></AuthGuard>
)

export default function AppRouter() {
  const { pathname } = useLocation()
  return (
    <>
      <ScrollToTop />
      <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<Skeleton variant="page" label="Loading" />}>
        <Routes>
          <Route path="/research/science" element={<ScienceBehindPrism />} />
          <Route path="/research/validity" element={<ValidityStudy />} />
          <Route path="/research/ai-evaluation" element={<AIEvaluation />} />
          <Route path="/research/blog" element={<Blog />} />
          <Route path="/research/blog/:slug" element={<BlogPost />} />
          <Route path="/about" element={<AboutStudAI />} />
          <Route path="/about/mission" element={<Mission />} />
          <Route path="/about/careers" element={<Careers />} />
          {/* Legal & policy pages — public, required for payment verification. */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/contact" element={<ContactPage />} />
          {/* Internal living style guide — admin-token gated in-page. */}
          <Route path="/design-system" element={<DesignSystem />} />
          {/* Control Centre — dark server-side unless PRISM_ADMIN_CONSOLE=true. */}
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
            <Route path="invites" element={<AdminInvites />} />
            <Route path="margin" element={<AdminMargin />} />
            <Route path="organizations" element={<AdminOrganizationsPage />} />
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
          <Route path="/admin/legacy-ops" element={<Admin />} />

          {/* The app launcher: legacy ShellHome unless the V3 shell is enabled. */}
          <Route
            path="/app"
            element={<FlagRoute flag="PRISM_APP_SHELL_V3" on={<AuthGuard><Navigate to="/app/home" replace /></AuthGuard>} off={<ShellHome />} />}
          />
          <Route element={studentShell}>
            <Route path="/app/home" element={<HomePage />} />
            <Route path="/app/assessments" element={<AssessmentsPage />} />
            <Route path="/app/assessments/:assignmentId" element={<AssessmentDetailPage />} />
            <Route path="/app/assessments/:assignmentId/briefing" element={<BriefingPage />} />
            <Route path="/app/assessments/:assignmentId/system-check" element={<SystemCheckPage />} />
            <Route path="/app/capabilities" element={<CapabilitiesPage />} />
            <Route path="/app/capabilities/:capabilityId" element={<CapabilityDetailPage />} />
            <Route path="/app/evidence" element={<EvidencePage />} />
            <Route path="/app/development" element={<DevelopmentPage />} />
            <Route path="/app/growth" element={<GrowthPage />} />
            <Route path="/app/sharing" element={<SharingPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/app/assessment/:sessionId" element={<V3Route flag="PRISM_ASSESSMENT_WORKSPACE_V3" requiresShell legacyPath="/workspace/:sessionId" page={<AuthGuard><WorkspaceContent><AssessmentPlayerPage /></WorkspaceContent></AuthGuard>} />} />
          <Route path="/app/reports/:sessionId" element={<V3Route flag="PRISM_STUDENT_REPORT_V3" requiresShell legacyPath="/report/:sessionId/v2" page={inShell(<StudentReportPage />)} />} />
          <Route path="/app/development/missions/:missionId" element={<V3Route flag="PRISM_DEVELOPMENT_V2" requiresShell legacyPath="/missions/:missionId" page={inShell(<MissionPlayerPage />)} />} />
          {/* Short mission URL: an alias; the development path stays canonical. */}
          <Route path="/app/missions/:missionId" element={<ShellGate><ParamRedirect to="/app/development/missions/:missionId" /></ShellGate>} />
          <Route path="/app/explore" element={<V3Route flag="PRISM_ROLE_EXPLORATION_V2" requiresShell legacyPath="/explore" page={inShell(<ExplorePage />)} />} />
          <Route path="/app/*" element={<AuthGuard><ShellGate off={<StudentPortalUnavailable />}><Navigate to="/app/home" replace /></ShellGate></AuthGuard>} />

          {/* Campus invitation (spec §37.2): sign-in first, so a signed-out
              invitee reaches /login?next= (K25 flip precondition). */}
          <Route
            path="/app/campus-invite/:token"
            element={<AuthGuard><ShellGate><CampusGate><CampusInvitePage /></CampusGate></ShellGate></AuthGuard>}
          />

          {/* Campus student workspace (spec §6.3). */}
          <Route
            path="/app/campus/:organizationId"
            element={<ShellGate><CampusGate><AuthGuard><WorkspaceGuard type="CAMPUS_STUDENT"><StudentShell /></WorkspaceGuard></AuthGuard></CampusGate></ShellGate>}
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="assignments" element={<AssessmentsPage />} />
            <Route path="assignments/:assignmentId" element={<AssessmentDetailPage />} />
            <Route path="assignments/:assignmentId/briefing" element={<BriefingPage />} />
            <Route path="assignments/:assignmentId/system-check" element={<SystemCheckPage />} />
            <Route path="development" element={<DevelopmentPage />} />
            <Route path="development/missions/:missionId" element={<FlagRoute flag="PRISM_DEVELOPMENT_V2" onError="error" on={<MissionPlayerPage />} off={<ParamRedirect to="/app/campus/:organizationId/development" />} />} />
            <Route path="growth" element={<GrowthPage />} />
            <Route path="reports/:sessionId" element={<FlagRoute flag="PRISM_STUDENT_REPORT_V3" onError="error" on={<StudentReportPage />} off={<Navigate to="../home" replace />} />} />
            <Route path="*" element={<ParamRedirect to="/app/campus/:organizationId/home" />} />
          </Route>

          {/* Campus administration (spec §6.4). */}
          <Route
            path="/campus/:organizationId"
            element={<CampusGate><AuthGuard><WorkspaceGuard type="CAMPUS_ADMIN"><CampusShell /></WorkspaceGuard></AuthGuard></CampusGate>}
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<CampusOverviewPage />} />
            <Route path="setup" element={<CampusOnboardingPage />} />
            <Route path="students" element={<CampusStudentsPage />} />
            <Route path="students/:studentId" element={<CampusStudentDetailPage />} />
            <Route path="cohorts" element={<CampusCohortsPage />} />
            <Route path="cohorts/import" element={<CampusImportPage />} />
            <Route path="cohorts/:cohortId" element={<CampusCohortDetailPage />} />
            <Route path="programs" element={<CampusProgramsPage />} />
            <Route path="programs/:programId" element={<CampusProgramDetailPage />} />
            <Route path="assessments" element={<CampusAssessmentsPage />} />
            <Route path="assessments/assign" element={<CampusAssignWizardPage />} />
            <Route path="assessments/:assignmentId" element={<CampusAssignmentDetailPage />} />
            <Route path="members" element={<CampusMembersPage />} />
            <Route path="settings" element={<CampusSettingsPage />} />
            <Route path="reports/:sessionId" element={<FlagRoute flag="PRISM_STUDENT_REPORT_V3" onError="error" on={<CampusReportPage />} off={<ParamRedirect to="/campus/:organizationId/overview" />} />} />
            {/* Sections of later phases (spec §19.1 nav): an honest page, never a loop. */}
            <Route path="development" element={<FlagRoute flag="PRISM_DEVELOPMENT_V2" onError="error" on={<CampusDevelopmentPage />} off={<CampusNotYetAvailablePage title="Development" />} />} />
            <Route path="reassessments" element={<FlagRoute flag="PRISM_GROWTH_ENABLED" onError="error" on={<CampusReassessmentsPage />} off={<CampusNotYetAvailablePage title="Reassessments" />} />} />
            <Route path="analytics" element={<FlagRoute flag="PRISM_CAMPUS_ANALYTICS" onError="error" on={<CampusAnalyticsPage />} off={<CampusNotYetAvailablePage title="Analytics" />} />} />
            <Route path="reports" element={<FlagRoute flag="PRISM_CAMPUS_ANALYTICS" onError="error" on={<CampusReportsPage />} off={<CampusNotYetAvailablePage title="Reports" />} />} />
            {/* Wording aliases for the target IA: Interventions, Growth, Capabilities. */}
            <Route path="interventions" element={<ParamRedirect to="/campus/:organizationId/development" />} />
            <Route path="growth" element={<ParamRedirect to="/campus/:organizationId/reassessments" />} />
            <Route path="capabilities" element={<ParamRedirect to="/campus/:organizationId/analytics" />} />
            <Route path="integrations" element={<CampusIntegrationsPage />} />
            <Route path="billing" element={<CampusBillingPage />} />
            <Route path="*" element={<ParamRedirect to="/campus/:organizationId/overview" />} />
          </Route>

          <Route path="/invite/:token" element={<InviteRedeem />} />
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
          <Route path="/rater/evidence" element={<EvidenceRatingPage />} />
          <Route path="/dashboard" element={<AuthGuard><Navigate to="/app/home" replace /></AuthGuard>} />
          <Route path="/profile" element={<AuthGuard><Navigate to="/app/settings#profile" replace /></AuthGuard>} />
          {/* Legacy URLs (spec §6.5): move to V3 only when its flag is on. */}
          <Route path="/explore" element={<LegacyAlias flag="PRISM_ROLE_EXPLORATION_V2" requiresShell v3Path="/app/explore" legacy={<ExploreMode />} />} />
          <Route path="/workspace/:sessionId" element={<LegacyAlias flag="PRISM_ASSESSMENT_WORKSPACE_V3" requiresShell v3Path="/app/assessment/:sessionId" legacy={<AssessmentWorkspace />} />} />
          <Route path="/report/:sessionId/v2" element={<LegacyAlias flag="PRISM_STUDENT_REPORT_V3" requiresShell v3Path="/app/reports/:sessionId" legacy={<StudentReportV2 />} />} />
          <Route path="/report/:sessionId/employee" element={<EmployeeReportV2 />} />
          <Route path="/shared/:token" element={<SharedReportPage />} />
          <Route path="/missions" element={<DevelopmentMission />} />
          <Route path="/missions/:missionId" element={<LegacyAlias flag="PRISM_DEVELOPMENT_V2" requiresShell v3Path="/app/development/missions/:missionId" legacy={<DevelopmentMission />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </>
  )
}
