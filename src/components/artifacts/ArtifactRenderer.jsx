// src/components/artifacts/ArtifactRenderer.jsx — Universal Dynamic Work Artifact Factory (12 Primitives)
import AnalyticsDashboard from './AnalyticsDashboard.jsx'
import CustomerTicketLog from './CustomerTicketLog.jsx'
import BudgetModeler from './BudgetModeler.jsx'
import EmailThread from './EmailThread.jsx'
import TeamChat from './TeamChat.jsx'
import ExecutiveMemo from './ExecutiveMemo.jsx'
import SpreadsheetTable from './SpreadsheetTable.jsx'
import ProjectBoard from './ProjectBoard.jsx'
import CalendarSchedule from './CalendarSchedule.jsx'
import BrandCreativeBrief from './BrandCreativeBrief.jsx'
import MeetingTranscript from './MeetingTranscript.jsx'
import PolicyComplianceDoc from './PolicyComplianceDoc.jsx'

export default function ArtifactRenderer({ artifact = {}, sessionId }) {
  const type = String(artifact?.type || artifact?.artifactId || '').toUpperCase()
  const data = artifact?.data || {}

  if (type.includes('DASH') || type === 'ANALYTICS_DASHBOARD' || type === 'ART-DASH-01') {
    return <AnalyticsDashboard data={data} />
  }

  if (type.includes('TICKET') || type.includes('FEEDBACK') || type === 'CUSTOMER_TICKET_LOG' || type === 'ART-FEEDBACK-02') {
    return <CustomerTicketLog data={data} />
  }

  if (type.includes('BUDGET') || type === 'BUDGET_MODELER' || type === 'ART-BUDGET-03') {
    return <BudgetModeler data={data} sessionId={sessionId} />
  }

  if (type.includes('EMAIL') || type === 'EMAIL_THREAD') {
    return <EmailThread data={data} />
  }

  if (type.includes('CHAT') || type === 'TEAM_CHAT') {
    return <TeamChat data={data} />
  }

  if (type.includes('MEMO') || type === 'EXECUTIVE_MEMO') {
    return <ExecutiveMemo data={data} />
  }

  if (type.includes('SPREADSHEET') || type.includes('TABLE') || type === 'SPREADSHEET_TABLE') {
    return <SpreadsheetTable data={data} />
  }

  if (type.includes('BOARD') || type.includes('KANBAN') || type === 'PROJECT_BOARD') {
    return <ProjectBoard data={data} />
  }

  if (type.includes('CALENDAR') || type.includes('SCHEDULE') || type === 'CALENDAR_SCHEDULE') {
    return <CalendarSchedule data={data} />
  }

  if (type.includes('CREATIVE') || type.includes('BRIEF') || type === 'BRAND_CREATIVE_BRIEF') {
    return <BrandCreativeBrief data={data} />
  }

  if (type.includes('TRANSCRIPT') || type === 'MEETING_TRANSCRIPT') {
    return <MeetingTranscript data={data} />
  }

  if (type.includes('COMPLIANCE') || type.includes('POLICY') || type === 'POLICY_COMPLIANCE_DOC') {
    return <PolicyComplianceDoc data={data} />
  }

  // Generic fallback: renders nicely formatted data view
  return (
    <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 space-y-4">
      <div className="border-b border-slate-800 pb-3">
        <h3 className="font-bold text-base text-white">{artifact?.title || 'Interactive Artifact'}</h3>
        <span className="text-[10px] font-mono text-slate-500 uppercase">{artifact?.artifactId || 'GENERIC'}</span>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">{artifact?.description || 'Artifact preview'}</p>
      <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-indigo-300 font-mono overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
