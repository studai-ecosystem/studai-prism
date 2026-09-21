// src/components/artifacts/CustomerTicketLog.jsx — Customer Review & Escalation Tickets
import { useState } from 'react'

export default function CustomerTicketLog({ data = {} }) {
  const [filterRating, setFilterRating] = useState('ALL')
  const [flaggedTickets, setFlaggedTickets] = useState(new Set())
  const tickets = data.tickets || []

  const filteredTickets = filterRating === 'ALL'
    ? tickets
    : filterRating === 'CRITICAL'
    ? tickets.filter((t) => t.rating <= 2)
    : tickets.filter((t) => t.rating === Number(filterRating))

  const toggleFlag = (id) => {
    setFlaggedTickets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6 text-slate-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Qualitative Intelligence Feed</span>
          <h3 className="text-lg font-bold text-white">Customer Reviews & Escalation Tickets (Recent 150 Sample)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Aggregated from Zendesk, Trustpilot, and Instagram Direct Messages</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Flagged by Candidate:</span>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {flaggedTickets.size} Root Causes
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 font-medium mr-2">Filter View:</span>
        {[
          { id: 'ALL', label: 'All Reviews' },
          { id: 'CRITICAL', label: '🚨 Critical (1-2 Stars)' },
          { id: '1', label: '1 Star' },
          { id: '2', label: '2 Stars' },
          { id: '5', label: '5 Stars' }
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setFilterRating(btn.id)}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              filterRating === btn.id
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Ticket List Cards */}
      <div className="space-y-3">
        {filteredTickets.map((ticket) => {
          const isFlagged = flaggedTickets.has(ticket.id)
          return (
            <div
              key={ticket.id}
              className={`p-4 rounded-xl border transition-all duration-200 ${
                isFlagged
                  ? 'bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-950/20'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center text-amber-400 text-xs">
                    {'★'.repeat(ticket.rating)}{'☆'.repeat(5 - ticket.rating)}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-400">{ticket.id}</span>
                  <span className="text-xs font-semibold text-white">{ticket.customer}</span>
                  {ticket.rating <= 2 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Churn Risk
                    </span>
                  )}
                </div>

                <button
                  onClick={() => toggleFlag(ticket.id)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                    isFlagged
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {isFlagged ? '✓ Tagged as Root Cause' : '+ Tag as Evidence'}
                </button>
              </div>

              <p className="text-sm text-slate-300 mt-2.5 leading-relaxed italic">
                "{ticket.comment}"
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                {ticket.comment.toLowerCase().includes('smell') || ticket.comment.toLowerCase().includes('formula') || ticket.comment.toLowerCase().includes('allergic') ? (
                  <span className="px-2 py-0.5 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300">
                    ⚠️ Product Reformulation Issue
                  </span>
                ) : null}
                {ticket.comment.toLowerCase().includes('delay') || ticket.comment.toLowerCase().includes('crushed') || ticket.comment.toLowerCase().includes('logistics') ? (
                  <span className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300">
                    📦 Logistics / Fulfillment Failure
                  </span>
                ) : null}
                {ticket.comment.toLowerCase().includes('subscribe') || ticket.comment.toLowerCase().includes('payment') ? (
                  <span className="px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800/40 text-blue-300">
                    🔄 Subscription Friction
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Synthesis Callout */}
      <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs leading-relaxed text-amber-200">
        <p className="font-semibold text-amber-300 mb-1">🔍 Qualitative Insight</p>
        Notice that loyal multi-year customers are reporting skin irritation after a recent formulation tweak, and logistics delays have jumped from 3 to 16 days. If customers refund or churn within 30 days, acquiring them at ANY CAC will destroy commercial margins.
      </div>
    </div>
  )
}
