// src/components/artifacts/CalendarSchedule.jsx — Interactive Executive Calendar Primitive
import { useState } from 'react'

export default function CalendarSchedule({ data = {} }) {
  const [events, setEvents] = useState(data.events || [
    { id: 1, time: '09:00 AM', title: 'Daily Growth Standup & Attribution Review', attendees: 'Elena, Marcus, Candidate', status: 'CONFIRMED', duration: '30m' },
    { id: 2, time: '11:00 AM', title: 'Packaging Vendor Emergency Briefing (Batch B-409)', attendees: 'Devika, QA Lead, Supplier', status: 'CRITICAL', duration: '45m' },
    { id: 3, time: '02:00 PM', title: 'Creative Agency TikTok Script Pitch', attendees: 'Marcus, Creative Director', status: 'OPTIONAL', duration: '60m' },
    { id: 4, time: '04:30 PM', title: 'Board Strategy Prep & CAC Recovery Alignment', attendees: 'Elena Vance (CEO)', status: 'HIGH_PRIORITY', duration: '45m' },
  ])

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-4">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-base text-white">{data.title || 'Executive Schedule & Strategic Touchpoints'}</h3>
          <p className="text-xs text-slate-400">Synchronized meeting agenda for the active simulation day</p>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          Thursday, Week 3
        </span>
      </div>

      <div className="space-y-3">
        {events.map((ev) => (
          <div key={ev.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-16 text-center">
                <span className="text-xs font-bold font-mono text-indigo-300 block">{ev.time}</span>
                <span className="text-[10px] text-slate-500">{ev.duration}</span>
              </div>
              <div className="h-8 w-px bg-slate-800 hidden sm:block" />
              <div>
                <h4 className="text-xs font-bold text-white">{ev.title}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Attendees: {ev.attendees}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                ev.status === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300' :
                ev.status === 'HIGH_PRIORITY' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300'
              }`}>
                {ev.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
