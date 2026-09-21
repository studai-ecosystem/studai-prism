// src/components/artifacts/ProjectBoard.jsx — Interactive Kanban Project Board Primitive
import { useState } from 'react'

export default function ProjectBoard({ data = {} }) {
  const [tasks, setTasks] = useState(data.tasks || [
    { id: 'TSK-101', title: 'Audit TikTok Creative Performance & Hook Drop-off', status: 'IN_PROGRESS', priority: 'HIGH', assignee: 'Marcus Chen' },
    { id: 'TSK-102', title: 'Halt Batch B-409 Fulfillment & Dispatch Replacement Droppers', status: 'COMPLETED', priority: 'CRITICAL', assignee: 'Devika Pillai' },
    { id: 'TSK-103', title: 'Set Up Klaviyo Post-Purchase Win-Back Automation Flow', status: 'BACKLOG', priority: 'HIGH', assignee: 'Growth Team' },
    { id: 'TSK-104', title: 'Draft Executive Strategy Memo for Friday Board Review', status: 'IN_PROGRESS', priority: 'CRITICAL', assignee: 'Candidate' },
    { id: 'TSK-105', title: 'Re-negotiate Influencer Retainers with Tier-2 Creators', status: 'BLOCKED', priority: 'MEDIUM', assignee: 'PR Agency' },
  ])

  const moveTask = (taskId, newStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }

  const columns = [
    { key: 'BACKLOG', label: 'Backlog', color: 'border-slate-700' },
    { key: 'IN_PROGRESS', label: 'In Progress', color: 'border-indigo-500' },
    { key: 'BLOCKED', label: 'Blocked / Review', color: 'border-amber-500' },
    { key: 'COMPLETED', label: 'Completed', color: 'border-emerald-500' }
  ]

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-4">
      <div>
        <h3 className="font-bold text-base text-white">{data.title || 'Growth Sprint & Triage Board'}</h3>
        <p className="text-xs text-slate-400">Click actions to reprioritize deliverables in real time</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key)
          return (
            <div key={col.key} className={`p-3 rounded-xl bg-slate-950/80 border ${col.color} flex flex-col gap-3 min-h-[300px]`}>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-white uppercase tracking-wider">{col.label}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">{colTasks.length}</span>
              </div>

              <div className="space-y-2.5 flex-1">
                {colTasks.map(t => (
                  <div key={t.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs shadow">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono text-indigo-400">{t.id}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        t.priority === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300' :
                        t.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {t.priority}
                      </span>
                    </div>
                    <p className="font-medium text-slate-200">{t.title}</p>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
                      <span>👤 {t.assignee}</span>
                      <div className="flex gap-1">
                        {col.key !== 'COMPLETED' && (
                          <button
                            onClick={() => moveTask(t.id, 'COMPLETED')}
                            className="text-[10px] text-emerald-400 hover:underline"
                          >
                            ✓ Done
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
