import { Home, ClipboardList, Layers, FileSearch, Sprout, TrendingUp, Compass, Share2, Settings, LifeBuoy, LayoutDashboard, Users, UsersRound, FolderKanban, ClipboardCheck, RefreshCcw, BarChart3, FileText, UserCog, Plug, Receipt, SlidersHorizontal } from 'lucide-react'

// Student / personal navigation (spec §7.1).
export const STUDENT_NAV = [
  { id: 'home', label: 'Home', to: '/app/home', icon: Home },
  { id: 'assessments', label: 'Assessments', to: '/app/assessments', icon: ClipboardList },
  { id: 'capabilities', label: 'My Capabilities', to: '/app/capabilities', icon: Layers },
  { id: 'evidence', label: 'Evidence', to: '/app/evidence', icon: FileSearch },
  { id: 'development', label: 'Development', to: '/app/development', icon: Sprout },
  { id: 'growth', label: 'Growth', to: '/app/growth', icon: TrendingUp },
  { id: 'explore', label: 'Explore Roles', to: '/app/explore', icon: Compass },
  { id: 'sharing', label: 'Sharing', to: '/app/sharing', icon: Share2 },
]

export const STUDENT_NAV_FOOTER = [
  { id: 'help', label: 'Help', to: '/contact', icon: LifeBuoy },
  { id: 'settings', label: 'Settings', to: '/app/settings', icon: Settings },
]

// Mobile bottom navigation (spec §7.3): Home, Assess, Develop, Growth, More.
export const STUDENT_BOTTOM_NAV = [
  { id: 'home', label: 'Home', to: '/app/home', icon: Home },
  { id: 'assessments', label: 'Assess', to: '/app/assessments', icon: ClipboardList },
  { id: 'development', label: 'Develop', to: '/app/development', icon: Sprout },
  { id: 'growth', label: 'Growth', to: '/app/growth', icon: TrendingUp },
]

// Campus administration navigation (spec §19.1). Each item names the server
// permission that makes it visible; the server re-checks on every request.
export const CAMPUS_NAV = [
  { id: 'overview', label: 'Overview', path: 'overview', icon: LayoutDashboard, permission: 'org.overview.read' },
  { id: 'students', label: 'Students', path: 'students', icon: Users, permission: 'students.read' },
  { id: 'cohorts', label: 'Cohorts', path: 'cohorts', icon: UsersRound, permission: 'cohorts.read' },
  { id: 'programs', label: 'Programs', path: 'programs', icon: FolderKanban, permission: 'programs.read' },
  { id: 'assessments', label: 'Assessments', path: 'assessments', icon: ClipboardCheck, permission: 'assignments.read' },
  { id: 'development', label: 'Development', path: 'development', icon: Sprout, permission: 'interventions.read' },
  { id: 'reassessments', label: 'Reassessments', path: 'reassessments', icon: RefreshCcw, permission: 'reassessments.read' },
  { id: 'analytics', label: 'Analytics', path: 'analytics', icon: BarChart3, permission: 'analytics.read' },
  { id: 'reports', label: 'Reports', path: 'reports', icon: FileText, permission: 'reports.read' },
  { id: 'team', label: 'Team', path: 'members', icon: UserCog, permission: 'team.read' },
  { id: 'integrations', label: 'Integrations', path: 'integrations', icon: Plug, permission: 'integrations.read' },
  { id: 'billing', label: 'Billing', path: 'billing', icon: Receipt, permission: 'billing.read' },
  { id: 'settings', label: 'Settings', path: 'settings', icon: SlidersHorizontal, permission: 'org.settings.read' },
]

export function campusNavFor(organizationId, permissions = []) {
  return CAMPUS_NAV
    .filter((item) => permissions.includes(item.permission))
    .map((item) => ({ ...item, to: `/campus/${organizationId}/${item.path}` }))
}
