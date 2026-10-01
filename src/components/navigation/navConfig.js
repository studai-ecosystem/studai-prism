import { Home, ClipboardList, Layers, FileSearch, Sprout, TrendingUp, Compass, Share2, Settings, LifeBuoy, LayoutDashboard, Users, UsersRound, FolderKanban, ClipboardCheck, RefreshCcw, BarChart3, FileText, UserCog, Plug, Receipt, SlidersHorizontal } from 'lucide-react'

// Section headings for grouped navigation. An item without `group` sits at
// the top of the list; consecutive items with the same group form a section.
export const NAV_GROUP_LABELS = Object.freeze({
  more: 'Evidence and sharing',
  people: 'People',
  assess: 'Assess and develop',
  insight: 'Insight',
  admin: 'Administration',
})

// Personal and student navigation: outcomes, not technical architecture.
// Profile lives in the account menu; Settings in the footer.
export const STUDENT_NAV = [
  { id: 'home', label: 'Home', to: '/app/home', icon: Home },
  { id: 'assessments', label: 'Assessments', to: '/app/assessments', icon: ClipboardList },
  { id: 'capabilities', label: 'Capabilities', to: '/app/capabilities', icon: Layers },
  { id: 'development', label: 'Development', to: '/app/development', icon: Sprout },
  { id: 'growth', label: 'Growth', to: '/app/growth', icon: TrendingUp },
  { id: 'explore', label: 'Explore', to: '/app/explore', icon: Compass },
  { id: 'evidence', label: 'Evidence', to: '/app/evidence', icon: FileSearch, group: 'more' },
  { id: 'sharing', label: 'Shared reports', to: '/app/sharing', icon: Share2, group: 'more' },
]

export const STUDENT_NAV_FOOTER = [
  { id: 'help', label: 'Help', to: '/contact', icon: LifeBuoy },
  { id: 'settings', label: 'Settings', to: '/app/settings', icon: Settings },
]

// Mobile bottom navigation: the four things a student does most, then More
// (the rest of the list opens in a drawer).
export const STUDENT_BOTTOM_NAV = [
  { id: 'home', label: 'Home', to: '/app/home', icon: Home },
  { id: 'assessments', label: 'Assess', to: '/app/assessments', icon: ClipboardList },
  { id: 'capabilities', label: 'Capabilities', to: '/app/capabilities', icon: Layers },
  { id: 'development', label: 'Develop', to: '/app/development', icon: Sprout },
]

// Campus administration navigation. Each item names the server permission
// that makes it visible; the server re-checks on every request. Labels keep
// the names of the pages they open; the Capabilities, Interventions and
// Growth wording arrives with the campus page redesign (phase I).
export const CAMPUS_NAV = [
  { id: 'overview', label: 'Overview', path: 'overview', icon: LayoutDashboard, permission: 'org.overview.read' },
  { id: 'students', label: 'Students', path: 'students', icon: Users, permission: 'students.read', group: 'people' },
  { id: 'cohorts', label: 'Cohorts', path: 'cohorts', icon: UsersRound, permission: 'cohorts.read', group: 'people' },
  { id: 'programs', label: 'Programs', path: 'programs', icon: FolderKanban, permission: 'programs.read', group: 'people' },
  { id: 'assessments', label: 'Assessments', path: 'assessments', icon: ClipboardCheck, permission: 'assignments.read', group: 'assess' },
  { id: 'development', label: 'Development', path: 'development', icon: Sprout, permission: 'interventions.read', group: 'assess' },
  { id: 'reassessments', label: 'Reassessments', path: 'reassessments', icon: RefreshCcw, permission: 'reassessments.read', group: 'assess' },
  { id: 'analytics', label: 'Analytics', path: 'analytics', icon: BarChart3, permission: 'analytics.read', group: 'insight' },
  { id: 'reports', label: 'Reports', path: 'reports', icon: FileText, permission: 'reports.read', group: 'insight' },
  { id: 'team', label: 'Team', path: 'members', icon: UserCog, permission: 'team.read', group: 'admin' },
  { id: 'integrations', label: 'Integrations', path: 'integrations', icon: Plug, permission: 'integrations.read', group: 'admin' },
  { id: 'billing', label: 'Billing', path: 'billing', icon: Receipt, permission: 'billing.read', group: 'admin' },
  { id: 'settings', label: 'Settings', path: 'settings', icon: SlidersHorizontal, permission: 'org.settings.read', group: 'admin' },
]

export function campusNavFor(organizationId, permissions = []) {
  return CAMPUS_NAV
    .filter((item) => permissions.includes(item.permission))
    .map((item) => ({ ...item, to: `/campus/${organizationId}/${item.path}` }))
}