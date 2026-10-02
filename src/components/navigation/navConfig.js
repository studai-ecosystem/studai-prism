import { Home, ClipboardList, Layers, Sprout, Target, History as HistoryIcon, Compass, Share2, Settings, LifeBuoy, TrendingUp, LayoutDashboard, Users, UsersRound, FolderKanban, ClipboardCheck, RefreshCcw, BarChart3, FileText, UserCog, Plug, Receipt, SlidersHorizontal } from 'lucide-react'
import { NAV_UNAVAILABLE_NOTE } from '../../lib/copy/student.js'

// Section headings for grouped navigation. An item without `group` sits at
// the top of the list; consecutive items with the same group form a section.
export const NAV_GROUP_LABELS = Object.freeze({
  more: 'More',
  people: 'People',
  assess: 'Assess and develop',
  insight: 'Insight',
  admin: 'Administration',
})

// Matches a nav item to the current location. Items whose `to` carries a
// query string (History) are current only when that query is present; the
// plain route (Assessments) is current only when it is absent.
const hasTab = (search, tab) => new URLSearchParams(search).get('tab') === tab
const pathOf = (to) => String(to).split('?')[0]
export function isNavItemActive(item, location) {
  if (!item.to) return false
  const path = pathOf(item.to)
  const onPath = location.pathname === path || location.pathname.startsWith(`${path}/`)
  if (!onPath) return false
  if (item.tab) return hasTab(location.search, item.tab)
  if (item.excludeTab) return !hasTab(location.search, item.excludeTab)
  return true
}

// Personal and student navigation (P3.2): Home, Assessments, My Prism,
// Practice, Prepare, History. Evidence and Growth live as sections under My
// Prism; History is a view over the assessments projection (`?tab=history`),
// never a second store. Prepare is announced honestly as not yet available
// (its route activates after P7). Profile lives in the account menu;
// Settings in the footer.
export const STUDENT_NAV = [
  { id: 'home', label: 'Home', to: '/app/home', icon: Home },
  { id: 'assessments', label: 'Assessments', to: '/app/assessments', icon: ClipboardList, excludeTab: 'history' },
  { id: 'capabilities', label: 'My Prism', to: '/app/capabilities', icon: Layers },
  { id: 'development', label: 'Practice', to: '/app/development', icon: Sprout },
  { id: 'prepare', label: 'Prepare', to: null, icon: Target, unavailable: NAV_UNAVAILABLE_NOTE },
  { id: 'history', label: 'History', to: '/app/assessments?tab=history', icon: HistoryIcon, tab: 'history' },
  { id: 'explore', label: 'Explore', to: '/app/explore', icon: Compass, group: 'more' },
  { id: 'sharing', label: 'Shared reports', to: '/app/sharing', icon: Share2, group: 'more' },
]

// Campus student workspace (spec §6.3): only the sponsored sections; `to` is
// the section path StudentShell scopes to the organization. There is no My
// Prism in a sponsored workspace, so Growth stays a direct link here.
export const CAMPUS_STUDENT_NAV = [
  { id: 'home', label: 'Home', to: 'home', icon: Home },
  { id: 'assessments', label: 'Assessments', to: 'assignments', icon: ClipboardList, excludeTab: 'history' },
  { id: 'development', label: 'Practice', to: 'development', icon: Sprout },
  { id: 'growth', label: 'Growth', to: 'growth', icon: TrendingUp },
]

export const STUDENT_NAV_FOOTER = [
  { id: 'help', label: 'Help', to: '/contact', icon: LifeBuoy },
  { id: 'settings', label: 'Settings', to: '/app/settings', icon: Settings },
]

// Mobile bottom navigation: the four things a student does most, then More
// (the rest of the list opens in a drawer). Labels match the sidebar.
export const STUDENT_BOTTOM_NAV = [
  { id: 'home', label: 'Home', to: '/app/home', icon: Home },
  { id: 'assessments', label: 'Assessments', to: '/app/assessments', icon: ClipboardList, excludeTab: 'history' },
  { id: 'capabilities', label: 'My Prism', to: '/app/capabilities', icon: Layers },
  { id: 'development', label: 'Practice', to: '/app/development', icon: Sprout },
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